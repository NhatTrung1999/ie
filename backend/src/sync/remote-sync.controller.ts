import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sync endpoints cho remote server (online version - SQL Server)
 * Nhận data push từ các offline Electron clients
 * Trả data mới khi các client pull
 *
 * Được đặt ở đây để remote server có thể accept sync requests từ offline app
 */
@Controller('sync')
export class RemoteSyncController {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // PULL: Offline app kéo data mới từ remote server
  // ============================================================

  @Get('pull')
  async pullData(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : new Date(0);

    const [stages, stageCategories, machineTypes] = await Promise.all([
      this.prisma.stageList.findMany({
        where: { updatedAt: { gt: sinceDate } },
        orderBy: { updatedAt: 'asc' },
        take: 500,
      }),
      this.prisma.stageCategory.findMany({
        where: { updatedAt: { gt: sinceDate } },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.machineType.findMany({
        where: { updatedAt: { gt: sinceDate } },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    return { stages, stageCategories, machineTypes };
  }

  // ============================================================
  // PUSH: Offline app đẩy data lên remote server
  // ============================================================

  @Post('stages')
  async syncStages(
    @Body() body: { records: any[]; localIds: string[] },
  ) {
    const synced: { localId: string; remoteId: string }[] = [];

    for (let i = 0; i < body.records.length; i++) {
      const record = body.records[i];
      const localId = body.localIds[i];

      try {
        let remote: any;

        if (record.remoteId) {
          // Đã có remoteId → upsert (last-write-wins: dữ liệu sau ghi đè)
          remote = await this.prisma.stageList.upsert({
            where: { id: record.remoteId },
            update: {
              code: record.code, name: record.name, season: record.season,
              cutDie: record.cutDie, area: record.area, article: record.article,
              duration: record.duration, mood: record.mood, stage: record.stage,
              sortOrder: record.sortOrder,
              stageDate: record.stageDate ? new Date(record.stageDate) : null,
              updatedAt: new Date(record.updatedAt),
            },
            create: {
              code: record.code, name: record.name, season: record.season,
              cutDie: record.cutDie, area: record.area, article: record.article,
              duration: record.duration, mood: record.mood, stage: record.stage,
              sortOrder: record.sortOrder,
              stageDate: record.stageDate ? new Date(record.stageDate) : null,
            },
          });
        } else {
          // Chưa có remoteId → tạo mới
          remote = await this.prisma.stageList.create({
            data: {
              code: record.code, name: record.name, season: record.season,
              cutDie: record.cutDie, area: record.area, article: record.article,
              duration: record.duration, mood: record.mood, stage: record.stage,
              sortOrder: record.sortOrder,
              stageDate: record.stageDate ? new Date(record.stageDate) : null,
            },
          });
        }

        synced.push({ localId, remoteId: remote.id });
      } catch (error) {
        console.error(`[RemoteSync] Failed to sync stage record ${localId}:`, error);
      }
    }

    return { synced };
  }

  @Post('table-ct')
  async syncTableCt(@Body() body: { records: any[]; localIds: string[] }) {
    const synced: { localId: string; remoteId: string }[] = [];

    for (let i = 0; i < body.records.length; i++) {
      const record = body.records[i];
      const localId = body.localIds[i];

      try {
        const data = {
          stageItemId: record.stageItemId,
          no: record.no, partName: record.partName, stage: record.stage,
          ct1: record.ct1, ct2: record.ct2, ct3: record.ct3, ct4: record.ct4, ct5: record.ct5,
          ct6: record.ct6, ct7: record.ct7, ct8: record.ct8, ct9: record.ct9, ct10: record.ct10,
          vaCt1: record.vaCt1, vaCt2: record.vaCt2, vaCt3: record.vaCt3, vaCt4: record.vaCt4, vaCt5: record.vaCt5,
          vaCt6: record.vaCt6, vaCt7: record.vaCt7, vaCt8: record.vaCt8, vaCt9: record.vaCt9, vaCt10: record.vaCt10,
          machineType: record.machineType, confirmed: record.confirmed, done: record.done,
          sortOrder: record.sortOrder,
        };

        let remote: any;
        if (record.remoteId) {
          remote = await this.prisma.tableCT.upsert({
            where: { id: record.remoteId },
            update: { ...data, updatedAt: new Date(record.updatedAt) },
            create: data,
          });
        } else {
          remote = await this.prisma.tableCT.create({ data });
        }

        synced.push({ localId, remoteId: remote.id });
      } catch (error) {
        console.error(`[RemoteSync] Failed to sync TableCT ${localId}:`, error);
      }
    }

    return { synced };
  }

  @Post('history')
  async syncHistory(@Body() body: { records: any[]; localIds: string[] }) {
    const synced: { localId: string; remoteId: string }[] = [];

    for (let i = 0; i < body.records.length; i++) {
      const record = body.records[i];
      const localId = body.localIds[i];

      try {
        const data = {
          stageItemId: record.stageItemId,
          stageCode: record.stageCode,
          startTime: record.startTime,
          endTime: record.endTime,
          type: record.type,
          value: record.value,
          committed: record.committed,
        };

        let remote: any;
        if (record.remoteId) {
          remote = await this.prisma.historyEntry.upsert({
            where: { id: record.remoteId },
            update: { ...data, updatedAt: new Date(record.updatedAt) },
            create: data,
          });
        } else {
          remote = await this.prisma.historyEntry.create({ data });
        }

        synced.push({ localId, remoteId: remote.id });
      } catch (error) {
        console.error(`[RemoteSync] Failed to sync History ${localId}:`, error);
      }
    }

    return { synced };
  }

  @Post('control-session')
  async syncControlSession(@Body() body: { records: any[]; localIds: string[] }) {
    const synced: { localId: string; remoteId: string }[] = [];

    for (let i = 0; i < body.records.length; i++) {
      const record = body.records[i];
      const localId = body.localIds[i];

      try {
        const data = {
          stageItemId: record.stageItemId,
          stageCode: record.stageCode,
          elapsed: record.elapsed,
          isRunning: false, // Khi sync, luôn set isRunning = false
          segmentStart: record.segmentStart,
          nva: record.nva,
          va: record.va,
          skip: record.skip,
        };

        let remote: any;
        if (record.remoteId) {
          remote = await this.prisma.controlSession.upsert({
            where: { id: record.remoteId },
            update: { ...data, updatedAt: new Date(record.updatedAt) },
            create: data,
          });
        } else {
          remote = await this.prisma.controlSession.create({ data });
        }

        synced.push({ localId, remoteId: remote.id });
      } catch (error) {
        console.error(`[RemoteSync] Failed to sync ControlSession ${localId}:`, error);
      }
    }

    return { synced };
  }
}
