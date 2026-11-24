// one-click fixes. the ui only ever sends a check id, everything that runs is written here.
// every fix says what it does and how to undo it, and is confirmed by the user in a native dialog first
const fs = require('fs')
const path = require('path')
const os = require('os')
const sh = require('./probes/sh')

const home = os.homedir()
const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`
const line = argv => argv.map(shq).join(' ')

// --- elevation ---

// runs shell commands as an admin. the os shows its own password prompt, we never see the password
async function elevatePosix (script) {
  if (process.platform === 'darwin') {
    const esc = script.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return sh('/usr/bin/osascript', ['-e', `do shell script "${esc}" with administrator privileges`], { timeout: 300000 })
  }
  return sh('pkexec', ['/bin/sh', '-c', script], { timeout: 300000 })
}

// the windows version opens a UAC prompt and waits for the elevated window to finish
async function elevateWindows (script) {
  const inner = `$ErrorActionPreference = 'Stop'; try { ${script} } catch { Write-Error $_; exit 1 }; exit 0`
  const enc = Buffer.from(inner, 'utf16le').toString('base64')
  const outer = `try { $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${enc}'; exit $p.ExitCode } catch { Write-Error 'admin permission was not given'; exit 2 }`
  return sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(outer, 'utf16le').toString('base64')], { timeout: 300000 })
}

