import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CtRow, HistoryItem, ControlSessionItem, StageCategory, StageItem } from '@/types/dashboard';
import type { MachineTypeItem } from '@/services/machine-types';

// ─── Extended cached types ───────────────────────────────────────────────────

export type SyncStatus = 'pending' | 'failed';

export type SyncQueueEntry = {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  payload?: unknown;
  resource: string;
  createdAt: number;
  retries: number;
  status: SyncStatus;
  errorMessage?: string;
};

type CachedStageItem = StageItem & { _cachedAt: number };
type CachedCtRow = CtRow & { _stageCode?: string; _cachedAt: number };
type CachedHistoryItem = HistoryItem & {
  _stageCode?: string;
  _stageItemId?: string;
  _cachedAt: number;
};
type CachedControlSession = ControlSessionItem & { _cachedAt: number };
type CachedMachineType = MachineTypeItem & { _cachedAt: number };
type CachedStageCategory = StageCategory & { _cachedAt: number };
type SyncMetaEntry = { key: string; value: string };

// ─── IDB Schema ──────────────────────────────────────────────────────────────

interface IEOfflineSchema extends DBSchema {
  stages: { key: string; value: CachedStageItem };
  tableCtRows: {
    key: string;
    value: CachedCtRow;
    indexes: { 'by-stageItemId': string; 'by-stageCode': string };
  };
  historyEntries: {
    key: string;
    value: CachedHistoryItem;
    indexes: { 'by-stageItemId': string; 'by-stageCode': string };
  };
  controlSessions: {
    key: string;
    value: CachedControlSession;
    indexes: { 'by-stageItemId': string; 'by-stageCode': string };
  };
  machineTypes: { key: string; value: CachedMachineType };
  stageCategories: { key: string; value: CachedStageCategory };
  syncQueue: {
    key: string;
    value: SyncQueueEntry;
    indexes: { 'by-status': SyncStatus; 'by-createdAt': number };
  };
  syncMeta: { key: string; value: SyncMetaEntry };
}

let _dbPromise: Promise<IDBPDatabase<IEOfflineSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<IEOfflineSchema>> {
  if (!_dbPromise) {
    _dbPromise = openDB<IEOfflineSchema>('ie-offline-db', 1, {
      upgrade(db) {
        // Stages
        db.createObjectStore('stages', { keyPath: 'id' });

        // TableCT rows
        const ctStore = db.createObjectStore('tableCtRows', { keyPath: 'id' });
        ctStore.createIndex('by-stageItemId', 'stageItemId');
        ctStore.createIndex('by-stageCode', '_stageCode');

        // History entries
        const histStore = db.createObjectStore('historyEntries', { keyPath: 'id' });
        histStore.createIndex('by-stageItemId', '_stageItemId');
        histStore.createIndex('by-stageCode', '_stageCode');

        // Control sessions
        const csStore = db.createObjectStore('controlSessions', { keyPath: 'id' });
        csStore.createIndex('by-stageItemId', 'stageItemId');
        csStore.createIndex('by-stageCode', 'stageCode');

        // Lookup tables
        db.createObjectStore('machineTypes', { keyPath: 'id' });
        db.createObjectStore('stageCategories', { keyPath: 'id' });

        // Sync queue
        const sqStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        sqStore.createIndex('by-status', 'status');
        sqStore.createIndex('by-createdAt', 'createdAt');

        // Sync metadata (e.g., lastSyncAt)
        db.createObjectStore('syncMeta', { keyPath: 'key' });
      },
    });
  }
  return _dbPromise;
}

// ─── Utility: strip internal cache fields ────────────────────────────────────

function toCtRow(cached: CachedCtRow): CtRow {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _stageCode: _sc, _cachedAt: _ca, ...row } = cached;
  return row as CtRow;
}

function toHistoryItem(cached: CachedHistoryItem): HistoryItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _stageCode: _sc, _stageItemId: _si, _cachedAt: _ca, ...item } = cached;
  return item as HistoryItem;
}

