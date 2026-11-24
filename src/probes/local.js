// deeper checks of this computer. each one reads only settings, names and file permissions
const fs = require('fs')
const path = require('path')
const os = require('os')
const sh = require('./sh')
const { oddPlace } = require('./common')

const win = process.platform === 'win32'
const mac = process.platform === 'darwin'
const home = os.homedir()
const read = (f, max = 256 * 1024) => { try { const s = fs.statSync(f); return s.size <= max ? fs.readFileSync(f, 'utf8') : '' } catch { return '' } }
const ps = script => sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')])

// --- credential files ---

// files that hold logins for other services. other users on this computer should never read them
const SECRET_FILES = [
  ['.aws/credentials', 'amazon cloud keys'],
  ['.netrc', 'saved logins'],
  ['.git-credentials', 'git passwords in plain text'],
  ['.pgpass', 'database passwords'],
  ['.my.cnf', 'database password'],
  ['.docker/config.json', 'docker logins'],
  ['.kube/config', 'kubernetes access'],
  ['.config/gh/hosts.yml', 'github token'],
  ['.npmrc', 'npm token'],
  ['.pypirc', 'python package logins'],
  ['.config/gcloud/credentials.db', 'google cloud login'],
  ['.azure/accessTokens.json', 'azure login'],
  ['.ssh/config', null]
]
const PLAIN = /(\bpassword\s*[=:]|\bauthToken\s*=|\b_auth\s*=|aws_secret_access_key|https?:\/\/[^/\s:]+:[^@\s]+@|\btoken:\s*\S{12,})/i

function credential_files () {
  const items = []
  let loose = 0
  let found = 0
  for (const [rel, what] of SECRET_FILES) {
    if (!what) continue
    const f = path.join(home, rel)
    let st
    try { st = fs.statSync(f) } catch { continue }
    if (!st.isFile()) continue
    found++
    const open = !win && (st.mode & 0o044)
    const plain = PLAIN.test(read(f, 64 * 1024))
    if (open) loose++
    items.push({
      text: `~/${rel}`,
      note: [open ? 'other users can read it' : '', plain ? `${what} stored as plain text` : what].filter(Boolean).join(', '),
      flag: !!open
    })
  }
  // .env files in the usual project folders
  for (const d of ['Projects', 'Code', 'Coding', 'dev', 'src', 'work', 'repos', 'Documents', 'Desktop']) {
    const root = path.join(home, d)
    let entries = []
    try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { continue }
    for (const e of entries.slice(0, 200)) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      const f = path.join(root, e.name, '.env')
      let st
      try { st = fs.statSync(f) } catch { continue }
      found++
      const open = !win && (st.mode & 0o004)
      if (open) { loose++; items.push({ text: `~/${d}/${e.name}/.env`, note: 'anyone on this computer can read it', flag: true }) }
    }
  }
  if (!found) return { status: 'ok', detail: 'no saved logins or keys found in the usual places' }
  return loose
    ? { status: 'loose', detail: `${loose} file${loose === 1 ? ' holds' : 's hold'} logins that other users can read`, items }
    : { status: 'ok', detail: `${found} file${found === 1 ? '' : 's'} with logins, all locked to your account`, items }
}

// --- shell startup files ---

