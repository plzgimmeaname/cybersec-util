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

module.exports = { disk_encryption_status }
