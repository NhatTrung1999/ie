import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  ChevronDown,
  FileSpreadsheet,
  GripVertical,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  fetchMachineTypes,
  type MachineTypeItem,
} from '@/services/machine-types';
import {
  deleteTableCtRow,
  exportLsaWorkbook,
  exportTableCtWorkbook,
} from '@/services/table-ct';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  confirmSelectedTableRows,
  completeTableRow,
  saveTableRow,
  setSelectedCtCell,
  toggleTableRowConfirm,
  updateTableRowMachineType,
} from '@/store/slices/dashboard-slice';
import type { CtRow } from '@/types/dashboard';

const CT_COLUMNS = [
  'CT1',
  'CT2',
  'CT3',
  'CT4',
  'CT5',
  'CT6',
  'CT7',
  'CT8',
  'CT9',
  'CT10',
];

type CtTablePanelProps = {
  rows: CtRow[];
  activeStageItemId: string | null;
  onReorder: (activeNo: string, overNo: string) => void;
  onRefresh: (options?: { ignoreSelection?: boolean }) => Promise<void> | void;
  onToggleStageItemActive: (stageItemId: string | null) => void;
};

export function CtTablePanel({
  rows,
  activeStageItemId,
  onReorder,
  onRefresh,
  onToggleStageItemActive,
}: CtTablePanelProps) {
  const dispatch = useAppDispatch();
  const { tableRowsError, activeStage, selectedCtCell, sessionCategory } =
    useAppSelector((state) => ({
      tableRowsError: state.dashboard.tableRowsError,
      activeStage: state.dashboard.activeStage,
      selectedCtCell: state.dashboard.selectedCtCell,
      sessionCategory: state.auth.sessionUser.category,
    }));
  const [draggingNo, setDraggingNo] = useState<string | null>(null);
  const [dragOverNo, setDragOverNo] = useState<string | null>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement | null>(null);
  const [machineTypes, setMachineTypes] = useState<MachineTypeItem[]>([]);
  const [machineTypeQueries, setMachineTypeQueries] = useState<
    Record<string, string>
  >({});
  const [openMachineDropdownId, setOpenMachineDropdownId] = useState<string | null>(
    null,
  );
  const [isLsaExportOpen, setIsLsaExportOpen] = useState(false);
  const [estimateOutputInput, setEstimateOutputInput] = useState('0');
  const [lsaExportError, setLsaExportError] = useState('');
  const [isExportingLsa, setIsExportingLsa] = useState(false);
  const activeRowStageItemId = activeStageItemId;
  const isLsaCategory = sessionCategory.trim().toUpperCase() === 'LSA';

  useEffect(() => {
    if (!activeStage) {
      setMachineTypes([]);
      setOpenMachineDropdownId(null);
      return;
    }

    void fetchMachineTypes(activeStage)
      .then((items) => {
        setMachineTypes(items);
      })
      .catch(() => {
        setMachineTypes([]);
      });
  }, [activeStage]);

  const machineTypeOptions = useMemo(() => machineTypes, [machineTypes]);

  const handleToggleRowSelection = (row: CtRow) => {
    const isDeselecting = activeStageItemId === (row.stageItemId ?? null);

    if (isDeselecting) {
      if (selectedCtCell?.rowId === row.id) {
        dispatch(setSelectedCtCell(null));
      }
      onToggleStageItemActive(null);
      return;
    }

    onToggleStageItemActive(row.stageItemId ?? null);
  };

  const handleRefresh = (options?: { ignoreSelection?: boolean }) => {
    void onRefresh(options);
  };

  const handleMachineType = async (id: string, value: string) => {
    dispatch(
      updateTableRowMachineType({ id, machineType: value || 'Select..' })
    );

    const result = await dispatch(
      saveTableRow({
        id,
        machineType: value || 'Select..',
      })
    );

    if (saveTableRow.rejected.match(result)) {
      handleRefresh();
    }
  };

  const handleMachineTypeQueryChange = (row: CtRow, query: string) => {
    setMachineTypeQueries((current) => ({
      ...current,
      [row.id]: query,
    }));

    const matchedMachine = findMachineTypeByQuery(query, machineTypeOptions);
    if (!matchedMachine) {
      return;
    }

    void handleMachineType(row.id, matchedMachine.label);
  };

  const handleMachineTypeQueryBlur = (row: CtRow) => {
    const currentQuery = machineTypeQueries[row.id];

    if (currentQuery == null) {
      return;
    }

    const matchedMachine = findMachineTypeByQuery(currentQuery, machineTypeOptions);

    if (!currentQuery.trim()) {
      void handleMachineType(row.id, '');
    } else if (!matchedMachine) {
      setMachineTypeQueries((current) => ({
        ...current,
        [row.id]: getMachineTypeDisplay(row.machineType, machineTypeOptions),
      }));
      return;
    }

    setMachineTypeQueries((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
  };

  const getFilteredMachineTypes = (row: CtRow) => {
    const query = (machineTypeQueries[row.id] ?? '').trim().toLowerCase();

    if (!query) {
      return machineTypeOptions;
    }

    return machineTypeOptions.filter((machine) => {
      const displayValue = formatMachineTypeOption(machine).toLowerCase();
      return (
        displayValue.includes(query) ||
        machine.label.toLowerCase().includes(query) ||
        machine.labelCn?.toLowerCase().includes(query) ||
        machine.labelVn?.toLowerCase().includes(query)
      );
    });
  };

  const handleConfirm = async (id: string, confirmed: boolean) => {
    dispatch(toggleTableRowConfirm(id));

    const result = await dispatch(
      saveTableRow({
        id,
        confirmed: !confirmed,
      })
    );

    if (saveTableRow.rejected.match(result)) {
      handleRefresh();
    }
  };

  const handleDone = async (id: string) => {
    const result = await dispatch(completeTableRow(id));

    if (completeTableRow.rejected.match(result)) {
      handleRefresh();
    }
  };

  const handleDelete = async (row: CtRow) => {
    try {
      await deleteTableCtRow(row.id);

      if (selectedCtCell?.rowId === row.id) {
        dispatch(setSelectedCtCell(null));
      }

      if (activeStageItemId === (row.stageItemId ?? null)) {
        onToggleStageItemActive(null);
        handleRefresh({ ignoreSelection: true });
        return;
      }

      handleRefresh();
    } catch {
      handleRefresh();
    }
  };

  const handleExport = () => {
    if (rows.length === 0 || rows.some((row) => !row.confirmed)) {
      return;
    }

    void exportTableCtWorkbook({
      stage: activeStage,
      stageItemId: activeStageItemId,
      rowIds: rows.map((row) => row.id),
    }).then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-');

      link.href = url;
      link.download = `time-study-${activeStage.toLowerCase()}-${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  };

  const workingTimeSeconds = 27000;
  const totalCtSeconds = useMemo(
    () =>
      roundToTwoDecimals(
        rows.reduce((sum, row) => {
          const totalValues = row.nvaValues.map(
            (value, index) => value + (row.vaValues[index] ?? 0)
          );
          const baseCt = calculateAverageNumber(totalValues, sessionCategory);
          const lossRate = getMachineTypeLossRate(
            row.machineType,
            machineTypeOptions
          );
          return sum + baseCt * (1 + lossRate);
        }, 0)
      ),
    [machineTypeOptions, rows, sessionCategory]
  );
  const estimateOutputPairs = Math.max(0, Number(estimateOutputInput) || 0);
  const taktTimeSeconds =
    estimateOutputPairs > 0
      ? roundToTwoDecimals(3600 / estimateOutputPairs)
      : 0;
  const manpowerStandardLabor =
    taktTimeSeconds > 0 ? Math.ceil(totalCtSeconds / taktTimeSeconds) : 0;
  const capacityPerHour =
    totalCtSeconds > 0 ? Math.round(3600 / totalCtSeconds) : 0;
  const unconfirmedRowIds = rows
    .filter((row) => !row.confirmed)
    .map((row) => row.id);
  const canExportWorkbook = rows.length > 0 && unconfirmedRowIds.length === 0;

  const handleConfirmMany = async () => {
    if (unconfirmedRowIds.length === 0) {
      return;
    }

    const result = await dispatch(
      confirmSelectedTableRows({
        ids: unconfirmedRowIds,
        confirmed: true,
      })
    );

    if (confirmSelectedTableRows.rejected.match(result)) {
      handleRefresh();
    }
  };

  const handleExportLsa = () => {
    if (rows.length === 0 || rows.some((row) => !row.confirmed)) {
      return;
    }

    setLsaExportError('');
    setIsLsaExportOpen(true);
  };

  const handleConfirmExportLsa = async () => {
    if (rows.length === 0) {
      return;
    }

    if (estimateOutputPairs < 0) {
      setLsaExportError('Estimate Output must be 0 or greater.');
      return;
    }

    try {
      setIsExportingLsa(true);
      const blob = await exportLsaWorkbook({
        stage: activeStage,
        stageItemId: activeStageItemId,
        rowIds: rows.map((row) => row.id),
        estimateOutputPairs,
        workingTimeSeconds,
        taktTimeSeconds,
        manpowerStandardLabor,
        capacityPerHour,
        totalCtSeconds,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-');

      link.href = url;
      link.download = `lsa-${activeStage.toLowerCase()}-${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setIsLsaExportOpen(false);
      setLsaExportError('');
    } catch (error) {
      setLsaExportError(
        error instanceof Error
          ? error.message
          : 'Unable to export LSA workbook.'
      );
    } finally {
      setIsExportingLsa(false);
    }
  };

  const handleCancelExportLsa = () => {
    setIsLsaExportOpen(false);
    setLsaExportError('');
  };

  return (
    <>
      <div className="flex min-h-90 flex-col overflow-hidden border-t border-gray-200 bg-white lg:h-[38%] lg:min-h-0">
        <div className="flex shrink-0 flex-col gap-3 border-b border-gray-100 px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
            <span className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">
              TableCT
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleRefresh()}
            className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-[11px] text-red-500 shadow-none hover:bg-red-100"
          >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => void handleConfirmMany()}
              disabled={unconfirmedRowIds.length === 0}
              className="h-8 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[11px] text-blue-600 shadow-none hover:bg-blue-100"
            >
              <CheckCheck className="h-3 w-3" />
              Confirm
            </Button>
            {isLsaCategory ? (
              <Button
                size="sm"
                onClick={handleExportLsa}
                disabled={!canExportWorkbook}
                title={
                  canExportWorkbook
                    ? 'Export Excel LSA'
                    : 'Please confirm all TableCT rows before exporting.'
                }
                className="h-8 rounded-lg border border-teal-200 bg-teal-50 px-3 text-[11px] text-teal-700 shadow-none hover:bg-teal-100"
              >
                <FileSpreadsheet className="h-3 w-3" />
                Excel LSA
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleExport}
                disabled={!canExportWorkbook}
                title={
                  canExportWorkbook
                    ? 'Export Excel Time Study'
                    : 'Please confirm all TableCT rows before exporting.'
                }
                className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[11px] text-emerald-600 shadow-none hover:bg-emerald-100"
              >
                <FileSpreadsheet className="h-3 w-3" />
                Excel Time Study
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {tableRowsError ? (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] font-medium text-amber-700">
              {tableRowsError}
            </div>
          ) : null}
          <table className="w-full min-w-310 border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-100">
                <th className="w-6 py-2" />
                <th className="w-10 py-2 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  No
                </th>
                <th className="w-36 py-2 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  Part Name
                </th>
                <th className="w-14 py-2 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  Type
                </th>
                {CT_COLUMNS.map((col) => (
                  <th
                    key={col}
                    className="w-10 py-2 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase"
                  >
                    {col}
                  </th>
                ))}
                <th className="w-14 py-2 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  Avg
                </th>
                <th className="w-36 py-2 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  Machine Type
                </th>
                <th className="w-16 py-2 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  Confirm
                </th>
                <th className="w-16 py-2 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  Action
                </th>
              </tr>
            </thead>

            <tbody
              ref={tableBodyRef}
              onDragOver={(e) => {
                if (!draggingNo || !tableBodyRef.current) {
                  return;
                }

                const nearestNo = getNearestTableRowNo(tableBodyRef.current, e.clientY);

                if (!nearestNo || nearestNo === draggingNo) {
                  return;
                }

                e.preventDefault();
                setDragOverNo(nearestNo);
              }}
              onDrop={(e) => {
                e.preventDefault();

                if (draggingNo && dragOverNo && draggingNo !== dragOverNo) {
                  onReorder(draggingNo, dragOverNo);
                }

                setDraggingNo(null);
                setDragOverNo(null);
              }}
            >
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={CT_COLUMNS.length + 9}
                    className="h-55 px-4 py-10 align-middle"
                  >
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100">
                        <FileSpreadsheet className="h-4 w-4 text-gray-300" />
                      </div>
                      <p className="text-[11px] text-gray-400">No data</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) =>
                  ['NVA', 'VA'].map((type, idx) => (
                    <tr
                      key={`${row.no}-${type}`}
                      data-drag-row={idx === 0 ? row.no : undefined}
                      onClick={() => handleToggleRowSelection(row)}
                      draggable={idx === 0}
                      onDragStart={(e) => {
                        if (idx !== 0) {
                          e.preventDefault();
                          return;
                        }

                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', row.id);
                        setDraggingNo(row.no);
                      }}
                      onDragEnd={() => {
                        setDraggingNo(null);
                        setDragOverNo(null);
                      }}
                      onDragOver={(e) => {
                        if (idx === 0 && draggingNo && draggingNo !== row.no) {
                          e.preventDefault();
                          setDragOverNo(row.no);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverNo === row.no) {
                          setDragOverNo(null);
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-b border-gray-50 transition-all',
                        activeRowStageItemId === (row.stageItemId ?? null)
                          ? 'bg-linear-to-r from-blue-50/60 to-violet-50/60'
                          : 'hover:bg-gray-50/60',
                        draggingNo === row.no ? 'opacity-60' : '',
                        dragOverNo === row.no && draggingNo !== row.no
                          ? 'bg-blue-50/70'
                          : ''
                      )}
                    >
                      {idx === 0 ? (
                        <td
                          rowSpan={2}
                          className="relative w-6 align-middle text-center"
                        >
                          {dragOverNo === row.no && draggingNo !== row.no ? (
                            <div className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-blue-400" />
                          ) : null}
                          <button
                            type="button"
                            title="Drag to reorder"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="rounded-md p-0.5"
                          >
                            <GripVertical className="mx-auto h-3 w-3 cursor-grab text-gray-300 active:cursor-grabbing" />
                          </button>
                        </td>
                      ) : null}

                      {idx === 0 ? (
                        <td
                          rowSpan={2}
                          className="w-10 py-1.5 align-middle text-center"
                        >
                          <span
                            className={cn(
                              'text-xs font-bold',
                              activeRowStageItemId === (row.stageItemId ?? null)
                                ? 'text-blue-600'
                                : 'text-gray-600'
                            )}
                          >
                            {row.no}
                          </span>
                        </td>
                      ) : null}

                      {idx === 0 ? (
                        <td
                          rowSpan={2}
                          className="w-36 py-1.5 align-middle text-center"
                        >
                          <span className="text-xs text-gray-500">
                            {row.partName}
                          </span>
                        </td>
                      ) : null}

                      <td className="w-14 py-1.5 align-middle text-center">
                        <div className="flex justify-center">
                          {type === 'NVA' ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-500">
                              <span className="h-1 w-1 rounded-full bg-red-400" />
                              NVA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                              <span className="h-1 w-1 rounded-full bg-emerald-400" />
                              VA
                            </span>
                          )}
                        </div>
                      </td>

                      {(type === 'NVA' ? row.nvaValues : row.vaValues).map(
                        (value, ctIdx) => (
                          <td
                            key={ctIdx}
                            className="w-10 py-1.5 align-middle text-center"
                          >
                            <button
                              type="button"
                              disabled={row.confirmed}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (row.confirmed) {
                                  return;
                                }
                                const isSelected =
                                  selectedCtCell?.rowId === row.id &&
                                  selectedCtCell.columnIndex === ctIdx;

                                if (isSelected) {
                                  dispatch(setSelectedCtCell(null));
                                  onToggleStageItemActive(null);
                                  return;
                                }

                                dispatch(
                                  setSelectedCtCell({
                                    rowId: row.id,
                                    stageItemId: row.stageItemId ?? null,
                                    rowNo: row.no,
                                    columnIndex: ctIdx,
                                    columnKey: CT_COLUMNS[ctIdx],
                                  })
                                );
                                onToggleStageItemActive(
                                  row.stageItemId ?? null
                                );
                              }}
                              className={cn(
                                'inline-flex min-w-8 items-center justify-center rounded-md px-1 py-0.5 text-xs font-mono transition-colors',
                                activeRowStageItemId ===
                                  (row.stageItemId ?? null) && ctIdx === 0
                                  ? 'font-bold text-amber-500'
                                  : 'text-gray-400',
                                row.confirmed
                                  ? 'cursor-not-allowed opacity-60 hover:bg-transparent'
                                  : '',
                                selectedCtCell?.rowId === row.id &&
                                  selectedCtCell.columnIndex === ctIdx
                                  ? 'bg-blue-100 font-bold text-blue-700 ring-1 ring-blue-300'
                                  : row.confirmed
                                  ? ''
                                  : 'hover:bg-gray-100'
                              )}
                            >
                              {formatMetricValue(value)}
                            </button>
                          </td>
                        )
                      )}

                      <td className="w-14 py-1.5 align-middle text-center">
                        <span className="text-xs font-mono text-gray-400">
                          {formatAverage(
                            type === 'NVA' ? row.nvaValues : row.vaValues,
                            row.done,
                            sessionCategory
                          )}
                        </span>
                      </td>

                      {idx === 0 ? (
                        <td
                          rowSpan={2}
                          className="w-36 py-1.5 align-middle text-center"
                        >
                          <div className="flex justify-center">
                            <div className="relative w-32">
                              <button
                                type="button"
                                disabled={row.confirmed}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMachineDropdownId((current) =>
                                    current === row.id ? null : row.id,
                                  );
                                  setMachineTypeQueries((current) => ({
                                    ...current,
                                    [row.id]: '',
                                  }));
                                }}
                                className={cn(
                                  'flex h-7 w-full items-center justify-between rounded-lg border px-3 text-[11px] outline-none transition-all',
                                  row.confirmed
                                    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300'
                                    : row.machineType !== 'Select..'
                                    ? 'border-blue-200 bg-blue-50 font-medium text-blue-600'
                                    : 'border-gray-200 bg-gray-50 text-gray-400',
                                )}
                              >
                                <span className="truncate">
                                  {getMachineTypeDisplay(
                                    row.machineType,
                                    machineTypeOptions,
                                  ) || 'Select...'}
                                </span>
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              </button>

                              {openMachineDropdownId === row.id && !row.confirmed ? (
                                <div
                                  className="absolute left-0 top-[calc(100%+0.25rem)] z-20 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    autoFocus
                                    value={machineTypeQueries[row.id] ?? ''}
                                    onChange={(e) =>
                                      handleMachineTypeQueryChange(row, e.target.value)
                                    }
                                    onBlur={() => {
                                      handleMachineTypeQueryBlur(row);
                                      setTimeout(() => {
                                        setOpenMachineDropdownId((current) =>
                                          current === row.id ? null : current,
                                        );
                                      }, 120);
                                    }}
                                    placeholder="Search..."
                                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
                                  />
                                  <div className="mt-2 max-h-44 overflow-y-auto">
                                    {getFilteredMachineTypes(row).length === 0 ? (
                                      <div className="px-2 py-2 text-[11px] text-slate-400">
                                        No data
                                      </div>
                                    ) : (
                                      getFilteredMachineTypes(row).map((machine) => (
                                        <button
                                          key={machine.id}
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => {
                                            void handleMachineType(row.id, machine.label);
                                            setMachineTypeQueries((current) => {
                                              const next = { ...current };
                                              delete next[row.id];
                                              return next;
                                            });
                                            setOpenMachineDropdownId(null);
                                          }}
                                          className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[11px] text-slate-700 transition hover:bg-slate-100"
                                        >
                                          <span className="truncate">
                                            {formatMachineTypeOption(machine)}
                                          </span>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      ) : null}

                      {idx === 0 ? (
                        <td
                          rowSpan={2}
                          className="w-16 py-1.5 align-middle text-center"
                        >
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleConfirm(row.id, row.confirmed);
                              }}
                              title={
                                row.confirmed ? 'Unconfirm row' : 'Confirm row'
                              }
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all',
                                row.confirmed
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-gray-300 bg-white hover:border-blue-400'
                              )}
                            >
                              {row.confirmed ? (
                                <CheckCheck className="h-3 w-3 text-white" />
                              ) : null}
                            </button>
                          </div>
                        </td>
                      ) : null}

                      {idx === 0 ? (
                        <td
                          rowSpan={2}
                          className="w-16 py-1.5 align-middle text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-center gap-1.5">
                            <Button
                              size="sm"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDone(row.id);
                              }}
                              disabled={row.confirmed}
                              title={
                                row.done
                                  ? 'Mark as not done'
                                  : 'Mark row as done'
                              }
                              className={cn(
                                'h-6 rounded-lg border px-2 text-[10px] font-bold shadow-none',
                                row.confirmed
                                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300'
                                  : row.done
                                  ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              )}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                void handleDelete(row);
                              }}
                              disabled={row.confirmed}
                              title={
                                row.confirmed
                                  ? 'Confirmed rows cannot be deleted.'
                                  : 'Delete table row'
                              }
                              className={cn(
                                'h-6 rounded-lg border px-2 text-[10px] font-bold shadow-none',
                                row.confirmed
                                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300'
                                  : 'border-red-200 bg-red-50 text-red-500 hover:bg-red-100'
                              )}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isLsaExportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-98 overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_22px_64px_rgba(15,23,42,0.16)]">
            <div className="border-b border-slate-100 px-4 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-linear-to-b from-teal-500 to-blue-500" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                      LSA Export
                    </span>
                  </div>
                  <h2 className="text-[18px] font-semibold tracking-tight text-slate-700">
                    Modal Estimate Output
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleCancelExportLsa}
                  className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3 px-4 py-4">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-slate-700">
                  Estimate Output (pairs)
                </span>
                <input
                  type="number"
                  min="0"
                  value={estimateOutputInput}
                  onChange={(event) =>
                    setEstimateOutputInput(event.target.value)
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
                />
              </label>

              <div className="space-y-0 rounded-xl border border-slate-100 bg-white">
                <MetricRow
                  label="Working Time"
                  value={`${formatNumber(workingTimeSeconds)} sec`}
                />
                <MetricRow
                  label="Takt Time"
                  value={`${formatNumber(
                    roundToTwoDecimals(taktTimeSeconds)
                  )} sec`}
                />
                <MetricRow
                  label="Total CT"
                  value={`${formatNumber(
                    roundToTwoDecimals(totalCtSeconds)
                  )} sec`}
                  dashed
                />
                <MetricRow
                  label="Manpower Standard labor"
                  value={`${formatNumber(
                    roundToTwoDecimals(manpowerStandardLabor)
                  )} persons`}
                  accent
                  dashed
                />
                <MetricRow
                  label="Capacity"
                  value={`${formatNumber(
                    roundToTwoDecimals(capacityPerHour)
                  )} pairs/hour`}
                />
              </div>

              {lsaExportError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-500">
                  {lsaExportError}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmExportLsa()}
                  disabled={isExportingLsa}
                  className="h-10 rounded-xl bg-linear-to-r from-emerald-500 to-emerald-600 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)] transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
                >
                  {isExportingLsa ? 'Exporting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelExportLsa}
                  disabled={isExportingLsa}
                  className="h-10 rounded-xl bg-linear-to-r from-rose-500 to-red-500 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(239,68,68,0.2)] transition hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatMachineTypeOption(machine: MachineTypeItem) {
  return [machine.labelCn, machine.labelVn]
    .filter((value) => value && value.trim().length > 0)
    .join(' / ');
}

function getMachineTypeDisplay(
  machineType: string,
  machineTypes: MachineTypeItem[]
) {
  if (!machineType || machineType === 'Select..') {
    return '';
  }

  const matchedMachine = machineTypes.find((item) => item.label === machineType);
  return matchedMachine ? formatMachineTypeOption(matchedMachine) : machineType;
}

function findMachineTypeByQuery(
  query: string,
  machineTypes: MachineTypeItem[]
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return null;
  }

  return (
    machineTypes.find((machine) => {
      const displayValue = formatMachineTypeOption(machine).toLowerCase();
      return (
        displayValue === normalizedQuery ||
        machine.label.toLowerCase() === normalizedQuery ||
        machine.labelCn?.toLowerCase() === normalizedQuery ||
        machine.labelVn?.toLowerCase() === normalizedQuery
      );
    }) ?? null
  );
}

