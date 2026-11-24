// network checks that work the same way on every os
// everything here only reads or asks. the few outside requests are listed in the settings page
const dns = require('dns')
const net = require('net')
const tls = require('tls')
const http = require('http')
const https = require('https')
const dgram = require('dgram')
const os = require('os')
const sh = require('./sh')
const { isPrivate, oddPlace } = require('./common')

const win = process.platform === 'win32'
const mac = process.platform === 'darwin'
const ps = script => sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')])

const withTimeout = (p, ms, label = 'timed out') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))])

// can this computer reach the internet at all? offline results are "unknown", not "fail"
function online () {
  return new Promise(resolve => {
    const s = net.connect({ host: '1.1.1.1', port: 443, timeout: 3500 })
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('timeout', () => { s.destroy(); resolve(false) })
    s.once('error', () => resolve(false))
  })
}
const offline = { status: 'unknown', detail: 'no internet connection, so this could not be checked' }

// --- proxy ---

async function proxy_settings () {
  const items = []
  const add = (text, note) => items.push({ text, note, flag: true })

  if (mac) {
    const r = await sh('/usr/sbin/scutil', ['--proxy'])
    const o = {}
    for (const m of r.out.matchAll(/^\s*(\w+)\s*:\s*(.+)$/gm)) o[m[1]] = m[2].trim()
    for (const [on, host, port, name] of [['HTTPEnable', 'HTTPProxy', 'HTTPPort', 'web proxy'], ['HTTPSEnable', 'HTTPSProxy', 'HTTPSPort', 'secure web proxy'], ['SOCKSEnable', 'SOCKSProxy', 'SOCKSPort', 'socks proxy'], ['ProxyAutoConfigEnable', 'ProxyAutoConfigURLString', null, 'auto-config script'], ['ProxyAutoDiscoveryEnable', null, null, 'auto-discovery']]) {
      if (o[on] === '1') add(name, host ? `${o[host] || ''}${port && o[port] ? `:${o[port]}` : ''}` : 'on')
    }
  } else if (win) {
    const r = await ps(`
      $k = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction SilentlyContinue
      "enable=$($k.ProxyEnable)"; "server=$($k.ProxyServer)"; "pac=$($k.AutoConfigURL)"
    `)
    const o = Object.fromEntries(r.out.split(/\r?\n/).map(l => l.split(/=(.*)/s).slice(0, 2)))
    if (o.enable === '1') add('manual proxy', o.server || 'on')
    if (o.pac) add('auto-config script', o.pac)
  } else {
    for (const k of ['http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) {
      if (process.env[k]) add(k.toLowerCase(), process.env[k].replace(/\/\/[^@/]*@/, '//'))
    }
    const g = await sh('gsettings', ['get', 'org.gnome.system.proxy', 'mode'])
    if (g.ok && /manual|auto/.test(g.out)) add('desktop proxy', g.out.replace(/'/g, ''))
  }

  if (!items.length) return { status: 'none', detail: 'no proxy is set, traffic goes straight out' }
  // a local dev proxy is normal, anything else is worth a look
  const local = items.every(i => /(127\.0\.0\.1|localhost|\[::1\])/.test(i.note))
  const detail = `${items.length} proxy setting${items.length === 1 ? ' is' : 's are'} on: ${items.map(i => i.text).join(', ')}`
  return local
    ? { status: 'none', detail: `${detail}, but only to this computer (normal for developer tools)`, items: items.map(i => ({ ...i, flag: false })) }
    : { status: 'set', detail: `${detail}. Everything you browse passes through it`, items }
}

// --- dns integrity ---

// a made-up name must not exist. if it does, whoever answers is rewriting failed lookups (ads, or worse)
async function dns_integrity () {
  if (!(await online())) return offline
  const items = []
  const rand = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8)
  const resolver = new dns.promises.Resolver({ timeout: 4000, tries: 1 })

  let hijacked = 0
  for (let i = 0; i < 2; i++) {
    const name = `${rand()}.com`
    try {
      const a = await withTimeout(resolver.resolve4(name), 6000)
      if (a.length) hijacked++
    } catch {}
  }
  items.push(hijacked
    ? { text: 'made-up website names resolve', note: 'your dns server rewrites failed lookups', flag: true }
    : { text: 'made-up website names fail', note: 'normal' })

  // dnssec: this name has a deliberately broken signature, a validating resolver refuses it
  let validates = true
  try {
    const a = await withTimeout(resolver.resolve4('dnssec-failed.org'), 6000)
    if (a.length) validates = false
  } catch {}
  items.push(validates
    ? { text: 'dnssec validation', note: 'your resolver rejects forged answers' }
    : { text: 'dnssec validation', note: 'your resolver accepts forged answers' })

  // the system's answer for a stable name should agree with an independent resolver
  let mismatch = false
  try {
    const [local, far] = await Promise.all([
      withTimeout(dns.promises.resolve4('example.com'), 6000),
      withTimeout(new dns.promises.Resolver({ timeout: 4000, tries: 1 }).resolve4('example.com'), 6000)
    ])
    // example.com sits on a handful of addresses; no overlap in a /16 means someone is rewriting it
    const net16 = ip => ip.split('.').slice(0, 2).join('.')
    const farNets = new Set(far.map(net16))
    mismatch = !local.some(ip => farNets.has(net16(ip))) && local.every(ip => isPrivate(ip))
  } catch {}
  if (mismatch) items.push({ text: 'example.com resolves to a private address', note: 'a real website should not', flag: true })

  if (hijacked || mismatch) return { status: 'tampered', detail: 'your dns server is changing answers', items }
  return validates
    ? { status: 'ok', detail: 'dns answers look honest and forged answers are rejected', items }
    : { status: 'ok', detail: 'dns answers look honest (it does not check signatures)', items }
}

// --- tls interception ---

const WATCH = ['www.google.com', 'github.com', 'www.cloudflare.com', 'www.microsoft.com']

function certOf (host) {
  return new Promise(resolve => {
    // node ships its own list of trusted authorities, so a root added to this computer's store does not hide an interceptor
    const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true, timeout: 6000 }, () => {
      const c = s.getPeerCertificate()
      s.destroy()
      resolve({ host, ok: true, issuer: (c.issuer && (c.issuer.O || c.issuer.CN)) || 'unknown' })
    })
    s.once('timeout', () => { s.destroy(); resolve({ host, ok: null, why: 'timed out' }) })
    s.once('error', e => resolve({ host, ok: /CERT|SELF_SIGNED|UNABLE_TO|ISSUER|certificate/i.test(e.code + e.message) ? false : null, why: e.code || e.message }))
  })
}

