const fs = require('fs')
const sh = require('./sh')
const { summarize } = require('./ports')

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

module.exports = {
  disk_encryption_status,
  firewall_status,
  os_updates_status,
  auto_updates_status,
  antimalware_status,
  screen_lock_status,
  user_is_admin,
  listening_ports
}
