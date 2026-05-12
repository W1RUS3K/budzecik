// Service worker v2.2
// Strategy: NETWORK-FIRST dla kodu aplikacji (HTML, JS, manifest, SW),
// CACHE-FIRST dla pozostałych assetów (ikony, fonty, Chart.js).
// Dzięki temu apka aktualizuje się sama przy otwarciu — bez konieczności
// force-quit z multitaskingu.
const CACHE_VERSION = 'budget-v2-2';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
];

const STATIC_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.all(
        [...APP_SHELL, ...STATIC_ASSETS].map(url =>
          cache.add(url).catch(err => console.warn('SW cache miss:', url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Helper: czy to jest plik aplikacji (HTML/JS/manifest) który chcemy
// zawsze aktualizować z sieci?
function isAppShell(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  return (
    path.endsWith('/') ||
    path.endsWith('/index.html') ||
    path.endsWith('/app.js') ||
    path.endsWith('/manifest.json')
  );
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (isAppShell(url)) {
    // NETWORK-FIRST: zawsze próbuj świeżego pliku, cache to fallback dla offline.
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CACHE-FIRST dla wszystkiego innego (ikony, fonty, Chart.js, etc.)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          const ok = response && response.ok;
          const shouldCache =
            url.origin === self.location.origin ||
            url.host === 'cdn.jsdelivr.net' ||
            url.host === 'fonts.googleapis.com' ||
            url.host === 'fonts.gstatic.com';
          if (ok && shouldCache) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

// Pozwól apce wymusić aktualizację z poziomu UI
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
