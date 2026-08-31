const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audiora', {
  selectFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  selectFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  platform: process.platform
});
