import { apiClient } from '@/lib/api-client';

export type DeleteLogItem = {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  actorUserId: string | null;
  actorUsername: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type ListDeleteLogsResponse = {
  logs: DeleteLogItem[];
};

export type DeleteLogFilters = {
  entityType?: string;
  username?: string;
  search?: string;
};

export async function fetchDeleteLogs(filters: DeleteLogFilters = {}) {
  const response = await apiClient.get<ListDeleteLogsResponse>('/delete-logs', {
    params: {
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.username ? { username: filters.username } : {}),
      ...(filters.search ? { search: filters.search } : {}),
    },
  });
  return response.data.logs;
}
