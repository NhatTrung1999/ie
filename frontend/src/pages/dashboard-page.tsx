import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ControlPanel } from '@/components/dashboard/control-panel';
import { CreateUserModal } from '@/components/dashboard/create-user-modal';
import { CtTablePanel } from '@/components/dashboard/ct-table-panel';
import { DeleteLogsModal } from '@/components/dashboard/delete-logs-modal';
import { DuplicateStageModal } from '@/components/dashboard/duplicate-stage-modal';
import { FilterPanel } from '@/components/dashboard/filter-panel';
import { HistoryPanel } from '@/components/dashboard/history-panel';
import { ManageStageCategoriesModal } from '@/components/dashboard/manage-stage-categories-modal';
import {
  PreviewPanel,
  type PreviewPlaybackRequest,
  type PreviewPlaybackState,
} from '@/components/dashboard/preview-panel';
import { StageListPanel } from '@/components/dashboard/stage-list-panel';
import { TopBar } from '@/components/dashboard/top-bar';
import { UploadVideoModal } from '@/components/dashboard/upload-video-modal';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { fetchStageCategories } from '@/services/stage-categories';
import { createStages, deleteStage, fetchStages, reorderStages } from '@/services/stages';
import { reorderTableCtRows } from '@/services/table-ct';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
  import {
  loadHistoryItems,
  appendStageItems,
  loadStages as loadStagesThunk,
  loadTableRows,
  removeStageItem,
  reorderStageItems,
  setActiveStage,
  setStageCategories,
  setHistoryItems,
  setSelectedCtCell,
  setSelectedItemId,
  setStageItems,
  setStageItemsError,
  setTableRows,
} from '@/store/slices/dashboard-slice';
import type { CtRow, StageFilters, StageItem, StageKey } from '@/types/dashboard';
import type { HistoryItem } from '@/types/dashboard';

type DashboardPageProps = {
  displayName: string;
  subtitle: string;
  onSignOut: () => void;
};

