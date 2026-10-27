const { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const engine = require('./engine')
const history = require('./history')
const report = require('./report')

// history, baseline and the nvd cache live in the app's own data folder
const dataDir = app.getPath('userData')
process.env.CHECKUP_DATA = dataDir

let last = null // latest scan, for saving
let savedPath = null // only this file can be shown in the folder

function createWindow () {
  const win = new BrowserWindow({
    width: 780,
    height: 800,
    minWidth: 480,
    minHeight: 480,
    title: 'security checkup',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141414' : '#fafafa',
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

  win.loadFile(path.join(__dirname, '..', 'ui', 'index.html'))
}

ipcMain.handle('info', () => ({ host: os.hostname(), os: engine.platform() }))

ipcMain.handle('scan', async e => {
  const r = await engine.run(p => {
    if (!e.sender.isDestroyed()) e.sender.send('progress', p)
  })
  r.host = os.hostname()
  try { r.drift = history.record(dataDir, r) } catch (err) { r.drift = { error: err.message, changes: [], trend: [] } }
  last = r
  return r
})

// "these changes are fine"
ipcMain.handle('accept', () => {
  const since = history.accept(dataDir)
  if (last && last.drift) last.drift = { ...last.drift, since, changes: [] }
  return since
})

ipcMain.handle('save', async (e, format) => {
  if (!last) return null
  const ext = format === 'json' ? 'json' : 'html'
  const day = new Date(last.time).toISOString().slice(0, 10)
  const win = BrowserWindow.fromWebContents(e.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), `security-checkup-${day}.${ext}`),
    filters: [ext === 'json' ? { name: 'json', extensions: ['json'] } : { name: 'web page', extensions: ['html'] }]
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
