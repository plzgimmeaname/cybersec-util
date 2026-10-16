const sh = require('./sh')

async function disk_encryption_status () {
  const r = await sh('/usr/bin/fdesetup', ['status'])
  if (/FileVault is On/i.test(r.out)) return { status: 'on', detail: 'filevault is on' }
  if (/FileVault is Off/i.test(r.out)) return { status: 'off', detail: 'filevault is off' }
  return { status: 'unknown', detail: r.err || r.out || 'could not read filevault status' }
}

module.exports = { disk_encryption_status }
