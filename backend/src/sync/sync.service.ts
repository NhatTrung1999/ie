import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

type SyncResult = {
  success: boolean;
  pushed: number;
  pulled: number;
  pendingCount: number;
  error?: string;
};

type RemoteStage = {
  id: string;
  code: string;
  name: string;
  season?: string;
  cutDie?: string;
  area?: string;
  article?: string;
  duration: string;
  mood: string;
  stage: string;
  filePath?: string;
  stageDate?: string;
  sortOrder: number;
  updatedAt: string;
};

// ============================================================
// Minimal HTTP client dùng Node 18+ built-in fetch
// (tránh phải cài thêm axios vào backend)
// ============================================================
async function httpGet<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function httpPost<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly remoteBaseUrl: string;
  private readonly syncHeaders: Record<string, string>;
  private isSyncing = false;
  private lastSyncAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {
    this.remoteBaseUrl = configService.get<string>(
      'REMOTE_API_URL',
      'http://192.168.18.42:3001/api',
    );
    this.syncHeaders = {
      'x-offline-sync': 'true',
      'x-offline-key': configService.get<string>('OFFLINE_SYNC_KEY', 'ie-offline-sync-2025'),
    };
  }

  async runSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, pushed: 0, pulled: 0, pendingCount: 0, error: 'Sync already running' };
    }

    this.isSyncing = true;
    let pushed = 0;
    let pulled = 0;

    try {
      pushed = await this.pushToRemote();
      pulled = await this.pullFromRemote();
      const pendingCount = await this.countPending();

      this.lastSyncAt = new Date();

      await (this.prisma as any).syncLog.create({
        data: {
          direction: 'bidirectional',
          tableName: 'all',
          recordCount: pushed + pulled,
          success: true,
        },
      }).catch(() => {});

      this.logger.log(`Sync complete — pushed: ${pushed}, pulled: ${pulled}`);
      return { success: true, pushed, pulled, pendingCount };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown sync error';
      this.logger.error('Sync failed:', errorMsg);

      await (this.prisma as any).syncLog.create({
        data: {
          direction: 'bidirectional',
          tableName: 'all',
          recordCount: 0,
          success: false,
          error: errorMsg,
        },
      }).catch(() => {});

      return { success: false, pushed: 0, pulled: 0, pendingCount: 0, error: errorMsg };
    } finally {
      this.isSyncing = false;
    }
  }

  // ============================================================
  // PUSH: Local SQLite → Remote SQL Server
  // ============================================================

  private async pushToRemote(): Promise<number> {
    let total = 0;

    total += await this.pushTable(
      'stageList',
      '/sync/stages',
      (item: any) => ({
        remoteId: item.remoteId,
        code: item.code,
        name: item.name,
        season: item.season,
        cutDie: item.cutDie,
        area: item.area,
        article: item.article,
        duration: item.duration,
        mood: item.mood,
        stage: item.stage,
        sortOrder: item.sortOrder,
        stageDate: item.stageDate,
        updatedAt: item.updatedAt.toISOString(),
        createdByIp: item.createdByIp,
      }),
    );

    total += await this.pushTable(
      'tableCT',
      '/sync/table-ct',
      (item: any) => ({
        remoteId: item.remoteId,
        stageItemId: item.stageItemId,
        no: item.no,
        partName: item.partName,
        stage: item.stage,
        ct1: item.ct1, ct2: item.ct2, ct3: item.ct3, ct4: item.ct4, ct5: item.ct5,
        ct6: item.ct6, ct7: item.ct7, ct8: item.ct8, ct9: item.ct9, ct10: item.ct10,
        vaCt1: item.vaCt1, vaCt2: item.vaCt2, vaCt3: item.vaCt3,
        vaCt4: item.vaCt4, vaCt5: item.vaCt5,
        vaCt6: item.vaCt6, vaCt7: item.vaCt7, vaCt8: item.vaCt8,
        vaCt9: item.vaCt9, vaCt10: item.vaCt10,
        machineType: item.machineType,
        confirmed: item.confirmed,
        done: item.done,
        sortOrder: item.sortOrder,
        updatedAt: item.updatedAt.toISOString(),
        createdByIp: item.createdByIp,
      }),
    );

    total += await this.pushTable(
      'historyEntry',
      '/sync/history',
      (item: any) => ({
        remoteId: item.remoteId,
        stageItemId: item.stageItemId,
        stageCode: item.stageCode,
        startTime: item.startTime,
        endTime: item.endTime,
        type: item.type,
        value: item.value,
        committed: item.committed,
        updatedAt: item.updatedAt.toISOString(),
        createdByIp: item.createdByIp,
      }),
    );

    total += await this.pushTable(
      'controlSession',
      '/sync/control-session',
      (item: any) => ({
        remoteId: item.remoteId,
        stageItemId: item.stageItemId,
        stageCode: item.stageCode,
        elapsed: item.elapsed,
        isRunning: item.isRunning,
        segmentStart: item.segmentStart,
        nva: item.nva,
        va: item.va,
        skip: item.skip,
        updatedAt: item.updatedAt.toISOString(),
        createdByIp: item.createdByIp,
      }),
    );

    return total;
  }

  private async pushTable(
    modelName: string,
    remotePath: string,
    mapper: (item: any) => any,
  ): Promise<number> {
    try {
      const pendingItems = await (this.prisma as any)[modelName].findMany({
        where: { syncStatus: 'pending' },
        take: 100,
      });

      if (pendingItems.length === 0) return 0;

      const payload = pendingItems.map(mapper);
      const url = `${this.remoteBaseUrl}${remotePath}`;

      const response = await httpPost<{ synced: { localId: string; remoteId: string }[] }>(
        url,
        { records: payload, localIds: pendingItems.map((i: any) => i.id) },
        this.syncHeaders,
      );

      const synced = response.synced ?? [];
      for (const { localId, remoteId } of synced) {
        await (this.prisma as any)[modelName].update({
          where: { id: localId },
          data: { remoteId, syncStatus: 'synced', lastSyncedAt: new Date() },
        }).catch(() => {});
      }

      return synced.length;
    } catch (error) {
      this.logger.warn(`Failed to push ${modelName}: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  // ============================================================
  // PULL: Remote SQL Server → Local SQLite
  // ============================================================

  private async pullFromRemote(): Promise<number> {
    let total = 0;

    try {
      const since = this.lastSyncAt?.toISOString() ?? new Date(0).toISOString();
      const url = `${this.remoteBaseUrl}/sync/pull?since=${encodeURIComponent(since)}`;

      const data = await httpGet<{
        stages: RemoteStage[];
        stageCategories: any[];
        machineTypes: any[];
      }>(url, this.syncHeaders);

      const { stages = [], stageCategories = [], machineTypes = [] } = data;

      for (const stage of stages) {
        await (this.prisma as any).stageList.upsert({
          where: { remoteId: stage.id },
          update: {
            code: stage.code, name: stage.name, season: stage.season,
            cutDie: stage.cutDie, area: stage.area, article: stage.article,
            duration: stage.duration, mood: stage.mood, stage: stage.stage,
            sortOrder: stage.sortOrder,
            stageDate: stage.stageDate ? new Date(stage.stageDate) : null,
            syncStatus: 'synced', lastSyncedAt: new Date(),
          },
          create: {
            remoteId: stage.id, code: stage.code, name: stage.name,
            season: stage.season, cutDie: stage.cutDie, area: stage.area,
            article: stage.article, duration: stage.duration, mood: stage.mood,
            stage: stage.stage, sortOrder: stage.sortOrder,
            stageDate: stage.stageDate ? new Date(stage.stageDate) : null,
            syncStatus: 'synced', lastSyncedAt: new Date(),
          },
        }).catch(() => { total--; });
        total++;
      }

      for (const cat of stageCategories) {
        await (this.prisma as any).stageCategory.upsert({
          where: { value: cat.value },
          update: { label: cat.label, sortOrder: cat.sortOrder, isActive: cat.isActive, syncStatus: 'synced' },
          create: { remoteId: cat.id, value: cat.value, label: cat.label, sortOrder: cat.sortOrder, isActive: cat.isActive, syncStatus: 'synced' },
        }).catch(() => {});
        total++;
      }

      for (const mt of machineTypes) {
        await (this.prisma as any).machineType.upsert({
          where: { remoteId: mt.id },
          update: { label: mt.label, labelCn: mt.labelCn, labelVn: mt.labelVn, syncStatus: 'synced' },
          create: {
            remoteId: mt.id, department: mt.department, label: mt.label,
            labelCn: mt.labelCn, labelVn: mt.labelVn, loss: mt.loss,
            sortOrder: mt.sortOrder, isActive: mt.isActive, syncStatus: 'synced',
          },
        }).catch(() => {});
        total++;
      }

    } catch (error) {
      this.logger.warn(`Pull failed: ${error instanceof Error ? error.message : error}`);
    }

    return total;
  }

  private async countPending(): Promise<number> {
    try {
      const counts = await Promise.all([
        (this.prisma as any).stageList.count({ where: { syncStatus: 'pending' } }),
        (this.prisma as any).tableCT.count({ where: { syncStatus: 'pending' } }),
        (this.prisma as any).historyEntry.count({ where: { syncStatus: 'pending' } }),
        (this.prisma as any).controlSession.count({ where: { syncStatus: 'pending' } }),
      ]);
      return counts.reduce((a, b) => a + b, 0);
    } catch {
      return 0;
    }
  }

  getStatus() {
    return {
      lastSyncAt: this.lastSyncAt?.toISOString() ?? null,
      isSyncing: this.isSyncing,
    };
  }

  async importData(body: { stages: any[]; tableCt: any[]; history: any[] }) {
    let stages = 0;
    let tableCt = 0;
    let history = 0;

    for (const stage of body.stages ?? []) {
      try {
        await (this.prisma as any).stageList.upsert({
          where: { id: stage.id ?? '__nonexistent__' },
          update: { ...stage, syncStatus: 'pending' },
          create: { ...stage, id: undefined, syncStatus: 'pending' },
        }).catch(async () => {
          await (this.prisma as any).stageList.create({
            data: { ...stage, id: undefined, syncStatus: 'pending' },
          });
        });
        stages++;
      } catch (error) {
        this.logger.warn(`Failed to import stage: ${error}`);
      }
    }

    for (const row of body.tableCt ?? []) {
      try {
        await (this.prisma as any).tableCT.upsert({
          where: { id: row.id ?? '__nonexistent__' },
          update: { ...row, syncStatus: 'pending' },
          create: { ...row, id: undefined, syncStatus: 'pending' },
        }).catch(async () => {
          await (this.prisma as any).tableCT.create({
            data: { ...row, id: undefined, syncStatus: 'pending' },
          });
        });
        tableCt++;
      } catch (error) {
        this.logger.warn(`Failed to import tableCT: ${error}`);
      }
    }

    for (const item of body.history ?? []) {
      try {
        await (this.prisma as any).historyEntry.upsert({
          where: { id: item.id ?? '__nonexistent__' },
          update: { ...item, syncStatus: 'pending' },
          create: { ...item, id: undefined, syncStatus: 'pending' },
        }).catch(async () => {
          await (this.prisma as any).historyEntry.create({
            data: { ...item, id: undefined, syncStatus: 'pending' },
          });
        });
        history++;
      } catch (error) {
        this.logger.warn(`Failed to import history: ${error}`);
      }
    }

    this.logger.log(`Import done — stages: ${stages}, tableCt: ${tableCt}, history: ${history}`);
    return { imported: { stages, tableCt, history } };
  }
}
