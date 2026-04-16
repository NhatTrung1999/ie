import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import { localDb } from '@/lib/local-db';
import { isNetworkOfflineError, isOffline } from '@/lib/offline-api';
import type { StageCategory } from '@/types/dashboard';

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

export async function fetchStageCategories() {
  try {
    const { data } = await apiClient.get<{ categories?: StageCategory[] }>('/stage-categories');
    const categories = data.categories ?? [];
    void localDb.putStageCategories(categories);
    return categories;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      return localDb.getStageCategories();
    }
    throw new Error(getErrorMessage(error, 'Unable to load stage categories.'));
  }
}

export async function createStageCategory(payload: { value: string; label: string }) {
  try {
    const { data } = await apiClient.post<{ category: StageCategory }>(
      '/stage-categories',
      payload,
    );
    void localDb.putStageCategory(data.category);
    return data.category;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      const optimistic: StageCategory = {
        id: `temp-${crypto.randomUUID()}`,
        value: payload.value,
        label: payload.label,
      };
      void localDb.putStageCategory(optimistic);
      void localDb.enqueueSync({
        method: 'POST',
        endpoint: '/stage-categories',
        payload,
        resource: 'stage-categories',
      });
      return optimistic;
    }
    throw new Error(getErrorMessage(error, 'Unable to create stage category.'));
  }
}

export async function updateStageCategory(
  id: string,
  payload: { value?: string; label?: string },
) {
  try {
    const { data } = await apiClient.patch<{ category: StageCategory }>(
      `/stage-categories/${id}`,
      payload,
    );
    void localDb.putStageCategory(data.category);
    return data.category;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      const existing = (await localDb.getStageCategories()).find((c) => c.id === id);
      const optimistic: StageCategory = { ...existing!, ...payload };
      void localDb.putStageCategory(optimistic);
      void localDb.enqueueSync({
        method: 'PATCH',
        endpoint: `/stage-categories/${id}`,
        payload,
        resource: 'stage-categories',
      });
      return optimistic;
    }
    throw new Error(getErrorMessage(error, 'Unable to update stage category.'));
  }
}

export async function deleteStageCategory(id: string) {
  try {
    await apiClient.delete(`/stage-categories/${id}`);
    void localDb.deleteStageCategoryById(id);
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      void localDb.deleteStageCategoryById(id);
      if (!id.startsWith('temp-')) {
        void localDb.enqueueSync({
          method: 'DELETE',
          endpoint: `/stage-categories/${id}`,
          resource: 'stage-categories',
        });
      }
      return;
    }
    throw new Error(getErrorMessage(error, 'Unable to delete stage category.'));
  }
}
