import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { UpsertControlSessionDto } from './dto/upsert-control-session.dto';

@Injectable()
export class ControlSessionService implements OnModuleInit {
  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit() {
    await this.ensureTable();
  }

  async getSession(stageCode?: string) {
    await this.ensureTable();

    const normalizedStageCode = stageCode?.trim().toUpperCase();

    if (!normalizedStageCode) {
      return { session: null };
    }

    const session = await this.prismaService.controlSession.findUnique({
      where: { stageCode: normalizedStageCode },
    });

    return {
      session: session ? this.mapSession(session) : null,
    };
  }

  async upsertSession(payload: UpsertControlSessionDto) {
    await this.ensureTable();

    const stageCode = payload.stageCode?.trim().toUpperCase();

    if (!stageCode) {
      throw new BadRequestException('Stage code is required.');
    }

    const nextElapsed = normalizeNumber(payload.elapsed, 'Elapsed');
    const nextSegmentStart = normalizeNumber(payload.segmentStart, 'Segment start');

    const saved = await this.prismaService.controlSession.upsert({
      where: { stageCode },
      update: {
        elapsed: nextElapsed,
        isRunning: Boolean(payload.isRunning),
        segmentStart: nextSegmentStart,
        nva: normalizeOptionalNumber(payload.nva),
        va: normalizeOptionalNumber(payload.va),
        skip: normalizeOptionalNumber(payload.skip),
      },
      create: {
        stageCode,
        elapsed: nextElapsed,
        isRunning: Boolean(payload.isRunning),
        segmentStart: nextSegmentStart,
        nva: normalizeOptionalNumber(payload.nva),
        va: normalizeOptionalNumber(payload.va),
        skip: normalizeOptionalNumber(payload.skip),
      },
    });

    return {
      session: this.mapSession(saved),
    };
  }

  private mapSession(session: {
    id: string;
    stageCode: string;
    elapsed: number;
    isRunning: boolean;
    segmentStart: number;
    nva: number | null;
    va: number | null;
    skip: number | null;
  }) {
    return {
      id: session.id,
      stageCode: session.stageCode,
      elapsed: session.elapsed,
      isRunning: session.isRunning,
      segmentStart: session.segmentStart,
      nva: session.nva,
      va: session.va,
      skip: session.skip,
    };
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.ControlSession', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.ControlSession')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[ControlSession];
      END

      IF OBJECT_ID(N'dbo.ControlSession', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[ControlSession] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ControlSession_id_df] DEFAULT NEWID(),
          [stageCode] NVARCHAR(50) NOT NULL,
          [elapsed] FLOAT NOT NULL CONSTRAINT [ControlSession_elapsed_df] DEFAULT 0,
          [isRunning] BIT NOT NULL CONSTRAINT [ControlSession_isRunning_df] DEFAULT 0,
          [segmentStart] FLOAT NOT NULL CONSTRAINT [ControlSession_segmentStart_df] DEFAULT 0,
          [nva] FLOAT NULL,
          [va] FLOAT NULL,
          [skip] FLOAT NULL,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [ControlSession_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ControlSession_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [ControlSession_pkey] PRIMARY KEY ([id]),
          CONSTRAINT [ControlSession_stageCode_key] UNIQUE ([stageCode])
        );
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.ControlSession')
          AND c.name = 'elapsed'
          AND t.name = 'int'
      )
      BEGIN
        DECLARE @elapsedConstraint NVARCHAR(128);
        SELECT @elapsedConstraint = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ControlSession')
          AND c.name = 'elapsed';

        IF @elapsedConstraint IS NOT NULL
        BEGIN
          EXEC('ALTER TABLE [dbo].[ControlSession] DROP CONSTRAINT [' + @elapsedConstraint + ']');
        END

        ALTER TABLE [dbo].[ControlSession] ALTER COLUMN [elapsed] FLOAT NOT NULL;
        ALTER TABLE [dbo].[ControlSession]
        ADD CONSTRAINT [ControlSession_elapsed_df] DEFAULT 0 FOR [elapsed];
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.ControlSession')
          AND c.name = 'segmentStart'
          AND t.name = 'int'
      )
      BEGIN
        DECLARE @segmentStartConstraint NVARCHAR(128);
        SELECT @segmentStartConstraint = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ControlSession')
          AND c.name = 'segmentStart';

        IF @segmentStartConstraint IS NOT NULL
        BEGIN
          EXEC('ALTER TABLE [dbo].[ControlSession] DROP CONSTRAINT [' + @segmentStartConstraint + ']');
        END

        ALTER TABLE [dbo].[ControlSession] ALTER COLUMN [segmentStart] FLOAT NOT NULL;
        ALTER TABLE [dbo].[ControlSession]
        ADD CONSTRAINT [ControlSession_segmentStart_df] DEFAULT 0 FOR [segmentStart];
      END
    `);
  }
}

function normalizeNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`${label} is invalid.`);
  }

  return Number(value.toFixed(2));
}

function normalizeOptionalNumber(value?: number | null) {
  if (typeof value === 'undefined' || value === null || Number.isNaN(value)) {
    return null;
  }

  return Number(value);
}
