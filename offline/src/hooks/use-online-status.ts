import { useEffect, useState } from 'react';
import { syncManager } from '@/lib/sync-manager';

export type OnlineStatus = {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
};

export function useOnlineStatus(): OnlineStatus {
  const [state, setState] = useState<OnlineStatus>({
    isOnline: navigator.onLine,
    pendingCount: 0,
    isSyncing: false,
  });

  useEffect(() => {
    // Subscribe to sync-manager updates (pending count + syncing flag)
    const unsubscribe = syncManager.subscribe((pendingCount, isSyncing) => {
      setState((prev) => ({ ...prev, pendingCount, isSyncing }));
    });

    // Track browser online/offline events
    const handleOnline = () => setState((prev) => ({ ...prev, isOnline: true }));
    const handleOffline = () => setState((prev) => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return state;
}