async function tls_interception () {
  if (!(await online())) return offline
  const res = await Promise.all(WATCH.map(certOf))
  const bad = res.filter(r => r.ok === false)
  const good = res.filter(r => r.ok)
  const items = res.map(r => r.ok
    ? { text: r.host, note: `signed by ${r.issuer}` }
    : r.ok === false
      ? { text: r.host, note: 'certificate is not from a public authority', flag: true }
      : { text: r.host, note: `could not connect (${r.why})` })

  if (bad.length) {
    return { status: 'intercepted', detail: `${bad.length} of ${res.length} secure sites showed a certificate that no public authority signed. Something is reading your encrypted traffic (work proxy, antivirus, or malware)`, items }
  }
  if (!good.length) return { status: 'unknown', detail: 'could not reach any test site' }
  return { status: 'clean', detail: `${good.length} secure sites all showed real certificates`, items }
}

// --- http integrity ---

function httpGet (url, ms = 6000) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: ms, headers: { 'user-agent': 'security-checkup' } }, res => {
      let body = ''
      res.on('data', c => { body += c; if (body.length > 4096) req.destroy() })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      res.on('close', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.once('timeout', () => { req.destroy(); resolve(null) })
    req.once('error', () => resolve(null))
  })
}

// a plain http page with a known answer: if anything else comes back, the network is rewriting traffic
async function http_integrity () {
  if (!(await online())) return offline
  const [a, b] = await Promise.all([
    httpGet('http://detectportal.firefox.com/success.txt'),
    httpGet('http://captive.apple.com/hotspot-detect.html')
  ])
  const items = []
  let wrong = 0
  let answered = 0
  const test = (name, r, ok) => {
    if (!r) { items.push({ text: name, note: 'no answer' }); return }
    answered++
    if (ok(r)) items.push({ text: name, note: 'unchanged' })
    else { wrong++; items.push({ text: name, note: r.status >= 300 && r.status < 400 ? 'redirected to a login page' : 'answer was changed on the way', flag: true }) }
  }
  test('detectportal.firefox.com', a, r => /^success/i.test(r.body.trim()))
  test('captive.apple.com', b, r => /success/i.test(r.body))
  if (!answered) return { status: 'unknown', detail: 'plain web requests got no answer' }
  return wrong
    ? { status: 'tampered', detail: 'this network is changing plain web pages, or wants you to sign in first (a captive portal)', items }
    : { status: 'clean', detail: 'plain web pages arrive unchanged', items }
}

