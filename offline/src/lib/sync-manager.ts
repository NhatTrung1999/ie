import { apiClient } from '@/lib/api-client';
import { localDb } from '@/lib/local-db';

type SyncListener = (pendingCount: number, isSyncing: boolean) => void;

class SyncManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<SyncListener>();
  private isSyncing = false;
  private pendingCount = 0;

  /** Call once on app mount */
  init() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Start periodic sync every 30 s when online
    this.intervalId = setInterval(() => {
      if (navigator.onLine) {
        void this.flushQueue();
      }
    }, 30_000);

    // Initial flush if already online
    if (navigator.onLine) {
      void this.refreshPendingCount();
    }
  }

  destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ─── Subscribe ────────────────────────────────────────────────────────────
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    listener(this.pendingCount, this.isSyncing);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l(this.pendingCount, this.isSyncing));
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────
  private handleOnline = () => {
    void this.flushQueue();
  };

  private handleOffline = async () => {
    await this.refreshPendingCount();
    this.notify();
  };

  // ─── Queue management ─────────────────────────────────────────────────────
  async refreshPendingCount() {
    this.pendingCount = await localDb.getSyncQueueCount();
    this.notify();
  }

  /** Push all queued operations to the server */
  async flushQueue(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) return { success: 0, failed: 0 };

    this.isSyncing = true;
    this.notify();

    let success = 0;
    let failed = 0;

    try {
      const pending = await localDb.getPendingSyncEntries();
      // Process in creation order
      const sorted = [...pending].sort((a, b) => a.createdAt - b.createdAt);

      for (const entry of sorted) {
        try {
          await apiClient.request({
            method: entry.method,
            url: entry.endpoint,
            data: entry.payload,
          });
          await localDb.removeSyncEntry(entry.id);
          success++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          await localDb.markSyncEntryFailed(entry.id, msg);
          failed++;
        }
      }
    } finally {
      this.isSyncing = false;
      await this.refreshPendingCount();
    }

    return { success, failed };
  }

  /** Manually retry failed entries */
  async retryFailed() {
    await localDb.clearFailedSyncEntries();
    await this.refreshPendingCount();
    this.notify();
  }
}

export const syncManager = new SyncManager();