function toControlSession(cached: CachedControlSession): ControlSessionItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _cachedAt: _ca, ...session } = cached;
  return session as ControlSessionItem;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const localDb = {
  // ── Stages ────────────────────────────────────────────────────────────────
  async putStages(stages: StageItem[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('stages', 'readwrite');
    await Promise.all(stages.map((s) => tx.store.put({ ...s, _cachedAt: Date.now() })));
    await tx.done;
  },

  async getStages(): Promise<StageItem[]> {
    const db = await getDb();
    const cached = await db.getAll('stages');
    return cached.map(({ _cachedAt: _, ...s }) => s as StageItem);
  },

  async deleteStage(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('stages', id);
  },

  // ── TableCT rows ──────────────────────────────────────────────────────────
  async putTableCtRows(rows: CtRow[], stageCode?: string): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('tableCtRows', 'readwrite');
    await Promise.all(
      rows.map((r) => tx.store.put({ ...r, _stageCode: stageCode ?? '', _cachedAt: Date.now() })),
    );
    await tx.done;
  },

  async putTableCtRow(row: CtRow, stageCode?: string): Promise<void> {
    const db = await getDb();
    const existing = await db.get('tableCtRows', row.id);
    await db.put('tableCtRows', {
      ...row,
      _stageCode: stageCode ?? existing?._stageCode ?? '',
      _cachedAt: Date.now(),
    });
  },

  async getTableCtRow(id: string): Promise<CtRow | null> {
    const db = await getDb();
    const cached = await db.get('tableCtRows', id);
    return cached ? toCtRow(cached) : null;
  },

  async getTableCtRowsByStageItemId(stageItemId: string): Promise<CtRow[]> {
    const db = await getDb();
    const cached = await db.getAllFromIndex('tableCtRows', 'by-stageItemId', stageItemId);
    return cached.map(toCtRow);
  },

  async getTableCtRowsByStageCode(stageCode: string): Promise<CtRow[]> {
    const db = await getDb();
    const cached = await db.getAllFromIndex('tableCtRows', 'by-stageCode', stageCode);
    return cached.map(toCtRow);
  },

  async getAllTableCtRows(): Promise<CtRow[]> {
    const db = await getDb();
    const cached = await db.getAll('tableCtRows');
    return cached.map(toCtRow);
  },

  async deleteTableCtRow(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('tableCtRows', id);
  },

  // ── History entries ────────────────────────────────────────────────────────
  async putHistoryEntries(
    items: HistoryItem[],
    opts: { stageCode?: string; stageItemId?: string },
  ): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('historyEntries', 'readwrite');
    await Promise.all(
      items.map((i) =>
        tx.store.put({
          ...i,
          _stageCode: opts.stageCode ?? '',
          _stageItemId: opts.stageItemId ?? '',
          _cachedAt: Date.now(),
        }),
      ),
    );
    await tx.done;
  },

  async putHistoryEntry(
    item: HistoryItem,
    opts: { stageCode?: string; stageItemId?: string },
  ): Promise<void> {
    const db = await getDb();
    const existing = await db.get('historyEntries', item.id);
    await db.put('historyEntries', {
      ...item,
      _stageCode: opts.stageCode ?? existing?._stageCode ?? '',
      _stageItemId: opts.stageItemId ?? existing?._stageItemId ?? '',
      _cachedAt: Date.now(),
    });
  },

  async getHistoryByStageItemId(stageItemId: string): Promise<HistoryItem[]> {
    const db = await getDb();
    const cached = await db.getAllFromIndex('historyEntries', 'by-stageItemId', stageItemId);
    return cached.map(toHistoryItem);
  },

  async getHistoryByStageCode(stageCode: string): Promise<HistoryItem[]> {
    const db = await getDb();
    const cached = await db.getAllFromIndex('historyEntries', 'by-stageCode', stageCode);
    return cached.map(toHistoryItem);
  },

  async deleteHistoryEntry(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('historyEntries', id);
  },

  // ── Control sessions ───────────────────────────────────────────────────────
  async putControlSession(session: ControlSessionItem): Promise<void> {
    const db = await getDb();
    await db.put('controlSessions', { ...session, _cachedAt: Date.now() });
  },

  async getControlSessionByStageItemId(stageItemId: string): Promise<ControlSessionItem | null> {
    const db = await getDb();
    const results = await db.getAllFromIndex('controlSessions', 'by-stageItemId', stageItemId);
    return results[0] ? toControlSession(results[0]) : null;
  },

  async getControlSessionByStageCode(stageCode: string): Promise<ControlSessionItem | null> {
    const db = await getDb();
    const results = await db.getAllFromIndex('controlSessions', 'by-stageCode', stageCode);
    return results[0] ? toControlSession(results[0]) : null;
  },

  // ── Machine types ──────────────────────────────────────────────────────────
  async putMachineTypes(types: MachineTypeItem[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('machineTypes', 'readwrite');
    await Promise.all(types.map((t) => tx.store.put({ ...t, _cachedAt: Date.now() })));
    await tx.done;
  },

  async getMachineTypes(): Promise<MachineTypeItem[]> {
    const db = await getDb();
    const cached = await db.getAll('machineTypes');
    return cached.map(({ _cachedAt: _, ...t }) => t as MachineTypeItem);
  },

  // ── Stage categories ───────────────────────────────────────────────────────
  async putStageCategories(categories: StageCategory[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('stageCategories', 'readwrite');
    await Promise.all(categories.map((c) => tx.store.put({ ...c, _cachedAt: Date.now() })));
    await tx.done;
  },

  async putStageCategory(category: StageCategory): Promise<void> {
    const db = await getDb();
    await db.put('stageCategories', { ...category, _cachedAt: Date.now() });
  },

  async getStageCategories(): Promise<StageCategory[]> {
    const db = await getDb();
    const cached = await db.getAll('stageCategories');
    return cached.map(({ _cachedAt: _, ...c }) => c as StageCategory);
  },

  async deleteStageCategoryById(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('stageCategories', id);
  },

  // ── Sync queue ─────────────────────────────────────────────────────────────
  async enqueueSync(
    entry: Omit<SyncQueueEntry, 'id' | 'createdAt' | 'retries' | 'status'>,
  ): Promise<string> {
    const db = await getDb();
    const id = crypto.randomUUID();
    const queueEntry: SyncQueueEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
      retries: 0,
      status: 'pending',
    };
    await db.put('syncQueue', queueEntry);
    return id;
  },

  async getPendingSyncEntries(): Promise<SyncQueueEntry[]> {
    const db = await getDb();
    return db.getAllFromIndex('syncQueue', 'by-status', 'pending');
  },

  async removeSyncEntry(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('syncQueue', id);
  },

  async markSyncEntryFailed(id: string, errorMessage: string): Promise<void> {
    const db = await getDb();
    const entry = await db.get('syncQueue', id);
    if (entry) {
      await db.put('syncQueue', {
        ...entry,
        status: 'failed' as const,
        retries: entry.retries + 1,
        errorMessage,
      });
    }
  },

  async getSyncQueueCount(): Promise<number> {
    const db = await getDb();
    const pending = await db.getAllFromIndex('syncQueue', 'by-status', 'pending');
    return pending.length;
  },

  async clearFailedSyncEntries(): Promise<void> {
    const db = await getDb();
    const all = await db.getAll('syncQueue');
    const failed = all.filter((e) => e.status === 'failed');
    await Promise.all(failed.map((e) => db.delete('syncQueue', e.id)));
  },

  // ── Sync metadata ──────────────────────────────────────────────────────────
  async getSyncMeta(key: string): Promise<string | null> {
    const db = await getDb();
    const entry = await db.get('syncMeta', key);
    return entry?.value ?? null;
  },

  async setSyncMeta(key: string, value: string): Promise<void> {
    const db = await getDb();
    await db.put('syncMeta', { key, value });
  },
};
