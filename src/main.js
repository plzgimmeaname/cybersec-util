const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
const path = require('path')
const os = require('os')
const engine = require('./engine')

function createWindow () {
  const win = new BrowserWindow({
    width: 760,
    height: 680,
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
ipcMain.handle('scan', () => engine.run())

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
