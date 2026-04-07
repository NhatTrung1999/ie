import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
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

export async function fetchControlSession(stageCode?: string) {
  try {
    const { data } = await apiClient.get<{ session?: ControlSessionItem | null }>(
      '/control-session',
      {
        params: stageCode ? { stageCode } : undefined,
      },
    );

    return data.session ?? null;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to load control session.'));
  }
}

export async function saveControlSession(payload: {
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
    return data.session;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to save control session.'));
  }
}
