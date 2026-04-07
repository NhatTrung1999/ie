import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';

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
    return data.machineTypes ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to load machine types.'));
  }
}
