"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncManager = void 0;
const axios_1 = __importDefault(require("axios"));
class SyncManager {
    constructor(localBaseUrl) {
        this.status = {
            lastSyncAt: null,
            isSyncing: false,
            pendingCount: 0,
            error: null,
        };
        this.localApi = axios_1.default.create({
            baseURL: localBaseUrl,
            timeout: 10000,
        });
    }
    getStatus() {
        return { ...this.status };
    }
    async runSync() {
        if (this.status.isSyncing) {
            return { success: false, pushed: 0, pulled: 0, error: 'Sync already in progress' };
        }
        this.status.isSyncing = true;
        this.status.error = null;
        try {
            // Gọi sync endpoint của local NestJS backend
            // Backend sẽ handle toàn bộ logic push/pull với remote server
            const response = await this.localApi.post('/api/sync/run');
            const { pushed, pulled, pendingCount } = response.data;
            this.status.lastSyncAt = new Date().toISOString();
            this.status.pendingCount = pendingCount;
            this.status.error = null;
            console.log(`[SyncManager] Sync completed — pushed: ${pushed}, pulled: ${pulled}`);
            return { success: true, pushed, pulled };
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Sync failed';
            this.status.error = errorMsg;
            console.error('[SyncManager] Sync error:', errorMsg);
            return { success: false, pushed: 0, pulled: 0, error: errorMsg };
        }
        finally {
            this.status.isSyncing = false;
        }
    }
}
exports.SyncManager = SyncManager;
//# sourceMappingURL=sync-manager.js.map