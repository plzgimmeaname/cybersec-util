const sh = require('./sh')

const ps = script => sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])

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

module.exports = { disk_encryption_status, firewall_status }
