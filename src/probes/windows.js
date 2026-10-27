const sh = require('./sh')
const { summarize } = require('./ports')
const { browser_extensions } = require('./extensions')

// scripts go in base64 so windows never mangles their quotes
const ps = (script, opts) => sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], opts)

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

// remote desktop, winrm, an ssh server, or shared folders
async function remote_access () {
  const r = await ps(`
    $ts = Get-ItemProperty 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -ErrorAction SilentlyContinue
    "rdp=$($ts.fDenyTSConnections)"
    "winrm=$((Get-Service WinRM -ErrorAction SilentlyContinue).Status)"
    "sshd=$((Get-Service sshd -ErrorAction SilentlyContinue).Status)"
    "shares=$((Get-CimInstance Win32_Share -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '\\$$' } | ForEach-Object { $_.Name }) -join ',')"
  `)
  const o = lines(r.out)
  if (o.rdp == null && o.winrm == null) return { status: 'unknown', detail: r.err || 'could not read remote settings' }

  const on = []
  if (o.rdp === '0') on.push('remote desktop')
  if (o.winrm === 'Running') on.push('windows remote management (winrm)')
  if (o.sshd === 'Running') on.push('ssh server')
  for (const share of (o.shares || '').split(',').filter(Boolean)) on.push(`shared folder: ${share}`)
  return on.length
    ? { status: 'open', detail: `turned on: ${on.length} way${on.length === 1 ? '' : 's'} in from other computers`, items: on.map(t => ({ text: t, flag: true })) }
    : { status: 'closed', detail: 'no remote desktop, remote management or shared folders are on' }
}

// run keys + startup folders, each checked for a valid signature
async function startup_items () {
  const r = await ps(`
    function Get-Exe($cmd) {
      if ($cmd -match '^\\s*"([^"]+)"') { return $matches[1] }
      if ($cmd -match '^\\s*(.+?\\.exe)') { return $matches[1] }
      return ($cmd -split ' ')[0]
    }
    $found = @()
    $keys = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
            'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
            'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
    foreach ($k in $keys) {
      $p = Get-ItemProperty $k -ErrorAction SilentlyContinue
      if ($p) { $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $found += ,@($_.Name, (Get-Exe $_.Value)) } }
    }
    $shell = New-Object -ComObject WScript.Shell
    $dirs = "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
            "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
    foreach ($d in $dirs) {
      Get-ChildItem $d -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
        $t = if ($_.Extension -eq '.lnk') { $shell.CreateShortcut($_.FullName).TargetPath } else { $_.FullName }
        $found += ,@($_.BaseName, $t)
      }
    }
    foreach ($f in $found) {
      $exe = [Environment]::ExpandEnvironmentVariables($f[1])
      $st = if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { 'missing' } else { (Get-AuthenticodeSignature -LiteralPath $exe).Status }
      "item=$($f[0])|$st|$exe"
    }
    "done=1"
  `, { timeout: 60000 })
  if (!/done=1/.test(r.out)) return { status: 'unknown', detail: r.err || 'could not list startup apps' }

  const items = r.out.split(/\r?\n/).filter(l => l.startsWith('item=')).map(l => {
    const [name, st, exe] = l.slice(5).split('|')
    if (st === 'missing') return { text: name, note: 'program is gone, leftover from a removed app', flag: true }
    if (/\\(temp|users\\public)\\/i.test(exe)) return { text: name, note: `runs from an odd place: ${exe}`, flag: true }
    if (st === 'NotSigned') return { text: name, note: 'not signed by its maker', flag: true }
    if (st !== 'Valid') return { text: name, note: 'its signature is broken', flag: true }
    return { text: name }
  }).sort((a, b) => (!!b.flag - !!a.flag) || a.text.localeCompare(b.text))

  const flagged = items.filter(i => i.flag).length
  if (!items.length) return { status: 'clean', detail: 'no extra apps start on their own' }
  return flagged
    ? { status: 'review', detail: `${items.length} apps start on their own, ${flagged} worth a look`, items }
    : { status: 'clean', detail: `${items.length} apps start on their own, all signed by their makers`, items }
}

// no secureboot key at all means the pc starts in old bios mode
async function secure_boot_status () {
  const r = await ps(`
    $sb = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State' -ErrorAction SilentlyContinue
    "sb=$($sb.UEFISecureBootEnabled)"
    $dg = Get-CimInstance -Namespace root\\Microsoft\\Windows\\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction SilentlyContinue
    "vbs=$($dg.VirtualizationBasedSecurityStatus)"
  `)
  const o = lines(r.out)
  if (o.sb == null) return { status: 'unknown', detail: r.err || 'could not read secure boot' }
  const vbs = o.vbs === '2' ? ', memory integrity (vbs) is on' : ''
  if (o.sb === '1') return { status: 'on', detail: `secure boot is on${vbs}` }
  if (o.sb === '0') return { status: 'off', detail: 'secure boot is off' }
  return { status: 'off', detail: 'this pc starts in old bios mode, so secure boot is not used' }
}

// guest (-501) and the built-in administrator (-500) should be off,
// other accounts nobody signed into for 90 days are worth removing
async function guest_accounts () {
  const r = await ps(`
    Get-LocalUser | ForEach-Object {
      $last = if ($_.LastLogon) { $_.LastLogon.ToString('yyyy-MM-dd') } else { 'never' }
      "user=$($_.Name)|$($_.Enabled)|$last|$($_.SID.Value)"
    }
  `)
  const users = r.out.split(/\r?\n/).filter(l => l.startsWith('user=')).map(l => {
    const [name, enabled, last, sid] = l.slice(5).split('|')
    return { name, enabled: enabled === 'True', last, rid: sid.split('-').pop() }
  })
  if (!users.length) return { status: 'unknown', detail: r.err || 'could not list accounts' }

  const me = (process.env.USERNAME || '').toLowerCase()
  const old = Date.now() - 90 * 864e5
  const items = []
  for (const u of users.filter(u => u.enabled && !['503', '504'].includes(u.rid))) {
    if (u.rid === '501') items.push({ text: u.name, note: 'guest account is on', flag: true })
    else if (u.rid === '500') items.push({ text: u.name, note: 'built-in administrator is on', flag: true })
    else if (u.name.toLowerCase() !== me && (u.last === 'never' || new Date(u.last) < old)) {
      items.push({ text: u.name, note: u.last === 'never' ? 'never signed in' : `last sign-in ${u.last}`, flag: true })
    } else items.push({ text: u.name, note: u.last === 'never' ? '' : `last sign-in ${u.last}` })
  }
  const flagged = items.filter(i => i.flag).length
  return flagged
    ? { status: 'open', detail: `${flagged} account${flagged === 1 ? '' : 's'} should be turned off`, items }
    : { status: 'closed', detail: 'no guest or unused accounts', items }
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
