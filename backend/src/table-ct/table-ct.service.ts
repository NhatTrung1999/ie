import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { extname } from 'node:path';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUserPayload } from '../auth/auth.types';
import { DeleteLogService } from '../delete-log/delete-log.service';
import { StageCategoryService } from '../stage-category/stage-category.service';
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
    await this.ensureTable();
    await this.ensureSeedData();
  }

  async listRows(filters: { stage?: string; stageCode?: string; stageItemId?: string }) {
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
            ...(normalizedStage ? { stage: normalizedStage } : {}),
          },
        });

        if (sourceStage) {
          const parsedIdentity = parseTableIdentity(sourceStage.name, sourceStage.code);
          const sortOrder =
            (await this.prismaService.tableCT.count({
              where: { stage: sourceStage.stage },
            })) + 1;

          await this.prismaService.tableCT.create({
            data: {
              stageItemId: sourceStage.id,
              no: parsedIdentity.code,
              partName: parsedIdentity.partName,
              stage: sourceStage.stage,
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
        where: { stageCode: existingRow.no.trim().toUpperCase() },
      });

      await tx.controlSession.deleteMany({
        where: { stageCode: existingRow.no.trim().toUpperCase() },
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

    worksheet.getCell('C3').value = '';
    worksheet.getCell('I3').value = primaryStageItem?.name || primaryRow.partName;
    worksheet.getCell('C4').value = '';
    worksheet.getCell('I4').value = primaryStageItem?.article || primaryRow.no;
    worksheet.getCell('C5').value = normalizedStage;
    worksheet.getCell('I5').value = '';

    populateCycleTimeSection(
      worksheet,
      orderedRows.map((row) => this.mapRow(row)),
      category,
    );
    populateMachineSection(
      worksheet,
      orderedRows.map((row) => this.mapRow(row)),
      category,
    );

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    return {
      buffer,
      fileName: `time-study-${normalizedStage.toLowerCase()}-${timestamp}.xlsx`,
    };
  }

  async exportLsaWorkbook(payload: ExportTableCtDto, category?: string) {
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
    const stageTotalSeconds = roundToTwoDecimals(
      mappedRows.reduce(
        (sum, row) => sum + sumValues(row.nvaValues) + sumValues(row.vaValues),
        0,
      ),
    );
    const pairsPerPerson8h =
      stageTotalSeconds > 0 ? roundToTwoDecimals(8 * 3600 / stageTotalSeconds) : 0;

    worksheet.getCell('B2').value =
      primaryStageItem?.article || primaryStageItem?.code || primaryRow.no;
    worksheet.getCell('B3').value = '';
    worksheet.getCell('B4').value = '';
    worksheet.getCell('B5').value = pairsPerPerson8h;
    worksheet.getCell('G3').value = `${mappedRows.length} Pairs`;
    worksheet.getCell('G4').value = '8 hours';
    worksheet.getCell('G5').value = '1800 sec';

    const summaryRowByStage: Record<string, number> = {
      CUTTING: 2,
      STITCHING: 3,
      ASSEMBLY: 5,
      STOCK: 6,
    };
    const summaryRow = summaryRowByStage[normalizedStage] ?? 6;

    worksheet.getCell(`P${summaryRow}`).value = stageTotalSeconds;
    worksheet.getCell(`Q${summaryRow}`).value = pairsPerPerson8h;
    worksheet.getCell(`R${summaryRow}`).value = 0;
    worksheet.getCell(`S${summaryRow}`).value = 0;
    worksheet.getCell(`T${summaryRow}`).value = '0%';
    worksheet.getCell('P6').value = stageTotalSeconds;
    worksheet.getCell('Q6').value = pairsPerPerson8h;
    worksheet.getCell('R6').value = 0;
    worksheet.getCell('S6').value = 0;
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
        ON s.code = t.no AND s.stage = t.stage
      WHERE t.stageItemId IS NULL
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
  const templateStart = 12;
  const templateEnd = 14;
  const nextSectionStart = 15;
  const requiredRows = rows.length * 3;
  const currentRows = templateEnd - templateStart + 1;
  const extraRows = Math.max(0, requiredRows - currentRows);

  if (extraRows > 0) {
    worksheet.insertRows(nextSectionStart, Array.from({ length: extraRows }, () => []), 'i');
  }

  for (let blockIndex = 0; blockIndex < rows.length; blockIndex += 1) {
    const sourceRows = [12, 13, 14];
    const targetRows = [
      templateStart + blockIndex * 3,
      templateStart + blockIndex * 3 + 1,
      templateStart + blockIndex * 3 + 2,
    ];

    targetRows.forEach((targetRow, index) => {
      copyRowStyle(worksheet, sourceRows[index], targetRow);
      ensureCycleTimeMerges(worksheet, targetRow);
    });

    const row = rows[blockIndex];
    const totalValues = row.nvaValues.map((value, index) =>
      roundToTwoDecimals(value + (row.vaValues[index] ?? 0)),
    );

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
    fillCycleRow(worksheet, targetRows[2], {
      progress: 'Total',
      partName: '',
      type: '',
      values: totalValues,
      category,
    });
  }
}

function populateMachineSection(
  worksheet: ExcelJS.Worksheet,
  rows: ReturnType<TableCtService['mapRow']>[],
  category?: string,
) {
  const templateStart = 17;
  const nextSectionStart = 24;
  const templateRows = nextSectionStart - templateStart;
  const extraRows = Math.max(0, rows.length - templateRows);

  if (extraRows > 0) {
    worksheet.insertRows(nextSectionStart, Array.from({ length: extraRows }, () => []), 'i');
  }

  for (let index = 0; index < rows.length; index += 1) {
    const targetRow = templateStart + index;

    copyRowStyle(worksheet, templateStart, targetRow);
    ensureMachineSectionMerges(worksheet, targetRow);

    const row = rows[index];
    const totalValues = row.nvaValues.map((value, ctIndex) =>
      roundToTwoDecimals(value + (row.vaValues[ctIndex] ?? 0)),
    );

    worksheet.getCell(`A${targetRow}`).value =
      row.machineType === 'Select..' ? '' : row.machineType;
    worksheet.getCell(`D${targetRow}`).value = row.partName;
    worksheet.getCell(`I${targetRow}`).value = row.machineType === 'Select..' ? '' : 1;
    worksheet.getCell(`K${targetRow}`).value = formatAverageNumber(
      totalValues,
      category,
    );
    worksheet.getCell(`M${targetRow}`).value = '';
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

function ensureCycleTimeMerges(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  mergeIfNeeded(worksheet, `A${rowNumber}:B${rowNumber}`);
  mergeIfNeeded(worksheet, `C${rowNumber}:G${rowNumber}`);
  mergeIfNeeded(worksheet, `H${rowNumber}:L${rowNumber}`);
}

function ensureMachineSectionMerges(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  mergeIfNeeded(worksheet, `A${rowNumber}:C${rowNumber}`);
  mergeIfNeeded(worksheet, `D${rowNumber}:H${rowNumber}`);
  mergeIfNeeded(worksheet, `I${rowNumber}:J${rowNumber}`);
  mergeIfNeeded(worksheet, `K${rowNumber}:L${rowNumber}`);
  mergeIfNeeded(worksheet, `M${rowNumber}:W${rowNumber}`);
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