const psUser = script => sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ErrorActionPreference = 'Stop'; ${script}`, 'utf16le').toString('base64')], { timeout: 60000 })

// --- helpers for file permission fixes ---

function lockFiles (files, mode = 0o600) {
  let n = 0
  for (const f of files) {
    try { fs.chmodSync(f, mode); n++ } catch {}
  }
  return n
}

function sshFiles () {
  const dir = path.join(home, '.ssh')
  const out = { dir, keys: [] }
  try {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f)
      const st = fs.statSync(full)
      if (!st.isFile() || f.endsWith('.pub') || st.size > 64 * 1024) continue
      if (/PRIVATE KEY-----/.test(fs.readFileSync(full, 'utf8'))) out.keys.push(full)
      else if (f === 'authorized_keys' || f === 'config') out.keys.push(full)
    }
  } catch {}
  return out
}

async function lockSecrets () {
  const { credential_files } = require('./probes/local')
  const res = credential_files()
  const files = (res.items || []).filter(i => i.flag && i.text.startsWith('~/')).map(i => path.join(home, i.text.slice(2)))
  const n = lockFiles(files)
  return `locked ${n} file${n === 1 ? '' : 's'} to your account`
}

// --- the fixes ---

const fw = '/usr/libexec/ApplicationFirewall/socketfilterfw'
const macPref = (domain, key, type, val) => ['/usr/bin/defaults', 'write', domain, key, `-${type}`, String(val)]

const mac = {
  firewall: {
    label: 'Turn on firewall',
    summary: 'Turns on the macOS firewall and stealth mode.',
    undo: 'System Settings → Network → Firewall → turn it off.',
    admin: true,
    cmds: () => [[fw, '--setglobalstate', 'on'], [fw, '--setstealthmode', 'on']]
  },
  'auto-updates': {
    label: 'Turn on automatic updates',
    summary: 'Turns on checking, downloading, and installing of updates and security fixes.',
    undo: 'System Settings → General → Software Update → Automatic updates.',
    admin: true,
    cmds: () => {
      const d = '/Library/Preferences/com.apple.SoftwareUpdate'
      return ['AutomaticCheckEnabled', 'AutomaticDownload', 'CriticalUpdateInstall', 'AutomaticallyInstallMacOSUpdates'].map(k => macPref(d, k, 'bool', true))
    }
  },
  'guest-accounts': {
    label: 'Turn off guest account',
    summary: 'Stops anyone from signing in as a guest without a password.',
    undo: 'System Settings → Users & Groups → Guest User.',
    admin: true,
    cmds: () => [macPref('/Library/Preferences/com.apple.loginwindow', 'GuestEnabled', 'bool', false)]
  },
  antimalware: {
    label: 'Turn on Gatekeeper',
    summary: 'Makes macOS check apps from the internet before they run.',
    undo: 'Run sudo spctl --global-disable in the terminal.',
    admin: true,
    cmds: () => [['/usr/sbin/spctl', '--global-enable']]
  },
  'remote-access': {
    label: 'Turn off Remote Login',
    summary: 'Turns off SSH remote login. Screen sharing and file sharing stay as they are, turn those off in System Settings → General → Sharing.',
    undo: 'System Settings → General → Sharing → Remote Login.',
    admin: true,
    cmds: () => [['/usr/sbin/systemsetup', '-f', '-setremotelogin', 'off']]
  },
  'auto-login': {
    label: 'Turn off automatic sign-in',
    summary: 'Asks for a password when this Mac starts.',
    undo: 'System Settings → Users & Groups → Automatically log in as.',
    admin: true,
    cmds: () => [['/usr/bin/defaults', 'delete', '/Library/Preferences/com.apple.loginwindow', 'autoLoginUser']]
  },
  'clock-sync': {
    label: 'Set the clock automatically',
    summary: 'Turns on network time, so the clock stays right.',
    undo: 'System Settings → General → Date & Time.',
    admin: true,
    cmds: () => [['/usr/sbin/systemsetup', '-setusingnetworktime', 'on']]
  },
  'proxy-settings': {
    label: 'Turn off all proxies',
    summary: 'Turns off web, secure web, SOCKS and script proxies on every network connection.',
    undo: 'System Settings → Network → your connection → Details → Proxies. Your old proxy addresses stay saved.',
    admin: true,
    cmds: async () => {
      const r = await sh('/usr/sbin/networksetup', ['-listallnetworkservices'])
      const services = r.out.split('\n').slice(1).map(s => s.trim()).filter(s => s && !s.startsWith('*'))
      const ns = '/usr/sbin/networksetup'
      return services.flatMap(s => [[ns, '-setwebproxystate', s, 'off'], [ns, '-setsecurewebproxystate', s, 'off'], [ns, '-setsocksfirewallproxystate', s, 'off'], [ns, '-setautoproxystate', s, 'off'], [ns, '-setproxyautodiscovery', s, 'off']])
    }
  },
  'ssh-keys': {
    label: 'Lock SSH files',
    summary: 'Makes the .ssh folder and your private keys readable only by you.',
    undo: 'Permissions can be changed back with chmod.',
    run: async () => {
      const { dir, keys } = sshFiles()
      lockFiles([dir], 0o700)
      return `locked ${lockFiles(keys)} file${keys.length === 1 ? '' : 's'}`
    }
  },
  'credential-files': {
    label: 'Lock saved logins',
    summary: 'Makes saved login and key files readable only by you.',
    undo: 'Permissions can be changed back with chmod.',
    run: lockSecrets
  }
}

const linux = {
  firewall: {
    label: 'Turn on firewall (ufw)',
    summary: 'Turns on ufw with its default rules: block incoming, allow outgoing. SSH is not opened, so remote sessions may drop.',
    undo: 'Type sudo ufw disable.',
    admin: true,
    cmds: () => fs.existsSync('/usr/sbin/ufw') ? [['/usr/sbin/ufw', '--force', 'enable']] : []
  },
  'remote-access': {
    label: 'Turn off SSH server',
    summary: 'Stops the SSH server now and keeps it off after restart. You cannot sign in to this computer from another one afterwards.',
    undo: 'Type sudo systemctl enable --now ssh',
    admin: true,
    cmds: () => [['/bin/sh', '-c', 'systemctl disable --now ssh 2>/dev/null; systemctl disable --now sshd 2>/dev/null; true']]
  },
  'clock-sync': {
    label: 'Set the clock automatically',
    summary: 'Turns on network time.',
    undo: 'Type timedatectl set-ntp false',
    admin: true,
    cmds: () => [['timedatectl', 'set-ntp', 'true']]
  },
  'kernel-hardening': {
    label: 'Turn on kernel safety settings',
    summary: 'Writes /etc/sysctl.d/99-security-checkup.conf with safer values and applies them. They stay on after restart.',
    undo: 'Delete /etc/sysctl.d/99-security-checkup.conf and restart.',
    admin: true,
    cmds: () => {
      const conf = ['kernel.randomize_va_space=2', 'kernel.kptr_restrict=1', 'kernel.dmesg_restrict=1', 'kernel.yama.ptrace_scope=1', 'net.ipv4.conf.all.rp_filter=1', 'net.ipv4.tcp_syncookies=1', 'net.ipv4.conf.all.accept_redirects=0', 'net.ipv4.conf.all.accept_source_route=0', 'fs.protected_symlinks=1', 'fs.suid_dumpable=0'].join('\\n')
      return [['/bin/sh', '-c', `printf '${conf}\\n' > /etc/sysctl.d/99-security-checkup.conf && sysctl --system >/dev/null`]]
    }
  },
  'ssh-keys': mac['ssh-keys'],
  'credential-files': mac['credential-files']
}

const regSet = (key, name, type, val) => `if (-not (Test-Path '${key}')) { New-Item -Path '${key}' -Force | Out-Null }; Set-ItemProperty -Path '${key}' -Name '${name}' -Type ${type} -Value ${val}`

const windows = {
  firewall: {
    label: 'Turn on firewall',
    summary: 'Turns on Windows Firewall for the domain, private and public networks.',
    undo: 'Windows Security → Firewall & network protection.',
    admin: true,
    ps: 'Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True'
  },
  antimalware: {
    label: 'Turn on real-time protection',
    summary: 'Turns Microsoft Defender real-time protection back on. If Tamper Protection or another antivirus controls it, this may not stick.',
    undo: 'Windows Security → Virus & threat protection → Manage settings.',
    admin: true,
    ps: 'Set-MpPreference -DisableRealtimeMonitoring $false'
  },
  'guest-accounts': {
    label: 'Turn off guest account',
    summary: 'Disables the built-in Guest account.',
    undo: 'Open PowerShell as admin and type Enable-LocalUser -Name Guest.',
    admin: true,
    ps: 'Disable-LocalUser -Name Guest'
  },
  'remote-access': {
    label: 'Turn off Remote Desktop',
    summary: 'Stops Remote Desktop connections and closes its firewall rule.',
    undo: 'Settings → System → Remote Desktop.',
    admin: true,
    ps: `${regSet('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server', 'fDenyTSConnections', 'DWord', 1)}; Disable-NetFirewallRule -DisplayGroup 'Remote Desktop' -ErrorAction SilentlyContinue`
  },
  smb1: {
    label: 'Turn off SMBv1',
    summary: 'Turns off the old SMBv1 file sharing version. A restart finishes it.',
    undo: 'Type Enable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol in an admin PowerShell.',
    admin: true,
    ps: 'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force; Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart | Out-Null'
  },
  uac: {
    label: 'Turn on admin prompts',
    summary: 'Turns on User Account Control and sets it to ask for consent. Needs a restart.',
    undo: 'Change User Account Control settings in the Start menu.',
    admin: true,
    ps: `${regSet('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'EnableLUA', 'DWord', 1)}; ${regSet('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'ConsentPromptBehaviorAdmin', 'DWord', 5)}`
  },
  'auto-login': {
    label: 'Turn off automatic sign-in',
    summary: 'Asks for a password at startup and removes any password saved for automatic sign-in.',
    undo: 'Press Win + R, type netplwiz and set it up again.',
    admin: true,
    ps: `${regSet('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'AutoAdminLogon', 'String', "'0'")}; Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon' -Name DefaultPassword -ErrorAction SilentlyContinue`
  },
  'clock-sync': {
    label: 'Sync the clock',
    summary: 'Starts the time service and syncs with the internet.',
    undo: 'Nothing to undo.',
    admin: true,
    ps: 'Set-Service w32time -StartupType Automatic; Start-Service w32time -ErrorAction SilentlyContinue; w32tm /resync | Out-Null'
  },
  'usb-autoplay': {
    label: 'Turn off AutoPlay',
    summary: 'Stops USB drives and discs from starting things by themselves.',
    undo: 'Settings → Bluetooth & devices → AutoPlay.',
    ps: regSet('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\AutoplayHandlers', 'DisableAutoplay', 'DWord', 1)
  },
  'script-policy': {
    label: 'Make PowerShell safer',
    summary: 'Sets the PowerShell policy to RemoteSigned for your account: downloaded scripts must be signed.',
    undo: 'Type Set-ExecutionPolicy Undefined -Scope CurrentUser in PowerShell.',
    ps: 'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force'
  },
  'proxy-settings': {
    label: 'Turn off proxy',
    summary: 'Turns off the manual proxy and the proxy setup script for your account.',
    undo: 'Settings → Network & internet → Proxy.',
    ps: `${regSet('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', 'ProxyEnable', 'DWord', 0)}; Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name AutoConfigURL -ErrorAction SilentlyContinue`
  }
}

const table = { macos: mac, linux, windows }
const lookup = (osName, id) => (table[osName] || {})[id] || null

// what the ui is allowed to know about a fix
function info (osName, id) {
  const f = lookup(osName, id)
  return f ? { label: f.label, summary: f.summary, undo: f.undo, admin: !!f.admin } : null
}

// runs fixes in one go: all the admin steps share a single password prompt
async function apply (osName, ids) {
  const fixes = ids.map(id => ({ id, fix: lookup(osName, id) })).filter(x => x.fix)
  const results = Object.fromEntries(fixes.map(x => [x.id, { ok: true, message: '' }]))
  const adminPosix = []
  const adminPs = []
  const owner = []

  for (const { id, fix } of fixes) {
    try {
      if (fix.run) {
        results[id].message = await fix.run()
      } else if (osName === 'windows') {
        if (fix.admin) { adminPs.push(fix.ps); owner.push(id) } else {
          const r = await psUser(fix.ps)
          results[id] = { ok: r.ok, message: r.ok ? '' : r.err }
        }
      } else {
        const cmds = await fix.cmds()
        if (!cmds.length) { results[id] = { ok: false, message: 'a tool this fix needs is not installed' }; continue }
        if (fix.admin) { adminPosix.push(...cmds.map(line)); owner.push(id) } else {
          for (const c of cmds) {
            const r = await sh(c[0], c.slice(1))
            if (!r.ok) results[id] = { ok: false, message: r.err }
          }
        }
      }
    } catch (e) {
      results[id] = { ok: false, message: e.message }
    }
  }

  let elevated = null
  if (adminPs.length) elevated = await elevateWindows(adminPs.join('; '))
  else if (adminPosix.length) elevated = await elevatePosix(adminPosix.join(' ; '))
  if (elevated && !elevated.ok) {
    const cancelled = /User canceled|-128|dismissed|not given|Error calling|cancel/i.test(`${elevated.err} ${elevated.out}`)
    for (const id of owner) results[id] = { ok: false, cancelled, message: cancelled ? 'permission was not given' : (elevated.err || 'the system refused').split('\n').filter(Boolean).pop() }
  }
  return results
}

// --- log of what the app changed ---

const logFile = base => path.join(base, 'fixes.json')

function readLog (base) {
  try { return JSON.parse(fs.readFileSync(logFile(base), 'utf8')) } catch { return [] }
}

function addLog (base, entries) {
  const log = [...entries, ...readLog(base)].slice(0, 100)
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(logFile(base), JSON.stringify(log))
  return log
}

module.exports = { info, lookup, apply, readLog, addLog }
