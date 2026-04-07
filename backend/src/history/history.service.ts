import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUserPayload } from '../auth/auth.types';
import { DeleteLogService } from '../delete-log/delete-log.service';
import type { CreateHistoryDto } from './dto/create-history.dto';

@Injectable()
export class HistoryService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly deleteLogService: DeleteLogService,
  ) {}

  async onModuleInit() {
    await this.ensureTable();
  }

  async listHistory(stageCode?: string) {
    await this.ensureTable();

    const normalizedStageCode = stageCode?.trim().toUpperCase();
    const isLocked = normalizedStageCode
      ? await this.prismaService.tableCT.findFirst({
          where: {
            no: normalizedStageCode,
            confirmed: true,
          },
          select: { id: true },
        }).then((row) => Boolean(row))
      : false;

    const rows = await this.prismaService.historyEntry.findMany({
      where: normalizedStageCode ? { stageCode: normalizedStageCode } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        range: `${formatTime(row.startTime)} - ${formatTime(row.endTime)}`,
        label: `${row.type}: ${row.value.toFixed(2)}`,
        committed: row.committed,
        locked: isLocked,
      })),
    };
  }

  async createHistory(payload: CreateHistoryDto) {
    await this.ensureTable();

    const stageCode = payload.stageCode?.trim().toUpperCase();

    if (!stageCode) {
      throw new BadRequestException('Stage code is required.');
    }

    if (!['NVA', 'VA', 'SKIP'].includes(payload.type)) {
      throw new BadRequestException('History type is invalid.');
    }

    const created = await this.prismaService.historyEntry.create({
      data: {
        stageCode,
        startTime: payload.startTime,
        endTime: payload.endTime,
        type: payload.type,
        value: payload.value,
        committed: false,
      },
    });

    return {
      item: {
        id: created.id,
        range: `${formatTime(created.startTime)} - ${formatTime(created.endTime)}`,
        label: `${created.type}: ${created.value.toFixed(2)}`,
        committed: created.committed,
        locked: false,
      },
    };
  }

  async commitHistory(stageCode: string) {
    await this.ensureTable();

    const normalizedStageCode = stageCode?.trim().toUpperCase();

    if (!normalizedStageCode) {
      throw new BadRequestException('Stage code is required.');
    }

    await this.prismaService.historyEntry.updateMany({
      where: {
        stageCode: normalizedStageCode,
        committed: false,
      },
      data: {
        committed: true,
      },
    });

    const rows = await this.prismaService.historyEntry.findMany({
      where: { stageCode: normalizedStageCode },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const isLocked = await this.prismaService.tableCT.findFirst({
      where: {
        no: normalizedStageCode,
        confirmed: true,
      },
      select: { id: true },
    }).then((row) => Boolean(row));

    return {
      items: rows.map((row) => ({
        id: row.id,
        range: `${formatTime(row.startTime)} - ${formatTime(row.endTime)}`,
        label: `${row.type}: ${row.value.toFixed(2)}`,
        committed: row.committed,
        locked: isLocked,
      })),
    };
  }

  async deleteHistory(id: string, actor?: JwtUserPayload) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('History id is required.');
    }

    const existing = await this.prismaService.historyEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('History item was not found.');
    }

    if (existing.committed) {
      throw new BadRequestException(
        'This history entry has already been committed to TableCT and cannot be deleted.',
      );
    }

    const isLocked = await this.prismaService.tableCT.findFirst({
      where: {
        no: existing.stageCode,
        confirmed: true,
      },
      select: { id: true },
    });

    if (isLocked) {
      throw new BadRequestException(
        'This history entry is locked because the related TableCT row has been confirmed.',
      );
    }

    await this.prismaService.historyEntry.delete({
      where: { id },
    });

    await this.deleteLogService.logDelete({
      actor,
      entityType: 'HistoryEntry',
      entityId: existing.id,
      entityLabel: `${existing.stageCode} - ${existing.type}`,
      metadata: {
        stageCode: existing.stageCode,
        startTime: existing.startTime,
        endTime: existing.endTime,
        type: existing.type,
        value: existing.value,
        committed: existing.committed,
      },
    });

    return { success: true, id };
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.HistoryEntry', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.HistoryEntry')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[HistoryEntry];
      END

      IF OBJECT_ID(N'dbo.HistoryEntry', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[HistoryEntry] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [HistoryEntry_id_df] DEFAULT NEWID(),
          [stageCode] NVARCHAR(50) NOT NULL,
          [startTime] FLOAT NOT NULL,
          [endTime] FLOAT NOT NULL,
          [type] NVARCHAR(20) NOT NULL,
          [value] FLOAT NOT NULL,
          [committed] BIT NOT NULL CONSTRAINT [HistoryEntry_committed_df] DEFAULT 0,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [HistoryEntry_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [HistoryEntry_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [HistoryEntry_pkey] PRIMARY KEY ([id])
        );
      END

      IF COL_LENGTH('dbo.HistoryEntry', 'committed') IS NULL
      BEGIN
        ALTER TABLE [dbo].[HistoryEntry]
        ADD [committed] BIT NOT NULL CONSTRAINT [HistoryEntry_committed_df] DEFAULT 0;
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.HistoryEntry')
          AND c.name = 'startTime'
          AND t.name = 'int'
      )
      BEGIN
        DECLARE @startTimeConstraint NVARCHAR(128);
        SELECT @startTimeConstraint = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.HistoryEntry')
          AND c.name = 'startTime';

        IF @startTimeConstraint IS NOT NULL
        BEGIN
          EXEC('ALTER TABLE [dbo].[HistoryEntry] DROP CONSTRAINT [' + @startTimeConstraint + ']');
        END

        ALTER TABLE [dbo].[HistoryEntry] ALTER COLUMN [startTime] FLOAT NOT NULL;
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.HistoryEntry')
          AND c.name = 'endTime'
          AND t.name = 'int'
      )
      BEGIN
        DECLARE @endTimeConstraint NVARCHAR(128);
        SELECT @endTimeConstraint = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.HistoryEntry')
          AND c.name = 'endTime';

        IF @endTimeConstraint IS NOT NULL
        BEGIN
          EXEC('ALTER TABLE [dbo].[HistoryEntry] DROP CONSTRAINT [' + @endTimeConstraint + ']');
        END

        ALTER TABLE [dbo].[HistoryEntry] ALTER COLUMN [endTime] FLOAT NOT NULL;
      END
    `);
  }
}

function formatTime(totalSeconds: number) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = Math.floor(totalSeconds % 60);
  const hundredths = Math.round((totalSeconds - Math.floor(totalSeconds)) * 100);
  return `${mins}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