function reorderItems<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string
) {
  const fromIndex = items.findIndex((item) => item.id === activeId);
  const toIndex = items.findIndex((item) => item.id === overId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function sortRowsByStageItems(rows: CtRow[], items: StageItem[]) {
  const order = new Map(items.map((item, index) => [item.code.toUpperCase(), index]));

  return [...rows].sort((a, b) => {
    const aIndex = order.get(a.no.toUpperCase());
    const bIndex = order.get(b.no.toUpperCase());

    if (aIndex == null && bIndex == null) return 0;
    if (aIndex == null) return 1;
    if (bIndex == null) return -1;
    return aIndex - bIndex;
  });
}

export function DashboardPage({
  displayName,
  subtitle,
  onSignOut,
}: DashboardPageProps) {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    activeStage,
    orderedStageItems,
    selectedItemId,
    stageItemsError,
    tableRows,
    stageCategories,
  } =
    useAppSelector((state) => state.dashboard);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isDeleteLogsOpen, setIsDeleteLogsOpen] = useState(false);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [activeLinkedItemId, setActiveLinkedItemId] = useState<string | null>(null);
  const [hideCompletedStageItems, setHideCompletedStageItems] = useState(false);
  const [deletedHistoryItem, setDeletedHistoryItem] = useState<HistoryItem | null>(null);
  const [playbackState, setPlaybackState] = useState<PreviewPlaybackState>({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
  });
  const [playbackRequest, setPlaybackRequest] = useState<PreviewPlaybackRequest | null>(null);
  const [stageFilters, setStageFilters] = useState<StageFilters>(() =>
    getFiltersFromSearchParams(searchParams),
  );

  useEffect(() => {
    void fetchStageCategories()
      .then((categories) => {
        dispatch(setStageCategories(categories));
        if (!activeStage && categories[0]?.value) {
          dispatch(setActiveStage(categories[0].value));
        }
      })
      .catch(() => {});
  }, [activeStage, dispatch]);

  useEffect(() => {
    const nextFilters = getFiltersFromSearchParams(searchParams);

    setStageFilters((current) =>
      areStageFiltersEqual(current, nextFilters) ? current : nextFilters,
    );
  }, [searchParams]);

  useEffect(() => {
    const nextSearchParams = buildSearchParams(stageFilters);
    const currentSearch = searchParams.toString();
    const nextSearch = nextSearchParams.toString();

    if (currentSearch !== nextSearch) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, stageFilters]);

  const loadStages = async () => {
    const result = await dispatch(loadStagesThunk(stageFilters));

    if (loadStagesThunk.rejected.match(result)) {
      throw new Error(
        typeof result.payload === 'string'
          ? result.payload
          : 'Unable to load stage items.',
      );
    }
  };

  useEffect(() => {
    void loadStages()
      .catch((error) => {
        dispatch(setStageItemsError(
          error instanceof Error ? error.message : 'Unable to load stage items.',
        ));
      });
  }, [dispatch, stageFilters]);

  const filteredItems = useMemo(
    () =>
      orderedStageItems.filter(
        (item) =>
          item.stage === activeStage &&
          (!hideCompletedStageItems || !item.completed),
      ),
    [activeStage, hideCompletedStageItems, orderedStageItems]
  );

  const selectedItem =
    orderedStageItems.find((item) => item.id === selectedItemId) ?? undefined;
  const visibleCodes = useMemo(
    () => new Set(filteredItems.map((item) => item.code.toUpperCase())),
    [filteredItems],
  );
  const visibleTableRows = useMemo(
    () => tableRows.filter((row) => visibleCodes.has(row.no.toUpperCase())),
    [selectedItemId, tableRows, visibleCodes],
  );

  useEffect(() => {
    const selectedStageItem = orderedStageItems.find((item) => item.id === selectedItemId);

    if (!selectedStageItem) {
      void dispatch(
        loadTableRows({
          stage: activeStage,
        }),
      );
      return;
    }

    void dispatch(
      loadTableRows({
        stage: selectedStageItem.stage,
        stageCode: selectedStageItem.code,
        stageItemId: selectedStageItem.id,
      }),
    );
  }, [activeStage, dispatch, orderedStageItems, selectedItemId]);

  useEffect(() => {
    if (!selectedItem?.id) {
      dispatch(setHistoryItems([]));
      return;
    }

    void dispatch(
      loadHistoryItems({
        stageItemId: selectedItem.id,
        stageCode: selectedItem.code,
      }),
    );
  }, [dispatch, selectedItem?.code, selectedItem?.id]);

  useEffect(() => {
    if (!hideCompletedStageItems || !activeLinkedItemId) {
      return;
    }

    const activeLinkedItem = orderedStageItems.find((item) => item.id === activeLinkedItemId);
    if (!activeLinkedItem?.completed) {
      return;
    }

    setActiveLinkedItemId(null);
    dispatch(setSelectedItemId(''));
    dispatch(setHistoryItems([]));
    dispatch(setSelectedCtCell(null));
  }, [activeLinkedItemId, dispatch, hideCompletedStageItems, orderedStageItems]);

  useEffect(() => {
    const activeId = activeLinkedItemId ?? selectedItemId;

    if (!activeId) {
      return;
    }

    const itemStillVisible = filteredItems.some((item) => item.id === activeId);

    if (itemStillVisible) {
      return;
    }

    setActiveLinkedItemId(null);
    dispatch(setSelectedItemId(''));
    dispatch(setHistoryItems([]));
    dispatch(setSelectedCtCell(null));
  }, [activeLinkedItemId, dispatch, filteredItems, selectedItemId]);

  const handleRefreshTable = async () => {
    if (selectedItem) {
      await dispatch(
        loadTableRows({
          stage: selectedItem.stage,
          stageCode: selectedItem.code,
          stageItemId: selectedItem.id,
        }),
      );

      await dispatch(
        loadHistoryItems({
          stageItemId: selectedItem.id,
          stageCode: selectedItem.code,
        }),
      );
      return;
    }

    await dispatch(
      loadTableRows({
        stage: activeStage,
      }),
    );

    dispatch(setHistoryItems([]));
  };

  const handleStageReorder = (activeId: string, overId: string) => {
    const stageScoped = orderedStageItems.filter((item) => item.stage === activeStage);
    const reorderedScoped = reorderItems(stageScoped, activeId, overId);

    dispatch(setTableRows(sortRowsByStageItems(tableRows, reorderedScoped)));
    dispatch(
      reorderStageItems({
        stage: activeStage,
        reorderedScoped,
      }),
    );
    dispatch(setStageItemsError(''));

    void reorderStages({
      stage: activeStage,
      orderedIds: reorderedScoped.map((item) => item.id),
    }).catch((error) => {
      dispatch(setStageItemsError(
        error instanceof Error ? error.message : 'Unable to save stage order.',
      ));

      void loadStages().catch(() => {});
    });
  };

  const handleTableReorder = (activeNo: string, overNo: string) => {
    const activeId = tableRows.find((row) => row.no === activeNo)?.id;
    const overId = tableRows.find((row) => row.no === overNo)?.id;
    if (!activeId || !overId) return;

    const nextRows = reorderItems(tableRows, activeId, overId);
    const relevantCodes = new Set(nextRows.map((row) => row.no.toUpperCase()));
    const stageScoped = orderedStageItems.filter(
      (item) => item.stage === activeStage && relevantCodes.has(item.code.toUpperCase())
    );
    const orderedCodes = nextRows.map((row) => row.no.toUpperCase());
    const sortedScoped = [...stageScoped].sort(
      (a, b) =>
        orderedCodes.indexOf(a.code.toUpperCase()) -
        orderedCodes.indexOf(b.code.toUpperCase())
    );

    const scopedQueue = [...sortedScoped];
    const nextItems = orderedStageItems.map((item) => {
      if (item.stage !== activeStage || !relevantCodes.has(item.code.toUpperCase())) {
        return item;
      }
      return scopedQueue.shift() ?? item;
    });

    dispatch(setStageItems(nextItems));
    dispatch(setTableRows(nextRows));

    void reorderTableCtRows({
      stage: activeStage,
      orderedIds: nextRows.map((row) => row.id),
    }).catch(() => {
      void dispatch(
        loadTableRows({
          stage: activeStage,
        }),
      );
    });
  };

  const handleUpload = async (payload: {
    date: string;
    season: string;
    stageCode: string;
    cutDie: string;
    area: StageKey;
    article: string;
    files: File[];
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }) => {
    await createStages(payload);
    const refreshedItems = await fetchStages(stageFilters);

    dispatch(setStageItems(refreshedItems));
    dispatch(setActiveStage(payload.area));
    setIsUploadOpen(false);
  };

  const handleDeleteStage = async (id: string) => {
    const targetItem = orderedStageItems.find((item) => item.id === id);
    if (!targetItem) return;

    await deleteStage(id);

    dispatch(removeStageItem(id));

    if (selectedItemId === id) {
      dispatch(setSelectedItemId(''));
    }
    if (activeLinkedItemId === id) {
      setActiveLinkedItemId(null);
    }

    dispatch(
      setTableRows(
        tableRows.filter((row) => row.no.toUpperCase() !== targetItem.code.toUpperCase()),
      ),
    );

    dispatch(setStageItemsError(''));
  };

  const handleDuplicate = (items: StageItem[], targetArea: StageKey) => {
    dispatch(appendStageItems(items));
    dispatch(setActiveStage(targetArea));
    setIsDuplicateOpen(false);
  };

  useEffect(() => {
    if (!activeLinkedItemId) {
      return;
    }

    const itemStillExists = orderedStageItems.some((item) => item.id === activeLinkedItemId);
    if (!itemStillExists) {
      setActiveLinkedItemId(null);
    }
  }, [activeLinkedItemId, orderedStageItems]);

  const issuePlaybackRequest = (
    request:
      | { type: 'play' }
      | { type: 'pause' }
      | { type: 'seek'; time: number },
  ) => {
    setPlaybackRequest({
      ...request,
      token: Date.now(),
    } as PreviewPlaybackRequest);
  };

  return (
    <DashboardLayout
      topBar={
        <TopBar
          onOpenFilter={() => setIsFilterOpen(true)}
          onOpenCreateUser={() => setIsCreateUserOpen(true)}
          onOpenDeleteLogs={() => setIsDeleteLogsOpen(true)}
          onOpenManageStageCategories={() => setIsManageCategoriesOpen(true)}
          onSignOut={onSignOut}
          displayName={displayName}
          subtitle={subtitle}
        />
      }
      sidebar={
        <StageListPanel
          categories={stageCategories}
          activeStage={activeStage}
          items={filteredItems}
          selectedItemId={activeLinkedItemId ?? ''}
          onStageChange={(value) => {
            dispatch(setActiveStage(value));
            dispatch(setSelectedItemId(''));
            dispatch(setTableRows([]));
            dispatch(setHistoryItems([]));
            setActiveLinkedItemId(null);
          }}
          onSelectItem={(value) => {
            if (activeLinkedItemId === value) {
              dispatch(setSelectedItemId(''));
              dispatch(setHistoryItems([]));
              dispatch(setSelectedCtCell(null));
              setActiveLinkedItemId(null);
              return;
            }

            setActiveLinkedItemId(value);
            dispatch(setSelectedItemId(value));
          }}
          onReorder={handleStageReorder}
          onDeleteItem={handleDeleteStage}
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenDuplicate={() => setIsDuplicateOpen(true)}
          onToggleHideCompleted={() => setHideCompletedStageItems((value) => !value)}
          hideCompleted={hideCompletedStageItems}
          errorMessage={stageItemsError}
        />
      }
      controlPanel={
        <>
          <ControlPanel
            playbackState={playbackState}
            onPlay={() => issuePlaybackRequest({ type: 'play' })}
            onPause={() => issuePlaybackRequest({ type: 'pause' })}
            onSeek={(time) => issuePlaybackRequest({ type: 'seek', time })}
            deletedHistoryItem={deletedHistoryItem}
          />
          <HistoryPanel
            onSelectItem={(item) => {
              issuePlaybackRequest({ type: 'pause' });
              issuePlaybackRequest({ type: 'seek', time: item.startTime });
            }}
            onDeleteApplied={(item) => {
              setDeletedHistoryItem(item);
            }}
          />
        </>
      }
      content={
        <>
          <PreviewPanel
            selectedItem={selectedItem}
            playbackRequest={playbackRequest}
            onPlaybackStateChange={setPlaybackState}
          />
          <CtTablePanel
            rows={visibleTableRows}
            activeStageItemId={activeLinkedItemId}
            onReorder={handleTableReorder}
            onRefresh={handleRefreshTable}
            onToggleStageItemActive={(stageItemId) => {
              setActiveLinkedItemId(stageItemId);
              if (!stageItemId) {
                dispatch(setSelectedItemId(''));
                dispatch(setHistoryItems([]));
                dispatch(setSelectedCtCell(null));
                return;
              }

              if (stageItemId !== selectedItemId) {
                dispatch(setSelectedItemId(stageItemId));
              }
            }}
          />
        </>
      }
      overlay={
        <>
          <FilterPanel
            open={isFilterOpen}
            categories={stageCategories}
            onClose={() => setIsFilterOpen(false)}
            value={stageFilters}
            onApply={setStageFilters}
            onReset={() =>
              setStageFilters({
                dateFrom: getTodayFilterDate(),
                dateTo: getTodayFilterDate(),
                season: '',
                stage: '',
                cutDie: '',
                area: '',
                article: '',
              })
            }
          />
          <DuplicateStageModal
            open={isDuplicateOpen}
            categories={stageCategories}
            defaultArea={activeStage}
            onClose={() => setIsDuplicateOpen(false)}
            onDuplicate={handleDuplicate}
          />
          <UploadVideoModal
            open={isUploadOpen}
            categories={stageCategories}
            defaultArea={activeStage}
            onClose={() => setIsUploadOpen(false)}
            onUpload={handleUpload}
          />
      <CreateUserModal
        open={isCreateUserOpen}
        onClose={() => setIsCreateUserOpen(false)}
      />
      <DeleteLogsModal
        open={isDeleteLogsOpen}
        onClose={() => setIsDeleteLogsOpen(false)}
      />
      <ManageStageCategoriesModal
        open={isManageCategoriesOpen}
        onClose={() => setIsManageCategoriesOpen(false)}
        onChanged={(categories) => {
          dispatch(setStageCategories(categories));
          if (!categories.some((category) => category.value === activeStage)) {
            const nextStage = categories[0]?.value ?? '';
            dispatch(setActiveStage(nextStage));
          }
        }}
      />
        </>
      }
    />
  );
}

function getFiltersFromSearchParams(searchParams: URLSearchParams): StageFilters {
  const today = getTodayFilterDate();

  return {
    dateFrom: searchParams.get('dateFrom') ?? today,
    dateTo: searchParams.get('dateTo') ?? today,
    season: searchParams.get('season') ?? '',
    stage: searchParams.get('stage') ?? '',
    cutDie: searchParams.get('cutDie') ?? '',
    area: searchParams.get('area') ?? '',
    article: searchParams.get('article') ?? '',
  };
}

function buildSearchParams(filters: StageFilters) {
  const next = new URLSearchParams();

  (Object.entries(filters) as Array<[keyof StageFilters, string]>).forEach(([key, value]) => {
    const normalized = value.trim();

    if (normalized) {
      next.set(key, normalized);
    }
  });

  return next;
}

function areStageFiltersEqual(left: StageFilters, right: StageFilters) {
  return (
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo &&
    left.season === right.season &&
    left.stage === right.stage &&
    left.cutDie === right.cutDie &&
    left.area === right.area &&
    left.article === right.article
  );
}

function getTodayFilterDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