// --- clock ---

async function clock_sync () {
  if (!(await online())) return offline
  const t0 = Date.now()
  const r = await httpGet('https://www.cloudflare.com/cdn-cgi/trace')
  const t1 = Date.now()
  const date = r && r.headers && r.headers.date
  if (!date) return { status: 'unknown', detail: 'could not ask a time server' }
  const drift = Math.round((Date.parse(date) - (t0 + t1) / 2) / 1000)
  const abs = Math.abs(drift)
  const text = abs < 2 ? 'within a second of real time' : `${abs >= 90 ? Math.round(abs / 60) + ' min' : abs + ' sec'} ${drift > 0 ? 'behind' : 'ahead of'} real time`
  return abs <= 120
    ? { status: 'ok', detail: `clock is ${text}` }
    : { status: 'off', detail: `clock is ${text}. Wrong time breaks secure sites and hides what happened in logs` }
}

// --- arp ---

async function defaultGateway () {
  if (mac) return (await sh('/sbin/route', ['-n', 'get', 'default'])).out.match(/gateway:\s*(\S+)/)?.[1]
  if (win) return (await ps('(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1).NextHop')).out.trim() || undefined
  return (await sh('ip', ['route', 'show', 'default'])).out.match(/via (\S+)/)?.[1]
}

// two addresses with one hardware address is how someone sits between you and the router
async function arp_spoofing () {
  const r = win ? await sh('arp', ['-a']) : await sh(mac ? '/usr/sbin/arp' : 'arp', ['-an'])
  if (!r.ok && !r.out) return { status: 'unknown', detail: r.err || 'could not read the arp table' }
  const rows = []
  for (const l of r.out.split('\n')) {
    const m = win
      ? l.match(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f-]{17})\s+dynamic/i)
      : l.match(/\((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]{11,17})/i)
    if (!m) continue
    // mac prints 0:1a:… without padding
    const mc = m[2].toLowerCase().replace(/-/g, ':').split(':').map(x => x.padStart(2, '0')).join(':')
    if (/^ff:ff:ff|^01:00:5e|^33:33/.test(mc)) continue
    const last = Number(m[1].split('.')[3])
    if (last === 255) continue
    rows.push({ ip: m[1], mac: mc })
  }
  if (!rows.length) return { status: 'ok', detail: 'no neighbours on the network right now' }

  const gw = await defaultGateway()
  const byMac = new Map()
  for (const x of rows) byMac.set(x.mac, [...(byMac.get(x.mac) || []), x.ip])
  const dupes = [...byMac].filter(([, ips]) => ips.length > 1)
  const items = dupes.map(([m, ips]) => ({
    text: `${ips.join(' and ')} share one device address`,
    note: gw && ips.includes(gw) ? `one of them is your router (${gw}). Someone may be posing as it` : m,
    flag: !!(gw && ips.includes(gw))
  }))
  const onGateway = items.some(i => i.flag)
  if (onGateway) return { status: 'spoofed', detail: 'another device claims to be your router', items }
  // routers and some vpns legitimately answer for many addresses
  return dupes.length
    ? { status: 'ok', detail: `${rows.length} neighbours, ${dupes.length} share an address (usually a router or vpn answering for others)`, items: items.map(i => ({ ...i, flag: false })) }
    : { status: 'ok', detail: `${rows.length} neighbours, none look like impostors`, items: gw ? [{ text: `router ${gw}`, note: 'looks normal' }] : [] }
}

