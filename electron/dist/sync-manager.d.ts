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
export declare class SyncManager {
    private readonly localApi;
    private status;
    constructor(localBaseUrl: string);
    getStatus(): SyncStatus;
    runSync(): Promise<SyncResult>;
}
