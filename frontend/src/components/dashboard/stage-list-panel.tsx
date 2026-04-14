import { useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Copy,
  FileVideo,
  Filter,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { StageCategory, StageItem, StageKey } from '@/types/dashboard';

type StageListPanelProps = {
  categories: StageCategory[];
  activeStage: StageKey;
  items: StageItem[];
  selectedItemId: string;
  errorMessage?: string;
  onStageChange: (stage: StageKey) => void;
  onSelectItem: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onDeleteItem: (id: string) => void;
  onOpenUpload: () => void;
  onOpenDuplicate: () => void;
  onToggleHideCompleted: () => void;
  hideCompleted: boolean;
};

type SortableStageCardProps = {
  item: StageItem;
  isActive: boolean;
  onSelectItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
};

function SortableStageCard({
  item,
  isActive,
  onSelectItem,
  onDeleteItem,
}: SortableStageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelectItem(item.id)}
      className={cn(
        'group relative flex cursor-pointer items-center gap-2 rounded-xl border px-2 py-2 transition-all duration-200 transform-gpu will-change-transform',
        isActive
          ? 'border-blue-200 bg-linear-to-r from-blue-50 to-violet-50 shadow-sm'
          : 'border-transparent hover:bg-gray-50',
        isDragging
          ? 'scale-[1.02] border-gray-200 bg-white opacity-70 shadow-xl'
          : '',
      )}
    >
      {isActive && !isDragging ? (
        <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
      ) : null}

      <button
        type="button"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded-md p-0.5 touch-none"
      >
        <GripVertical
          className={cn(
            'h-3.5 w-3.5 cursor-grab transition active:cursor-grabbing',
            isActive ? 'text-blue-300' : 'text-gray-200 group-hover:text-gray-400',
          )}
        />
      </button>

      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition',
          isActive ? 'bg-blue-100' : 'bg-gray-100 group-hover:bg-gray-200',
        )}
      >
        <FileVideo
          className={cn(
            'h-3 w-3 transition',
            isActive ? 'text-blue-600' : 'text-gray-400',
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-xs font-medium transition',
            isActive ? 'text-blue-700' : 'text-gray-600 group-hover:text-gray-800',
          )}
        >
          {item.code}. {item.name}
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDeleteItem(item.id);
        }}
        className="rounded-lg p-1 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function StageListPanel({
  categories,
  activeStage,
  items,
  selectedItemId,
  errorMessage,
  onStageChange,
  onSelectItem,
  onReorder,
  onDeleteItem,
  onOpenUpload,
  onOpenDuplicate,
  onToggleHideCompleted,
  hideCompleted,
}: StageListPanelProps) {
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    isMouseDown: false,
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleTabsMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tabsScrollRef.current) return;

    dragStateRef.current = {
      isMouseDown: true,
      isDragging: false,
      startX: e.clientX,
      scrollLeft: tabsScrollRef.current.scrollLeft,
    };
  };

  const handleTabsMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = tabsScrollRef.current;
    if (!container || !dragStateRef.current.isMouseDown) return;

    const deltaX = e.clientX - dragStateRef.current.startX;
    if (!dragStateRef.current.isDragging && Math.abs(deltaX) > 4) {
      dragStateRef.current.isDragging = true;
    }

    if (!dragStateRef.current.isDragging) return;

    container.scrollLeft = dragStateRef.current.scrollLeft - deltaX;
  };

  const handleTabsMouseUp = () => {
    dragStateRef.current.isMouseDown = false;

    window.setTimeout(() => {
      dragStateRef.current.isDragging = false;
    }, 0);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);

    if (!over || active.id === over.id) {
      return;
    }

    onReorder(String(active.id), String(over.id));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
            <span className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">
              Stage List
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onToggleHideCompleted}
              title={
                hideCompleted ? 'Show completed items' : 'Hide completed items'
              }
              className={cn(
                'rounded-lg p-1.5 transition',
                hideCompleted
                  ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onOpenDuplicate}
              title="Duplicate"
              className="rounded-lg bg-violet-50 p-1.5 text-violet-600 transition hover:bg-violet-100"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onOpenUpload}
              title="Add"
              className="rounded-lg bg-blue-50 p-1.5 text-blue-600 transition hover:bg-blue-100"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-2 pt-2 pb-1">
        <div
          ref={tabsScrollRef}
          className="tabs-scroll overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1"
          onMouseDown={handleTabsMouseDown}
          onMouseMove={handleTabsMouseMove}
          onMouseUp={handleTabsMouseUp}
          onMouseLeave={handleTabsMouseUp}
        >
          <div className="flex min-w-max gap-1">
            {categories.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onStageChange(tab.value)}
                className={cn(
                  'h-9 shrink-0 whitespace-nowrap rounded-xl px-3 text-[11px] font-semibold tracking-wide transition-all',
                  activeStage === tab.value
                    ? 'bg-white text-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600',
                )}
                onDragStart={(e) => e.preventDefault()}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        <div className={cn('flex flex-col gap-0.5', items.length === 0 ? 'h-full' : '')}>
          {errorMessage ? (
            <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
              {errorMessage}
            </div>
          ) : null}

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                <FileVideo className="h-5 w-5 text-gray-300" />
              </div>
              <p className="text-[11px] text-gray-400">No stages yet</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }) => setActiveDragId(String(active.id))}
              onDragCancel={() => setActiveDragId(null)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableStageCard
                    key={item.id}
                    item={item}
                    isActive={selectedItemId === item.id || activeDragId === item.id}
                    onSelectItem={onSelectItem}
                    onDeleteItem={onDeleteItem}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}
