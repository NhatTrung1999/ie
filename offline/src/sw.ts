/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { RangeRequestsPlugin } from 'workbox-range-requests';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// ─── Precache static assets ─────────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ─── SPA navigation fallback ────────────────────────────────────────────────
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// ─── API calls (NetworkFirst — 5 s timeout, 24 h cache) ─────────────────────
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/api'),
  new NetworkFirst({
    cacheName: 'ie-api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
    ],
  }),
);

// ─── Video / uploads (CacheFirst + RangeRequests — 30 day cache) ─────────────
registerRoute(
  ({ url }) => url.pathname.startsWith('/uploads/'),
  new CacheFirst({
    cacheName: 'ie-video-cache',
    plugins: [
      new RangeRequestsPlugin(),
      new CacheableResponsePlugin({ statuses: [0, 200, 206] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  }),
);
