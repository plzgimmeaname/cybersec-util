const { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const engine = require('./engine')
const history = require('./history')
const report = require('./report')
const settings = require('./settings')

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
  })
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
