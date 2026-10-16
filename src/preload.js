const { contextBridge, ipcRenderer } = require('electron')

// only these two calls reach the ui
contextBridge.exposeInMainWorld('checkup', {
  info: () => ipcRenderer.invoke('info'),
  scan: () => ipcRenderer.invoke('scan')
})
