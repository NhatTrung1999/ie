import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import { localDb } from '@/lib/local-db';
import { isNetworkOfflineError, isOffline } from '@/lib/offline-api';

export type MachineTypeItem = {
  id: string;
  department: string;
  label: string;
  labelCn: string;
  labelVn: string;
  loss: string;
};

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

export async function fetchMachineTypes(department?: string) {
  try {
    const { data } = await apiClient.get<{ machineTypes?: MachineTypeItem[] }>('/machine-types', {
      params: department ? { department } : undefined,
    });
    const types = data.machineTypes ?? [];
    void localDb.putMachineTypes(types);
    return types;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      const cached = await localDb.getMachineTypes();
      return department ? cached.filter((t) => t.department === department) : cached;
    }
    throw new Error(getErrorMessage(error, 'Unable to load machine types.'));
  }
}
