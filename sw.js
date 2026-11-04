// Service Worker for Badminton Management System 2.0
// Caches ONLY static assets. Never caches API responses, private user data or tokens.

const CACHE_NAME = 'bms-static-v2.16';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './scoring.js',
  './config.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Past the HTTP cache, otherwise old and new files can end up mixed after an update
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Security: NEVER cache API calls or POST requests. Only own static files are handled at all.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api')) {
    return;
  }

  // Network first, so that page and script always belong together. The cache only serves offline.
  event.respondWith(
    fetch(url.href, { cache: 'no-cache' }).then(networkResponse => {
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
      }
      return networkResponse;
    }).catch(() => caches.match(event.request))
  );
});
