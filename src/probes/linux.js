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

module.exports = { disk_encryption_status, firewall_status }
