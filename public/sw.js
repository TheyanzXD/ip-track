// sw.js — service worker: precache shell, stale-while-revalidate CDN, offline snapshots (TODO 18)
const VERSION = 'netutils-v2.0.0';
const SHELL = [
  '/',
  '/index.html',
  '/docs',
  '/docs.html',
  '/css/style.css',
  '/js/main.js',
  '/js/theme.js',
  '/js/i18n.js',
  '/js/history.js',
  '/js/map.js',
  '/js/palette.js',
  '/manifest.webmanifest',
  '/openapi.json',
  '/security.txt',
  '/locales/en.json',
  '/locales/id.json',
  '/locales/zh.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const CDN_CACHE = new Set([
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://unpkg.com'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // API: network-first, cache last snapshot for offline read-only view
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          if (res.ok) caches.open(`${VERSION}-api`).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CDN: stale-while-revalidate
  if ([...CDN_CACHE].some(p => url.origin.startsWith(p))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetched = fetch(event.request).then(res => {
          if (res.ok) caches.open(`${VERSION}-cdn`).then(c => c.put(event.request, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  // shell: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(res => {
        if (res.ok && url.origin === self.location.origin) {
          caches.open(VERSION).then(c => c.put(event.request, res.clone()));
        }
        return res;
      });
    })
  );
});
