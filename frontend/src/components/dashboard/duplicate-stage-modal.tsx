import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Search,
  X,
} from 'lucide-react';

import { duplicateStage } from '@/services/stages';
import type { StageCategory, StageItem, StageKey } from '@/types/dashboard';

type DuplicateStageModalProps = {
  open: boolean;
  categories: StageCategory[];
  defaultArea: StageKey;
  items: StageItem[];
  onClose: () => void;
  onDuplicate: (item: StageItem, targetArea: StageKey) => void;
};

const STAGE_OPTIONS = [
  'Choose option',
  'Pullover',
  'CR0',
  'CR1',
  'CR2',
  'SMS',
  'CS1',
  'CS2',
  'CS3',
  'MASSPRODUCTION',
  'Customer',
];

export function DuplicateStageModal({
  open,
  categories,
  defaultArea,
  items,
  onClose,
  onDuplicate,
}: DuplicateStageModalProps) {
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [season, setSeason] = useState('');
  const [stageCode, setStageCode] = useState('Choose option');
  const [area, setArea] = useState<StageKey | 'Choose option'>(defaultArea);
  const [article, setArticle] = useState('');
  const [results, setResults] = useState<StageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!open) return;

    setDateFrom(today);
    setDateTo(today);
    setSeason('');
    setStageCode('Choose option');
    setArea(defaultArea);
    setArticle('');
    setResults([]);
    setSelectedId(null);
    setIsSubmitting(false);
    setSubmitError('');
  }, [defaultArea, open, today]);

  if (!open) return null;

  const handleSearch = () => {
    const normalizedArticle = article.trim().toLowerCase();

    const nextResults = items.filter((item) => {
      const matchArea = area === 'Choose option' ? true : item.stage === area;
      const matchArticle =
        normalizedArticle.length === 0
          ? true
          : `${item.code} ${item.name}`.toLowerCase().includes(normalizedArticle);
      const matchStage =
        stageCode === 'Choose option'
          ? true
          : `${item.code} ${item.name}`.toLowerCase().includes(stageCode.toLowerCase());
      const matchSeason =
        season.trim().length === 0
          ? true
          : item.name.toLowerCase().includes(season.trim().toLowerCase());

      return matchArea && matchArticle && matchStage && matchSeason;
    });

    setResults(nextResults);
    setSelectedId(nextResults[0]?.id ?? null);
  };

  const selectedItem = results.find((item) => item.id === selectedId) ?? null;
  const targetArea = area === 'Choose option' ? defaultArea : area;

  const handleDuplicate = async () => {
    if (!selectedItem) return;

    try {
      setIsSubmitting(true);
      setSubmitError('');
      const createdStage = await duplicateStage({
        sourceId: selectedItem.id,
        targetArea,
      });
      onDuplicate(createdStage, targetArea);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to duplicate stage item.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/25 px-4 py-8 backdrop-blur-[2px] sm:py-12">
      <div className="w-full max-w-[840px] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Stage Library
              </span>
            </div>
            <h2 className="text-[21px] font-semibold tracking-tight text-slate-700">
              Duplicate Stage
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                <Search className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-slate-700">
                  Search Existing Stage
                </div>
                <div className="text-[11px] text-slate-400">
                  Pick a source item, then duplicate it into the selected area.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Date From">
              <DateInput value={dateFrom} onChange={setDateFrom} align="left" />
            </Field>

            <Field label="Date To">
              <DateInput value={dateTo} onChange={setDateTo} align="left" />
            </Field>

            <Field label="Season">
              <input
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="Enter your season..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
              />
            </Field>

            <Field label="Stage">
              <select
                value={stageCode}
                onChange={(e) => setStageCode(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
              >
                {STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_208px]">
            <Field label="Area">
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as StageKey | 'Choose option')}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
              >
                <option value="Choose option">Choose option</option>
                {categories.map((option) => (
                  <option key={option.id} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Article">
              <input
                value={article}
                onChange={(e) => setArticle(e.target.value)}
                placeholder="Enter your article..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
              />
            </Field>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSearch}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 text-[14px] font-semibold text-white transition hover:from-slate-700 hover:to-slate-800"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
            </div>
          </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
              <div>
                <div className="text-[13px] font-semibold text-slate-700">
                  Search Result
                </div>
                <div className="text-[11px] text-slate-400">
                  {results.length === 0
                    ? 'No matched stage found yet.'
                    : `${results.length} stage item${results.length > 1 ? 's' : ''} found`}
                </div>
              </div>
              {selectedItem ? (
                <div className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
                  Selected: {selectedItem.code}
                </div>
              ) : null}
            </div>
            {results.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center px-4 text-center">
                <div>
                  <div className="text-[15px] font-semibold text-slate-500">No Data</div>
                  <div className="mt-1 text-[12px] text-slate-400">
                    Try searching by article, stage, or area to find a source stage.
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-h-[240px] overflow-y-auto p-2">
                <div className="flex flex-col gap-1.5">
                  {results.map((item) => {
                    const isSelected = item.id === selectedId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={[
                          'flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition',
                          isSelected
                            ? 'border-blue-200 bg-linear-to-r from-blue-50 to-violet-50 shadow-sm'
                            : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-slate-700">
                            {item.code}. {item.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {item.stage} • {item.duration}
                          </div>
                        </div>
                        <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                          {item.mood}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
          {submitError ? (
            <div className="mr-auto rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-500">
              {submitError}
            </div>
          ) : null}
          <button
            type="button"
            disabled={!selectedItem || isSubmitting}
            onClick={() => {
              void handleDuplicate();
            }}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-[14px] font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Copy className="h-4 w-4" />
            {isSubmitting ? 'Duplicating...' : 'Duplicate'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-red-500 px-5 text-[14px] font-semibold text-white transition hover:bg-red-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function DateInput({
  value,
  onChange,
  align = 'left',
}: {
  value: Date;
  onChange: (date: Date) => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(value.getFullYear(), value.getMonth(), 1)
  );
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const days = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = (firstDay + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const isSameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  const formatDisplayDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
  };

  const monthLabel = visibleMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-[13px] font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
      >
        <span>{formatDisplayDate(value)}</span>
        <CalendarDays className="h-4 w-4 text-slate-500" />
      </button>

      {open ? (
        <div
          className={[
            'absolute top-[calc(100%+0.5rem)] z-50 w-[280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.14)]',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-sm font-semibold text-slate-700">{monthLabel}</div>

            <button
              type="button"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
              <div
                key={day}
                className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((date) => {
              const isSelected = isSameDay(date, value);
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isToday = isSameDay(date, new Date());

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(date);
                    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                    setOpen(false);
                  }}
                  className={[
                    'flex h-8 items-center justify-center rounded-lg text-sm transition',
                    isSelected
                      ? 'bg-gradient-to-r from-blue-500 to-violet-500 font-semibold text-white shadow-sm'
                      : isCurrentMonth
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'text-slate-300 hover:bg-slate-50',
                    !isSelected && isToday ? 'ring-1 ring-blue-200' : '',
                  ].join(' ')}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
