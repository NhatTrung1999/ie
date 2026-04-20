import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to the renderer process (React frontend)
// Tất cả IPC calls đều đi qua đây
contextBridge.exposeInMainWorld('electronAPI', {
  // === File & Video ===
  selectVideo: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectVideo'),

  exportData: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:exportData'),

  importData: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:importData'),

  readDataFile: (filePath: string): Promise<{ success: boolean; data?: string; error?: string }> =>
    ipcRenderer.invoke('file:readData', filePath),

  writeDataFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('file:writeData', filePath, content),

  getVideoUrl: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('file:getVideoUrl', filePath),

  // === Sync ===
  getSyncStatus: (): Promise<SyncStatus> =>
    ipcRenderer.invoke('sync:getStatus'),

  triggerSync: (): Promise<SyncResult> =>
    ipcRenderer.invoke('sync:trigger'),

  // === Network ===
  isOnline: (): Promise<boolean> =>
    ipcRenderer.invoke('network:isOnline'),

  // === Identity ===
  getLocalIp: (): Promise<string> =>
    ipcRenderer.invoke('identity:getIp'),

  getHostname: (): Promise<string> =>
    ipcRenderer.invoke('identity:getHostname'),

  // === Events (main → renderer) ===
  onNetworkOnline: (callback: () => void) => {
    ipcRenderer.on('network:online', callback);
    return () => ipcRenderer.removeListener('network:online', callback);
  },

  onNetworkOffline: (callback: () => void) => {
    ipcRenderer.on('network:offline', callback);
    return () => ipcRenderer.removeListener('network:offline', callback);
  },

  onSyncCompleted: (callback: (status: SyncStatus) => void) => {
    const listener = (_event: any, status: any) => callback(status as SyncStatus);
    ipcRenderer.on('sync:completed', listener);
    return () => ipcRenderer.removeListener('sync:completed', listener);
  },
});

// Type definitions (mirrored in frontend)
type SyncStatus = {
  lastSyncAt: string | null;
  isSyncing: boolean;
  pendingCount: number;
  error: string | null;
};

type SyncResult = {
  success: boolean;
  pushed: number;
  pulled: number;
  error?: string;
};
