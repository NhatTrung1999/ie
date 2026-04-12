import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { extname } from 'node:path';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUserPayload } from '../auth/auth.types';
import { DeleteLogService } from '../delete-log/delete-log.service';
import { StageCategoryService } from '../stage-category/stage-category.service';
import type { ConfirmTableCtRowsDto } from './dto/confirm-table-ct-rows.dto';
import type { ExportTableCtDto } from './dto/export-table-ct.dto';
import type { UpdateTableCtMetricsDto } from './dto/update-table-ct-metrics.dto';
import type { ReorderTableCtDto } from './dto/reorder-table-ct.dto';
import type { UpdateTableCtDto } from './dto/update-table-ct.dto';

@Injectable()
export class TableCtService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly deleteLogService: DeleteLogService,
    private readonly stageCategoryService: StageCategoryService,
  ) {}

  async onModuleInit() {
    await this.ensureStageListColumns();
    await this.ensureTable();
    await this.ensureSeedData();
  }

  async listRows(filters: { stage?: string; stageCode?: string; stageItemId?: string }) {
    await this.ensureStageListColumns();
    await this.ensureTable();

    const normalizedStage = filters.stage?.trim().toUpperCase();
    const normalizedStageCode = filters.stageCode?.trim().toUpperCase();
    const normalizedStageItemId = filters.stageItemId?.trim();

    if (normalizedStageItemId || normalizedStageCode) {
      const existingRow = await this.prismaService.tableCT.findFirst({
        where: {
          ...(normalizedStageItemId ? { stageItemId: normalizedStageItemId } : {}),
          ...(!normalizedStageItemId && normalizedStageCode ? { no: normalizedStageCode } : {}),
          ...(normalizedStage ? { stage: normalizedStage } : {}),
        },
      });

      if (!existingRow) {
        const sourceStage = await this.prismaService.stageList.findFirst({
          where: {
            ...(normalizedStageItemId ? { id: normalizedStageItemId } : {}),
            ...(!normalizedStageItemId && normalizedStageCode ? { code: normalizedStageCode } : {}),
            ...(normalizedStage ? { area: normalizedStage } : {}),
          },
        });

        if (sourceStage) {
          const parsedIdentity = parseTableIdentity(sourceStage.name, sourceStage.code);
          const sortOrder =
            (await this.prismaService.tableCT.count({
              where: { stage: sourceStage.area ?? sourceStage.stage },
            })) + 1;

          await this.prismaService.tableCT.create({
            data: {
              stageItemId: sourceStage.id,
              no: parsedIdentity.code,
              partName: parsedIdentity.partName,
              stage: sourceStage.area ?? sourceStage.stage,
              ct1: 0,
              ct2: 0,
              ct3: 0,
              ct4: 0,
              ct5: 0,
              ct6: 0,
              ct7: 0,
              ct8: 0,
              ct9: 0,
              ct10: 0,
              machineType: 'Select..',
              confirmed: false,
              done: false,
              sortOrder,
            },
          });
        }
      }
    }

    const rows = await this.prismaService.tableCT.findMany({
      where: {
        ...(normalizedStage ? { stage: normalizedStage } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
    });

    return {
      rows: rows.map((row) => ({
        ...this.mapRow(row),
      })),
    };
  }

  async updateRow(id: string, payload: UpdateTableCtDto) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Table row id is required.');
    }

    const existingRow = await this.prismaService.tableCT.findUnique({
      where: { id },
    });

    if (!existingRow) {
      throw new NotFoundException('Table row was not found.');
    }

    const nextMachineType = payload.machineType?.trim();
    const nextConfirmed = payload.confirmed;

    if (typeof nextMachineType === 'undefined' && typeof nextConfirmed === 'undefined') {
      throw new BadRequestException('No update payload was provided.');
    }

    if (
      existingRow.confirmed &&
      typeof nextMachineType !== 'undefined'
    ) {
      throw new BadRequestException('Confirmed table rows are locked and cannot be edited.');
    }

    const updatedRow = await this.prismaService.tableCT.update({
      where: { id },
      data: {
        ...(typeof nextMachineType !== 'undefined'
          ? { machineType: nextMachineType || 'Select..' }
          : {}),
        ...(typeof nextConfirmed === 'boolean' ? { confirmed: nextConfirmed } : {}),
      },
    });

    return {
      row: this.mapRow(updatedRow),
    };
  }

  async confirmRows(payload: ConfirmTableCtRowsDto) {
    await this.ensureTable();

    const ids = payload.ids?.map((id) => id.trim()).filter(Boolean) ?? [];
    const confirmed = payload.confirmed ?? true;

    if (ids.length === 0) {
      throw new BadRequestException('Table row ids are required.');
    }

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Table row ids must be unique.');
    }

    const existingRows = await this.prismaService.tableCT.findMany({
      where: {
        id: { in: ids },
      },
    });

    if (existingRows.length !== ids.length) {
      throw new NotFoundException('One or more table rows were not found.');
    }

    await this.prismaService.$transaction(
      ids.map((id) =>
        this.prismaService.tableCT.update({
          where: { id },
          data: { confirmed },
        }),
      ),
    );

    const updatedRows = await this.prismaService.tableCT.findMany({
      where: {
        id: { in: ids },
      },
    });

    const rowMap = new Map(updatedRows.map((row) => [row.id, row]));

    return {
      rows: ids
        .map((id) => rowMap.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => this.mapRow(row)),
    };
  }

  async updateMetrics(id: string, payload: UpdateTableCtMetricsDto, category?: string) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Table row id is required.');
    }

    if (
      typeof payload.columnIndex !== 'number' ||
      payload.columnIndex < 0 ||
      payload.columnIndex > 9
    ) {
      throw new BadRequestException('Column index is invalid.');
    }

    const existingRow = await this.prismaService.tableCT.findUnique({
      where: { id },
    });

    if (!existingRow) {
      throw new NotFoundException('Table row was not found.');
    }

    if (existingRow.confirmed) {
      throw new BadRequestException('Confirmed table rows are locked and cannot be edited.');
    }

    const nvaColumn = (`ct${payload.columnIndex + 1}`) as keyof typeof existingRow;
    const vaColumn = (`vaCt${payload.columnIndex + 1}`) as keyof typeof existingRow;
    const currentNvaValue =
      typeof existingRow[nvaColumn] === 'number' ? Number(existingRow[nvaColumn]) : 0;
    const currentVaValue =
      typeof existingRow[vaColumn] === 'number' ? Number(existingRow[vaColumn]) : 0;

    const metricUpdate = {
      ...(typeof payload.nvaValue === 'number'
        ? {
            [nvaColumn]: roundToTwoDecimals(
              Math.max(0, currentNvaValue + payload.nvaValue),
            ),
          }
        : {}),
      ...(typeof payload.vaValue === 'number'
        ? {
            [vaColumn]: roundToTwoDecimals(
              Math.max(0, currentVaValue + payload.vaValue),
            ),
          }
        : {}),
    };

    const updatedRow = await this.prismaService.tableCT.update({
      where: { id },
      data: metricUpdate,
    });

    return {
      row: this.mapRow(updatedRow),
    };
  }

  async reorderRows(payload: ReorderTableCtDto) {
    await this.ensureTable();

    const normalizedStage = await this.stageCategoryService.normalizeAndValidate(
      payload.stage,
      'Stage',
    );
    const orderedIds = payload.orderedIds?.map((id) => id.trim()).filter(Boolean) ?? [];

    if (orderedIds.length === 0) {
      throw new BadRequestException('Ordered ids are required.');
    }

    const existingRows = await this.prismaService.tableCT.findMany({
      where: { stage: normalizedStage },
      orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
    });

    if (existingRows.length !== orderedIds.length) {
      throw new BadRequestException('Ordered ids do not match current table rows.');
    }

    const existingIds = new Set(existingRows.map((row) => row.id));
    const hasInvalidId = orderedIds.some((id) => !existingIds.has(id));

    if (hasInvalidId || new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('Ordered ids are invalid.');
    }

    await this.prismaService.$transaction(
      orderedIds.map((id, index) =>
        this.prismaService.tableCT.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return { success: true };
  }

  async markDone(id: string, category?: string) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Table row id is required.');
    }

    const existingRow = await this.prismaService.tableCT.findUnique({
      where: { id },
    });

    if (!existingRow) {
      throw new NotFoundException('Table row was not found.');
    }

    const normalizedCategory = normalizeCategory(category);
    const data =
      !existingRow.done && normalizedCategory === 'COSTING'
        ? {
            ...buildCostingDoneUpdate(existingRow),
            done: true,
          }
        : {
            done: !existingRow.done,
          };

    const updatedRow = await this.prismaService.tableCT.update({
      where: { id },
      data,
    });

    return {
      row: this.mapRow(updatedRow),
    };
  }

  async deleteRow(id: string, actor?: JwtUserPayload) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Table row id is required.');
    }

    const existingRow = await this.prismaService.tableCT.findUnique({
      where: { id },
    });

    if (!existingRow) {
      throw new NotFoundException('Table row was not found.');
    }

    if (existingRow.confirmed) {
      throw new BadRequestException('Confirmed table rows cannot be deleted.');
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.historyEntry.deleteMany({
        where: existingRow.stageItemId
          ? { stageItemId: existingRow.stageItemId }
          : { stageCode: existingRow.no.trim().toUpperCase() },
      });

      await tx.controlSession.deleteMany({
        where: existingRow.stageItemId
          ? { stageItemId: existingRow.stageItemId }
          : { stageCode: existingRow.no.trim().toUpperCase() },
      });

      await tx.tableCT.delete({
        where: { id },
      });

      const remainingRows = await tx.tableCT.findMany({
        where: { stage: existingRow.stage },
        orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
      });

      await Promise.all(
        remainingRows.map((row, index) =>
          tx.tableCT.update({
            where: { id: row.id },
            data: { sortOrder: index + 1 },
          }),
        ),
      );
    });

    await this.deleteLogService.logDelete({
      actor,
      entityType: 'TableCT',
      entityId: existingRow.id,
      entityLabel: `${existingRow.no} - ${existingRow.partName}`,
      metadata: {
        stageItemId: existingRow.stageItemId ?? null,
        no: existingRow.no,
        partName: existingRow.partName,
        stage: existingRow.stage,
        machineType: existingRow.machineType,
        confirmed: existingRow.confirmed,
        done: existingRow.done,
      },
    });

    return { success: true, id };
  }

  async exportWorkbook(payload: ExportTableCtDto, category?: string) {
    await this.ensureStageListColumns();
    await this.ensureTable();

    const normalizedStage = payload.stage?.trim().toUpperCase();
    const orderedRowIds = payload.rowIds?.map((id) => id.trim()).filter(Boolean) ?? [];
    const selectedStageItemId = payload.stageItemId?.trim() || null;

    if (!normalizedStage) {
      throw new BadRequestException('Stage is required for export.');
    }

    const rows = await this.prismaService.tableCT.findMany({
      where: {
        stage: normalizedStage,
        ...(orderedRowIds.length > 0 ? { id: { in: orderedRowIds } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
    });

    if (rows.length === 0) {
      throw new NotFoundException('No table rows were found to export.');
    }

    const rowOrder = new Map(orderedRowIds.map((id, index) => [id, index]));
    const orderedRows =
      orderedRowIds.length > 0
        ? [...rows].sort(
            (a, b) =>
              (rowOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (rowOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          )
        : rows;

    const primaryRow =
      orderedRows.find((row) => row.stageItemId === selectedStageItemId) ?? orderedRows[0];
    const primaryStageItem = primaryRow.stageItemId
      ? await this.prismaService.stageList.findUnique({
          where: { id: primaryRow.stageItemId },
        })
      : null;

    const workbook = new ExcelJS.Workbook();
    const templatePath = join(process.cwd(), 'templates', 'excel-time-study-template.xlsx');
    await workbook.xlsx.readFile(templatePath);

    const worksheet = workbook.getWorksheet('Time Study') ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new NotFoundException('Time Study template sheet is missing.');
    }

    worksheet.getCell('C3').value = primaryStageItem?.season ?? '';
    worksheet.getCell('I3').value = '';
    worksheet.getCell('C4').value = '';
    worksheet.getCell('I4').value = primaryStageItem?.article || '';
    worksheet.getCell('C5').value = '';
    worksheet.getCell('I5').value = '';

    const lowerSectionTemplates = captureLowerTimeStudyTemplates(worksheet);
    const cycleLayout = populateCycleTimeSection(
      worksheet,
      orderedRows.map((row) => this.mapRow(row)),
      category,
    );
    restoreTimeStudyLowerSectionLayout(
      worksheet,
      cycleLayout.insertedRows,
      lowerSectionTemplates,
    );

    // Keep the lower template sections intact. The cycle-time section above grows
    // by inserting rows before them, so the original workbook layout moves down
    // automatically without us re-drawing the observations/photo block.
    void cycleLayout;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    return {
      buffer,
      fileName: `time-study-${normalizedStage.toLowerCase()}-${timestamp}.xlsx`,
    };
  }

  async exportLsaWorkbook(payload: ExportTableCtDto, category?: string) {
    await this.ensureStageListColumns();
    await this.ensureTable();

    const normalizedStage = payload.stage?.trim().toUpperCase();
    const orderedRowIds = payload.rowIds?.map((id) => id.trim()).filter(Boolean) ?? [];
    const selectedStageItemId = payload.stageItemId?.trim() || null;

    if (!normalizedStage) {
      throw new BadRequestException('Stage is required for export.');
    }

    const rows = await this.prismaService.tableCT.findMany({
      where: {
        stage: normalizedStage,
        ...(orderedRowIds.length > 0 ? { id: { in: orderedRowIds } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
    });

    if (rows.length === 0) {
      throw new NotFoundException('No table rows were found to export.');
    }

    const rowOrder = new Map(orderedRowIds.map((id, index) => [id, index]));
    const orderedRows =
      orderedRowIds.length > 0
        ? [...rows].sort(
            (a, b) =>
              (rowOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (rowOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          )
        : rows;

    const primaryRow =
      orderedRows.find((row) => row.stageItemId === selectedStageItemId) ?? orderedRows[0];
    const primaryStageItem = primaryRow.stageItemId
      ? await this.prismaService.stageList.findUnique({
          where: { id: primaryRow.stageItemId },
        })
      : null;

    const workbook = new ExcelJS.Workbook();
    const templatePath = join(process.cwd(), 'templates', 'excel-lsa-template.xlsx');
    await workbook.xlsx.readFile(templatePath);

    const worksheet = workbook.getWorksheet('LSA') ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new NotFoundException('LSA template sheet is missing.');
    }

    const mappedRows = orderedRows.map((row) => this.mapRow(row));
    const computedStageTotalSeconds = roundToTwoDecimals(
      mappedRows.reduce(
        (sum, row) => sum + sumValues(row.nvaValues) + sumValues(row.vaValues),
        0,
      ),
    );
    const stageTotalSeconds =
      typeof payload.totalCtSeconds === 'number' && Number.isFinite(payload.totalCtSeconds)
        ? payload.totalCtSeconds
        : computedStageTotalSeconds;
    const estimateOutputPairs =
      typeof payload.estimateOutputPairs === 'number' && Number.isFinite(payload.estimateOutputPairs)
        ? payload.estimateOutputPairs
        : 0;
    const taktTimeSeconds =
      typeof payload.taktTimeSeconds === 'number' && Number.isFinite(payload.taktTimeSeconds)
        ? payload.taktTimeSeconds
        : estimateOutputPairs > 0
          ? roundToTwoDecimals(3600 / estimateOutputPairs)
          : 0;
    const manpowerStandardLabor =
      typeof payload.manpowerStandardLabor === 'number' &&
      Number.isFinite(payload.manpowerStandardLabor)
        ? payload.manpowerStandardLabor
        : taktTimeSeconds > 0
          ? Math.ceil(stageTotalSeconds / taktTimeSeconds)
          : 0;
    const capacityPerHour =
      typeof payload.capacityPerHour === 'number' && Number.isFinite(payload.capacityPerHour)
        ? payload.capacityPerHour
        : stageTotalSeconds > 0
          ? Math.round(3600 / stageTotalSeconds)
          : 0;
    const workingTimeSeconds =
      typeof payload.workingTimeSeconds === 'number' && Number.isFinite(payload.workingTimeSeconds)
        ? payload.workingTimeSeconds
        : 27000;

    worksheet.getCell('B2').value =
      primaryStageItem?.article || primaryStageItem?.code || primaryRow.no;
    worksheet.getCell('B3').value = '';
    worksheet.getCell('B4').value = '';
    worksheet.getCell('B5').value = estimateOutputPairs;
    worksheet.getCell('G3').value = `${mappedRows.length} Pairs`;
    worksheet.getCell('G4').value = `${workingTimeSeconds} sec`;
    worksheet.getCell('G5').value = `${taktTimeSeconds} sec`;

    const summaryRowByStage: Record<string, number> = {
      CUTTING: 2,
      STITCHING: 3,
      ASSEMBLY: 5,
      STOCK: 6,
    };
    const summaryRow = summaryRowByStage[normalizedStage] ?? 6;

    worksheet.getCell(`P${summaryRow}`).value = stageTotalSeconds;
    worksheet.getCell(`Q${summaryRow}`).value = manpowerStandardLabor;
    worksheet.getCell(`R${summaryRow}`).value = capacityPerHour;
    worksheet.getCell(`S${summaryRow}`).value = estimateOutputPairs;
    worksheet.getCell(`T${summaryRow}`).value = '0%';
    worksheet.getCell('P6').value = stageTotalSeconds;
    worksheet.getCell('Q6').value = manpowerStandardLabor;
    worksheet.getCell('R6').value = capacityPerHour;
    worksheet.getCell('S6').value = estimateOutputPairs;
    worksheet.getCell('T6').value = '0%';

    populateLsaDetailSection(worksheet, mappedRows, category);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    return {
      buffer,
      fileName: `lsa-${normalizedStage.toLowerCase()}-${timestamp}.xlsx`,
    };
  }

  private mapRow(row: {
    id: string;
    stageItemId?: string | null;
    no: string;
    partName: string;
    ct1: number;
    ct2: number;
    ct3: number;
    ct4: number;
    ct5: number;
    ct6: number;
    ct7: number;
    ct8: number;
    ct9: number;
    ct10: number;
    vaCt1: number;
    vaCt2: number;
    vaCt3: number;
    vaCt4: number;
    vaCt5: number;
    vaCt6: number;
    vaCt7: number;
    vaCt8: number;
    vaCt9: number;
    vaCt10: number;
    machineType: string;
    confirmed: boolean;
    done: boolean;
  }) {
    return {
      id: row.id,
      stageItemId: row.stageItemId ?? null,
      no: row.no,
      partName: row.partName,
      nvaValues: [
        row.ct1,
        row.ct2,
        row.ct3,
        row.ct4,
        row.ct5,
        row.ct6,
        row.ct7,
        row.ct8,
        row.ct9,
        row.ct10,
      ],
      vaValues: [
        row.vaCt1,
        row.vaCt2,
        row.vaCt3,
        row.vaCt4,
        row.vaCt5,
        row.vaCt6,
        row.vaCt7,
        row.vaCt8,
        row.vaCt9,
        row.vaCt10,
      ],
      machineType: row.machineType,
      confirmed: row.confirmed,
      done: row.done,
    };
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.TableCT', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.TableCT')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[TableCT];
      END

      IF OBJECT_ID(N'dbo.TableCT', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[TableCT] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [TableCT_id_df] DEFAULT NEWID(),
          [stageItemId] UNIQUEIDENTIFIER NULL,
          [no] NVARCHAR(50) NOT NULL,
          [partName] NVARCHAR(255) NOT NULL,
          [stage] NVARCHAR(50) NOT NULL,
          [ct1] FLOAT NOT NULL CONSTRAINT [TableCT_ct1_df] DEFAULT 0,
          [ct2] FLOAT NOT NULL CONSTRAINT [TableCT_ct2_df] DEFAULT 0,
          [ct3] FLOAT NOT NULL CONSTRAINT [TableCT_ct3_df] DEFAULT 0,
          [ct4] FLOAT NOT NULL CONSTRAINT [TableCT_ct4_df] DEFAULT 0,
          [ct5] FLOAT NOT NULL CONSTRAINT [TableCT_ct5_df] DEFAULT 0,
          [ct6] FLOAT NOT NULL CONSTRAINT [TableCT_ct6_df] DEFAULT 0,
          [ct7] FLOAT NOT NULL CONSTRAINT [TableCT_ct7_df] DEFAULT 0,
          [ct8] FLOAT NOT NULL CONSTRAINT [TableCT_ct8_df] DEFAULT 0,
          [ct9] FLOAT NOT NULL CONSTRAINT [TableCT_ct9_df] DEFAULT 0,
          [ct10] FLOAT NOT NULL CONSTRAINT [TableCT_ct10_df] DEFAULT 0,
          [vaCt1] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt1_df] DEFAULT 0,
          [vaCt2] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt2_df] DEFAULT 0,
          [vaCt3] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt3_df] DEFAULT 0,
          [vaCt4] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt4_df] DEFAULT 0,
          [vaCt5] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt5_df] DEFAULT 0,
          [vaCt6] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt6_df] DEFAULT 0,
          [vaCt7] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt7_df] DEFAULT 0,
          [vaCt8] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt8_df] DEFAULT 0,
          [vaCt9] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt9_df] DEFAULT 0,
          [vaCt10] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt10_df] DEFAULT 0,
          [machineType] NVARCHAR(100) NOT NULL CONSTRAINT [TableCT_machineType_df] DEFAULT 'Select..',
          [confirmed] BIT NOT NULL CONSTRAINT [TableCT_confirmed_df] DEFAULT 0,
          [done] BIT NOT NULL CONSTRAINT [TableCT_done_df] DEFAULT 0,
          [sortOrder] INT NOT NULL CONSTRAINT [TableCT_sortOrder_df] DEFAULT 0,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [TableCT_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [TableCT_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [TableCT_pkey] PRIMARY KEY ([id])
        );
      END

      IF COL_LENGTH('dbo.TableCT', 'stageItemId') IS NULL
      BEGIN
        ALTER TABLE [dbo].[TableCT]
        ADD [stageItemId] UNIQUEIDENTIFIER NULL;
      END

      IF COL_LENGTH('dbo.TableCT', 'done') IS NULL
      BEGIN
        ALTER TABLE [dbo].[TableCT]
        ADD [done] BIT NOT NULL CONSTRAINT [TableCT_done_df] DEFAULT 0;
      END
    `);

    for (let index = 1; index <= 10; index += 1) {
      await this.prismaService.$executeRawUnsafe(`
        IF COL_LENGTH('dbo.TableCT', 'vaCt${index}') IS NULL
        BEGIN
          ALTER TABLE [dbo].[TableCT]
          ADD [vaCt${index}] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt${index}_df] DEFAULT 0;
        END
      `);
    }

    for (let index = 1; index <= 10; index += 1) {
      await this.ensureFloatColumn(`ct${index}`, `TableCT_ct${index}_df`);
      await this.ensureFloatColumn(`vaCt${index}`, `TableCT_vaCt${index}_df`);
    }

    await this.prismaService.$executeRawUnsafe(`
      UPDATE t
      SET t.stageItemId = s.id
      FROM [dbo].[TableCT] t
      INNER JOIN [dbo].[StageList] s
        ON s.code = t.no AND ISNULL(s.area, s.stage) = t.stage
      WHERE t.stageItemId IS NULL
    `);
  }

  private async ensureStageListColumns() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'season') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [season] NVARCHAR(100) NULL;
      END
    `);

    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'cutDie') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [cutDie] NVARCHAR(100) NULL;
      END
    `);

    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'area') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [area] NVARCHAR(50) NULL;
      END
    `);

    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'area') IS NOT NULL
      BEGIN
        UPDATE [dbo].[StageList]
        SET [area] = [stage]
        WHERE [area] IS NULL;
      END
    `);
  }

  private async ensureSeedData() {
    return;
  }

  private async ensureFloatColumn(columnName: string, defaultConstraintName: string) {
    const columnType = await this.prismaService.$queryRawUnsafe<Array<{ typeName: string }>>(`
      SELECT TOP 1 t.name AS typeName
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      WHERE c.object_id = OBJECT_ID(N'dbo.TableCT')
        AND c.name = '${columnName}'
    `);

    if (!columnType[0] || columnType[0].typeName === 'float') {
      return;
    }

    const defaultConstraints = await this.prismaService.$queryRawUnsafe<Array<{ constraintName: string }>>(`
      SELECT dc.name AS constraintName
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c
        ON dc.parent_object_id = c.object_id
       AND dc.parent_column_id = c.column_id
      WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TableCT')
        AND c.name = '${columnName}'
    `);

    for (const constraint of defaultConstraints) {
      await this.prismaService.$executeRawUnsafe(`
        ALTER TABLE [dbo].[TableCT]
        DROP CONSTRAINT [${constraint.constraintName}]
      `);
    }

    await this.prismaService.$executeRawUnsafe(`
      ALTER TABLE [dbo].[TableCT]
      ALTER COLUMN [${columnName}] FLOAT NOT NULL
    `);

    await this.prismaService.$executeRawUnsafe(`
      ALTER TABLE [dbo].[TableCT]
      ADD CONSTRAINT [${defaultConstraintName}] DEFAULT 0 FOR [${columnName}]
    `);
  }
}

function populateCycleTimeSection(
  worksheet: ExcelJS.Worksheet,
  rows: ReturnType<TableCtService['mapRow']>[],
  category?: string,
) {
  const templateStart = 13;
  const templateEnd = 15;
  const nextSectionStart = 16;
  const requiredRows = rows.length * 2 + 1;
  const currentRows = templateEnd - templateStart + 1;
  const extraRows = Math.max(0, requiredRows - currentRows);
  const totalTemplate = captureRowTemplate(worksheet, 15);

  if (extraRows > 0) {
    worksheet.insertRows(nextSectionStart, Array.from({ length: extraRows }, () => []), 'i');
  }

  const grandTotalValues = Array.from({ length: 10 }, () => 0);

  for (let blockIndex = 0; blockIndex < rows.length; blockIndex += 1) {
    const sourceRows = [13, 14];
    const targetRows = [
      templateStart + blockIndex * 2,
      templateStart + blockIndex * 2 + 1,
    ];

    targetRows.forEach((targetRow, index) => {
      clearMergedRangesForRow(worksheet, targetRow, 1, 23);
      copyRowStyle(worksheet, sourceRows[index], targetRow);
      ensureCycleTimeMerges(worksheet, targetRow);
    });

    const row = rows[blockIndex];
    row.nvaValues.forEach((value, index) => {
      grandTotalValues[index] += value + (row.vaValues[index] ?? 0);
    });

    fillCycleRow(worksheet, targetRows[0], {
      progress: row.no,
      partName: row.partName,
      type: 'NVA',
      values: row.nvaValues,
      category,
    });
    fillCycleRow(worksheet, targetRows[1], {
      progress: '',
      partName: '',
      type: 'VA',
      values: row.vaValues,
      category,
    });
  }

  const totalRow = templateStart + rows.length * 2;
  clearMergedRangesForRow(worksheet, totalRow, 1, 23);
  applyRowTemplate(worksheet, totalTemplate, totalRow);
  ensureTotalCycleTimeMerges(worksheet, totalRow);
  fillTotalCycleRow(worksheet, totalRow, {
    values: grandTotalValues.map((value) => roundToTwoDecimals(value)),
    category,
  });

  return {
    insertedRows: extraRows,
    totalRow,
  };
}

function populateMachineSection(
  worksheet: ExcelJS.Worksheet,
  rows: ReturnType<TableCtService['mapRow']>[],
  templateStart: number,
  category?: string,
) {
  const nextSectionStart = 26;
  const templateRows = 7;
  const sectionRows = Math.max(rows.length, templateRows);
  const effectiveNextSectionStart = templateStart + templateRows;
  const extraRows = Math.max(0, rows.length - templateRows);

  if (extraRows > 0) {
    worksheet.insertRows(
      effectiveNextSectionStart,
      Array.from({ length: extraRows }, () => []),
      'i',
    );
  }

  for (let index = 0; index < rows.length; index += 1) {
    const targetRow = templateStart + index;

    clearMergedRangesForRow(worksheet, targetRow, 1, 12);
    copyRowStyle(worksheet, templateStart, targetRow);
    ensureMachineLeftSectionMerges(worksheet, targetRow);
  }

  for (let rowNumber = templateStart; rowNumber < templateStart + sectionRows; rowNumber += 1) {
    clearMergedRangesForRow(worksheet, rowNumber, 13, 23);
  }

  mergeIfNeeded(worksheet, `M${templateStart}:W${templateStart}`);
  if (sectionRows > 1) {
    mergeIfNeeded(
      worksheet,
      `M${templateStart + 1}:W${templateStart + sectionRows - 1}`,
    );
  }
}

function fillCycleRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  payload: {
    progress: string;
    partName: string;
    type: string;
    values: number[];
    category?: string;
  },
) {
  worksheet.getCell(`A${rowNumber}`).value = payload.progress;
  worksheet.getCell(`C${rowNumber}`).value = payload.partName;
  worksheet.getCell(`H${rowNumber}`).value = payload.type;

  payload.values.forEach((value, index) => {
    worksheet.getCell(rowNumber, 13 + index).value = roundToTwoDecimals(value);
  });

  worksheet.getCell(`W${rowNumber}`).value = formatAverageNumber(
    payload.values,
    payload.category,
  );
}

function fillTotalCycleRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  payload: {
    values: number[];
    category?: string;
  },
) {
  worksheet.getCell(`A${rowNumber}`).value = 'Total';
  worksheet.getCell(`M${rowNumber}`).value = '';

  payload.values.forEach((value, index) => {
    worksheet.getCell(rowNumber, 13 + index).value = roundToTwoDecimals(value);
  });

  worksheet.getCell(`W${rowNumber}`).value = formatAverageNumber(
    payload.values,
    payload.category,
  );
}

function copyRowStyle(
  worksheet: ExcelJS.Worksheet,
  sourceRowNumber: number,
  targetRowNumber: number,
) {
  if (sourceRowNumber === targetRowNumber) {
    return;
  }

  const sourceRow = worksheet.getRow(sourceRowNumber);
  const targetRow = worksheet.getRow(targetRowNumber);
  targetRow.height = sourceRow.height;

  sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const targetCell = targetRow.getCell(colNumber);
    targetCell.style = JSON.parse(JSON.stringify(cell.style));
    if (!targetCell.value) {
      targetCell.value = '';
    }
  });
}

function captureRowTemplate(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = worksheet.getRow(rowNumber);
  const cells: Array<{ colNumber: number; style: ExcelJS.Style; value: ExcelJS.CellValue }> = [];

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const mergedCell = cell as ExcelJS.Cell & {
      isMerged?: boolean;
      master?: ExcelJS.Cell;
    };
    const isMergeFollower =
      Boolean(mergedCell.isMerged) &&
      mergedCell.master != null &&
      mergedCell.master.address !== cell.address;

    cells.push({
      colNumber,
      style: JSON.parse(JSON.stringify(cell.style)),
      value: isMergeFollower ? '' : (cell.value ?? ''),
    });
  });

  return {
    height: row.height,
    cells,
  };
}

function applyRowTemplate(
  worksheet: ExcelJS.Worksheet,
  template: ReturnType<typeof captureRowTemplate>,
  targetRowNumber: number,
) {
  const targetRow = worksheet.getRow(targetRowNumber);
  targetRow.height = template.height;

  template.cells.forEach((cellTemplate) => {
    const targetCell = targetRow.getCell(cellTemplate.colNumber);
    targetCell.style = JSON.parse(JSON.stringify(cellTemplate.style));
    targetCell.value = cellTemplate.value;
  });
}

function ensureCycleTimeMerges(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  clearMergedRangesForRow(worksheet, rowNumber, 1, 12);
  mergeIfNeeded(worksheet, `A${rowNumber}:B${rowNumber}`);
  mergeIfNeeded(worksheet, `C${rowNumber}:G${rowNumber}`);
  mergeIfNeeded(worksheet, `H${rowNumber}:L${rowNumber}`);
}

function ensureTotalCycleTimeMerges(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  clearMergedRangesForRow(worksheet, rowNumber, 1, 12);
  mergeIfNeeded(worksheet, `A${rowNumber}:L${rowNumber}`);
}

function restoreTimeStudyLowerSectionLayout(
  worksheet: ExcelJS.Worksheet,
  rowOffset: number,
  templates: ReturnType<typeof captureLowerTimeStudyTemplates>,
) {
  const observationTitleRow = 17 + rowOffset;
  const observationHeaderRow = 18 + rowOffset;
  const observationBodyStartRow = 19 + rowOffset;
  const observationBodyEndRow = 25 + rowOffset;
  const additionalTitleRow = 27 + rowOffset;
  const additionalBodyStartRow = 28 + rowOffset;
  const additionalBodyEndRow = 34 + rowOffset;
  const detailsTitleRow = 36 + rowOffset;
  const detailsBodyStartRow = 37 + rowOffset;
  const detailsBodyEndRow = 82 + rowOffset;

  for (let row = observationTitleRow; row <= detailsBodyEndRow; row += 1) {
    clearMergedRangesForRow(worksheet, row, 1, 23);
  }

  applyRowTemplate(worksheet, templates.observationTitle, observationTitleRow);
  applyRowTemplate(worksheet, templates.observationHeader, observationHeaderRow);
  for (let row = observationBodyStartRow; row <= observationBodyEndRow; row += 1) {
    applyRowTemplate(worksheet, templates.observationBody, row);
  }
  applyRowTemplate(worksheet, templates.additionalTitle, additionalTitleRow);
  for (let row = additionalBodyStartRow; row <= additionalBodyEndRow; row += 1) {
    applyRowTemplate(worksheet, templates.additionalBody, row);
  }
  applyRowTemplate(worksheet, templates.detailsTitle, detailsTitleRow);
  for (let row = detailsBodyStartRow; row <= detailsBodyEndRow; row += 1) {
    applyRowTemplate(worksheet, templates.detailsBody, row);
  }

  mergeIfNeeded(worksheet, `A${observationTitleRow}:W${observationTitleRow}`);
  mergeIfNeeded(worksheet, `A${observationHeaderRow}:C${observationHeaderRow}`);
  mergeIfNeeded(worksheet, `D${observationHeaderRow}:H${observationHeaderRow}`);
  mergeIfNeeded(worksheet, `I${observationHeaderRow}:J${observationHeaderRow}`);
  mergeIfNeeded(worksheet, `K${observationHeaderRow}:L${observationHeaderRow}`);
  mergeIfNeeded(worksheet, `M${observationHeaderRow}:W${observationHeaderRow}`);

  for (let row = observationBodyStartRow; row <= observationBodyEndRow; row += 1) {
    mergeIfNeeded(worksheet, `A${row}:C${row}`);
    mergeIfNeeded(worksheet, `D${row}:H${row}`);
    mergeIfNeeded(worksheet, `I${row}:J${row}`);
    mergeIfNeeded(worksheet, `K${row}:L${row}`);
  }
  mergeIfNeeded(worksheet, `M${observationBodyStartRow}:W${observationBodyEndRow}`);

  mergeIfNeeded(worksheet, `A${additionalTitleRow}:W${additionalTitleRow}`);
  mergeIfNeeded(worksheet, `A${additionalBodyStartRow}:W${additionalBodyEndRow}`);

  mergeIfNeeded(worksheet, `A${detailsTitleRow}:W${detailsTitleRow}`);
  mergeIfNeeded(worksheet, `A${detailsBodyStartRow}:W${detailsBodyEndRow}`);

  worksheet.getCell(`A${observationTitleRow}`).value =
    'OTHER OBSERVATIONS:  if any/ if needed';
  worksheet.getCell(`A${observationHeaderRow}`).value = 'Type of Machine';
  worksheet.getCell(`D${observationHeaderRow}`).value = 'Process';
  worksheet.getCell(`I${observationHeaderRow}`).value = 'No. of Machines';
  worksheet.getCell(`K${observationHeaderRow}`).value = 'CT (in sec)';
  worksheet.getCell(`M${observationHeaderRow}`).value =
    'Photo of Finished Components';
  worksheet.getCell(`A${additionalTitleRow}`).value =
    'ADDITIONAL NOTES/ RECOMMENDATION:';
  worksheet.getCell(`A${detailsTitleRow}`).value =
    'DETAILED PROCESS ILLUSTRATIONS:';

  applyRangeBorder(worksheet, `A${observationTitleRow}:W${observationTitleRow}`, {
    top: 'medium',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
  });
  applyRangeBorder(worksheet, `A${observationHeaderRow}:W${observationHeaderRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'thin',
  });
  applyRangeBorder(worksheet, `A${observationBodyStartRow}:L${observationBodyEndRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
    insideHorizontal: 'thin',
    insideVertical: 'thin',
  });
  applyRangeBorder(worksheet, `M${observationBodyStartRow}:W${observationBodyEndRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
  });
  applyRangeBorder(worksheet, `A${additionalTitleRow}:W${additionalTitleRow}`, {
    top: 'medium',
    left: 'medium',
    right: 'medium',
    bottom: 'thin',
  });
  applyRangeBorder(worksheet, `A${additionalBodyStartRow}:W${additionalBodyEndRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
  });
  applyRangeBorder(worksheet, `A${detailsTitleRow}:W${detailsTitleRow}`, {
    top: 'medium',
    left: 'medium',
    right: 'medium',
    bottom: 'thin',
  });
  applyRangeBorder(worksheet, `A${detailsBodyStartRow}:W${detailsBodyEndRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
  });
  clearMergedRowInnerBorders(worksheet, `A${observationTitleRow}:W${observationTitleRow}`);
  clearMergedRowInnerBorders(worksheet, `A${additionalTitleRow}:W${additionalTitleRow}`);
  clearMergedRowInnerBorders(worksheet, `A${detailsTitleRow}:W${detailsTitleRow}`);
}

