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

export async function fetchHistory(stageCode?: string) {
  try {
    const { data } = await apiClient.get<{ items?: HistoryItem[] }>('/history', {
      params: stageCode ? { stageCode } : undefined,
    });

    return data.items ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to load history items.'));
  }
}

export async function createHistory(payload: {
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

export async function commitHistory(stageCode: string) {
  try {
    const { data } = await apiClient.patch<{ items?: HistoryItem[] }>('/history/commit', {
      stageCode,
    });

    return data.items ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to commit history items.'));
  }
}