function formatMetricValue(value: number) {
  return value.toFixed(2);
}

function formatAverage(values: number[], isDone: boolean, category?: string) {
  const normalizedCategory = category?.trim().toUpperCase() ?? '';

  if (!isDone && normalizedCategory !== 'COSTING') {
    return '';
  }

  return calculateAverageNumber(values, normalizedCategory).toFixed(2);
}

function calculateAverageNumber(values: number[], category?: string) {
  const normalizedCategory = category?.trim().toUpperCase() ?? '';
  if (normalizedCategory === 'COSTING') {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / 10;
  }

  const shouldUsePositiveOnly =
    normalizedCategory === 'FF28' || normalizedCategory === 'LSA';
  const valuesForAverage = shouldUsePositiveOnly
    ? values.filter((value) => value > 0)
    : values;

  if (valuesForAverage.length === 0) {
    return 0;
  }

  return (
    valuesForAverage.reduce((sum, value) => sum + value, 0) /
    valuesForAverage.length
  );
}

function roundToTwoDecimals(value: number) {
  return Number(value.toFixed(2));
}

function parseLossRate(value?: string) {
  if (!value) {
    return 0;
  }

  const normalized = value.trim().replace('%', '');
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed > 1 ? parsed / 100 : parsed;
}

function getMachineTypeLossRate(
  machineType: string,
  machineTypes: MachineTypeItem[]
) {
  const matched = machineTypes.find((item) => item.label === machineType);
  return parseLossRate(matched?.loss);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function MetricRow({
  label,
  value,
  dashed = false,
  accent = false,
}: {
  label: string;
  value: string;
  dashed?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2.5',
        dashed
          ? 'border-t border-dashed border-slate-200'
          : 'border-t border-slate-100 first:border-t-0'
      )}
    >
      <span className="text-[12px] font-medium text-slate-700">{label}</span>
      <span
        className={cn(
          'text-right text-[12px] font-semibold text-slate-800',
          accent ? 'text-blue-600' : ''
        )}
      >
        {value}
      </span>
    </div>
  );
}

function getNearestTableRowNo(container: HTMLTableSectionElement, clientY: number) {
  const rows = Array.from(
    container.querySelectorAll<HTMLTableRowElement>('tr[data-drag-row]'),
  );

  let nearestNo: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  rows.forEach((row) => {
    const rect = row.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - midpoint);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestNo = row.dataset.dragRow ?? null;
    }
  });

  return nearestNo;
}