function captureLowerTimeStudyTemplates(worksheet: ExcelJS.Worksheet) {
  return {
    observationTitle: captureRowTemplate(worksheet, 17),
    observationHeader: captureRowTemplate(worksheet, 18),
    observationBody: captureRowTemplate(worksheet, 19),
    additionalTitle: captureRowTemplate(worksheet, 27),
    additionalBody: captureRowTemplate(worksheet, 28),
    detailsTitle: captureRowTemplate(worksheet, 36),
    detailsBody: captureRowTemplate(worksheet, 37),
  };
}

function applyRangeBorder(
  worksheet: ExcelJS.Worksheet,
  range: string,
  edges: {
    top?: ExcelJS.BorderStyle;
    left?: ExcelJS.BorderStyle;
    right?: ExcelJS.BorderStyle;
    bottom?: ExcelJS.BorderStyle;
    insideHorizontal?: ExcelJS.BorderStyle;
    insideVertical?: ExcelJS.BorderStyle;
  },
) {
  const [startRef, endRef] = range.split(':');
  const startCell = worksheet.getCell(startRef);
  const endCell = worksheet.getCell(endRef);
  const startRow = startCell.row;
  const endRow = endCell.row;
  const startCol = startCell.col;
  const endCol = endCell.col;

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      const border = JSON.parse(JSON.stringify(cell.border ?? {}));

      if (row === startRow && edges.top) {
        border.top = { style: edges.top, color: { argb: 'FF000000' } };
      }
      if (row === endRow && edges.bottom) {
        border.bottom = { style: edges.bottom, color: { argb: 'FF000000' } };
      }
      if (col === startCol && edges.left) {
        border.left = { style: edges.left, color: { argb: 'FF000000' } };
      }
      if (col === endCol && edges.right) {
        border.right = { style: edges.right, color: { argb: 'FF000000' } };
      }
      if (row < endRow && edges.insideHorizontal) {
        border.bottom = { style: edges.insideHorizontal, color: { argb: 'FF000000' } };
      }
      if (col < endCol && edges.insideVertical) {
        border.right = { style: edges.insideVertical, color: { argb: 'FF000000' } };
      }

      cell.border = border;
    }
  }
}