// --- upnp ---

// asks the local network if a router offers to open ports for anyone who asks
function upnp_exposure () {
  return new Promise(resolve => {
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const found = new Map()
    const msg = Buffer.from(['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'MX: 2', 'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1', '', ''].join('\r\n'))
    const done = () => {
      try { s.close() } catch {}
      if (!found.size) return resolve({ status: 'off', detail: 'no router on this network offers upnp' })
      const items = [...found].map(([ip, server]) => ({ text: ip, note: server || 'internet gateway', flag: true }))
      resolve({ status: 'on', detail: `${found.size} device${found.size === 1 ? ' offers' : 's offer'} to open ports on your router for any app that asks`, items })
    }
    s.on('message', (m, rinfo) => {
      const t = m.toString()
      if (/InternetGatewayDevice/i.test(t)) found.set(rinfo.address, (t.match(/^server:\s*(.+)$/im) || [])[1]?.trim())
    })
    s.on('error', () => resolve({ status: 'unknown', detail: 'could not send a local network search' }))
    try {
      s.bind(0, () => { s.send(msg, 1900, '239.255.255.250', err => { if (err) { try { s.close() } catch {} resolve({ status: 'unknown', detail: 'could not send a local network search' }) } }) })
    } catch { return resolve({ status: 'unknown', detail: 'could not send a local network search' }) }
    setTimeout(done, 2800)
  })
}

// --- exposed services: connect to our own network address like a neighbour would ---

const RISKY = {
  21: ['ftp', 'sends passwords in plain text'],
  23: ['telnet', 'sends everything in plain text'],
  69: null,
  111: ['rpcbind', 'old remote service'],
  135: ['windows rpc', 'old remote service'],
  139: ['file sharing (netbios)', 'old file sharing'],
  445: ['file sharing (smb)', 'file sharing'],
  512: ['rexec', 'old remote login'],
  513: ['rlogin', 'old remote login'],
  514: ['rsh', 'old remote login'],
  1433: ['sql server', 'database open to the network'],
  2049: ['nfs', 'file sharing'],
  2375: ['docker api', 'anyone can take over this computer'],
  3306: ['mysql', 'database open to the network'],
  3389: ['remote desktop', 'remote control'],
  5432: ['postgres', 'database open to the network'],
  5900: ['vnc', 'remote screen control'],
  5984: ['couchdb', 'database open to the network'],
  6379: ['redis', 'database, often without a password'],
  9200: ['elasticsearch', 'database, often without a password'],
  11211: ['memcached', 'cache, often without a password'],
  27017: ['mongodb', 'database, often without a password']
}

function probePort (host, port) {
  return new Promise(resolve => {
    const s = net.connect({ host, port, timeout: 900 })
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('timeout', () => { s.destroy(); resolve(false) })
    s.once('error', () => resolve(false))
  })
}

async function exposed_services () {
  const addrs = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')).map(a => a.address)
  if (!addrs.length) return { status: 'unknown', detail: 'this computer is not on a network right now' }
  const ip = addrs[0]
  const ports = Object.keys(RISKY).map(Number).filter(p => RISKY[p])
  const open = []
  // small batches so a slow firewall doesn't stack up sockets
  for (let i = 0; i < ports.length; i += 8) {
    const batch = ports.slice(i, i + 8)
    const res = await Promise.all(batch.map(p => probePort(ip, p)))
    batch.forEach((p, j) => { if (res[j]) open.push(p) })
  }
  if (!open.length) return { status: 'closed', detail: `none of the ${ports.length} riskiest ports answer on ${ip}` }
  const items = open.map(p => ({ text: `${RISKY[p][0]} (port ${p})`, note: RISKY[p][1], flag: true }))
  return { status: 'open', detail: `${open.length} risky service${open.length === 1 ? ' answers' : 's answer'} to other computers on ${ip}: ${open.map(p => RISKY[p][0]).join(', ')}`, items }
}

// --- outbound connections ---

const BAD_PORTS = { 4444: 'metasploit default', 1337: 'common backdoor port', 31337: 'common backdoor port', 6667: 'irc, used by old botnets', 9001: 'tor relay', 9050: 'tor proxy', 5555: 'adb or backdoor' }
function remoteOf (s) {
  const i = s.lastIndexOf(':')
  return { ip: s.slice(0, i).replace(/^\[|\]$/g, ''), port: parseInt(s.slice(i + 1), 10) }
}

async function connectionList () {
  const rows = [] // { proc, pid, ip, port }
  if (win) {
    const r = await ps(`Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; "$($p.ProcessName)|$($p.Path)|$($_.RemoteAddress)|$($_.RemotePort)" }`)
    for (const l of r.out.split(/\r?\n/)) {
      const [proc, path, ip, port] = l.split('|')
      if (ip && port) rows.push({ proc, path, ip, port: Number(port) })
    }
  } else {
    const r = await sh(mac ? '/usr/sbin/lsof' : 'lsof', ['-nP', '-iTCP', '-sTCP:ESTABLISHED', '-FpcnL'], { timeout: 20000 })
    let cur = {}
    for (const l of r.out.split('\n')) {
      const k = l[0]; const v = l.slice(1)
      if (k === 'p') cur = { pid: v }
      else if (k === 'c') cur.proc = v
      else if (k === 'n') {
        const m = v.match(/->(.+)$/)
        if (!m) continue
        const { ip, port } = remoteOf(m[1])
        rows.push({ ...cur, ip, port })
      }
    }
    // resolve executable paths once per process
    const paths = new Map()
    for (const pid of new Set(rows.map(r => r.pid))) {
      const p = await sh('ps', ['-o', 'comm=', '-p', pid])
      paths.set(pid, p.out)
    }
    for (const row of rows) row.path = paths.get(row.pid)
  }
  return rows
}

async function outbound_connections () {
  let rows
  try { rows = await connectionList() } catch (e) { return { status: 'unknown', detail: e.message } }
  rows = rows.filter(r => r.ip && !isPrivate(r.ip))
  if (!rows.length) return { status: 'quiet', detail: 'no apps are talking to the internet right now' }

  const byApp = new Map()
  for (const r of rows) {
    const key = r.proc || 'unknown'
    const e = byApp.get(key) || { ips: new Set(), ports: new Set(), flags: new Set(), path: r.path }
    e.ips.add(r.ip); e.ports.add(r.port)
    if (BAD_PORTS[r.port]) e.flags.add(`port ${r.port} (${BAD_PORTS[r.port]})`)
    if (r.path && oddPlace(r.path)) e.flags.add(`runs from an odd place: ${r.path}`)
    byApp.set(key, e)
  }
  const items = [...byApp].map(([name, e]) => e.flags.size
    ? { text: name, note: [...e.flags].join('; '), flag: true }
    : { text: name, note: `${e.ips.size} server${e.ips.size === 1 ? '' : 's'}` })
  items.sort((a, b) => (!!b.flag - !!a.flag) || a.text.localeCompare(b.text))
  const flagged = items.filter(i => i.flag).length
  return flagged
    ? { status: 'review', detail: `${flagged} app${flagged === 1 ? ' is' : 's are'} connecting out in a suspicious way`, items }
    : { status: 'quiet', detail: `${byApp.size} app${byApp.size === 1 ? ' is' : 's are'} connected to the internet, nothing unusual`, items }
}

module.exports = { proxy_settings, dns_integrity, tls_interception, http_integrity, clock_sync, arp_spoofing, upnp_exposure, exposed_services, outbound_connections }