const SHELL_FILES = ['.zshrc', '.zprofile', '.zshenv', '.zlogin', '.bashrc', '.bash_profile', '.profile', '.bash_login', '.config/fish/config.fish']
const BAD_LINES = [
  [/(curl|wget)[^|;\n]*\|\s*(sudo\s+)?(ba|z)?sh/i, 'downloads and runs code every time you open a terminal'],
  [/base64\s+(-d|--decode)[^|\n]*\|\s*(ba|z)?sh/i, 'decodes hidden code and runs it'],
  [/\beval\s+["'$(`]*\s*(curl|wget|base64)/i, 'runs downloaded or hidden code'],
  [/\/(tmp|var\/tmp|dev\/shm)\/[\w.-]+/, 'runs something from a temporary folder'],
  [/\bnc\s+(-\w+\s+)*\d+\.\d+\.\d+\.\d+\s+\d+|\/dev\/tcp\//, 'opens a network connection to somewhere'],
  [/\balias\s+(sudo|ssh|git|su|login)=/i, 'replaces a security-sensitive command with something else'],
  [/\bexport\s+(LD_PRELOAD|DYLD_INSERT_LIBRARIES)=/, 'injects code into every program you start']
]

function shell_persistence () {
  if (win) return { status: 'unknown', detail: 'this check is for terminals on mac and linux' }
  const items = []
  let checked = 0
  for (const rel of SHELL_FILES) {
    const text = read(path.join(home, rel))
    if (!text) continue
    checked++
    text.split('\n').forEach((raw, i) => {
      const line = raw.trim()
      if (!line || line.startsWith('#')) return
      const hit = BAD_LINES.find(([re]) => re.test(line))
      if (hit) items.push({ text: `~/${rel} line ${i + 1}`, note: hit[1], flag: true })
    })
  }
  if (!checked) return { status: 'clean', detail: 'no terminal startup files to read' }
  return items.length
    ? { status: 'review', detail: `${items.length} line${items.length === 1 ? '' : 's'} in your terminal startup files look like something malware would add`, items }
    : { status: 'clean', detail: `${checked} terminal startup file${checked === 1 ? '' : 's'} read, nothing suspicious`, items: [] }
}

// --- scheduled tasks ---

const ODD_CMD = /(\/tmp\/|\/var\/tmp\/|\/dev\/shm\/|\/\.[\w-]+\/|\\Temp\\|\\AppData\\|\\Users\\Public\\|\bcurl\b[^|]*\||\bwget\b[^|]*\||base64\s+-d|\bnc\s+-|powershell[^"]*-enc|\/dev\/tcp\/)/i

async function scheduled_tasks () {
  const items = []
  if (win) {
    const r = await sh('schtasks', ['/query', '/fo', 'csv', '/v'], { timeout: 30000 })
    if (!r.ok && !r.out) return { status: 'unknown', detail: r.err || 'could not read scheduled tasks' }
    const rows = r.out.split(/\r?\n/).map(l => l.match(/"((?:[^"]|"")*)"/g)?.map(c => c.slice(1, -1).replace(/""/g, '"')))
    const head = rows.find(x => x && x[0] === 'HostName')
    if (!head) return { status: 'unknown', detail: 'scheduled task list was in an unexpected format' }
    const iName = head.indexOf('TaskName'); const iRun = head.indexOf('Task To Run'); const iUser = head.indexOf('Run As User')
    const seen = new Set()
    for (const x of rows) {
      if (!x || x.length < head.length || x[0] === 'HostName') continue
      const name = x[iName]
      if (/^\\Microsoft\\/i.test(name) || seen.has(name)) continue
      seen.add(name)
      const odd = ODD_CMD.test(x[iRun] || '')
      items.push(odd ? { text: name, note: `runs ${x[iRun]}`, flag: true } : { text: name, note: x[iUser] || '' })
    }
  } else {
    const sources = []
    const mine = await sh('crontab', ['-l'])
    if (mine.ok) sources.push(['your crontab', mine.out])
    for (const f of ['/etc/crontab']) sources.push([f, read(f)])
    for (const dir of ['/etc/cron.d']) {
      try { for (const f of fs.readdirSync(dir)) sources.push([path.join(dir, f), read(path.join(dir, f))]) } catch {}
    }
    for (const [src, text] of sources) {
      for (const raw of text.split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#') || /^[A-Z_]+=/.test(line)) continue
        const odd = ODD_CMD.test(line)
        items.push({ text: `${src}: ${line.replace(/\s+/g, ' ').slice(0, 90)}`, note: odd ? 'runs from an odd place or downloads code' : '', flag: odd })
      }
    }
    if (!mac) {
      const t = await sh('systemctl', ['list-timers', '--all', '--no-legend', '--no-pager'])
      const user = await sh('systemctl', ['--user', 'list-timers', '--all', '--no-legend', '--no-pager'])
      const n = (t.out + '\n' + user.out).split('\n').filter(l => l.trim() && /\.timer/.test(l)).length
      if (n) items.push({ text: `${n} systemd timers`, note: 'normal on most systems' })
    }
  }
  items.sort((a, b) => (!!b.flag - !!a.flag))
  const flagged = items.filter(i => i.flag).length
  if (!items.length) return { status: 'clean', detail: 'no scheduled jobs of your own' }
  return flagged
    ? { status: 'review', detail: `${flagged} scheduled job${flagged === 1 ? '' : 's'} run from an odd place or download code`, items }
    : { status: 'clean', detail: `${items.length} scheduled job${items.length === 1 ? '' : 's'}, nothing unusual`, items }
}

// --- running programs ---

const TOOLS = /\b(xmrig|minerd|cpuminer|kdevtmpfs|ethminer|nbminer|t-rex|lolminer|mimikatz|meterpreter|msfvenom|cobaltstrike|beacon\.exe|ncat|socat)\b/i

async function suspicious_processes () {
  let procs = []
  if (win) {
    const r = await ps('Get-Process | Where-Object Path | ForEach-Object { "$($_.Id)|$($_.ProcessName)|$($_.Path)" }')
    procs = r.out.split(/\r?\n/).map(l => l.split('|')).filter(p => p.length >= 3).map(([pid, name, ...p]) => ({ pid, name, path: p.join('|') }))
  } else {
    const r = await sh('ps', ['-axo', 'pid=,comm='])
    if (!r.ok) return { status: 'unknown', detail: r.err }
    procs = r.out.split('\n').map(l => l.trim().match(/^(\d+)\s+(.+)$/)).filter(Boolean).map(m => ({ pid: m[1], name: path.basename(m[2]), path: m[2] }))
    if (!mac) {
      // linux shows a deleted binary: the file was removed while it kept running, a classic way to hide
      for (const p of procs) {
        try { if (/ \(deleted\)$/.test(fs.readlinkSync(`/proc/${p.pid}/exe`))) p.deleted = true } catch {}
      }
    }
  }
  const items = []
  const seen = new Set()
  for (const p of procs) {
    const why = []
    if (TOOLS.test(p.name) || TOOLS.test(p.path)) why.push('name matches a known hacking or mining tool')
    if (oddPlace(p.path)) why.push(`runs from ${path.dirname(p.path)}`)
    if (p.deleted) why.push('its file was deleted while it keeps running')
    if (!why.length) continue
    const key = `${p.name}|${why[0]}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ text: p.name, note: `${why.join('; ')} (pid ${p.pid})`, flag: true })
  }
  if (!items.length) return { status: 'clean', detail: `${procs.length} programs running, none in odd places`, items: [] }
  return { status: 'review', detail: `${items.length} running program${items.length === 1 ? ' looks' : 's look'} out of place`, items }
}

// --- admin accounts ---

async function admin_accounts () {
  let admins = []
  if (mac) {
    const r = await sh('/usr/bin/dscl', ['.', '-read', '/Groups/admin', 'GroupMembership'])
    admins = r.out.replace(/^GroupMembership:\s*/, '').split(/\s+/).filter(n => n && n !== 'root')
  } else if (win) {
    const r = await sh('net', ['localgroup', 'Administrators'])
    const lines = r.out.split(/\r?\n/)
    const start = lines.findIndex(l => /^-{5,}/.test(l))
    admins = lines.slice(start + 1).filter(l => l.trim() && !/command completed/i.test(l)).map(l => l.trim())
  } else {
    for (const g of ['sudo', 'wheel', 'admin']) {
      const r = await sh('getent', ['group', g])
      if (r.ok) admins.push(...(r.out.split(':')[3] || '').split(',').filter(Boolean))
    }
    admins = [...new Set(admins)]
  }
  if (!admins.length) return { status: 'unknown', detail: 'could not read who the admins are' }
  const items = admins.map(n => ({ text: n, note: 'can change anything on this computer' }))
  return admins.length > 2
    ? { status: 'many', detail: `${admins.length} accounts are admins: ${admins.join(', ')}`, items: items.map(i => ({ ...i, flag: true })) }
    : { status: 'few', detail: `${admins.length} admin account${admins.length === 1 ? '' : 's'}: ${admins.join(', ')}`, items }
}

// --- automatic login ---

async function auto_login () {
  if (mac) {
    const r = await sh('/usr/bin/defaults', ['read', '/Library/Preferences/com.apple.loginwindow', 'autoLoginUser'])
    return r.ok && r.out
      ? { status: 'on', detail: `${r.out} signs in by itself at startup, with no password` }
      : { status: 'off', detail: 'a password is needed after startup' }
  }
  if (win) {
    const r = await ps(`$k = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon' -ErrorAction SilentlyContinue; "auto=$($k.AutoAdminLogon)"; "user=$($k.DefaultUserName)"; "pw=$([bool]$k.DefaultPassword)"`)
    const o = Object.fromEntries(r.out.split(/\r?\n/).map(l => l.split(/=(.*)/s).slice(0, 2)))
    if (o.auto === '1') return { status: 'on', detail: `${o.user || 'an account'} signs in by itself at startup${o.pw === 'True' ? ', and its password is saved in the registry in plain text' : ''}` }
    return { status: 'off', detail: 'a password is needed after startup' }
  }
  for (const f of ['/etc/gdm3/custom.conf', '/etc/gdm/custom.conf']) {
    if (/^\s*AutomaticLoginEnable\s*=\s*(true|1)/mi.test(read(f))) return { status: 'on', detail: 'the desktop signs in by itself at startup' }
  }
  for (const f of ['/etc/lightdm/lightdm.conf']) {
    if (/^\s*autologin-user\s*=\s*\S+/m.test(read(f))) return { status: 'on', detail: 'the desktop signs in by itself at startup' }
  }
  const sddm = [read('/etc/sddm.conf'), ...(() => { try { return fs.readdirSync('/etc/sddm.conf.d').map(f => read(path.join('/etc/sddm.conf.d', f))) } catch { return [] } })()].join('\n')
  if (/^\s*User\s*=\s*\S+/m.test(sddm) && /\[Autologin\]/i.test(sddm)) return { status: 'on', detail: 'the desktop signs in by itself at startup' }
  return { status: 'off', detail: 'a password is needed after startup' }
}

// --- certificates ---

async function trusted_certificates () {
  const items = []
  if (mac) {
    // only certificates somebody added trust for show up here, apple's own roots are built in
    for (const [flag, who] of [['-d', 'every user (admin)'], ['', 'you']]) {
      const r = await sh('/usr/bin/security', ['dump-trust-settings', ...(flag ? [flag] : [])])
      for (const m of r.out.matchAll(/Cert \d+: (.+)\n\s+Number Of Trust Settings\s*:\s*(\d+)/g)) {
        items.push({ text: m[1].trim(), note: `trusted by ${who}`, flag: true })
      }
    }
  } else if (!win) {
    for (const dir of ['/usr/local/share/ca-certificates', '/etc/pki/ca-trust/source/anchors', '/usr/share/pki/trust/anchors']) {
      try { for (const f of fs.readdirSync(dir)) items.push({ text: f, note: `added in ${dir}`, flag: true }) } catch {}
    }
  } else {
    return { status: 'unknown', detail: 'this check is for mac and linux' }
  }
  if (!items.length) return { status: 'default', detail: 'no extra certificate authorities were added, only the built-in ones are trusted' }
  return { status: 'extra', detail: `${items.length} certificate authorit${items.length === 1 ? 'y was' : 'ies were'} added by you, your company, or an app. Each one can vouch for any website`, items }
}

// --- ssh server settings ---

function sshdValue (key, fallback) {
  const files = ['/etc/ssh/sshd_config']
  try { files.unshift(...fs.readdirSync('/etc/ssh/sshd_config.d').filter(f => f.endsWith('.conf')).sort().map(f => path.join('/etc/ssh/sshd_config.d', f))) } catch {}
  for (const f of files) {
    for (const line of read(f).split('\n')) {
      const t = line.trim()
      if (/^match\s/i.test(t)) break
      const m = t.match(new RegExp(`^${key}\\s+(\\S+)`, 'i'))
      if (m) return m[1].toLowerCase()
    }
  }
  return fallback
}

async function ssh_server_config () {
  if (win) return { status: 'unknown', detail: 'this check is for mac and linux' }
  if (!fs.existsSync('/etc/ssh/sshd_config')) return { status: 'strong', detail: 'no ssh server is installed' }
  // only matters if the server is actually reachable
  let running = false
  if (mac) running = (await sh('/usr/sbin/netstat', ['-an', '-p', 'tcp'])).out.split('\n').some(l => /\.22\s.*LISTEN/.test(l))
  else running = (await sh('systemctl', ['is-active', 'ssh'])).out === 'active' || (await sh('systemctl', ['is-active', 'sshd'])).out === 'active'
  if (!running) return { status: 'strong', detail: 'the ssh server is not running, so its settings do not matter right now' }

  const checks = [
    ['PermitRootLogin', 'prohibit-password', v => v === 'yes', 'root can sign in over the network'],
    ['PasswordAuthentication', 'yes', v => v === 'yes', 'passwords are allowed, they can be guessed'],
    ['PermitEmptyPasswords', 'no', v => v === 'yes', 'accounts with no password can sign in'],
    ['X11Forwarding', 'no', v => v === 'yes', 'screen forwarding is on'],
    ['MaxAuthTries', '6', v => Number(v) > 6, 'many password guesses are allowed']
  ]
  const items = checks.map(([k, d, bad, why]) => {
    const v = sshdValue(k, d)
    return bad(v) ? { text: `${k} ${v}`, note: why, flag: true } : { text: `${k} ${v}`, note: 'fine' }
  })
  const bad = items.filter(i => i.flag)
  return bad.length
    ? { status: 'weak', detail: `the ssh server is on and ${bad.length} setting${bad.length === 1 ? ' is' : 's are'} weak`, items }
    : { status: 'strong', detail: 'the ssh server is on and set up safely', items }
}

// --- sign-in history ---

async function recent_signins () {
  if (win) return { status: 'unknown', detail: 'this check is for mac and linux' }
  const r = await sh('last', ['-n', '40'])
  if (!r.ok && !r.out) return { status: 'unknown', detail: r.err || 'could not read the sign-in log' }
  const items = []
  for (const l of r.out.split('\n')) {
    // remote sign-ins carry an address in the host column
    const m = l.match(/^(\S+)\s+(ssh\S*|pts\/\d+)\s+(\d+\.\d+\.\d+\.\d+|[0-9a-f:]{6,})\s+(.+?)(\s+still logged in|\s+-\s+\S+.*)?$/i)
    if (!m || m[1] === 'reboot' || m[1] === 'wtmp') continue
    items.push({ text: `${m[1]} from ${m[3]}`, note: m[4].trim(), flag: true })
  }
  return items.length
    ? { status: 'remote', detail: `${items.length} sign-in${items.length === 1 ? '' : 's'} came from other computers recently`, items: items.slice(0, 12) }
    : { status: 'local', detail: 'every recent sign-in happened at this computer' }
}

// --- find my ---

async function find_my () {
  if (!mac) return { status: 'unknown', detail: 'this check is for mac' }
  // the icloud account record lists each service and whether it is on
  const exp = await sh('/usr/bin/defaults', ['export', 'MobileMeAccounts', '-'])
  const json = exp.ok ? await new Promise(resolve => {
    const { spawn } = require('child_process')
    const p = spawn('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'])
    let out = ''
    p.stdout.on('data', d => { out += d })
    p.on('close', () => resolve(out))
    p.on('error', () => resolve(''))
    p.stdin.end(exp.out)
  }) : ''
  let accounts = []
  try { accounts = JSON.parse(json).Accounts || [] } catch {}
  if (!accounts.length) return { status: 'off', detail: 'you are not signed in to icloud, so find my mac cannot be on' }
  const fmm = accounts.flatMap(a => a.Services || []).find(x => x.Name === 'FIND_MY_MAC')
  if (fmm && fmm.Enabled) return { status: 'on', detail: 'find my mac is on, you can locate or erase this mac if it is lost' }
  return { status: 'off', detail: 'find my mac is off' }
}

// --- linux kernel settings ---

function kernel_hardening () {
  if (process.platform !== 'linux') return { status: 'unknown', detail: 'this check is for linux' }
  const val = k => { try { return fs.readFileSync(`/proc/sys/${k.replace(/\./g, '/')}`, 'utf8').trim() } catch { return null } }
  const want = [
    ['kernel.randomize_va_space', '2', 'programs are placed at random spots in memory', 'attacks can guess where code is'],
    ['kernel.kptr_restrict', v => Number(v) >= 1, 'kernel addresses are hidden', 'kernel addresses are visible to every program'],
    ['kernel.dmesg_restrict', '1', 'the kernel log is for admins only', 'any user can read the kernel log'],
    ['kernel.yama.ptrace_scope', v => Number(v) >= 1, 'programs cannot spy on each other', 'any program can read another one\'s memory'],
    ['net.ipv4.conf.all.rp_filter', v => Number(v) >= 1, 'forged sender addresses are dropped', 'forged sender addresses are accepted'],
    ['net.ipv4.tcp_syncookies', '1', 'protected against connection floods', 'not protected against connection floods'],
    ['net.ipv4.conf.all.accept_redirects', '0', 'route hijack messages are ignored', 'route hijack messages are accepted'],
    ['net.ipv4.conf.all.accept_source_route', '0', 'sender-chosen routes are refused', 'sender-chosen routes are accepted'],
    ['fs.protected_symlinks', '1', 'link tricks in shared folders are blocked', 'link tricks in shared folders work'],
    ['fs.suid_dumpable', '0', 'crash dumps of privileged programs are off', 'privileged programs can leave readable crash dumps']
  ]
  const items = []
  let seen = 0
  for (const [k, ok, good, bad] of want) {
    const v = val(k)
    if (v == null) continue
    seen++
    const pass = typeof ok === 'function' ? ok(v) : v === ok
    items.push(pass ? { text: k, note: good } : { text: k, note: bad, flag: true })
  }
  if (!seen) return { status: 'unknown', detail: 'could not read kernel settings' }
  const weak = items.filter(i => i.flag).length
  return weak
    ? { status: 'weak', detail: `${weak} of ${seen} kernel safety settings are off`, items }
    : { status: 'strong', detail: `all ${seen} kernel safety settings are on`, items }
}

// --- windows only ---

async function smb1 () {
  const r = await ps('"smb1=$((Get-SmbServerConfiguration -ErrorAction SilentlyContinue).EnableSMB1Protocol)"; "client=$((Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction SilentlyContinue).State)"')
  const o = Object.fromEntries(r.out.split(/\r?\n/).map(l => l.split(/=(.*)/s).slice(0, 2)))
  if (!o.smb1 && !o.client) return { status: 'unknown', detail: r.err || 'could not read file sharing settings' }
  if (o.smb1 === 'True' || o.client === 'Enabled') return { status: 'on', detail: 'the old, broken file sharing version (SMBv1) is on. Ransomware like WannaCry used it' }
  return { status: 'off', detail: 'old file sharing (SMBv1) is off' }
}

async function uac () {
  const r = await ps(`$k = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -ErrorAction SilentlyContinue; "lua=$($k.EnableLUA)"; "prompt=$($k.ConsentPromptBehaviorAdmin)"`)
  const o = Object.fromEntries(r.out.split(/\r?\n/).map(l => l.split(/=(.*)/s).slice(0, 2)))
  if (o.lua == null) return { status: 'unknown', detail: r.err || 'could not read the admin prompt setting' }
  if (o.lua === '0') return { status: 'off', detail: 'User Account Control is off, programs can get admin rights without asking' }
  if (o.prompt === '0') return { status: 'weak', detail: 'admin rights are given without asking you' }
  return { status: 'on', detail: 'Windows asks before a program gets admin rights' }
}

module.exports = {
  credential_files, shell_persistence, scheduled_tasks, suspicious_processes, admin_accounts, auto_login,
  trusted_certificates, ssh_server_config, recent_signins, find_my, kernel_hardening, smb1, uac
}