function clearMergedRowInnerBorders(worksheet: ExcelJS.Worksheet, range: string) {
  const [startRef, endRef] = range.split(':');
  const startCell = worksheet.getCell(startRef);
  const endCell = worksheet.getCell(endRef);
  const row = startCell.row;
  const startCol = startCell.col;
  const endCol = endCell.col;

  for (let col = startCol; col <= endCol; col += 1) {
    const cell = worksheet.getCell(row, col);
    const border = JSON.parse(JSON.stringify(cell.border ?? {}));

    if (col > startCol) {
      delete border.left;
    }
    if (col < endCol) {
      delete border.right;
    }

    if (col === startCol) {
      border.left = { style: 'medium', color: { argb: 'FF000000' } };
    }
    if (col === endCol) {
      border.right = { style: 'medium', color: { argb: 'FF000000' } };
    }

    border.top = { style: 'medium', color: { argb: 'FF000000' } };
    border.bottom = { style: 'medium', color: { argb: 'FF000000' } };
    cell.border = border;
  }
}

function ensureMachineLeftSectionMerges(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  mergeIfNeeded(worksheet, `A${rowNumber}:C${rowNumber}`);
  mergeIfNeeded(worksheet, `D${rowNumber}:H${rowNumber}`);
  mergeIfNeeded(worksheet, `I${rowNumber}:J${rowNumber}`);
  mergeIfNeeded(worksheet, `K${rowNumber}:L${rowNumber}`);
}

