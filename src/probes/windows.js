const sh = require('./sh')

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

module.exports = { disk_encryption_status, firewall_status, os_updates_status, auto_updates_status }
