import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import { localDb } from '@/lib/local-db';
import { isNetworkOfflineError, isOffline } from '@/lib/offline-api';
import type { ControlSessionItem } from '@/types/dashboard';

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

export async function fetchControlSession(filters?: {
  stageItemId?: string;
  stageCode?: string;
}) {
  try {
    const { data } = await apiClient.get<{ session?: ControlSessionItem | null }>(
      '/control-session',
      {
        params:
          filters?.stageItemId || filters?.stageCode
            ? {
                ...(filters.stageItemId ? { stageItemId: filters.stageItemId } : {}),
                ...(filters.stageCode ? { stageCode: filters.stageCode } : {}),
              }
            : undefined,
      },
    );

    const session = data.session ?? null;
    if (session) void localDb.putControlSession(session);
    return session;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      if (filters?.stageItemId) {
        return localDb.getControlSessionByStageItemId(filters.stageItemId);
      }
      if (filters?.stageCode) {
        return localDb.getControlSessionByStageCode(filters.stageCode);
      }
      return null;
    }
    throw new Error(getErrorMessage(error, 'Unable to load control session.'));
  }
}

export async function saveControlSession(payload: {
  stageItemId?: string;
  stageCode: string;
  elapsed: number;
  isRunning: boolean;
  segmentStart: number;
  nva?: number | null;
  va?: number | null;
  skip?: number | null;
}) {
  try {
    const { data } = await apiClient.put<{ session: ControlSessionItem }>(
      '/control-session',
      payload,
    );
    void localDb.putControlSession(data.session);
    return data.session;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      // Optimistic: build a local session object and queue the save
      const optimistic: ControlSessionItem = {
        id: `temp-${payload.stageCode}`,
        stageItemId: payload.stageItemId ?? null,
        stageCode: payload.stageCode,
        elapsed: payload.elapsed,
        isRunning: payload.isRunning,
        segmentStart: payload.segmentStart,
        nva: payload.nva ?? null,
        va: payload.va ?? null,
        skip: payload.skip ?? null,
      };
      void localDb.putControlSession(optimistic);
      void localDb.enqueueSync({
        method: 'PUT',
        endpoint: '/control-session',
        payload,
        resource: 'control-session',
      });
      return optimistic;
    }
    throw new Error(getErrorMessage(error, 'Unable to save control session.'));
  }
}
