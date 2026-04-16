import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import { localDb } from '@/lib/local-db';
import { isNetworkOfflineError, isOffline } from '@/lib/offline-api';
import type { StageFilters, StageItem, StageKey } from '@/types/dashboard';

// In dev (proxy): relative path; in prod: full URL stripped of /api
const FILE_BASE_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL ?? 'http://192.168.18.42:3001/api').replace(/\/api$/, '');

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    if (error.code === 'ERR_CANCELED') return 'Upload canceled.';
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
      ? item.videoUrl.startsWith('http') || item.videoUrl.startsWith('/')
        ? item.videoUrl.startsWith('http')
          ? item.videoUrl
          : `${FILE_BASE_URL}${item.videoUrl}`
        : `${FILE_BASE_URL}${item.videoUrl}`
      : undefined,
  };
}

export async function fetchStages(filters?: Partial<StageFilters>) {
  try {
    const params = Object.fromEntries(
      Object.entries(filters ?? {}).filter(([, v]) => {
        if (typeof v !== 'string') return false;
        const n = v.trim();
        return n !== '' && n.toUpperCase() !== 'CHOOSE OPTION';
      }),
    );

    const { data } = await apiClient.get<{ stages?: StageItem[] }>('/stages', {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    const stages = (data.stages ?? []).map(mapStageItem);

    // Cache in IDB
    void localDb.putStages(stages);
    return stages;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      // Fallback: return cached stages (client-side filter)
      const cached = await localDb.getStages();
      const mapped = cached.map(mapStageItem);
      if (Object.keys(filters ?? {}).length === 0) return mapped;

      return mapped.filter((s) => {
        if (filters?.stage && s.stage !== filters.stage) return false;
        if (filters?.season && s.season !== filters.season) return false;
        if (filters?.area && s.area !== filters.area) return false;
        if (filters?.cutDie && s.cutDie !== filters.cutDie) return false;
        if (filters?.article && s.article !== filters.article) return false;
        return true;
      });
    }
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
  if (isOffline()) {
    throw new Error('Không thể upload video khi offline. Vui lòng kết nối mạng và thử lại.');
  }

  try {
    const formData = new FormData();
    formData.append('date', payload.date);
    formData.append('season', payload.season);
    formData.append('stageCode', payload.stageCode);
    formData.append('cutDie', payload.cutDie);
    formData.append('area', payload.area);
    formData.append('article', payload.article);
    payload.files.forEach((file) => formData.append('files', file));

    const { data } = await apiClient.post<{ stages?: StageItem[] }>('/stages', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      signal: payload.signal,
      onUploadProgress: (e) => {
        if (!payload.onProgress || !e.total) return;
        payload.onProgress(Math.min(100, Math.max(0, Math.round((e.loaded * 100) / e.total))));
      },
    });

    const stages = (data.stages ?? []).map(mapStageItem);
    void localDb.putStages(stages);
    return stages;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create stage items.'));
  }
}

export async function deleteStage(id: string) {
  try {
    await apiClient.delete(`/stages/${id}`);
    void localDb.deleteStage(id);
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      // Optimistic delete from IDB + queue
      void localDb.deleteStage(id);
      void localDb.enqueueSync({ method: 'DELETE', endpoint: `/stages/${id}`, resource: 'stages' });
      return;
    }
    throw new Error(getErrorMessage(error, 'Unable to delete stage item.'));
  }
}

export async function reorderStages(payload: { stage: StageKey; orderedIds: string[] }) {
  try {
    await apiClient.patch('/stages/reorder', payload);
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      void localDb.enqueueSync({ method: 'PATCH', endpoint: '/stages/reorder', payload, resource: 'stages' });
      return;
    }
    throw new Error(getErrorMessage(error, 'Unable to save stage order.'));
  }
}

export async function duplicateStage(payload: { sourceId: string; targetArea: StageKey }) {
  if (isOffline()) {
    throw new Error('Không thể nhân bản stage khi offline. Vui lòng kết nối mạng.');
  }
  try {
    const { data } = await apiClient.post<{ stage: StageItem }>('/stages/duplicate', payload);
    const stage = mapStageItem(data.stage);
    void localDb.putStages([stage]);
    return stage;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to duplicate stage item.'));
  }
}
