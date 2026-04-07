import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUserPayload } from '../auth/auth.types';
import { DeleteLogService } from '../delete-log/delete-log.service';
import { StageCategoryService } from '../stage-category/stage-category.service';
import type { CreateStageDto } from './dto/create-stage.dto';
import type { DuplicateStageDto } from './dto/duplicate-stage.dto';
import type { ListStagesDto } from './dto/list-stages.dto';
import type { ReorderStageDto } from './dto/reorder-stage.dto';
import { ensureStageUploadDir } from './stage-upload.util';

@Injectable()
export class StageService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly deleteLogService: DeleteLogService,
    private readonly stageCategoryService: StageCategoryService,
  ) {}

  async onModuleInit() {
    ensureStageUploadDir();
    await this.ensureStageTable();
    await this.ensureSeedData();
  }

  async listStages(filters: ListStagesDto = {}) {
    await this.ensureStageTable();

    const where: Prisma.StageListWhereInput = {};
    const normalizedKeyword = filters.keyword?.trim();
    const normalizedStageCode = filters.stage?.trim();
    const normalizedArea = filters.area?.trim().toUpperCase();
    const normalizedArticle = filters.article?.trim();
    const dateFrom = parseDateFilter(filters.dateFrom, 'Date from');
    const dateTo = parseDateFilter(filters.dateTo, 'Date to');

    if (normalizedKeyword) {
      where.OR = [
        { name: { contains: normalizedKeyword } },
        { code: { contains: normalizedKeyword } },
        { article: { contains: normalizedKeyword } },
      ];
    }

    if (normalizedStageCode && normalizedStageCode !== 'Choose option') {
      where.code = { contains: normalizedStageCode };
    }

    if (normalizedArea && normalizedArea !== 'CHOOSE OPTION') {
      where.stage = normalizedArea;
    }

    if (normalizedArticle) {
      where.article = { contains: normalizedArticle };
    }

    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    const stages = await this.prismaService.stageList.findMany({
      where,
      orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });

    return {
      stages: stages.map((item) => {
        const parsedIdentity = parseStageIdentity(item.name, item.code);

        return {
          id: item.id,
          code: parsedIdentity.code,
          name: parsedIdentity.name,
          article: item.article ?? '',
          duration: item.duration,
          mood: item.mood,
          stage: item.stage,
          videoUrl: item.filePath ? `/uploads/stages/${basename(item.filePath)}` : undefined,
        };
      }),
    };
  }

  async createStages(payload: CreateStageDto, files: any[] = []) {
    await this.ensureStageTable();

    const normalizedArea = await this.stageCategoryService.normalizeAndValidate(
      payload.area,
      'Area',
    );
    const baseCode = payload.stageCode?.trim().toUpperCase() || 'NEW';
    const uploadedFiles = files.filter(Boolean);

    if (uploadedFiles.length === 0) {
      throw new BadRequestException('At least one video file is required.');
    }

    const stageCount = await this.prismaService.stageList.count({
      where: { stage: normalizedArea },
    });
    const createdStages = await this.prismaService.$transaction(async (tx) => {
      const created: Prisma.StageListGetPayload<Record<string, never>>[] = [];

      for (const [index, file] of uploadedFiles.entries()) {
        const parsedIdentity = parseStageIdentity(
          file.originalname,
          uploadedFiles.length === 1 ? baseCode : `${baseCode}-${index + 1}`,
        );
        const stage = await tx.stageList.create({
          data: {
            code: parsedIdentity.code,
            name: parsedIdentity.name,
            article: payload.article?.trim() || null,
            duration: '00:00',
            mood: 'NVA',
            stage: normalizedArea,
            filePath: file.path,
            sortOrder: stageCount + index + 1,
          },
        });

        created.push(stage);
      }

      return created;
    });

    return {
      stages: createdStages.map((item) => {
        const parsedIdentity = parseStageIdentity(item.name, item.code);

        return {
          id: item.id,
          code: parsedIdentity.code,
          name: parsedIdentity.name,
          article: item.article ?? '',
          duration: item.duration,
          mood: item.mood,
          stage: item.stage,
          videoUrl: item.filePath ? `/uploads/stages/${basename(item.filePath)}` : undefined,
        };
      }),
    };
  }

  async duplicateStage(payload: DuplicateStageDto) {
    await this.ensureStageTable();

    const sourceId = payload.sourceId?.trim();
    const targetArea = await this.stageCategoryService.normalizeAndValidate(
      payload.targetArea,
      'Target area',
    );

    if (!sourceId) {
      throw new BadRequestException('Source stage id is required.');
    }

    const sourceStage = await this.prismaService.stageList.findUnique({
      where: { id: sourceId },
    });

    if (!sourceStage) {
      throw new NotFoundException('Source stage item was not found.');
    }

    const targetCount = await this.prismaService.stageList.count({
      where: { stage: targetArea },
    });
    const relatedCopies = await this.prismaService.stageList.count({
      where: {
        code: {
          startsWith: sourceStage.code,
        },
      },
    });

    const duplicateCode = `${sourceStage.code}-COPY${relatedCopies + 1}`;
    const duplicateName = `${sourceStage.name} Copy`;

    const duplicatedStage = await this.prismaService.$transaction(async (tx) => {
      return tx.stageList.create({
        data: {
          code: duplicateCode,
          name: duplicateName,
          article: sourceStage.article,
          duration: sourceStage.duration,
          mood: sourceStage.mood,
          stage: targetArea,
          filePath: sourceStage.filePath,
          sortOrder: targetCount + 1,
        },
      });
    });

    const parsedIdentity = parseStageIdentity(duplicatedStage.name, duplicatedStage.code);

    return {
      stage: {
        id: duplicatedStage.id,
        code: parsedIdentity.code,
        name: parsedIdentity.name,
        article: duplicatedStage.article ?? '',
        duration: duplicatedStage.duration,
        mood: duplicatedStage.mood,
        stage: duplicatedStage.stage,
        videoUrl: duplicatedStage.filePath
          ? `/uploads/stages/${basename(duplicatedStage.filePath)}`
          : undefined,
      },
    };
  }

  async reorderStages(payload: ReorderStageDto) {
    await this.ensureStageTable();

    const normalizedStage = await this.stageCategoryService.normalizeAndValidate(
      payload.stage,
      'Stage',
    );
    const orderedIds = payload.orderedIds?.map((id) => id.trim()).filter(Boolean) ?? [];

    if (orderedIds.length === 0) {
      throw new BadRequestException('Ordered ids are required.');
    }

    const existingItems = await this.prismaService.stageList.findMany({
      where: { stage: normalizedStage },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    if (existingItems.length !== orderedIds.length) {
      throw new BadRequestException('Ordered ids do not match current stage items.');
    }

    const existingIds = new Set(existingItems.map((item) => item.id));
    const hasInvalidId = orderedIds.some((id) => !existingIds.has(id));

    if (hasInvalidId || new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('Ordered ids are invalid.');
    }

    await this.prismaService.$transaction(
      orderedIds.map((id, index) =>
        this.prismaService.stageList.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return { success: true };
  }

  async deleteStage(id: string, actor?: JwtUserPayload) {
    await this.ensureStageTable();

    if (!id?.trim()) {
      throw new BadRequestException('Stage id is required.');
    }

    const targetStage = await this.prismaService.stageList.findUnique({
      where: { id },
    });

    if (!targetStage) {
      throw new NotFoundException('Stage item was not found.');
    }

    const parsedIdentity = parseStageIdentity(targetStage.name, targetStage.code);

    await this.prismaService.$transaction(async (tx) => {
      await tx.stageList.delete({
        where: { id },
      });

      await tx.historyEntry.deleteMany({
        where: {
          stageCode: parsedIdentity.code,
        },
      });

      await tx.controlSession.deleteMany({
        where: {
          stageCode: parsedIdentity.code,
        },
      });

      await tx.tableCT.deleteMany({
        where: {
          OR: [
            { stageItemId: targetStage.id },
            {
              no: parsedIdentity.code,
              stage: targetStage.stage,
            },
          ],
        },
      });

      const remainingItems = await tx.stageList.findMany({
        where: { stage: targetStage.stage },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });

      await Promise.all(
        remainingItems.map((item, index) =>
          tx.stageList.update({
            where: { id: item.id },
            data: { sortOrder: index + 1 },
          }),
        ),
      );
    });

    if (targetStage.filePath) {
      const remainingReferences = await this.prismaService.stageList.count({
        where: {
          filePath: targetStage.filePath,
        },
      });

      if (remainingReferences === 0) {
        try {
          await unlink(targetStage.filePath);
        } catch {
          // Ignore missing/unreadable files so stage deletion still succeeds.
        }
      }
    }

    await this.deleteLogService.logDelete({
      actor,
      entityType: 'StageList',
      entityId: targetStage.id,
      entityLabel: `${parsedIdentity.code} - ${parsedIdentity.name}`,
      metadata: {
        code: parsedIdentity.code,
        name: parsedIdentity.name,
        stage: targetStage.stage,
        article: targetStage.article ?? null,
        filePath: targetStage.filePath ?? null,
      },
    });

    return {
      success: true,
      id,
    };
  }

  private async ensureStageTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.IE_StageApiUuid', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.StageList', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.IE_StageApiUuid', 'StageList';
      END

      IF OBJECT_ID(N'dbo.StageApi', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.StageList', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.StageApi', 'StageList';
      END

      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.StageList')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[StageList];
      END

      IF OBJECT_ID(N'dbo.StageList', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[StageList] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [StageList_id_df] DEFAULT NEWID(),
          [code] NVARCHAR(50) NOT NULL,
          [name] NVARCHAR(255) NOT NULL,
          [article] NVARCHAR(255) NULL,
          [duration] NVARCHAR(20) NOT NULL,
          [mood] NVARCHAR(20) NOT NULL,
          [stage] NVARCHAR(50) NOT NULL,
          [filePath] NVARCHAR(500) NULL,
          [sortOrder] INT NOT NULL CONSTRAINT [StageList_sortOrder_df] DEFAULT 0,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [StageList_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [StageList_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [StageList_pkey] PRIMARY KEY ([id])
        );
      END

      IF COL_LENGTH('dbo.StageList', 'article') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [article] NVARCHAR(255) NULL;
      END

      IF COL_LENGTH('dbo.StageList', 'sortOrder') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [sortOrder] INT NOT NULL CONSTRAINT [StageList_sortOrder_df] DEFAULT 0;
      END

      IF COL_LENGTH('dbo.StageList', 'filePath') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [filePath] NVARCHAR(500) NULL;
      END

      IF COL_LENGTH('dbo.StageList', 'createdAt') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [createdAt] DATETIME2 NOT NULL CONSTRAINT [StageList_createdAt_df] DEFAULT SYSUTCDATETIME();
      END

      IF COL_LENGTH('dbo.StageList', 'updatedAt') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [updatedAt] DATETIME2 NOT NULL CONSTRAINT [StageList_updatedAt_df] DEFAULT SYSUTCDATETIME();
      END
    `);
  }

  private async ensureSeedData() {
    const count = await this.prismaService.stageList.count();

    if (count > 0) {
      return;
    }

    await this.prismaService.stageList.createMany({
      data: [
        {
          code: 'C10',
          name: 'Tears.mp4',
          article: 'JENNIE',
          duration: '03:44',
          mood: 'NVA',
          stage: 'CUTTING',
          sortOrder: 1,
        },
        {
          code: 'C4',
          name: 'Your Love.mp4',
          article: 'JENNIE',
          duration: '05:34',
          mood: 'VA',
          stage: 'CUTTING',
          sortOrder: 2,
        },
        {
          code: 'C3',
          name: 'Hugs & Kisses.mp4',
          article: 'JENNIE',
          duration: '03:12',
          mood: 'NVA',
          stage: 'CUTTING',
          sortOrder: 3,
        },
        {
          code: 'C2',
          name: 'You & Me.mp4',
          article: 'JENNIE',
          duration: '04:59',
          mood: 'NVA',
          stage: 'CUTTING',
          sortOrder: 4,
        },
      ],
    });
  }
}

function parseStageIdentity(rawName: string, fallbackCode: string) {
  const withoutExtension = stripFileExtension(rawName).trim();
  const normalizedFallbackCode = fallbackCode.trim().toUpperCase() || 'NEW';
  const matched = withoutExtension.match(/^([^.]+)\.\s*(.+)$/);

  if (!matched) {
    return {
      code: normalizedFallbackCode,
      name: withoutExtension || normalizedFallbackCode,
    };
  }

  return {
    code: matched[1].trim().toUpperCase() || normalizedFallbackCode,
    name: matched[2].trim() || withoutExtension || normalizedFallbackCode,
  };
}

function stripFileExtension(fileName: string) {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function parseDateFilter(value: string | undefined, label: string) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${label} is invalid.`);
  }

  if (label === 'Date to') {
    parsed.setUTCHours(23, 59, 59, 999);
  }

  return parsed;
}
