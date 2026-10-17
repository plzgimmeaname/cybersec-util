const fs = require('fs')
const sh = require('./sh')

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

module.exports = { disk_encryption_status, firewall_status, os_updates_status, auto_updates_status }
