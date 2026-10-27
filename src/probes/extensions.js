// reads browser extensions straight from disk, same code on every os
const fs = require('fs')
const path = require('path')
const os = require('os')

const home = os.homedir()

// where each browser keeps its profiles
function browserDirs () {
  const local = process.env.LOCALAPPDATA || ''
  const roaming = process.env.APPDATA || ''
  const mac = p => path.join(home, 'Library', 'Application Support', p)
  const cfg = p => path.join(home, '.config', p)

  const chromium = {
    darwin: {
      chrome: mac('Google/Chrome'),
      edge: mac('Microsoft Edge'),
      brave: mac('BraveSoftware/Brave-Browser'),
      arc: mac('Arc/User Data'),
      vivaldi: mac('Vivaldi'),
      opera: mac('com.operasoftware.Opera'),
      chromium: mac('Chromium')
    },
    win32: {
      chrome: path.join(local, 'Google/Chrome/User Data'),
      edge: path.join(local, 'Microsoft/Edge/User Data'),
      brave: path.join(local, 'BraveSoftware/Brave-Browser/User Data'),
      vivaldi: path.join(local, 'Vivaldi/User Data'),
      opera: path.join(roaming, 'Opera Software/Opera Stable'),
      chromium: path.join(local, 'Chromium/User Data')
    },
    linux: {
      chrome: cfg('google-chrome'),
      edge: cfg('microsoft-edge'),
      brave: cfg('BraveSoftware/Brave-Browser'),
      vivaldi: cfg('vivaldi'),
      opera: cfg('opera'),
      chromium: cfg('chromium')
    }
  }[process.platform] || {}

  const firefox = {
    darwin: [mac('Firefox/Profiles')],
    win32: [path.join(roaming, 'Mozilla/Firefox/Profiles')],
    linux: [path.join(home, '.mozilla/firefox'), path.join(home, 'snap/firefox/common/.mozilla/firefox')]
  }[process.platform] || []

  return { chromium, firefox }
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const list = d => { try { return fs.readdirSync(d) } catch { return [] } }

// these patterns mean "can read and change every website"
const BROAD = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*|\*:\/\/\*\/|https?:\/\/\*\/)$/

function isBroad (patterns) {
  return patterns.some(p => BROAD.test(p))
}

// names like __MSG_appName__ live in _locales/<lang>/messages.json
function resolveName (dir, manifest) {
  const name = manifest.name || ''
  const m = name.match(/^__MSG_(.+)__$/)
  if (!m) return name
  for (const lang of [manifest.default_locale, 'en', 'en_US'].filter(Boolean)) {
    const msgs = readJson(path.join(dir, '_locales', lang, 'messages.json'))
    if (!msgs) continue
    const key = Object.keys(msgs).find(k => k.toLowerCase() === m[1].toLowerCase())
    if (key && msgs[key].message) return msgs[key].message
  }
  return name
}

function chromiumExtensions (browser, root) {
  const out = []
  // profiles are "Default", "Profile 1", "Profile 2"...
  const profiles = list(root).filter(p => p === 'Default' || /^Profile \d+$/.test(p))
  if (!profiles.length && fs.existsSync(path.join(root, 'Extensions'))) profiles.push('.')

  for (const profile of profiles) {
    const extDir = path.join(root, profile, 'Extensions')
    for (const id of list(extDir)) {
      // newest version folder wins
      const versions = list(path.join(extDir, id)).filter(v => !v.startsWith('.')).sort()
      const dir = path.join(extDir, id, versions[versions.length - 1] || '')
      const manifest = readJson(path.join(dir, 'manifest.json'))
      if (!manifest) continue

      const patterns = [
        ...(manifest.permissions || []),
        ...(manifest.host_permissions || []),
        ...(manifest.optional_host_permissions || []),
        ...(manifest.content_scripts || []).flatMap(c => c.matches || [])
      ].filter(p => typeof p === 'string')

      out.push({ browser, name: resolveName(dir, manifest), id, broad: isBroad(patterns) })
    }
  }
  return out
}

// firefox lists everything in extensions.json, we skip its built-in ones
function firefoxExtensions (root) {
  const out = []
  for (const profile of list(root)) {
    const data = readJson(path.join(root, profile, 'extensions.json'))
    for (const a of (data && data.addons) || []) {
      if (a.type !== 'extension' || a.location !== 'app-profile') continue
      const origins = (a.userPermissions && a.userPermissions.origins) || []
      const scripts = (a.userContentScripts || []).flatMap(c => c.matches || [])
      out.push({
        browser: 'firefox',
        name: (a.defaultLocale && a.defaultLocale.name) || a.id,
        id: a.id,
        broad: isBroad([...origins, ...scripts])
      })
    }
  }
  return out
}

function browser_extensions () {
  const { chromium, firefox } = browserDirs()
  let all = []
  for (const [browser, root] of Object.entries(chromium)) all = all.concat(chromiumExtensions(browser, root))
  for (const root of firefox) all = all.concat(firefoxExtensions(root))

  // the same extension in two profiles only shows once
  const seen = new Set()
  all = all.filter(e => {
    const k = `${e.browser}:${e.id}`
    return seen.has(k) ? false : seen.add(k)
  })

  const broad = all.filter(e => e.broad)
  const items = all
    .sort((a, b) => (b.broad - a.broad) || a.name.localeCompare(b.name))
    .map(e => ({ text: `${e.name} (${e.browser})`, note: e.broad ? 'can read every site' : '', flag: e.broad }))

  if (!all.length) return { status: 'ok', detail: 'no browser extensions found' }
  return broad.length
    ? { status: 'review', detail: `${broad.length} of ${all.length} extensions can read and change every website you visit`, items }
    : { status: 'ok', detail: `${all.length} extensions, none can read every website`, items }
}

module.exports = { browser_extensions }
