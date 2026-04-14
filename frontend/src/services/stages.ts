import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import type { StageFilters, StageItem, StageKey } from '@/types/dashboard';

const FILE_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api'
).replace(/\/api$/, '');

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    if (error.code === 'ERR_CANCELED') {
      return 'Upload canceled.';
    }

    return (
      (typeof error.response?.data?.message === 'string' && error.response.data.message) ||
      (error.code === 'ECONNABORTED' ? 'Request timed out.' : error.message) ||
      fallback
    );
  }

  return error instanceof Error ? error.message : fallback;
}

function mapStageItem(item: StageItem): StageItem {
  return {
    ...item,
    videoUrl: item.videoUrl
      ? item.videoUrl.startsWith('http')
        ? item.videoUrl
        : `${FILE_BASE_URL}${item.videoUrl}`
      : undefined,
  };
}

export async function fetchStages(filters?: Partial<StageFilters>) {
  try {
    const params = Object.fromEntries(
      Object.entries(filters ?? {}).filter(([, value]) => {
        if (typeof value !== 'string') {
          return false;
        }

        const normalized = value.trim();
        return normalized !== '' && normalized.toUpperCase() !== 'CHOOSE OPTION';
      }),
    );

    const { data } = await apiClient.get<{ stages?: StageItem[] }>('/stages', {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return (data.stages ?? []).map(mapStageItem);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to load stage items.'));
  }
}

export async function createStages(payload: {
  date: string;
  season: string;
  stageCode: string;
  cutDie: string;
  area: StageKey;
  article: string;
  files: File[];
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}) {
  try {
    const formData = new FormData();
    formData.append('date', payload.date);
    formData.append('season', payload.season);
    formData.append('stageCode', payload.stageCode);
    formData.append('cutDie', payload.cutDie);
    formData.append('area', payload.area);
    formData.append('article', payload.article);
    payload.files.forEach((file) => {
      formData.append('files', file);
    });

    const { data } = await apiClient.post<{ stages?: StageItem[] }>('/stages', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 0,
      signal: payload.signal,
      onUploadProgress: (progressEvent) => {
        if (!payload.onProgress || !progressEvent.total) {
          return;
        }

        const percent = Math.min(
          100,
          Math.max(0, Math.round((progressEvent.loaded * 100) / progressEvent.total)),
        );
        payload.onProgress(percent);
      },
    });
    return (data.stages ?? []).map(mapStageItem);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create stage items.'));
  }
}

export async function deleteStage(id: string) {
  try {
    await apiClient.delete(`/stages/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete stage item.'));
  }
}

export async function reorderStages(payload: { stage: StageKey; orderedIds: string[] }) {
  try {
    await apiClient.patch('/stages/reorder', payload);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to save stage order.'));
  }
}

export async function duplicateStage(payload: {
  sourceId: string;
  targetArea: StageKey;
}) {
  try {
    const { data } = await apiClient.post<{ stage: StageItem }>('/stages/duplicate', payload);
    return mapStageItem(data.stage);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to duplicate stage item.'));
  }
}
