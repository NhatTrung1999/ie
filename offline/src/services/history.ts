import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import { localDb } from '@/lib/local-db';
import { isNetworkOfflineError, isOffline } from '@/lib/offline-api';
import type { HistoryItem } from '@/types/dashboard';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    return (
      (typeof error.response?.data?.message === 'string' && error.response.data.message) ||
      (error.code === 'ECONNABORTED' ? 'Request timed out.' : error.message) ||
      fallback
    );
  }
  return error instanceof Error ? error.message : fallback;
}

export async function fetchHistory(filters?: { stageItemId?: string; stageCode?: string }) {
  try {
    const params =
      filters?.stageItemId || filters?.stageCode
        ? {
            ...(filters.stageItemId ? { stageItemId: filters.stageItemId } : {}),
            ...(filters.stageCode ? { stageCode: filters.stageCode } : {}),
          }
        : undefined;

    const { data } = await apiClient.get<{ items?: HistoryItem[] }>('/history', { params });
    const items = data.items ?? [];

    // Cache in IDB
    void localDb.putHistoryEntries(items, {
      stageCode: filters?.stageCode,
      stageItemId: filters?.stageItemId,
    });
    return items;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      if (filters?.stageItemId) return localDb.getHistoryByStageItemId(filters.stageItemId);
      if (filters?.stageCode) return localDb.getHistoryByStageCode(filters.stageCode);
      return [];
    }
    throw new Error(getErrorMessage(error, 'Unable to load history items.'));
  }
}

export async function createHistory(payload: {
  stageItemId?: string;
  stageCode: string;
  startTime: number;
  endTime: number;
  type: 'NVA' | 'VA' | 'SKIP';
  value: number;
}) {
  try {
    const { data } = await apiClient.post<{ item: HistoryItem }>('/history', payload);
    void localDb.putHistoryEntry(data.item, {
      stageCode: payload.stageCode,
      stageItemId: payload.stageItemId,
    });
    return data.item;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      // Create optimistic entry with a temporary ID
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: HistoryItem = {
        id: tempId,
        startTime: payload.startTime,
        endTime: payload.endTime,
        range: `${payload.startTime.toFixed(2)}s – ${payload.endTime.toFixed(2)}s`,
        label: payload.type,
        committed: false,
      };
      void localDb.putHistoryEntry(optimistic, {
        stageCode: payload.stageCode,
        stageItemId: payload.stageItemId,
      });
      void localDb.enqueueSync({
        method: 'POST',
        endpoint: '/history',
        payload,
        resource: 'history',
      });
      return optimistic;
    }
    throw new Error(getErrorMessage(error, 'Unable to create history item.'));
  }
}

export async function deleteHistory(id: string) {
  try {
    await apiClient.delete(`/history/${id}`);
    void localDb.deleteHistoryEntry(id);
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      void localDb.deleteHistoryEntry(id);
      // Only queue if it's a real server ID (not a temp offline ID)
      if (!id.startsWith('temp-')) {
        void localDb.enqueueSync({
          method: 'DELETE',
          endpoint: `/history/${id}`,
          resource: 'history',
        });
      }
      return;
    }
    throw new Error(getErrorMessage(error, 'Unable to delete history item.'));
  }
}

export async function commitHistory(payload: { stageItemId?: string; stageCode?: string }) {
  try {
    const { data } = await apiClient.patch<{ items?: HistoryItem[] }>('/history/commit', {
      ...(payload.stageItemId ? { stageItemId: payload.stageItemId } : {}),
      ...(payload.stageCode ? { stageCode: payload.stageCode } : {}),
    });
    return data.items ?? [];
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      void localDb.enqueueSync({
        method: 'PATCH',
        endpoint: '/history/commit',
        payload,
        resource: 'history',
      });
      // Return local history marked as committed
      const items = payload.stageItemId
        ? await localDb.getHistoryByStageItemId(payload.stageItemId)
        : payload.stageCode
          ? await localDb.getHistoryByStageCode(payload.stageCode)
          : [];
      return items.map((i) => ({ ...i, committed: true }));
    }
    throw new Error(getErrorMessage(error, 'Unable to commit history items.'));
  }
}
