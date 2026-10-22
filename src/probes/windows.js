const sh = require('./sh')
const { summarize } = require('./ports')

const ps = (script, opts) => sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], opts)

// turns "key=value" lines into an object
function lines (out) {
  const o = {}
  for (const l of out.split(/\r?\n/)) {
    const i = l.indexOf('=')
    if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim()
  }
  return o
}

// reads bitlocker state without admin rights
// 1 = on, 2 = off, 0 = not available on this drive
async function disk_encryption_status () {
  const drive = process.env.SystemDrive || 'C:'
  const r = await ps(`(New-Object -ComObject Shell.Application).NameSpace('${drive}\\').Self.ExtendedProperty('System.Volume.BitLockerProtection')`)
  const code = parseInt(r.out, 10)
  if (code === 1) return { status: 'on', detail: `bitlocker is on for ${drive}` }
  if (code === 2) return { status: 'off', detail: `bitlocker is off for ${drive}` }
  if (code === 0) return { status: 'off', detail: 'bitlocker is not available or not set up' }
  if (Number.isNaN(code)) return { status: 'unknown', detail: r.err || 'could not read bitlocker status' }
  return { status: 'unknown', detail: `bitlocker is changing state (code ${code})` }
}

// domain, private and public profiles must all be on
async function firewall_status () {
  const r = await ps('Get-NetFirewallProfile | ForEach-Object { "$($_.Name)=$($_.Enabled)" }')
  const profiles = r.out.split(/\r?\n/).map(l => l.trim().split('=')).filter(p => p.length === 2)
  if (!profiles.length) return { status: 'unknown', detail: r.err || 'could not read firewall status' }

  const off = profiles.filter(([, on]) => on !== 'True').map(([name]) => name.toLowerCase())
  return off.length
    ? { status: 'off', detail: `firewall is off for: ${off.join(', ')}` }
    : { status: 'on', detail: 'firewall is on for all profiles' }
}

// asks windows update what's waiting, skips optional ones
async function os_updates_status () {
  const r = await ps(`
    $s = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()
    $res = $s.Search("IsInstalled=0 and IsHidden=0 and Type='Software' and BrowseOnly=0")
    "count=$($res.Updates.Count)"
    "titles=$(($res.Updates | ForEach-Object { $_.Title }) -join ' | ')"
    $h = Get-HotFix | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1
    if ($h) { "last=$($h.InstalledOn.ToString('yyyy-MM-dd'))" }
  `, { timeout: 180000 })
  const o = lines(r.out)
  if (o.count == null) return { status: 'unknown', detail: r.err || 'could not ask windows update' }

  const last = o.last ? `, last update ${o.last}` : ''
  const n = parseInt(o.count, 10)
  return n
    ? { status: 'behind', detail: `${n} waiting: ${o.titles.toLowerCase()}${last}` }
    : { status: 'current', detail: `windows is up to date${last}` }
}

// on by default unless a policy, a disabled service, or a pause turns it off
async function auto_updates_status () {
  const r = await ps(`
    $au = Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU' -ErrorAction SilentlyContinue
    "noauto=$($au.NoAutoUpdate)"
    "auoptions=$($au.AUOptions)"
    "service=$((Get-Service wuauserv).StartType)"
    $ux = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings' -ErrorAction SilentlyContinue
    "paused=$($ux.PauseUpdatesExpiryTime)"
  `)
  const o = lines(r.out)
  if (o.service == null) return { status: 'unknown', detail: r.err || 'could not read update settings' }

  if (o.noauto === '1') return { status: 'off', detail: 'automatic updates are turned off by a policy' }
  if (o.auoptions === '1' || o.auoptions === '2') return { status: 'off', detail: 'windows only tells you about updates, it does not get them' }
  if (o.service === 'Disabled') return { status: 'off', detail: 'the windows update service is disabled' }
  const until = o.paused && new Date(o.paused)
  if (until && until > new Date()) return { status: 'off', detail: `updates are paused until ${until.toISOString().slice(0, 10)}` }
  return { status: 'on', detail: 'automatic updates are on' }
}

