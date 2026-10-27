const { contextBridge, ipcRenderer } = require('electron')

// only these calls reach the ui
contextBridge.exposeInMainWorld('checkup', {
  info: () => ipcRenderer.invoke('info'),
  scan: () => ipcRenderer.invoke('scan'),
  accept: () => ipcRenderer.invoke('accept'),
  save: format => ipcRenderer.invoke('save', format === 'json' ? 'json' : 'html'),
  reveal: () => ipcRenderer.invoke('reveal'),
  onProgress: cb => ipcRenderer.on('progress', (_, p) => cb(p))
})
