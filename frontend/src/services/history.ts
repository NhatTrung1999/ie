import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
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
    const { data } = await apiClient.get<{ items?: HistoryItem[] }>('/history', {
      params:
        filters?.stageItemId || filters?.stageCode
          ? {
              ...(filters.stageItemId ? { stageItemId: filters.stageItemId } : {}),
              ...(filters.stageCode ? { stageCode: filters.stageCode } : {}),
            }
          : undefined,
    });

    return data.items ?? [];
  } catch (error) {
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
    return data.item;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create history item.'));
  }
}

export async function deleteHistory(id: string) {
  try {
    await apiClient.delete(`/history/${id}`);
  } catch (error) {
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
    throw new Error(getErrorMessage(error, 'Unable to commit history items.'));
  }
}
