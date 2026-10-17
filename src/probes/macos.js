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

// big version jumps (26 → 27) are optional, only same-version fixes count
async function os_updates_status () {
  const ver = await sh('/usr/bin/sw_vers', ['-productVersion'])
  const major = ver.out.split('.')[0]
  const r = await sh('/usr/sbin/softwareupdate', ['-l'], { timeout: 120000 })
  const text = `${r.out}\n${r.err}`
  if (/No new software available/i.test(text)) return { status: 'current', detail: `macos ${ver.out} is up to date` }

  const titles = [...text.matchAll(/Title: ([^,]+), Version: ([^,]+)/g)].map(m => ({ title: m[1].trim(), version: m[2].trim() }))
  if (!titles.length) return { status: 'unknown', detail: r.err || 'could not check for updates' }

  const upgrades = titles.filter(t => /^macOS/.test(t.title) && t.version.split('.')[0] !== major)
  const pending = titles.filter(t => !upgrades.includes(t))
  const extra = upgrades.length ? ` (optional upgrade: ${upgrades.map(u => u.title.toLowerCase()).join(', ')})` : ''
  return pending.length
    ? { status: 'behind', detail: `${pending.length} waiting: ${pending.map(p => p.title.toLowerCase()).join(', ')}${extra}` }
    : { status: 'current', detail: `macos ${ver.out} is up to date${extra}` }
}

// missing keys mean apple's default; install-macos defaults to off
async function auto_updates_status () {
  const read = async key => (await sh('/usr/bin/defaults', ['read', '/Library/Preferences/com.apple.SoftwareUpdate', key])).out
  const settings = {
    'check for updates': (await read('AutomaticCheckEnabled')) !== '0',
    'download updates': (await read('AutomaticDownload')) !== '0',
    'install security fixes': (await read('CriticalUpdateInstall')) !== '0',
    'install macos updates': (await read('AutomaticallyInstallMacOSUpdates')) === '1'
  }
  const off = Object.keys(settings).filter(k => !settings[k])
  return off.length
    ? { status: 'off', detail: `turned off: ${off.join(', ')}` }
    : { status: 'on', detail: 'automatic updates are on' }
}

module.exports = { disk_encryption_status, firewall_status, os_updates_status, auto_updates_status }
