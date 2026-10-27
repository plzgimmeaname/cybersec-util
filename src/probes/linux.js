const fs = require('fs')
const sh = require('./sh')
const { summarize } = require('./ports')
const { browser_extensions } = require('./extensions')
const path = require('path')
const os = require('os')

// root is encrypted if any device under it is a luks "crypt" layer
async function disk_encryption_status () {
  const src = await sh('findmnt', ['-n', '-o', 'SOURCE', '/'])
  if (!src.ok || !src.out) return { status: 'unknown', detail: src.err || 'could not find root device' }

  const dev = src.out.split('[')[0] // btrfs adds [/subvol]
  const tree = await sh('lsblk', ['-s', '-l', '-n', '-o', 'TYPE', dev])
  if (!tree.ok) return { status: 'unknown', detail: tree.err || `could not inspect ${dev}` }

  const types = tree.out.split('\n').map(s => s.trim())
  return types.includes('crypt')
    ? { status: 'on', detail: `root (${dev}) is on a luks volume` }
    : { status: 'off', detail: `root (${dev}) is not encrypted` }
}

// ufw: config file says enabled (readable without root)
// firewalld / nftables: service is running
async function firewall_status () {
  try {
    const conf = fs.readFileSync('/etc/ufw/ufw.conf', 'utf8')
    if (/^\s*ENABLED\s*=\s*yes/m.test(conf)) return { status: 'on', detail: 'ufw is on' }
  } catch {}

  for (const svc of ['firewalld', 'nftables']) {
    const r = await sh('systemctl', ['is-active', svc])
    if (r.out === 'active') return { status: 'on', detail: `${svc} is running` }
    if (/ENOENT/.test(r.err)) return { status: 'unknown', detail: 'no systemctl, could not check firewall services' }
  }
  return { status: 'off', detail: 'no firewall found (looked for ufw, firewalld, nftables)' }
}

// tries apt, then dnf, then pacman. uses what's already downloaded, no password needed
async function os_updates_status () {
  const apt = await sh('apt', ['list', '--upgradable'], { timeout: 60000 })
  if (apt.ok) {
    const pkgs = apt.out.split('\n').filter(l => l.includes('upgradable from'))
    const security = pkgs.filter(l => l.includes('-security')).length
    return pkgs.length
      ? { status: 'behind', detail: `${pkgs.length} waiting (${security} security)` }
      : { status: 'current', detail: 'all packages are up to date' }
  }

  // dnf exits 100 when updates exist
  const dnf = await sh('dnf', ['check-update', '-q'], { timeout: 120000 })
  if (dnf.code === 0) return { status: 'current', detail: 'all packages are up to date' }
  if (dnf.code === 100) {
    const n = dnf.out.split('\n').filter(l => l.trim() && !l.startsWith(' ')).length
    return { status: 'behind', detail: `${n} waiting` }
  }

  // checkupdates (pacman-contrib) exits 2 when nothing is waiting
  const pac = await sh('checkupdates', [], { timeout: 120000 })
  if (pac.code === 2) return { status: 'current', detail: 'all packages are up to date' }
  if (pac.ok) return { status: 'behind', detail: `${pac.out.split('\n').length} waiting` }

  return { status: 'unknown', detail: 'could not find apt, dnf or checkupdates' }
}

async function auto_updates_status () {
  const apt = await sh('apt-config', ['dump'])
  if (apt.ok) {
    return /APT::Periodic::Unattended-Upgrade "1"/.test(apt.out)
      ? { status: 'on', detail: 'unattended-upgrades is on' }
      : { status: 'off', detail: 'unattended-upgrades is off or not installed' }
  }

  const timers = ['dnf-automatic.timer', 'dnf-automatic-install.timer', 'dnf5-automatic.timer', 'rpm-ostreed-automatic.timer']
  for (const t of timers) {
    const r = await sh('systemctl', ['is-enabled', t])
    if (r.out === 'enabled') return { status: 'on', detail: `${t.replace('.timer', '')} is on` }
  }
  if ((await sh('dnf', ['--version'])).ok) return { status: 'off', detail: 'dnf-automatic is off or not installed' }

  if ((await sh('pacman', ['--version'])).ok) return { status: 'off', detail: 'arch-based systems do not update on their own' }
  return { status: 'unknown', detail: 'could not tell how this system updates' }
}

// linux rarely needs antivirus at home, so a missing one is just a note
async function antimalware_status () {
  for (const svc of ['clamav-daemon', 'clamd@scan', 'clamd', 'clamav-freshclam']) {
    const r = await sh('systemctl', ['is-active', svc])
    if (r.out === 'active') return { status: 'on', detail: `clamav is running (${svc})` }
  }
  return { status: 'info', detail: 'no antivirus found. on linux this is normal for home use, updates and the firewall matter more' }
}

