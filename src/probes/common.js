// checks that read plain files the same way on every os
const fs = require('fs')
const path = require('path')
const os = require('os')

const win = process.platform === 'win32'

// --- ip helpers ---

function isPrivate (ip) {
  ip = String(ip).toLowerCase().replace(/%.*$/, '')
  if (ip.includes(':')) return ip === '::1' || ip === '::' || /^(fe[89ab]|fe[c-f]|f[cd])/.test(ip)
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // vpns like tailscale
}

const DNS_PROVIDERS = [
  [/^(1\.1\.1\.1|1\.0\.0\.1|2606:4700:4700::)/, 'cloudflare'],
  [/^(8\.8\.8\.8|8\.8\.4\.4|2001:4860:4860::)/, 'google'],
  [/^(9\.9\.9\.9|149\.112\.112\.112|2620:fe::)/, 'quad9'],
  [/^(208\.67\.22[02]\.22[02]|2620:119:)/, 'opendns'],
  [/^(94\.140\.1[45]\.)/, 'adguard'],
  [/^(45\.90\.(28|30)\.|2a07:a8c[01]:)/, 'nextdns'],
  [/^(75\.75\.7[56]\.7[56])/, 'comcast'],
  [/^(76\.76\.(2|10)\.)/, 'controld'],
  [/^(185\.228\.16[89]\.)/, 'cleanbrowsing']
]

// servers = list of ip strings, shared by every os's dns probe
function judgeDns (servers) {
  servers = [...new Set(servers.map(s => s.trim()).filter(Boolean))]
  if (!servers.length) return { status: 'unknown', detail: 'could not find which dns servers are used' }
  const items = servers.map(ip => {
    if (isPrivate(ip)) return { text: ip, note: /^(127\.|::1)/.test(ip) ? 'this computer (local resolver)' : 'your router or vpn' }
    const known = DNS_PROVIDERS.find(([re]) => re.test(ip))
    return known ? { text: ip, note: known[1] } : { text: ip, note: 'not a well-known provider', flag: true }
  })
  const odd = items.filter(i => i.flag)
  return odd.length
    ? { status: 'review', detail: `${odd.length} dns server${odd.length === 1 ? ' is' : 's are'} not a well-known provider`, items }
    : { status: 'ok', detail: `using ${[...new Set(items.map(i => i.note))].join(', ')}`, items }
}

// --- ssh keys ---

// openssh keys store their cipher name right after the magic header; "none" = no passphrase
function hasPassphrase (text) {
  if (/ENCRYPTED/.test(text)) return true
  const m = text.match(/-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]+?)-----END/)
  if (!m) return null
  try {
    const buf = Buffer.from(m[1].replace(/\s+/g, ''), 'base64')
    const magic = 'openssh-key-v1\0'.length
    const len = buf.readUInt32BE(magic)
    return buf.slice(magic + 4, magic + 4 + len).toString() !== 'none'
  } catch { return null }
}

// nothing here ever leaves the computer, only names and yes / no answers are shown
function ssh_keys () {
  const dir = path.join(os.homedir(), '.ssh')
  let files = []
  try { files = fs.readdirSync(dir) } catch { return { status: 'ok', detail: 'no ssh keys on this computer' } }

  const items = []
  let loose = 0
  if (!win) {
    const mode = fs.statSync(dir).mode
    if (mode & 0o077) { loose++; items.push({ text: '.ssh folder', note: 'other users can open it', flag: true }) }
  }

  for (const f of files) {
    const full = path.join(dir, f)
    let st
    try { st = fs.statSync(full) } catch { continue }
    if (!st.isFile() || st.size > 64 * 1024 || f.endsWith('.pub')) continue

    if (f === 'authorized_keys') {
      const keys = fs.readFileSync(full, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      for (const k of keys) {
        const parts = k.split(/\s+/)
        const i = parts.findIndex(p => /^(ssh-|ecdsa-|sk-)/.test(p))
        const label = parts.slice(i + 2).join(' ') || `${parts[i] || 'key'} …${(parts[i + 1] || '').slice(-8)}`
        items.push({ text: `can sign in here: ${label}`, note: 'from authorized_keys' })
      }
      continue
    }

    let head = ''
    try { head = fs.readFileSync(full, 'utf8') } catch { continue }
    if (!/PRIVATE KEY-----/.test(head)) continue

    const tooOpen = !win && (st.mode & 0o077)
    const pass = hasPassphrase(head)
    if (tooOpen) loose++
    items.push({
      text: f,
      note: [tooOpen ? 'other users can read it' : '', pass === false ? 'no passphrase' : pass ? 'has a passphrase' : ''].filter(Boolean).join(', '),
      flag: !!tooOpen
    })
  }

  const keys = items.filter(i => !i.text.startsWith('can sign in') && i.text !== '.ssh folder').length
  if (!items.length) return { status: 'ok', detail: 'no ssh keys on this computer' }
  return loose
    ? { status: 'loose', detail: `${loose} ssh file${loose === 1 ? ' is' : 's are'} readable by other users`, items }
    : { status: 'ok', detail: `${keys} private key${keys === 1 ? '' : 's'}, all locked to your account`, items }
}

// --- hosts file ---

const DEFAULT_HOSTS = /^(localhost|broadcasthost|ip6-\w+|localhost\.localdomain|[\w-]+\.local(domain)?)$/i

function hosts_file () {
  const file = win ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts') : '/etc/hosts'
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return { status: 'unknown', detail: 'could not read the hosts file' } }

  let blocked = 0
  const items = []
  const host = os.hostname().toLowerCase()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const [ip, ...names] = line.split(/\s+/)
    for (const name of names) {
      if (DEFAULT_HOSTS.test(name) || name.toLowerCase() === host || name.toLowerCase().startsWith(`${host}.`)) continue
      if (/^(0\.0\.0\.0|127\.|::1?$|::$)/.test(ip)) { blocked++; continue }
      items.push(isPrivate(ip)
        ? { text: `${name} → ${ip}`, note: 'points to a local device' }
        : { text: `${name} → ${ip}`, note: 'sends this site to a different server', flag: true })
    }
  }
  if (blocked) items.push({ text: `${blocked} site${blocked === 1 ? '' : 's'} blocked`, note: 'sent nowhere, often an ad blocker' })

  const odd = items.filter(i => i.flag).length
  if (!items.length) return { status: 'clean', detail: 'no changes, the hosts file is the default' }
  return odd
    ? { status: 'review', detail: `${odd} website${odd === 1 ? ' is' : 's are'} redirected to another server`, items }
    : { status: 'clean', detail: 'only local or blocking entries', items }
}

module.exports = { ssh_keys, hosts_file, judgeDns, isPrivate }
