const { contextBridge, ipcRenderer } = require('electron')

// only these calls reach the ui
contextBridge.exposeInMainWorld('checkup', {
  info: () => ipcRenderer.invoke('info'),
  scan: () => ipcRenderer.invoke('scan'),
  accept: () => ipcRenderer.invoke('accept'),
  history: () => ipcRenderer.invoke('history'),
  reset: () => ipcRenderer.invoke('reset'),
  openSettings: id => ipcRenderer.invoke('open-settings', String(id)),
  openData: () => ipcRenderer.invoke('open-data'),
  save: format => ipcRenderer.invoke('save', format === 'json' ? 'json' : 'html'),
  reveal: () => ipcRenderer.invoke('reveal'),
  onProgress: cb => ipcRenderer.on('progress', (_, p) => cb(p))
})