// gnome and kde keep this in different places
async function screen_lock_status () {
  const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase()
  const num = s => parseInt(String(s).replace(/^uint32\s+/, ''), 10)

  if (desktop.includes('kde')) {
    for (const cmd of ['kreadconfig6', 'kreadconfig5']) {
      const read = key => sh(cmd, ['--file', 'kscreenlockerrc', '--group', 'Daemon', '--key', key])
      const auto = await read('Autolock')
      if (!auto.ok) continue
      if (auto.out === 'false') return { status: 'off', detail: 'screen locking is turned off' }
      const mins = num((await read('Timeout')).out) || 5
      return mins <= 15
        ? { status: 'on', detail: `locks after ${mins} min` }
        : { status: 'off', detail: `takes ${mins} min to lock (should be 15 or less)` }
    }
  }

  const get = (schema, key) => sh('gsettings', ['get', schema, key])
  const enabled = await get('org.gnome.desktop.screensaver', 'lock-enabled')
  if (enabled.ok) {
    if (enabled.out !== 'true') return { status: 'off', detail: 'screen locking is turned off' }
    const idle = num((await get('org.gnome.desktop.session', 'idle-delay')).out)
    const delay = num((await get('org.gnome.desktop.screensaver', 'lock-delay')).out) || 0
    if (!idle) return { status: 'off', detail: 'screen never goes blank, so it never locks' }
    const mins = Math.round((idle + delay) / 60)
    return mins <= 15
      ? { status: 'on', detail: `locks after about ${mins} min` }
      : { status: 'off', detail: `takes about ${mins} min to lock (should be 15 or less)` }
  }
  return { status: 'unknown', detail: 'could not find gnome or kde lock settings' }
}

async function user_is_admin () {
  const r = await sh('id', ['-Gn'])
  if (!r.ok) return { status: 'unknown', detail: r.err }
  const user = process.env.USER || 'you'
  if (process.getuid && process.getuid() === 0) return { status: 'admin', detail: 'running as root' }
  const groups = r.out.split(/\s+/).filter(g => ['sudo', 'wheel', 'admin'].includes(g))
  return groups.length
    ? { status: 'admin', detail: `${user} can use sudo (group: ${groups.join(', ')})` }
    : { status: 'standard', detail: `${user} is a standard account` }
}

// ss shows app names only for your own apps without sudo
async function listening_ports () {
  const r = await sh('ss', ['-tlnpH'])
  if (!r.ok) return { status: 'unknown', detail: r.err || 'could not run ss' }
  const sockets = r.out.split('\n').filter(Boolean).map(line => {
    const cols = line.trim().split(/\s+/)
    const local = cols[3] || ''
    const i = local.lastIndexOf(':')
    const name = (line.match(/users:\(\("([^"]+)"/) || [])[1]
    return { addr: local.slice(0, i).replace(/%.*$/, ''), port: parseInt(local.slice(i + 1), 10), name }
  })
  return summarize(sockets, ['avahi-daemon', 'systemd-resolve', 'cupsd', 'chronyd'])
}

const read = f => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }
const active = async svc => (await sh('systemctl', ['is-active', svc])).out === 'active'

// sshd uses the first value it sees, drop-in files are read before the main file
function sshSetting (key, fallback) {
  const dir = '/etc/ssh/sshd_config.d'
  let files = []
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.conf')).sort().map(f => path.join(dir, f)) } catch {}
  for (const f of [...files, '/etc/ssh/sshd_config']) {
    for (const line of read(f).split('\n')) {
      const t = line.trim()
      if (/^match\s/i.test(t)) break
      const m = t.match(new RegExp(`^${key}\\s+(\\S+)`, 'i'))
      if (m) return m[1].toLowerCase()
    }
  }
  return fallback
}

async function remote_access () {
  const items = []
  if (await active('ssh') || await active('sshd')) {
    const pw = sshSetting('PasswordAuthentication', 'yes')
    const root = sshSetting('PermitRootLogin', 'prohibit-password')
    if (pw === 'yes') items.push({ text: 'ssh server', note: 'allows passwords, which can be guessed', flag: true })
    else items.push({ text: 'ssh server', note: 'keys only, this is the safe way' })
    if (root === 'yes') items.push({ text: 'ssh root login', note: 'root can sign in over the network', flag: true })
  }
  if (await active('xrdp')) items.push({ text: 'remote desktop (xrdp)', flag: true })
  if (await active('smbd')) items.push({ text: 'file sharing (samba)', flag: true })

  const ss = await sh('ss', ['-tlnH'])
  const vnc = ss.out.split('\n').some(l => /:(59\d\d)\s/.test(l) && !/127\.0\.0\.1|\[::1\]/.test(l))
  if (vnc) items.push({ text: 'screen sharing (vnc)', flag: true })

  const flagged = items.filter(i => i.flag)
  if (!items.length) return { status: 'closed', detail: 'no ssh, remote desktop or file sharing is on' }
  return flagged.length
    ? { status: 'open', detail: `turned on: ${flagged.map(i => i.text).join(', ')}`, items }
    : { status: 'closed', detail: 'ssh is on but only accepts keys', items }
}

// paths that malware likes to hide in
const odd = p => /^\/(tmp|var\/tmp|dev\/shm)\/|\/\./.test(p)

function judge (name, prog) {
  if (!prog) return { text: name }
  if (prog.startsWith('/') && !fs.existsSync(prog)) return { text: name, note: 'program is gone, leftover from a removed app', flag: true }
  if (odd(prog)) return { text: name, note: `runs from an odd place: ${prog}`, flag: true }
  return { text: name }
}

// desktop autostart, user systemd services, and your crontab
async function startup_items () {
  const items = []
  const auto = path.join(os.homedir(), '.config/autostart')
  let files = []
  try { files = fs.readdirSync(auto).filter(f => f.endsWith('.desktop')) } catch {}
  for (const f of files) {
    const text = read(path.join(auto, f))
    if (/^Hidden\s*=\s*true/mi.test(text)) continue
    const exec = (text.match(/^Exec\s*=\s*(.+)$/m) || [])[1] || ''
    items.push(judge(f.replace(/\.desktop$/, ''), exec.split(/\s+/)[0]))
  }

  const units = await sh('systemctl', ['--user', 'list-unit-files', '--state=enabled', '--type=service', '--no-legend'])
  for (const unit of units.out.split('\n').map(l => l.trim().split(/\s+/)[0]).filter(Boolean)) {
    const show = await sh('systemctl', ['--user', 'show', '-p', 'ExecStart', unit])
    items.push(judge(unit.replace(/\.service$/, ''), (show.out.match(/path=(\S+)/) || [])[1]))
  }

  const cron = await sh('crontab', ['-l'])
  for (const line of cron.out.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !/^\w+=/.test(l))) {
    const cmd = line.startsWith('@') ? line.split(/\s+/).slice(1).join(' ') : line.split(/\s+/).slice(5).join(' ')
    if (/(curl|wget)[^|]*\|\s*(ba|z)?sh/.test(cmd)) items.push({ text: `cron: ${cmd.slice(0, 60)}`, note: 'downloads and runs code from the internet', flag: true })
    else items.push({ ...judge(`cron: ${cmd.slice(0, 60)}`, cmd.split(/\s+/)[0]) })
  }

  items.sort((a, b) => (!!b.flag - !!a.flag) || a.text.localeCompare(b.text))
  const flagged = items.filter(i => i.flag).length
  if (!items.length) return { status: 'clean', detail: 'no extra apps start on their own' }
  return flagged
    ? { status: 'review', detail: `${items.length} things start on their own, ${flagged} worth a look`, items }
    : { status: 'clean', detail: `${items.length} things start on their own, none look odd`, items }
}

