import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import { localDb } from '@/lib/local-db';
import { isNetworkOfflineError, isOffline } from '@/lib/offline-api';
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

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchTableCt(params: {
  stage?: StageKey;
  stageCode?: string;
  stageItemId?: string;
}) {
  try {
    const { data } = await apiClient.get<{ rows?: CtRow[] }>('/table-ct', { params });
    const rows = data.rows ?? [];
    void localDb.putTableCtRows(rows, params.stageCode);
    return rows;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      if (params.stageItemId) return localDb.getTableCtRowsByStageItemId(params.stageItemId);
      if (params.stageCode) return localDb.getTableCtRowsByStageCode(params.stageCode);
      const all = await localDb.getAllTableCtRows();
      return params.stage ? all.filter((r) => (r as CtRow & { stage?: string }).stage === params.stage) : all;
    }
    throw new Error(getErrorMessage(error, 'Unable to load table rows.'));
  }
}

// ─── Reorder ──────────────────────────────────────────────────────────────────

export async function reorderTableCtRows(payload: { stage: StageKey; orderedIds: string[] }) {
  try {
    await apiClient.patch('/table-ct/reorder', payload);
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      void localDb.enqueueSync({
        method: 'PATCH',
        endpoint: '/table-ct/reorder',
        payload,
        resource: 'table-ct',
      });
      return;
    }
    throw new Error(getErrorMessage(error, 'Unable to save table row order.'));
  }
}

// ─── Update row ───────────────────────────────────────────────────────────────

export async function updateTableCtRow(
  id: string,
  payload: { machineType?: string; confirmed?: boolean },
) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}`, payload);
    void localDb.putTableCtRow(data.row);
    return data.row;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      const existing = await localDb.getTableCtRow(id);
      if (existing) {
        const optimistic = { ...existing, ...payload };
        void localDb.putTableCtRow(optimistic);
        void localDb.enqueueSync({
          method: 'PATCH',
          endpoint: `/table-ct/${id}`,
          payload,
          resource: 'table-ct',
        });
        return optimistic;
      }
    }
    throw new Error(getErrorMessage(error, 'Unable to update table row.'));
  }
}

// ─── Confirm rows ─────────────────────────────────────────────────────────────

export async function confirmTableCtRows(payload: { ids: string[]; confirmed?: boolean }) {
  try {
    const { data } = await apiClient.patch<{ rows: CtRow[] }>('/table-ct/confirm', payload);
    const rows = data.rows ?? [];
    await Promise.all(rows.map((r) => localDb.putTableCtRow(r)));
    return rows;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      // Optimistic: update each row locally
      const results: CtRow[] = [];
      for (const id of payload.ids) {
        const existing = await localDb.getTableCtRow(id);
        if (existing) {
          const updated = { ...existing, confirmed: payload.confirmed ?? true };
          void localDb.putTableCtRow(updated);
          results.push(updated);
        }
      }
      void localDb.enqueueSync({
        method: 'PATCH',
        endpoint: '/table-ct/confirm',
        payload,
        resource: 'table-ct',
      });
      return results;
    }
    throw new Error(getErrorMessage(error, 'Unable to confirm table rows.'));
  }
}

// ─── Update metrics ───────────────────────────────────────────────────────────

export async function updateTableCtMetrics(
  id: string,
  payload: { columnIndex: number; nvaValue?: number; vaValue?: number },
) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}/metrics`, payload);
    void localDb.putTableCtRow(data.row);
    return data.row;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      const existing = await localDb.getTableCtRow(id);
      if (existing) {
        // Update nvaValues / vaValues at columnIndex
        const nvaValues = [...existing.nvaValues];
        const vaValues = [...existing.vaValues];
        if (payload.nvaValue !== undefined) nvaValues[payload.columnIndex] = payload.nvaValue;
        if (payload.vaValue !== undefined) vaValues[payload.columnIndex] = payload.vaValue;
        const optimistic = { ...existing, nvaValues, vaValues };
        void localDb.putTableCtRow(optimistic);
        void localDb.enqueueSync({
          method: 'PATCH',
          endpoint: `/table-ct/${id}/metrics`,
          payload,
          resource: 'table-ct',
        });
        return optimistic;
      }
    }
    throw new Error(getErrorMessage(error, 'Unable to update table metrics.'));
  }
}

// ─── Mark done ────────────────────────────────────────────────────────────────

export async function markTableCtDone(id: string) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}/done`);
    void localDb.putTableCtRow(data.row);
    return data.row;
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      const existing = await localDb.getTableCtRow(id);
      if (existing) {
        const optimistic = { ...existing, done: true };
        void localDb.putTableCtRow(optimistic);
        void localDb.enqueueSync({
          method: 'PATCH',
          endpoint: `/table-ct/${id}/done`,
          resource: 'table-ct',
        });
        return optimistic;
      }
    }
    throw new Error(getErrorMessage(error, 'Unable to mark table row as done.'));
  }
}

// ─── Delete row ───────────────────────────────────────────────────────────────

export async function deleteTableCtRow(id: string) {
  try {
    await apiClient.delete(`/table-ct/${id}`);
    void localDb.deleteTableCtRow(id);
  } catch (error) {
    if (isNetworkOfflineError(error) || isOffline()) {
      void localDb.deleteTableCtRow(id);
      void localDb.enqueueSync({
        method: 'DELETE',
        endpoint: `/table-ct/${id}`,
        resource: 'table-ct',
      });
      return;
    }
    throw new Error(getErrorMessage(error, 'Unable to delete table row.'));
  }
}

// ─── Export (requires server) ─────────────────────────────────────────────────

export async function exportTableCtWorkbook(payload: {
  stage?: StageKey;
  stageItemId?: string | null;
  rowIds: string[];
}) {
  if (isOffline()) {
    throw new Error('Xuất Excel yêu cầu kết nối mạng. Vui lòng kết nối và thử lại.');
  }
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
  estimateOutputPairs?: number;
  workingTimeSeconds?: number;
  taktTimeSeconds?: number;
  manpowerStandardLabor?: number;
  capacityPerHour?: number;
  totalCtSeconds?: number;
}) {
  if (isOffline()) {
    throw new Error('Xuất LSA yêu cầu kết nối mạng. Vui lòng kết nối và thử lại.');
  }
  try {
    const response = await apiClient.post('/table-ct/export-lsa', payload, {
      responseType: 'blob',
    });
    return response.data as Blob;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to export LSA workbook.'));
  }
}
