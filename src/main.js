const { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const engine = require('./engine')
const history = require('./history')
const report = require('./report')
const settings = require('./settings')
const fixes = require('./fixes')

// history, baseline and the nvd cache live in the app's own data folder
const dataDir = app.getPath('userData')
process.env.CHECKUP_DATA = dataDir

const mac = process.platform === 'darwin'
const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
let last = null // latest scan, for saving
let savedPath = null // only this file can be shown in the folder

function createWindow () {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    title: 'Security Checkup',
    show: false,
    icon: iconPath,
    // mac gets inset traffic lights and the real sidebar material behind the nav
    ...(mac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 }, vibrancy: 'sidebar', visualEffectState: 'followWindow' }
      : { backgroundColor: nativeTheme.shouldUseDarkColors ? '#111214' : '#f6f6f7' }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // no menus, no popups, no navigating away
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.once('ready-to-show', () => win.show())

  win.loadFile(path.join(__dirname, '..', 'ui', 'index.html'))
}

// ignored checks stay in the list but don't count toward the score
function applyIgnored (r) {
  const ignored = new Set(Object.keys(settings.load(dataDir).ignored))
  for (const x of r.results) x.ignored = ignored.has(x.id)
  r.score = engine.score(r.results, ignored)
  return r
}

ipcMain.handle('info', () => ({
  host: os.hostname(),
  os: engine.platform(),
  osVersion: os.release(),
  version: app.getVersion(),
  mac,
  checks: engine.loadChecks().filter(c => (c.platforms || []).includes(engine.platform())).length,
  lastTime: (history.list(dataDir)[0] || {}).time || null,
  settings: settings.load(dataDir)
}))

ipcMain.handle('scan', async e => {
  const r = await engine.run(p => {
    if (!e.sender.isDestroyed()) e.sender.send('progress', p)
  }, { quick: settings.load(dataDir).quick })
  r.host = os.hostname()
  applyIgnored(r)
  try { r.drift = history.record(dataDir, r) } catch (err) { r.drift = { error: err.message, changes: [], trend: [] } }
  last = r
  return r
})

// one check again after a fix, the saved history stays as it was
ipcMain.handle('recheck', async (e, id) => {
  if (!last) return null
  const fresh = await engine.runOne(String(id))
  if (!fresh) return null
  last.results = engine.sort(last.results.map(x => x.id === fresh.id ? fresh : x))
  return applyIgnored(last)
})

// fixes: the user confirms in a native dialog, then the report is refreshed with fresh results
async function runFixes (e, ids) {
  if (!last) return null
  const osName = engine.platform()
  const win = BrowserWindow.fromWebContents(e.sender)
  const todo = ids.map(id => ({ id, info: fixes.info(osName, id), r: last.results.find(x => x.id === id) }))
    .filter(x => x.info && x.r && x.r.state !== 'pass')
  if (!todo.length) return { report: last, results: [] }

  const admin = todo.some(x => x.info.admin)
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Cancel', todo.length === 1 ? todo[0].info.label : `Fix ${todo.length} things`],
    defaultId: 0,
    cancelId: 0,
    message: todo.length === 1 ? `${todo[0].info.label}?` : `Fix ${todo.length} things?`,
    detail: todo.map(x => `• ${x.info.summary}\n   To undo: ${x.info.undo}`).join('\n\n') + (admin ? '\n\nYour computer will ask for your password or admin permission. This app never sees it.' : '')
  })
  if (response !== 1) return { report: last, cancelled: true, results: [] }

  const out = await fixes.apply(osName, todo.map(x => x.id))
  // the truth is what the check says afterwards, not what the command printed
  const results = []
  for (const x of todo) {
    const fresh = await engine.runOne(x.id)
    if (fresh) last.results = last.results.map(r => r.id === x.id ? fresh : r)
    const fixed = !!fresh && fresh.state === 'pass'
    const res = out[x.id] || { ok: false, message: 'no fix available' }
    results.push({ id: x.id, title: x.r.title, label: x.info.label, fixed, ok: res.ok, message: res.message, cancelled: !!res.cancelled })
  }
  last.results = engine.sort(last.results)
  fixes.addLog(dataDir, results.filter(x => !x.cancelled).map(x => ({ time: new Date().toISOString(), id: x.id, title: x.title, label: x.label, fixed: x.fixed, message: x.message })))
  return { report: applyIgnored(last), results }
}

ipcMain.handle('fix', (e, id) => runFixes(e, [String(id)]))
ipcMain.handle('fix-all', e => runFixes(e, last ? last.results.filter(r => r.state === 'fail' && !r.ignored && r.autofix).map(r => r.id) : []))
ipcMain.handle('fix-log', () => fixes.readLog(dataDir))

ipcMain.handle('ignore', (e, id, on) => {
  const check = engine.loadChecks().find(c => c.id === String(id))
  if (!check) return null
  const s = settings.ignore(dataDir, check.id, !!on, check.title)
  if (last) applyIgnored(last)
  return { settings: s, report: last }
})

ipcMain.handle('settings', (e, patch) => {
  const s = settings.update(dataDir, patch && typeof patch === 'object' ? patch : {})
  nativeTheme.themeSource = s.theme
  return s
})

// "these changes are fine"
ipcMain.handle('accept', () => {
  const since = history.accept(dataDir)
  if (last && last.drift) last.drift = { ...last.drift, since, changes: [] }
  return since
})

ipcMain.handle('history', () => history.list(dataDir))

ipcMain.handle('reset', async e => {
  const { response } = await dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), {
    type: 'warning',
    buttons: ['Cancel', 'Clear history'],
    defaultId: 0,
    cancelId: 0,
    message: 'Clear all past checkups?',
    detail: 'Your score history and known-good checkup will be deleted. The next checkup starts fresh.'
  })
  if (response !== 1) return false
  history.reset(dataDir)
  return true
})

// the renderer only sends a check id, the link itself comes from the check file
ipcMain.handle('open-settings', (e, id) => {
  const link = engine.linkFor(String(id))
  if (link) shell.openExternal(link)
  return !!link
})

// where this computer sits on the network, for the network page
ipcMain.handle('netinfo', () => ({
  host: os.hostname(),
  interfaces: Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list || []).filter(a => !a.internal && a.family === 'IPv4' && !a.address.startsWith('169.254.')).map(a => ({ name, address: a.address, mac: a.mac })))
}))

ipcMain.handle('open-data', () => shell.openPath(dataDir))

ipcMain.handle('save', async (e, format) => {
  if (!last) return null
  const ext = format === 'json' ? 'json' : 'html'
  const day = new Date(last.time).toISOString().slice(0, 10)
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    defaultPath: path.join(app.getPath('documents'), `security-checkup-${day}.${ext}`),
    filters: [ext === 'json' ? { name: 'JSON', extensions: ['json'] } : { name: 'Web page', extensions: ['html'] }]
  })
  if (canceled || !filePath) return null
  fs.writeFileSync(filePath, ext === 'json' ? report.toJson(last) : report.toHtml(last))
  savedPath = filePath
  return path.basename(filePath)
})

ipcMain.handle('reveal', () => {
  if (savedPath) shell.showItemInFolder(savedPath)
})

app.whenReady().then(() => {
  nativeTheme.themeSource = settings.load(dataDir).theme
  // dock icon while running with npm start
  if (mac && app.dock && fs.existsSync(iconPath)) app.dock.setIcon(iconPath)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!mac) app.quit()
})
