import axios, { AxiosInstance } from 'axios';

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

export class SyncManager {
  private readonly localApi: AxiosInstance;
  private status: SyncStatus = {
    lastSyncAt: null,
    isSyncing: false,
    pendingCount: 0,
    error: null,
  };

  constructor(localBaseUrl: string) {
    this.localApi = axios.create({
      baseURL: localBaseUrl,
      timeout: 10_000,
    });
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  async runSync(): Promise<SyncResult> {
    if (this.status.isSyncing) {
      return { success: false, pushed: 0, pulled: 0, error: 'Sync already in progress' };
    }

    this.status.isSyncing = true;
    this.status.error = null;

    try {
      // Gọi sync endpoint của local NestJS backend
      // Backend sẽ handle toàn bộ logic push/pull với remote server
      const response = await this.localApi.post<{
        success: boolean;
        pushed: number;
        pulled: number;
        pendingCount: number;
        error?: string;
      }>('/api/sync/run');

      const { pushed, pulled, pendingCount } = response.data;

      this.status.lastSyncAt = new Date().toISOString();
      this.status.pendingCount = pendingCount;
      this.status.error = null;

      console.log(`[SyncManager] Sync completed — pushed: ${pushed}, pulled: ${pulled}`);

      return { success: true, pushed, pulled };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Sync failed';
      this.status.error = errorMsg;
      console.error('[SyncManager] Sync error:', errorMsg);
      return { success: false, pushed: 0, pulled: 0, error: errorMsg };
    } finally {
      this.status.isSyncing = false;
    }
  }
}
