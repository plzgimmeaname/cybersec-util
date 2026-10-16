const sh = require('./sh')

async function disk_encryption_status () {
  const r = await sh('/usr/bin/fdesetup', ['status'])
  if (/FileVault is On/i.test(r.out)) return { status: 'on', detail: 'filevault is on' }
  if (/FileVault is Off/i.test(r.out)) return { status: 'off', detail: 'filevault is off' }
  return { status: 'unknown', detail: r.err || r.out || 'could not read filevault status' }
}

// state 1 = on, 2 = on and blocking everything, 0 = off
async function firewall_status () {
  const fw = '/usr/libexec/ApplicationFirewall/socketfilterfw'
  const r = await sh(fw, ['--getglobalstate'])
  const m = r.out.match(/State = (\d)/)
  if (!m) return { status: 'unknown', detail: r.err || r.out || 'could not read firewall status' }
  if (m[1] === '0') return { status: 'off', detail: 'firewall is off' }

  const stealth = await sh(fw, ['--getstealthmode'])
  const hidden = /stealth mode (is on|enabled)/i.test(stealth.out)
  return { status: 'on', detail: `firewall is on, stealth mode is ${hidden ? 'on' : 'off'}` }
}

module.exports = { disk_encryption_status, firewall_status }
