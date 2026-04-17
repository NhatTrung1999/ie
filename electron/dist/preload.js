"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose safe APIs to the renderer process (React frontend)
// Tất cả IPC calls đều đi qua đây
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // === File & Video ===
    selectVideo: () => electron_1.ipcRenderer.invoke('dialog:selectVideo'),
    exportData: () => electron_1.ipcRenderer.invoke('dialog:exportData'),
    importData: () => electron_1.ipcRenderer.invoke('dialog:importData'),
    readDataFile: (filePath) => electron_1.ipcRenderer.invoke('file:readData', filePath),
    writeDataFile: (filePath, content) => electron_1.ipcRenderer.invoke('file:writeData', filePath, content),
    getVideoUrl: (filePath) => electron_1.ipcRenderer.invoke('file:getVideoUrl', filePath),
    // === Sync ===
    getSyncStatus: () => electron_1.ipcRenderer.invoke('sync:getStatus'),
    triggerSync: () => electron_1.ipcRenderer.invoke('sync:trigger'),
    // === Network ===
    isOnline: () => electron_1.ipcRenderer.invoke('network:isOnline'),
    // === Identity ===
    getLocalIp: () => electron_1.ipcRenderer.invoke('identity:getIp'),
    getHostname: () => electron_1.ipcRenderer.invoke('identity:getHostname'),
    // === Events (main → renderer) ===
    onNetworkOnline: (callback) => {
        electron_1.ipcRenderer.on('network:online', callback);
        return () => electron_1.ipcRenderer.removeListener('network:online', callback);
    },
    onNetworkOffline: (callback) => {
        electron_1.ipcRenderer.on('network:offline', callback);
        return () => electron_1.ipcRenderer.removeListener('network:offline', callback);
    },
    onSyncCompleted: (callback) => {
        const listener = (_event, status) => callback(status);
        electron_1.ipcRenderer.on('sync:completed', listener);
        return () => electron_1.ipcRenderer.removeListener('sync:completed', listener);
    },
});
//# sourceMappingURL=preload.js.map