function mergeIfNeeded(worksheet: ExcelJS.Worksheet, range: string) {
  try {
    worksheet.mergeCells(range);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Cannot merge already merged cells')
    ) {
      return;
    }

    throw error;
  }
}

function clearMergedRangesForRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  startColumn: number,
  endColumn: number,
) {
  const merges = (worksheet as ExcelJS.Worksheet & {
    _merges?: Record<string, { top: number; left: number; bottom: number; right: number }>;
  })._merges;

  if (!merges) {
    return;
  }

  Object.entries(merges).forEach(([range, bounds]) => {
    const touchesRow = bounds.top <= rowNumber && bounds.bottom >= rowNumber;
    const touchesColumns = bounds.left <= endColumn && bounds.right >= startColumn;

    if (touchesRow && touchesColumns) {
      try {
        worksheet.unMergeCells(range);
      } catch {
        // Ignore stale merge metadata and continue rebuilding the row shape.
      }
    }
  });
}

function formatAverageNumber(values: number[], category?: string) {
  const normalizedCategory = category?.trim().toUpperCase() ?? '';
  if (normalizedCategory === 'COSTING') {
    if (values.length === 0) {
      return 0;
    }

    return roundToTwoDecimals(sumValues(values) / 10);
  }

  const shouldUsePositiveOnly =
    normalizedCategory === 'FF28' || normalizedCategory === 'LSA';
  const valuesForAverage = shouldUsePositiveOnly
    ? values.filter((value) => value > 0)
    : values;

  if (valuesForAverage.length === 0) {
    return 0;
  }

  return roundToTwoDecimals(
    valuesForAverage.reduce((sum, value) => sum + value, 0) /
      valuesForAverage.length,
  );
}

