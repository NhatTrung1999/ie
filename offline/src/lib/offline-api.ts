import { AxiosError } from 'axios';

/**
 * Returns true when the error is caused by network unavailability
 * (no internet, server unreachable, or request timed out)
 * rather than a 4xx/5xx HTTP error from the server.
 */
export function isNetworkOfflineError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    // No response means the request never reached the server
    if (!error.response) return true;
    // Explicit network error codes
    if (error.code === 'ERR_NETWORK') return true;
    if (error.code === 'ECONNABORTED') return true;
  }
  return false;
}

/** Quick sync-check; prefer using `navigator.onLine` in components. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}