// security center knows about defender and any other antivirus
// productState bits: 0x1000 = turned on, 0x10 = definitions out of date
async function antimalware_status () {
  const r = await ps(`
    Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct -ErrorAction SilentlyContinue |
      ForEach-Object { "av=$($_.displayName)|$($_.productState)" }
    $d = Get-MpComputerStatus -ErrorAction SilentlyContinue
    if ($d) { "defender=$($d.RealTimeProtectionEnabled)|$($d.AntivirusSignatureAge)" }
  `, { timeout: 30000 })
  const out = r.out.split(/\r?\n/)
  const products = out.filter(l => l.startsWith('av=')).map(l => {
    const [name, state] = l.slice(3).split('|')
    const n = parseInt(state, 10)
    return { name, on: ((n >> 12) & 0xf) === 1, fresh: ((n >> 4) & 0xf) === 0 }
  })

  const active = products.filter(p => p.on)
  if (active.length) {
    const fresh = active.filter(p => p.fresh)
    return fresh.length
      ? { status: 'on', detail: `${fresh.map(p => p.name).join(', ')} is on` }
      : { status: 'off', detail: `${active[0].name} is on but its virus list is out of date` }
  }

  // no security center (windows server), fall back to defender directly
  const def = out.find(l => l.startsWith('defender='))
  if (def) {
    const [rt, age] = def.slice(9).split('|')
    if (rt !== 'True') return { status: 'off', detail: 'defender real-time protection is off' }
    return parseInt(age, 10) > 7
      ? { status: 'off', detail: `defender's virus list is ${age} days old` }
      : { status: 'on', detail: 'defender is on' }
  }
  if (products.length) return { status: 'off', detail: `${products.map(p => p.name).join(', ')} is turned off` }
  return { status: 'unknown', detail: r.err || 'could not find any antivirus' }
}

// locked if any of: a lock policy, a password screensaver, or sleep + sign-in on wake
async function screen_lock_status () {
  const r = await ps(`
    $d = Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -ErrorAction SilentlyContinue
    "ss_active=$($d.ScreenSaveActive)"
    "ss_secure=$($d.ScreenSaverIsSecure)"
    "ss_timeout=$($d.ScreenSaveTimeOut)"
    $p = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -ErrorAction SilentlyContinue
    "inactivity=$($p.InactivityTimeoutSecs)"
  `)
  const o = lines(r.out)
  const limit = 900
  const inactivity = parseInt(o.inactivity, 10)
  if (inactivity > 0 && inactivity <= limit) return { status: 'on', detail: `locks after ${Math.round(inactivity / 60)} min (policy)` }

  const ssTime = parseInt(o.ss_timeout, 10)
  if (o.ss_active === '1' && o.ss_secure === '1' && ssTime > 0 && ssTime <= limit) {
    return { status: 'on', detail: `screensaver locks after ${Math.round(ssTime / 60)} min` }
  }

  // powercfg prints "...AC Power Setting Index: 0x...", "...DC Power Setting Index: 0x..."
  const power = async (sub, setting) => {
    const q = await sh('powercfg', ['/q', 'SCHEME_CURRENT', sub, setting])
    return [...q.out.matchAll(/:\s*0x([0-9a-f]+)\s*$/gim)].map(m => parseInt(m[1], 16)).slice(-2)
  }
  const sleep = await power('SUB_SLEEP', 'STANDBYIDLE')
  const lockOnWake = await power('SUB_NONE', 'CONSOLELOCK')
  if (!sleep.length) return { status: 'unknown', detail: r.err || 'could not read lock or sleep settings' }

  if (lockOnWake.length && lockOnWake.includes(0)) return { status: 'off', detail: 'no password needed when waking from sleep' }
  if (sleep.includes(0)) return { status: 'off', detail: 'computer never sleeps when plugged in or on battery, so it never locks' }
  const mins = Math.round(Math.max(...sleep) / 60)
  return mins <= 15
    ? { status: 'on', detail: `sleeps and locks after ${mins} min` }
    : { status: 'off', detail: `takes ${mins} min to sleep and lock (should be 15 or less)` }
}

// S-1-5-32-544 is the administrators group, same id on every language
async function user_is_admin () {
  const r = await sh('whoami', ['/groups'])
  if (!r.ok) return { status: 'unknown', detail: r.err }
  const user = process.env.USERNAME || 'you'
  return r.out.includes('S-1-5-32-544')
    ? { status: 'admin', detail: `${user} is an administrator account` }
    : { status: 'standard', detail: `${user} is a standard account` }
}

async function listening_ports () {
  const r = await ps(`
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      "$($_.LocalAddress)|$($_.LocalPort)|$((Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName)"
    }
  `, { timeout: 30000 })
  const sockets = r.out.split(/\r?\n/).filter(l => l.includes('|')).map(l => {
    const [addr, port, name] = l.trim().split('|')
    return { addr, port: parseInt(port, 10), name }
  })
  if (!sockets.length) return { status: 'unknown', detail: r.err || 'could not list open ports' }
  return summarize(sockets, ['System', 'svchost', 'lsass', 'wininit', 'services', 'spoolsv', 'Idle'])
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
