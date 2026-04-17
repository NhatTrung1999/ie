import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronRight,
  LogOut,
  SlidersHorizontal,
  UserPlus,
  Video,
  ClipboardList,
  PanelsTopLeft,
  Share2,
  RefreshCw,
  Wifi,
  WifiOff,
  Monitor,
} from 'lucide-react';
import { isElectron, electronBridge, type SyncStatus } from '@/lib/electron-bridge';

type TopBarProps = {
  onOpenFilter: () => void;
  onSignOut: () => void;
  onOpenCreateUser: () => void;
  onOpenDeleteLogs: () => void;
  onOpenManageStageCategories: () => void;
  onOpenShareData?: () => void;
  displayName: string;
  subtitle: string;
};

export function TopBar({
  onOpenFilter,
  onSignOut,
  onOpenCreateUser,
  onOpenDeleteLogs,
  onOpenManageStageCategories,
  onOpenShareData,
  displayName,
  subtitle,
}: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Offline-only state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncAt: null,
    isSyncing: false,
    pendingCount: 0,
    error: null,
  });
  const [isOnline, setIsOnline] = useState(false);
  const offline = isElectron();

  // Khởi tạo sync status và network state
  useEffect(() => {
    if (!offline) return;

    void electronBridge.getSyncStatus().then(setSyncStatus);
    void electronBridge.isOnline().then(setIsOnline);

    // Lắng nghe events từ main process
    const unsubOnline = electronBridge.onNetworkOnline(() => setIsOnline(true));
    const unsubOffline = electronBridge.onNetworkOffline(() => setIsOnline(false));
    const unsubSync = electronBridge.onSyncCompleted((status) => setSyncStatus(status));

    return () => {
      unsubOnline();
      unsubOffline();
      unsubSync();
    };
  }, [offline]);

  const handleTriggerSync = useCallback(async () => {
    if (syncStatus.isSyncing) return;
    setSyncStatus((s) => ({ ...s, isSyncing: true }));
    const result = await electronBridge.triggerSync();
    if (!result.success && result.error) {
      setSyncStatus((s) => ({ ...s, isSyncing: false, error: result.error ?? null }));
    }
    // Status update sẽ đến qua onSyncCompleted event
  }, [syncStatus.isSyncing]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizedDisplayName = displayName.trim().toLowerCase();
  const isAdminUser =
    normalizedDisplayName === 'administrator' || normalizedDisplayName === 'admin';

  // Sync badge UI
  const SyncBadge = () => {
    if (!offline) return null;

    if (syncStatus.isSyncing) {
      return (
        <div className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">Đang sync...</span>
        </div>
      );
    }

    if (!isOnline) {
      return (
        <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
          <WifiOff className="h-3 w-3" />
          <span className="hidden sm:inline">Offline</span>
          {syncStatus.pendingCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
              {syncStatus.pendingCount > 9 ? '9+' : syncStatus.pendingCount}
            </span>
          )}
        </div>
      );
    }

    return (
      <button
        onClick={handleTriggerSync}
        title={syncStatus.lastSyncAt ? `Lần cuối sync: ${new Date(syncStatus.lastSyncAt).toLocaleTimeString('vi-VN')}` : 'Chưa sync'}
        className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-100"
      >
        <Wifi className="h-3 w-3" />
        <span className="hidden sm:inline">Online</span>
        {syncStatus.pendingCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
            {syncStatus.pendingCount > 9 ? '9+' : syncStatus.pendingCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="flex h-auto shrink-0 items-center justify-between border-b-2 border-gray-100 bg-white px-3 py-2 sm:h-14 sm:px-4 sm:py-0 lg:px-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-violet-600 shadow-md shadow-blue-200">
            <Video className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="truncate text-sm font-bold tracking-tight text-gray-800">
              IE {offline ? 'Offline' : 'Video CT'}
            </span>
            {offline && (
              <span className="text-[10px] leading-none text-gray-400">v1.0.0</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1.5">
        {/* Sync badge - Offline only */}
        <SyncBadge />

        <button
          onClick={onOpenFilter}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 lg:px-3"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
        </button>

        <div className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-gray-100 sm:px-2"
          >
            {/* Avatar: IP icon cho offline, chữ cái đầu cho online */}
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-violet-600 text-xs font-bold text-white shadow">
              {offline ? (
                <Monitor className="h-3.5 w-3.5" />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="hidden flex-col items-start sm:flex">
              <span className="text-xs leading-tight font-semibold text-gray-700">{displayName}</span>
              <span className="text-[10px] leading-tight text-gray-400">{subtitle}</span>
            </div>
            <ChevronRight
              className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${
                dropdownOpen ? 'rotate-90' : ''
              }`}
            />
          </button>

          {dropdownOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-gray-100 bg-white py-1.5 shadow-lg shadow-gray-200/80">
              <div className="mb-1 border-b border-gray-100 px-3 py-2">
                <p className="text-xs font-semibold text-gray-700">{displayName}</p>
                <p className="text-[10px] text-gray-400">{subtitle}</p>
              </div>

              {/* Share Data — Offline only */}
              {offline && onOpenShareData && (
                <button
                  onClick={() => { onOpenShareData(); setDropdownOpen(false); }}
                  className="w-full px-3 py-2 text-left transition hover:bg-emerald-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                      <Share2 className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">Chia sẻ dữ liệu</p>
                      {syncStatus.pendingCount > 0 && (
                        <p className="text-[10px] text-amber-500">{syncStatus.pendingCount} chờ sync</p>
                      )}
                    </div>
                  </div>
                </button>
              )}

              {/* Admin tools — Online only */}
              {!offline && isAdminUser ? (
                <>
                  <button
                    onClick={onOpenCreateUser}
                    className="w-full px-3 py-2 text-left transition hover:bg-blue-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                        <UserPlus className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">Create user</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={onOpenDeleteLogs}
                    className="w-full px-3 py-2 text-left transition hover:bg-amber-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                        <ClipboardList className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">Delete logs</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={onOpenManageStageCategories}
                    className="w-full px-3 py-2 text-left transition hover:bg-violet-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                        <PanelsTopLeft className="h-3.5 w-3.5 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">Stage categories</p>
                      </div>
                    </div>
                  </button>
                </>
              ) : null}

              {/* Sign out — Online only */}
              {!offline && (
                <div className={isAdminUser ? 'mt-1 border-t border-gray-100 pt-1' : ''}>
                  <button
                    onClick={onSignOut}
                    className="group w-full px-3 py-2 text-left transition hover:bg-red-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-50 transition group-hover:bg-red-100">
                        <LogOut className="h-3.5 w-3.5 text-red-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-red-500">Sign out</p>
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
