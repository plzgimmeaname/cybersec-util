const sh = require('./sh')
const { summarize } = require('./ports')
const { browser_extensions } = require('./extensions')
const fs = require('fs')
const path = require('path')
const os = require('os')

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
  if (!titles.length) return { status: 'unknown', detail: `could not check with apple: ${r.err || 'no answer'}` }

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

// gatekeeper blocks unknown apps, xprotect is apple's built-in virus scanner
async function antimalware_status () {
  const gk = await sh('/usr/sbin/spctl', ['--status'])
  const xp = await sh('/usr/bin/defaults', ['read', '/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist', 'CFBundleShortVersionString'])
  const gkOn = /assessments enabled/.test(gk.out)
  if (!gk.ok && !xp.ok) return { status: 'unknown', detail: 'could not read gatekeeper or xprotect' }
  if (!gkOn) return { status: 'off', detail: 'gatekeeper is off, any app can run without a check' }
  if (!xp.ok) return { status: 'off', detail: 'xprotect is missing' }
  return { status: 'on', detail: `gatekeeper is on, xprotect version ${xp.out}` }
}

// time until locked = idle time before screensaver / display sleep + password delay
async function screen_lock_status () {
  const lock = await sh('/usr/sbin/sysadminctl', ['-screenLock', 'status'])
  const text = `${lock.out}\n${lock.err}`
  if (/screenLock is off/i.test(text)) return { status: 'off', detail: 'no password needed after sleep or screensaver' }
  const d = text.match(/screenLock delay is (immediate|\d+)/i)
  if (!d) return { status: 'unknown', detail: 'could not read lock setting' }
  const delay = d[1] === 'immediate' ? 0 : parseInt(d[1], 10)

  const ss = parseInt((await sh('/usr/bin/defaults', ['-currentHost', 'read', 'com.apple.screensaver', 'idleTime'])).out, 10) || 0
  const pm = (await sh('/usr/bin/pmset', ['-g'])).out.match(/displaysleep\s+(\d+)/)
  const display = pm ? parseInt(pm[1], 10) * 60 : 0
  const idle = [ss, display].filter(n => n > 0)
  if (!idle.length) return { status: 'off', detail: 'screen never sleeps, so it never locks' }

  const mins = Math.round((Math.min(...idle) + delay) / 60)
  return mins <= 15
    ? { status: 'on', detail: `locks after about ${mins} min` }
    : { status: 'off', detail: `takes about ${mins} min to lock (should be 15 or less)` }
}

async function user_is_admin () {
  const r = await sh('/usr/bin/id', ['-Gn'])
  if (!r.ok) return { status: 'unknown', detail: r.err }
  const user = process.env.USER || 'you'
  return r.out.split(/\s+/).includes('admin')
    ? { status: 'admin', detail: `${user} is an admin account` }
    : { status: 'standard', detail: `${user} is a standard account` }
}

// netstat -v shows every app's sockets without needing a password
async function listening_ports () {
  const r = await sh('/usr/sbin/netstat', ['-anv', '-p', 'tcp'])
  if (!r.ok) return { status: 'unknown', detail: r.err }
  const sockets = []
  for (const line of r.out.split('\n')) {
    const m = line.match(/^tcp\S*\s+\d+\s+\d+\s+(\S+)\s+\S+\s+LISTEN\s+(?:\d+\s+){4}(.+?):\d+\s+[0-9a-f]{5}\s/)
    if (!m) continue
    const i = m[1].lastIndexOf('.')
    sockets.push({ addr: m[1].slice(0, i), port: parseInt(m[1].slice(i + 1), 10), name: m[2].trim() })
  }
  return summarize(sockets, ['rapportd', 'ControlCenter', 'sharingd', 'mDNSResponder', 'launchd', 'symptomsd', 'netbiosd', 'AirPlayXPCHelper', 'AMPDevicesAgent'])
}

// launchd answers on these ports when a sharing feature is on
const REMOTE_PORTS = {
  22: 'remote login (ssh)',
  5900: 'screen sharing',
  3283: 'remote management',
  3031: 'remote apple events',
  445: 'file sharing'
}