// the SecureBoot efi variable: last byte 1 = on
async function secure_boot_status () {
  const mok = await sh('mokutil', ['--sb-state'])
  if (/SecureBoot enabled/i.test(mok.out)) return { status: 'on', detail: 'secure boot is on' }
  if (/SecureBoot disabled/i.test(mok.out)) return { status: 'off', detail: 'secure boot is off' }

  if (!fs.existsSync('/sys/firmware/efi')) return { status: 'off', detail: 'this computer starts in old bios mode, so secure boot is not used' }
  try {
    const v = fs.readFileSync('/sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c')
    return v[v.length - 1] === 1 ? { status: 'on', detail: 'secure boot is on' } : { status: 'off', detail: 'secure boot is off' }
  } catch {
    return { status: 'unknown', detail: 'could not read secure boot (try installing mokutil)' }
  }
}

// /etc/passwd is readable by everyone; an empty password field means no password at all
async function guest_accounts () {
  const passwd = read('/etc/passwd')
  if (!passwd) return { status: 'unknown', detail: 'could not read /etc/passwd' }
  const items = []
  for (const line of passwd.split('\n')) {
    const [name, pw, uid, , , , shell] = line.split(':')
    if (!name || !shell || /(nologin|false)$/.test(shell)) continue
    const id = parseInt(uid, 10)
    if (pw === '') items.push({ text: name, note: 'has no password', flag: true })
    else if (name === 'guest' || name.startsWith('guest-')) items.push({ text: name, note: 'guest account', flag: true })
    else if (id >= 1000 && id < 65534) items.push({ text: name })
  }
  const lightdm = ['/etc/lightdm/lightdm.conf', '/usr/share/lightdm/lightdm.conf.d/50-guest-wrapper.conf']
  if (lightdm.some(f => /^\s*allow-guest\s*=\s*true/mi.test(read(f)))) items.unshift({ text: 'guest session', note: 'anyone can sign in without a password', flag: true })

  const flagged = items.filter(i => i.flag).length
  return flagged
    ? { status: 'open', detail: `${flagged} account${flagged === 1 ? '' : 's'} can be used without a password`, items }
    : { status: 'closed', detail: 'no guest or passwordless accounts', items }
}

module.exports = {
  disk_encryption_status,
  firewall_status,
  os_updates_status,
  auto_updates_status,
  antimalware_status,
  screen_lock_status,
  user_is_admin,
  listening_ports,
  remote_access,
  startup_items,
  secure_boot_status,
  guest_accounts,
  browser_extensions
}
