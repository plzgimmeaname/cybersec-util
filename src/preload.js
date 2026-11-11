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
  recheck: id => ipcRenderer.invoke('recheck', String(id)),
  ignore: (id, on) => ipcRenderer.invoke('ignore', String(id), !!on),
  setSettings: patch => ipcRenderer.invoke('settings', patch),
  onProgress: cb => ipcRenderer.on('progress', (_, p) => cb(p))
})
