import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Clock, Play, Square, X } from 'lucide-react';

import type { PreviewPlaybackState } from '@/components/dashboard/preview-panel';
import { cn } from '@/lib/utils';
import { fetchControlSession, saveControlSession } from '@/services/control-session';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  addHistoryItem,
  commitHistoryItems,
  saveTableRowMetrics,
} from '@/store/slices/dashboard-slice';
import type { HistoryItem } from '@/types/dashboard';

const metricConfig = [
  {
    label: 'NVA',
    accent: 'border-red-200 focus:border-red-400 focus:ring-red-100',
    badge: 'bg-red-50 text-red-500',
  },
  {
    label: 'VA',
    accent: 'border-emerald-200 focus:border-emerald-400 focus:ring-emerald-100',
    badge: 'bg-emerald-50 text-emerald-600',
  },
  {
    label: 'SKIP',
    accent: 'border-amber-200 focus:border-amber-400 focus:ring-amber-100',
    badge: 'bg-amber-50 text-amber-600',
  },
] as const;

function roundToTwoDecimals(value: number) {
  return Number(value.toFixed(2));
}

function formatPreciseTime(totalSeconds: number) {
  const rounded = roundToTwoDecimals(totalSeconds);
  const wholeMinutes = Math.floor(rounded / 60);
  const secondsPart = rounded - wholeMinutes * 60;
  const wholeSeconds = Math.floor(secondsPart);
  const hundredths = Math.round((secondsPart - wholeSeconds) * 100);

  if (hundredths === 100) {
    return formatPreciseTime(wholeMinutes * 60 + wholeSeconds + 1);
  }

  return `${String(wholeMinutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

type ControlPanelProps = {
  playbackState: PreviewPlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  deletedHistoryItem?: HistoryItem | null;
};

export function ControlPanel({
  playbackState,
  onPlay,
  onPause,
  onSeek,
  deletedHistoryItem,
}: ControlPanelProps) {
  const dispatch = useAppDispatch();
  const saveTimeoutRef = useRef<number | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const { selectedItem, selectedCtCell, selectedTableRow, sessionCategory, activeStage } =
    useAppSelector((state) => {
    const selectedTableRow = state.dashboard.selectedCtCell
      ? state.dashboard.tableRows.find((row) => row.id === state.dashboard.selectedCtCell?.rowId)
      : undefined;

    return {
      selectedItem: state.dashboard.orderedStageItems.find(
        (item) => item.id === state.dashboard.selectedItemId,
      ),
      selectedCtCell: state.dashboard.selectedCtCell,
      selectedTableRow,
      sessionCategory: state.auth.sessionUser.category,
      activeStage: state.dashboard.activeStage,
    };
  });
  const [elapsed, setElapsed] = useState(0);
  const [nva, setNva] = useState<number | null>(null);
  const [va, setVa] = useState<number | null>(null);
  const [skip, setSkip] = useState<number | null>(null);
  const [segmentStart, setSegmentStart] = useState(0);
  const [sessionError, setSessionError] = useState('');
  const [isHydrating, setIsHydrating] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isCuttingModalOpen, setIsCuttingModalOpen] = useState(false);
  const [piecesInput, setPiecesInput] = useState('');
  const [layersInput, setLayersInput] = useState('');
  const [cuttingModalError, setCuttingModalError] = useState('');

  const isRunning = playbackState.isPlaying;
  const isLsaCuttingFlow =
    sessionCategory.trim().toUpperCase() === 'LSA' &&
    activeStage.trim().toUpperCase() === 'CUTTING';

  useEffect(() => {
    const stageCode = selectedItem?.code;

    if (!stageCode) {
      setElapsed(0);
      setNva(null);
      setVa(null);
      setSkip(null);
      setSegmentStart(0);
      setSessionError('');
      return;
    }

    let isCancelled = false;
    setIsHydrating(true);

    void fetchControlSession(stageCode)
      .then((session) => {
        if (isCancelled) return;

        setElapsed(session?.elapsed ?? 0);
        setNva(session?.nva ?? null);
        setVa(session?.va ?? null);
        setSkip(session?.skip ?? null);
        setSegmentStart(session?.segmentStart ?? 0);
        setSessionError('');
      })
      .catch((error) => {
        if (isCancelled) return;

        setElapsed(0);
        setNva(null);
        setVa(null);
        setSkip(null);
        setSegmentStart(0);
        setSessionError(
          error instanceof Error ? error.message : 'Unable to load control session.',
        );
      })
      .finally(() => {
        if (!isCancelled) {
          setIsHydrating(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedItem?.code]);

  useEffect(() => {
    setElapsed(roundToTwoDecimals(playbackState.currentTime));
  }, [playbackState.currentTime]);

  useEffect(() => {
    if (!deletedHistoryItem) {
      return;
    }

    const match = deletedHistoryItem.label.match(/^(NVA|VA|SKIP):\s*([0-9]+(?:\.[0-9]+)?)$/);

    if (!match) {
      return;
    }

    const [, type, valueText] = match;
    const value = Number(valueText);

    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    if (type === 'NVA') {
      setNva((current) => {
        const next = (current ?? 0) - value;
        return next > 0 ? Number(next.toFixed(2)) : null;
      });
    }

    if (type === 'VA') {
      setVa((current) => {
        const next = (current ?? 0) - value;
        return next > 0 ? Number(next.toFixed(2)) : null;
      });
    }

    if (type === 'SKIP') {
      setSkip((current) => {
        const next = (current ?? 0) - value;
        return next > 0 ? Number(next.toFixed(2)) : null;
      });
    }
  }, [deletedHistoryItem]);

  useEffect(() => {
    if (!selectedItem?.code || isHydrating) {
      return;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void saveControlSession({
        stageCode: selectedItem.code,
        elapsed: roundToTwoDecimals(playbackState.currentTime),
        isRunning,
        segmentStart,
        nva,
        va,
        skip,
      }).then(
        () => {
          setSessionError('');
        },
        (error) => {
          setSessionError(
            error instanceof Error ? error.message : 'Unable to save control session.',
          );
        },
      );
    }, isRunning ? 900 : 250);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    isHydrating,
    isRunning,
    nva,
    segmentStart,
    selectedItem?.code,
    skip,
    va,
    playbackState.currentTime,
  ]);

  const handleStart = () => {
    if (
      isRunning ||
      !selectedCtCell ||
      !selectedItem ||
      selectedCtCell.stageItemId !== selectedItem.id ||
      selectedTableRow?.confirmed
    ) {
      return;
    }
    setSegmentStart(roundToTwoDecimals(playbackState.currentTime));
    onPlay();
  };

  const applyDoneMetrics = async (nextNvaValue: number, nextVaValue: number) => {
    if (!selectedCtCell?.rowId || !selectedItem?.code || selectedTableRow?.confirmed) {
      return;
    }

    const result = await dispatch(
      saveTableRowMetrics({
        id: selectedCtCell.rowId,
        columnIndex: selectedCtCell.columnIndex,
        nvaValue: nextNvaValue,
        vaValue: nextVaValue,
      }),
    );

    if (saveTableRowMetrics.rejected.match(result)) {
      setSessionError(
        typeof result.payload === 'string'
          ? result.payload
          : 'Unable to save table metrics.',
      );
      return;
    }

    const commitResult = await dispatch(commitHistoryItems(selectedItem.code));

    if (commitHistoryItems.rejected.match(commitResult)) {
      setSessionError(
        typeof commitResult.payload === 'string'
          ? commitResult.payload
          : 'Unable to lock history items after saving table metrics.',
      );
      return;
    }

    setNva(null);
    setVa(null);
    setSkip(null);
    setSegmentStart(roundToTwoDecimals(playbackState.currentTime));
    setSessionError('');
    setCuttingModalError('');
    setPiecesInput('');
    setLayersInput('');
    setIsCuttingModalOpen(false);
  };

  const handleDone = async () => {
    if (!selectedCtCell?.rowId || !selectedItem?.code || selectedTableRow?.confirmed) {
      return;
    }

    if (isLsaCuttingFlow && ((nva ?? 0) > 0 || (va ?? 0) > 0)) {
      setCuttingModalError('');
      setIsCuttingModalOpen(true);
      return;
    }

    await applyDoneMetrics(nva ?? 0, va ?? 0);
  };

  const handleStop = () => {
    onPause();
  };

  const handleMetricSelect = async (metric: 'NVA' | 'VA' | 'SKIP') => {
    if (isRunning || !selectedItem?.code) {
      return;
    }

    const endTime = roundToTwoDecimals(playbackState.currentTime);
    const segmentValue = roundToTwoDecimals(Math.max(endTime - segmentStart, 0));

    if (segmentValue <= 0) {
      return;
    }

    if (metric === 'NVA') {
      setNva((current) => roundToTwoDecimals((current ?? 0) + segmentValue));
    }

    if (metric === 'VA') {
      setVa((current) => roundToTwoDecimals((current ?? 0) + segmentValue));
    }

    if (metric === 'SKIP') {
      setSkip((current) => roundToTwoDecimals((current ?? 0) + segmentValue));
    }

    await dispatch(
      addHistoryItem({
        stageCode: selectedItem.code,
        startTime: segmentStart,
        endTime,
        type: metric,
        value: segmentValue,
      }),
    );

    setSegmentStart(endTime);
  };

  const displayedTime = isSeeking ? elapsed : playbackState.currentTime;

  const progressPercent = useMemo(() => {
    if (playbackState.duration <= 0) {
      return 0;
    }

    return Math.max(0, (displayedTime / playbackState.duration) * 100);
  }, [displayedTime, playbackState.duration]);

  const formatTime = (seconds: number) => {
    return formatPreciseTime(seconds);
  };

  const handleCuttingModalDone = async () => {
    const pieces = Number(piecesInput);
    const layers = Number(layersInput);

    if (!Number.isFinite(pieces) || pieces <= 0) {
      setCuttingModalError('Number of pieces must be greater than 0.');
      return;
    }

    if (!Number.isFinite(layers) || layers <= 0) {
      setCuttingModalError('Number of layers must be greater than 0.');
      return;
    }

    const multipliedNva = roundToTwoDecimals(((nva ?? 0) * pieces) / layers);
    const multipliedVa = roundToTwoDecimals(((va ?? 0) * pieces) / layers);

    await applyDoneMetrics(multipliedNva, multipliedVa);
  };

  const metrics = [
    { label: 'NVA', value: nva, setter: setNva },
    { label: 'VA', value: va, setter: setVa },
    { label: 'SKIP', value: skip, setter: setSkip },
  ] as const;
  const hasVideoDuration = playbackState.duration > 0;
  const hasSelectedCtCell =
    !!selectedCtCell && !!selectedItem && selectedCtCell.stageItemId === selectedItem.id;
  const isSelectedRowLocked = Boolean(selectedTableRow?.confirmed);
  const canSelectMetric =
    hasSelectedCtCell &&
    !isSelectedRowLocked &&
    !isRunning &&
    playbackState.currentTime > segmentStart;
  const selectedMetric = skip !== null ? 'SKIP' : va !== null ? 'VA' : nva !== null ? 'NVA' : null;
  const currentTimeLabel = hasVideoDuration ? formatTime(displayedTime) : '00:00.00';
  const totalDurationLabel = hasVideoDuration
    ? formatTime(playbackState.duration)
    : '--:--.--';

  useEffect(() => {
    if (!isSeeking || !hasVideoDuration || isRunning) {
      return;
    }

    const updateSeek = (clientX: number) => {
      if (!seekBarRef.current) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const nextTime = Math.max(0, Math.min(ratio, 1)) * playbackState.duration;
      setElapsed(Math.floor(nextTime));
      onSeek(nextTime);
    };

    const handleMove = (event: MouseEvent) => {
      updateSeek(event.clientX);
    };

    const handleUp = () => {
      setIsSeeking(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [hasVideoDuration, isRunning, isSeeking, onSeek, playbackState.duration]);

  return (
    <>
      <div className="flex flex-col overflow-hidden border-t-2 border-gray-100">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-gray-100 px-3 py-2.5">
        <div className="h-3.5 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
        <span className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">
          Control Panel
        </span>
      </div>

      <div className="shrink-0 px-3 pt-3 pb-2 sm:px-4">
        {sessionError ? (
          <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
            {sessionError}
          </div>
        ) : null}
        <div
          className={cn(
            'relative flex items-center justify-center rounded-2xl border py-3 transition-all duration-300',
            isRunning
              ? 'border-blue-200 bg-linear-to-br from-blue-50 to-violet-50 shadow-sm shadow-blue-100'
              : 'border-gray-200 bg-gray-50',
          )}
        >
          {isRunning ? (
            <div className="absolute inset-0 rounded-2xl border-2 border-blue-300 opacity-20 animate-ping" />
          ) : null}
          <Clock
            className={cn(
              'mr-2 h-3.5 w-3.5 transition',
              isRunning ? 'text-blue-400' : 'text-gray-300',
            )}
          />
          <span
            className={cn(
              'font-mono text-2xl font-bold tracking-widest transition',
              isRunning ? 'text-blue-600' : 'text-gray-400',
            )}
          >
            {formatTime(elapsed)}
          </span>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-2.5 sm:px-4">
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            <span>Playback Range</span>
            <span>{selectedItem?.name ? 'Video Duration' : 'No Video'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="text-gray-500">{hasSelectedCtCell ? selectedCtCell.columnKey : ''}</span>
            {hasSelectedCtCell ? (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                {selectedCtCell.columnKey}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-semibold text-blue-500">
              {currentTimeLabel}
            </span>
            <span className="text-[10px] font-mono text-gray-400">
              {totalDurationLabel}
            </span>
          </div>

          <div
            ref={seekBarRef}
            className={cn(
              'relative h-1.5 w-full overflow-hidden rounded-full bg-gray-200',
              hasVideoDuration && !isRunning
                ? 'cursor-pointer'
                : 'cursor-not-allowed opacity-60',
            )}
            onMouseDown={(event) => {
              if (playbackState.duration <= 0 || isRunning) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              const nextTime = Math.max(0, Math.min(ratio, 1)) * playbackState.duration;
              setElapsed(Math.floor(nextTime));
              onSeek(nextTime);
              setIsSeeking(true);
            }}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-linear-to-r from-blue-500 to-violet-500"
              style={{ width: `${progressPercent}%` }}
            />
            {hasVideoDuration ? (
              <div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-blue-500 shadow-md shadow-blue-200"
                style={{ left: `${progressPercent}%` }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-2 px-3 pb-2.5 sm:grid-cols-3 sm:px-4">
        <button
          onClick={handleStart}
          disabled={isRunning || !hasSelectedCtCell}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all duration-200',
            isRunning || !hasSelectedCtCell
              ? 'cursor-not-allowed bg-gray-100 text-gray-300'
              : 'bg-linear-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200 active:scale-95 hover:from-blue-600 hover:to-blue-700',
          )}
        >
          <Play className="h-3.5 w-3.5" />
          Start
        </button>

        <button
          onClick={handleStop}
          disabled={!hasSelectedCtCell || (Math.floor(playbackState.currentTime) <= 0 && !isRunning)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all duration-200',
            !hasSelectedCtCell || (Math.floor(playbackState.currentTime) <= 0 && !isRunning)
              ? 'cursor-not-allowed bg-gray-100 text-gray-300'
              : 'bg-linear-to-r from-slate-500 to-slate-600 text-white shadow-md shadow-slate-200 active:scale-95 hover:from-slate-600 hover:to-slate-700',
          )}
        >
          <Square className="h-3.5 w-3.5" />
          Stop
        </button>

        <button
          onClick={handleDone}
          disabled={!hasSelectedCtCell || Math.floor(playbackState.currentTime) <= 0}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all duration-200',
            !hasSelectedCtCell || Math.floor(playbackState.currentTime) <= 0
              ? 'cursor-not-allowed bg-gray-100 text-gray-300'
              : 'bg-linear-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-200 active:scale-95 hover:from-emerald-600 hover:to-emerald-700',
          )}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Done
        </button>
      </div>

      <div className="shrink-0 px-3 pb-3 sm:px-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {metrics.map(({ label, value }) => {
            const config = metricConfig.find((item) => item.label === label)!;
            const isActiveMetric = selectedMetric === label;

            return (
              <div key={label} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => handleMetricSelect(label)}
                  disabled={!canSelectMetric}
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold tracking-widest transition-all',
                    config.badge,
                    canSelectMetric ? 'cursor-pointer hover:brightness-95' : 'cursor-not-allowed opacity-70',
                    isActiveMetric ? 'ring-2 ring-offset-1 ring-slate-300' : '',
                  )}
                >
                  {label}
                </button>
                <div
                  className={cn(
                    'flex min-h-10 items-center justify-center rounded-xl border bg-white px-2 py-2 text-center font-mono text-xs text-gray-700',
                    config.accent,
                  )}
                >
                  {typeof value === 'number' ? value.toFixed(2) : '0.00'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {isCuttingModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[432px] overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
            <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                      LSA Cutting
                    </span>
                  </div>
                  <h2 className="text-[22px] font-semibold tracking-tight text-slate-700">
                    Cutting Parameters
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCuttingModalOpen(false);
                    setCuttingModalError('');
                  }}
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <label className="block space-y-2">
                <span className="text-[14px] font-medium text-slate-700">
                  Number of pieces
                </span>
                <input
                  type="number"
                  min="1"
                  value={piecesInput}
                  onChange={(event) => setPiecesInput(event.target.value)}
                  placeholder="Enter your pieces..."
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[14px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[14px] font-medium text-slate-700">
                  Number of layers
                </span>
                <input
                  type="number"
                  min="1"
                  value={layersInput}
                  onChange={(event) => setLayersInput(event.target.value)}
                  placeholder="Enter your layers..."
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[14px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
                />
              </label>

              {cuttingModalError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-500">
                  {cuttingModalError}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleCuttingModalDone}
                  className="h-12 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)] transition hover:from-emerald-600 hover:to-emerald-700"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCuttingModalOpen(false);
                    setCuttingModalError('');
                  }}
                  className="h-12 rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(239,68,68,0.2)] transition hover:from-rose-600 hover:to-red-600"
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
