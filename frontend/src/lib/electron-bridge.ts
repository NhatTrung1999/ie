/**
 * Bridge giữa React frontend và Electron IPC API
 * Khi chạy trong Electron: dùng window.electronAPI (exposed qua preload.ts)
 * Khi chạy trong browser (dev/online): fallback về null-safe stubs
 */

export type SyncStatus = {
  lastSyncAt: string | null;
  isSyncing: boolean;
  pendingCount: number;
  error: string | null;
};

export type SyncResult = {
  success: boolean;
  pushed: number;
  pulled: number;
  error?: string;
};

// Typed interface cho window.electronAPI (match preload.ts)
type ElectronAPI = {
  selectVideo(): Promise<string | null>;
  getVideoUrl(filePath: string): Promise<string>;
  exportData(): Promise<string | null>;
  importData(): Promise<string | null>;
  readDataFile(filePath: string): Promise<{ success: boolean; data?: string; error?: string }>;
  writeDataFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }>;
  getSyncStatus(): Promise<SyncStatus>;
  triggerSync(): Promise<SyncResult>;
  isOnline(): Promise<boolean>;
  getLocalIp(): Promise<string>;
  getHostname(): Promise<string>;
  onNetworkOnline(callback: () => void): () => void;
  onNetworkOffline(callback: () => void): () => void;
  onSyncCompleted(callback: (status: SyncStatus) => void): () => void;
};

// Detect xem có đang chạy trong Electron không
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 'electronAPI' in window;
};

// Typed accessor tới Electron API
const api = (): ElectronAPI | undefined =>
  isElectron() ? (window as unknown as { electronAPI: ElectronAPI }).electronAPI : undefined;

export const electronBridge = {
  // === Video ===
  selectVideo: async (): Promise<string | null> => {
    if (!isElectron()) return null;
    return api()?.selectVideo() ?? null;
  },

  getVideoUrl: async (filePath: string): Promise<string> => {
    if (!isElectron()) return filePath;
    return api()?.getVideoUrl(filePath) ?? filePath;
  },

  // === Data Export/Import ===
  exportData: async (): Promise<string | null> => {
    if (!isElectron()) return null;
    return api()?.exportData() ?? null;
  },

  importData: async (): Promise<string | null> => {
    if (!isElectron()) return null;
    return api()?.importData() ?? null;
  },

  readDataFile: async (filePath: string): Promise<{ success: boolean; data?: string; error?: string }> => {
    if (!isElectron()) return { success: false, error: 'Not in Electron' };
    return api()?.readDataFile(filePath) ?? { success: false, error: 'No API' };
  },

  writeDataFile: async (filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
    if (!isElectron()) return { success: false, error: 'Not in Electron' };
    return api()?.writeDataFile(filePath, content) ?? { success: false, error: 'No API' };
  },

  // === Sync ===
  getSyncStatus: async (): Promise<SyncStatus> => {
    if (!isElectron()) return { lastSyncAt: null, isSyncing: false, pendingCount: 0, error: null };
    return api()?.getSyncStatus() ?? { lastSyncAt: null, isSyncing: false, pendingCount: 0, error: null };
  },

  triggerSync: async (): Promise<SyncResult> => {
    if (!isElectron()) return { success: false, pushed: 0, pulled: 0, error: 'Not in Electron' };
    return api()?.triggerSync() ?? { success: false, pushed: 0, pulled: 0, error: 'No API' };
  },

  // === Network ===
  isOnline: async (): Promise<boolean> => {
    if (!isElectron()) return navigator.onLine;
    return api()?.isOnline() ?? navigator.onLine;
  },

  // === Identity ===
  getLocalIp: async (): Promise<string> => {
    if (!isElectron()) return '127.0.0.1';
    return api()?.getLocalIp() ?? '127.0.0.1';
  },

  getHostname: async (): Promise<string> => {
    if (!isElectron()) return window.location.hostname;
    return api()?.getHostname() ?? window.location.hostname;
  },

  // === Event Listeners ===
  onNetworkOnline: (callback: () => void): (() => void) => {
    if (!isElectron()) {
      window.addEventListener('online', callback);
      return () => window.removeEventListener('online', callback);
    }
    return api()?.onNetworkOnline(callback) ?? (() => {});
  },

  onNetworkOffline: (callback: () => void): (() => void) => {
    if (!isElectron()) {
      window.addEventListener('offline', callback);
      return () => window.removeEventListener('offline', callback);
    }
    return api()?.onNetworkOffline(callback) ?? (() => {});
  },

  onSyncCompleted: (callback: (status: SyncStatus) => void): (() => void) => {
    if (!isElectron()) return () => {};
    return api()?.onSyncCompleted(callback) ?? (() => {});
  },
};
