// finds common apps, then asks nvd.nist.gov if their version has holes
// that cisa says attackers are actively using. only "vendor:product:version" leaves the computer
const fs = require('fs')
const path = require('path')
const os = require('os')
const yaml = require('js-yaml')
const sh = require('./sh')

const MAP_FILE = path.join(__dirname, '..', '..', 'checks', 'data', 'software.yaml')
const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const GAP = 6500 // nvd allows 5 lookups per 30 seconds without a key
const DAY = 864e5

const platform = { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform]
const cacheFile = () => path.join(process.env.CHECKUP_DATA || os.tmpdir(), 'nvd-cache.json')
const cleanVersion = v => (String(v).match(/\d+(\.\d+)+/) || [])[0]

// --- what's installed, as [{ name, version }] ---

async function macApps () {
  const dirs = ['/Applications', '/Applications/Utilities', path.join(os.homedir(), 'Applications')]
  const out = []
  for (const dir of dirs) {
    let names = []
    try { names = fs.readdirSync(dir).filter(n => n.endsWith('.app')) } catch { continue }
    for (const n of names) out.push({ name: n.replace(/\.app$/, ''), path: path.join(dir, n) })
  }
  return out
}

async function macVersion (app) {
  const r = await sh('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(app.path, 'Contents/Info.plist')])
  return r.ok ? r.out : ''
}

async function windowsApps () {
  const script = `
    $keys = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
            'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
            'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } |
      ForEach-Object { "$($_.DisplayName)|$($_.DisplayVersion)" }
  `
  const r = await sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 30000 })
  return r.out.split(/\r?\n/).filter(l => l.includes('|')).map(l => {
    const [name, version] = l.trim().split('|')
    return { name, version }
  })
}

async function linuxApps () {
  const out = []
  const dpkg = await sh('dpkg-query', ['-W', '-f=${Package} ${Version}\\n'])
  const rpm = dpkg.ok ? { out: '' } : await sh('rpm', ['-qa', '--qf', '%{NAME} %{VERSION}\\n'])
  for (const line of `${dpkg.out}\n${rpm.out}`.split('\n')) {
    const [name, version] = line.trim().split(/\s+/)
    if (name && version) out.push({ name, version: version.replace(/^\d+:/, '') })
  }
  const snap = await sh('snap', ['list'])
  for (const line of snap.out.split('\n').slice(1)) {
    const [name, version] = line.trim().split(/\s+/)
    if (name && version) out.push({ name, version })
  }
  return out
}

// matches installed apps against the list in checks/data/software.yaml
async function findApps () {
  let map = []
  try { map = yaml.load(fs.readFileSync(MAP_FILE, 'utf8')) || [] } catch { return [] }
  map = map.filter(m => m[platform])

  const installed = platform === 'macos' ? await macApps() : platform === 'windows' ? await windowsApps() : await linuxApps()
  const found = []
  for (const m of map) {
    const re = new RegExp(m[platform], 'i')
    const hit = installed.find(a => re.test(a.name))
    if (!hit) continue
    const version = cleanVersion(hit.version || (platform === 'macos' ? await macVersion(hit) : ''))
    if (version) found.push({ name: m.name, cpe: m.cpe, version })
  }
  return found
}

// --- asking nvd, one day cache so repeat scans are instant ---

function loadCache () {
  try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) } catch { return {} }
}

function saveCache (cache) {
  try { fs.writeFileSync(cacheFile(), JSON.stringify(cache)) } catch {}
}

let lastCall = 0
async function lookup (cpe, version) {
  const wait = lastCall + GAP - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastCall = Date.now()

  const url = `${NVD}?virtualMatchString=${encodeURIComponent(`cpe:2.3:a:${cpe}:${version}`)}&hasKev`
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'security-checkup' } })
  if (!res.ok) throw new Error(`nvd said ${res.status}`)
  const data = await res.json()
  return (data.vulnerabilities || []).map(v => ({ id: v.cve.id, name: v.cve.cisaVulnerabilityName || '' }))
}

async function vulnerable_software () {
  const apps = await findApps()
  if (!apps.length) return { status: 'clean', detail: 'none of the apps we know how to check are installed' }

  const cache = loadCache()
  const items = []
  let failed = 0
  let bad = 0

  for (const app of apps) {
    let cves = []
    let ok = true
    for (const cpe of app.cpe) {
      const key = `${cpe}:${app.version}`
      if (cache[key] && Date.now() - cache[key].time < DAY) { cves = cves.concat(cache[key].cves); continue }
      try {
        const found = await lookup(cpe, app.version)
        cache[key] = { time: Date.now(), cves: found }
        cves = cves.concat(found)
      } catch { ok = false }
    }

    const label = `${app.name} ${app.version}`
    if (cves.length) {
      bad++
      const ids = [...new Set(cves.map(c => c.id))]
      items.push({ text: label, note: `${ids.length} hole${ids.length === 1 ? '' : 's'} attackers use (${ids.slice(0, 3).join(', ')}${ids.length > 3 ? '…' : ''})`, flag: true })
    } else if (!ok) {
      failed++
      items.push({ text: label, note: 'could not check right now' })
    } else {
      items.push({ text: label, note: 'no known attacks' })
    }
  }
  saveCache(cache)

  items.sort((a, b) => (!!b.flag - !!a.flag) || a.text.localeCompare(b.text))
  if (failed === apps.length) return { status: 'unknown', detail: 'could not reach the vulnerability database (nvd.nist.gov), try again later', items }
  return bad
    ? { status: 'vulnerable', detail: `${bad} app${bad === 1 ? ' has' : 's have'} holes that attackers are using right now, update ${bad === 1 ? 'it' : 'them'}`, items }
    : { status: 'clean', detail: `checked ${apps.length} apps, none have holes attackers are known to use`, items }
}

module.exports = { vulnerable_software, findApps }
