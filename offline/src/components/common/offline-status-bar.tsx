import { useOnlineStatus } from '@/hooks/use-online-status';
import { syncManager } from '@/lib/sync-manager';

export function OfflineStatusBar() {
  const { isOnline, pendingCount, isSyncing } = useOnlineStatus();

  // If online and nothing pending — hide the bar
  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '8px 20px',
        fontSize: '13px',
        fontWeight: 500,
        fontFamily: 'inherit',
        backdropFilter: 'blur(8px)',
        borderTop: `1px solid ${isOnline ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)'}`,
        background: isOnline
          ? 'rgba(120,90,0,0.85)'
          : 'rgba(80,10,10,0.90)',
        color: '#fff',
        transition: 'background 0.3s',
      }}
    >
      {/* Left: status icon + message */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isOnline ? (
          isSyncing ? (
            <SpinnerIcon />
          ) : (
            <WarningIcon />
          )
        ) : (
          <OfflineIcon />
        )}
        <span>
          {!isOnline && 'Offline — đang lưu cục bộ'}
          {isOnline && isSyncing && 'Đang đồng bộ với server…'}
          {isOnline && !isSyncing && pendingCount > 0 && 'Đã kết nối lại — chờ đồng bộ'}
        </span>
        {pendingCount > 0 && (
          <span
            style={{
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '999px',
              padding: '1px 8px',
              fontSize: '11px',
            }}
          >
            {pendingCount} thay đổi chờ sync
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {isOnline && pendingCount > 0 && !isSyncing && (
          <button
            onClick={() => void syncManager.flushQueue()}
            style={btnStyle('#fff', 'rgba(255,255,255,0.15)')}
          >
            Sync ngay
          </button>
        )}
        {isOnline && pendingCount === 0 && !isSyncing && (
          <button
            onClick={() => void syncManager.retryFailed()}
            style={btnStyle('#fff', 'rgba(255,255,255,0.12)')}
          >
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}

function btnStyle(color: string, bg: string) {
  return {
    color,
    background: bg,
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '6px',
    padding: '3px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'background 0.15s',
  } as React.CSSProperties;
}

function OfflineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ animation: 'ie-spin 1s linear infinite' }}
    >
      <style>{`@keyframes ie-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
