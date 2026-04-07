import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import type { CtRow, StageKey } from '@/types/dashboard';

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

export async function fetchTableCt(params: {
  stage?: StageKey;
  stageCode?: string;
  stageItemId?: string;
}) {
  try {
    const { data } = await apiClient.get<{ rows?: CtRow[] }>('/table-ct', {
      params,
    });

    return data.rows ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to load table rows.'));
  }
}

export async function reorderTableCtRows(payload: {
  stage: StageKey;
  orderedIds: string[];
}) {
  try {
    await apiClient.patch('/table-ct/reorder', payload);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to save table row order.'));
  }
}

export async function updateTableCtRow(
  id: string,
  payload: {
    machineType?: string;
    confirmed?: boolean;
  },
) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}`, payload);
    return data.row;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to update table row.'));
  }
}

export async function updateTableCtMetrics(
  id: string,
  payload: {
    columnIndex: number;
    nvaValue?: number;
    vaValue?: number;
  },
) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}/metrics`, payload);
    return data.row;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to update table metrics.'));
  }
}

export async function markTableCtDone(id: string) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}/done`);
    return data.row;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to mark table row as done.'));
  }
}

export async function deleteTableCtRow(id: string) {
  try {
    await apiClient.delete(`/table-ct/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete table row.'));
  }
}

export async function exportTableCtWorkbook(payload: {
  stage?: StageKey;
  stageItemId?: string | null;
  rowIds: string[];
}) {
  try {
    const response = await apiClient.post('/table-ct/export', payload, {
      responseType: 'blob',
    });

    return response.data as Blob;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to export Time Study workbook.'));
  }
}

export async function exportLsaWorkbook(payload: {
  stage?: StageKey;
  stageItemId?: string | null;
  rowIds: string[];
}) {
  try {
    const response = await apiClient.post('/table-ct/export-lsa', payload, {
      responseType: 'blob',
    });

    return response.data as Blob;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to export LSA workbook.'));
  }
}