function populateLsaDetailSection(
  worksheet: ExcelJS.Worksheet,
  rows: ReturnType<TableCtService['mapRow']>[],
  category?: string,
) {
  const templateStart = 9;
  const firstExtraRow = 10;
  const blockHeight = 4;
  const requiredRows = Math.max(1, rows.length) * blockHeight;
  const currentRows = 4;
  const extraRows = Math.max(0, requiredRows - currentRows);

  if (extraRows > 0) {
    worksheet.insertRows(13, Array.from({ length: extraRows }, () => []), 'i');
  }

  for (let index = 0; index < rows.length; index += 1) {
    const baseRow = templateStart + index * blockHeight;
    const sourceRows = [9, 10, 11, 12];
    const targetRows = [baseRow, baseRow + 1, baseRow + 2, baseRow + 3];

    targetRows.forEach((targetRow, sourceIndex) => {
      copyRowStyle(worksheet, sourceRows[sourceIndex], targetRow);
    });

    const row = rows[index];
    const va = roundToTwoDecimals(sumValues(row.vaValues));
    const nva = roundToTwoDecimals(sumValues(row.nvaValues));
    const loss = 0;
    const totalValues = row.nvaValues.map((value, ctIndex) =>
      roundToTwoDecimals(value + (row.vaValues[ctIndex] ?? 0)),
    );
    const ct = formatAverageNumber(totalValues, category);
    const pph = ct > 0 ? Math.round(3600 / ct) : 0;
    const pair = ct > 0 ? roundToTwoDecimals((8 * 3600) / ct) : 0;

    worksheet.getCell(`A${baseRow}`).value = row.no;
    worksheet.getCell(`B${baseRow}`).value = row.partName;
    worksheet.getCell(`C${baseRow}`).value = va;
    worksheet.getCell(`D${baseRow}`).value = nva;
    worksheet.getCell(`E${baseRow}`).value = loss;
    worksheet.getCell(`F${baseRow}`).value = ct;
    worksheet.getCell(`G${baseRow}`).value = 0;
    worksheet.getCell(`H${baseRow}`).value = 0;
    worksheet.getCell(`I${baseRow}`).value = 0;
    worksheet.getCell(`J${baseRow}`).value = '';
    worksheet.getCell(`K${baseRow}`).value = pph;
    worksheet.getCell(`L${baseRow}`).value = 0;
    worksheet.getCell(`M${baseRow}`).value = '';

    worksheet.getCell(`B${baseRow + 1}`).value = `VA ${row.partName}`.trim();
    worksheet.getCell(`C${baseRow + 1}`).value = va;
    worksheet.getCell(`F${baseRow + 1}`).value = ct;
    worksheet.getCell(`G${baseRow + 1}`).value = 'CT';
    worksheet.getCell(`I${baseRow + 1}`).value = 0;
    worksheet.getCell(`L${baseRow + 1}`).value = 0;

    worksheet.getCell(`F${baseRow + 2}`).value = pair;
    worksheet.getCell(`G${baseRow + 2}`).value = 'PP';

    worksheet.getCell(`B${baseRow + 3}`).value = `TỔNG ${row.partName}`.trim();
    worksheet.getCell(`C${baseRow + 3}`).value = va;
    worksheet.getCell(`F${baseRow + 3}`).value = ct;
    worksheet.getCell(`G${baseRow + 3}`).value = 'Total';
    worksheet.getCell(`I${baseRow + 3}`).value = 0;
    worksheet.getCell(`J${baseRow + 3}`).value = 0;
    worksheet.getCell(`L${baseRow + 3}`).value = 0;
  }
}