async function remote_access () {
  const r = await sh('/usr/sbin/netstat', ['-anv', '-p', 'tcp'])
  if (!r.ok) return { status: 'unknown', detail: r.err }
  const on = new Set()
  for (const line of r.out.split('\n')) {
    const m = line.match(/^tcp\S*\s+\d+\s+\d+\s+(\S+)\s+\S+\s+LISTEN/)
    if (!m || /^(127\.|::1)/.test(m[1])) continue
    const port = parseInt(m[1].slice(m[1].lastIndexOf('.') + 1), 10)
    if (REMOTE_PORTS[port]) on.add(REMOTE_PORTS[port])
  }
  return on.size
    ? { status: 'open', detail: `turned on: ${[...on].join(', ')}`, items: [...on].map(t => ({ text: t, flag: true })) }
    : { status: 'closed', detail: 'no remote login, screen sharing or file sharing is on' }
}

// launch agents / daemons outside apple's own folders
async function startup_items () {
  const dirs = ['/Library/LaunchAgents', '/Library/LaunchDaemons', path.join(os.homedir(), 'Library/LaunchAgents')]
  const items = []
  for (const dir of dirs) {
    let files = []
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.plist')) } catch { continue }
    for (const f of files) {
      const j = await sh('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(dir, f)])
      let plist = {}
      try { plist = JSON.parse(j.out) } catch {}
      const prog = plist.Program || (plist.ProgramArguments || [])[0]
      const name = f.replace(/\.plist$/, '')
      if (!prog) { items.push({ text: name }); continue }

      if (!fs.existsSync(prog)) { items.push({ text: name, note: 'program is gone, leftover from a removed app', flag: true }); continue }
      const sig = await sh('/usr/bin/codesign', ['-v', prog])
      if (/not signed/i.test(sig.err)) items.push({ text: name, note: 'not signed by its maker', flag: true })
      else if (/\/tmp\/|\/Users\/Shared\/|\/\./.test(prog)) items.push({ text: name, note: `runs from an odd place: ${prog}`, flag: true })
      else items.push({ text: name })
    }
  }
  items.sort((a, b) => (!!b.flag - !!a.flag) || a.text.localeCompare(b.text))
  const flagged = items.filter(i => i.flag).length
  if (!items.length) return { status: 'clean', detail: 'no extra apps start on their own' }
  return flagged
    ? { status: 'review', detail: `${items.length} apps start on their own, ${flagged} worth a look`, items }
    : { status: 'clean', detail: `${items.length} apps start on their own, all signed by their makers`, items }
}

// sip stops even admin apps from changing core system files
async function secure_boot_status () {
  const r = await sh('/usr/bin/csrutil', ['status'])
  if (/status: enabled/i.test(r.out)) return { status: 'on', detail: 'system integrity protection is on' }
  if (/status: disabled/i.test(r.out)) return { status: 'off', detail: 'system integrity protection is off' }
  return { status: 'unknown', detail: r.err || r.out || 'could not read system integrity protection' }
}

async function guest_accounts () {
  const guest = await sh('/usr/bin/defaults', ['read', '/Library/Preferences/com.apple.loginwindow', 'GuestEnabled'])
  const users = await sh('/usr/bin/dscl', ['.', 'list', '/Users', 'UniqueID'])
  const people = users.out.split('\n').map(l => l.trim().split(/\s+/)).filter(([n, id]) => parseInt(id, 10) >= 500 && !n.startsWith('_')).map(([n]) => n)

  const items = []
  for (const u of people) {
    const last = await sh('/usr/bin/last', ['-1', u])
    const line = last.out.split('\n')[0] || ''
    const when = line.match(/\w{3} \w{3}\s+\d+ \d+:\d+/)
    const seen = !line.startsWith(u) ? 'no recent sign-in on record'
      : /still logged in/.test(line) ? 'signed in now'
        : `last sign-in ${when ? when[0].replace(/\s+/g, ' ') : 'unknown'}`
    items.push({ text: u, note: seen })
  }

  const guestOn = guest.out === '1'
  if (guestOn) items.unshift({ text: 'guest', note: 'anyone can sign in without a password', flag: true })
  return guestOn
    ? { status: 'open', detail: 'the guest account is on', items }
    : { status: 'closed', detail: `guest is off, ${people.length} account${people.length === 1 ? '' : 's'} on this mac`, items }
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