function sumValues(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function normalizeCategory(category?: string) {
  return category?.trim().toUpperCase() ?? '';
}

function buildCostingDoneUpdate(
  existingRow: {
    ct1: number;
    ct2: number;
    ct3: number;
    ct4: number;
    ct5: number;
    ct6: number;
    ct7: number;
    ct8: number;
    ct9: number;
    ct10: number;
    vaCt1: number;
    vaCt2: number;
    vaCt3: number;
    vaCt4: number;
    vaCt5: number;
    vaCt6: number;
    vaCt7: number;
    vaCt8: number;
    vaCt9: number;
    vaCt10: number;
  },
) {
  const nextData: Record<string, number> = {};

  const nextNvaValues = completeCostingValues([
    existingRow.ct1,
    existingRow.ct2,
    existingRow.ct3,
    existingRow.ct4,
    existingRow.ct5,
    existingRow.ct6,
    existingRow.ct7,
    existingRow.ct8,
    existingRow.ct9,
    existingRow.ct10,
  ]);
  const nextVaValues = completeCostingValues([
    existingRow.vaCt1,
    existingRow.vaCt2,
    existingRow.vaCt3,
    existingRow.vaCt4,
    existingRow.vaCt5,
    existingRow.vaCt6,
    existingRow.vaCt7,
    existingRow.vaCt8,
    existingRow.vaCt9,
    existingRow.vaCt10,
  ]);

  nextNvaValues.forEach((value, index) => {
    nextData[`ct${index + 1}`] = value;
  });

  nextVaValues.forEach((value, index) => {
    nextData[`vaCt${index + 1}`] = value;
  });

  return nextData;
}

function completeCostingValues(currentValues: number[]) {
  const nextValues = currentValues.map((value) => roundToTwoDecimals(Math.max(0, value)));
  let filledCount = 0;
  for (const value of nextValues) {
    if (value > 0) {
      filledCount += 1;
      continue;
    }
    break;
  }

  if (filledCount === 0 || filledCount >= 10) {
    return nextValues;
  }

  const seedValues = nextValues.slice(0, filledCount);
  const seedAverage = roundToTwoDecimals(sumValues(seedValues) / seedValues.length);
  const targetTotal = roundToTwoDecimals(seedAverage * 10);

  let generatedValues: number[] | null = null;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const trial = [...nextValues];

    for (let index = filledCount; index <= 8; index += 1) {
      trial[index] = roundToTwoDecimals(
        Math.max(0, seedAverage + randomBetween(-1, 1)),
      );
    }

    const remainingTotal = roundToTwoDecimals(
      targetTotal - sumValues(trial.slice(0, 9)),
    );

    if (remainingTotal >= 0) {
      trial[9] = remainingTotal;
      generatedValues = trial;
      break;
    }
  }

  if (!generatedValues) {
    generatedValues = [...nextValues];
    for (let index = filledCount; index <= 9; index += 1) {
      generatedValues[index] = seedAverage;
    }
  }

  return generatedValues.map((value) => roundToTwoDecimals(Math.max(0, value)));
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function parseTableIdentity(fileName: string, fallbackCode: string) {
  const withoutExtension = stripFileExtension(fileName).trim();
  const matched = withoutExtension.match(/^([^.]+)\.\s*(.+)$/);

  if (!matched) {
    return {
      code: fallbackCode.trim().toUpperCase(),
      partName: withoutExtension,
    };
  }

  return {
    code: matched[1].trim().toUpperCase() || fallbackCode.trim().toUpperCase(),
    partName: matched[2].trim() || withoutExtension,
  };
}

function stripFileExtension(fileName: string) {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function roundToTwoDecimals(value: number) {
  return Number(value.toFixed(2));
}
