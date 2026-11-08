// Service Worker for Badminton Management System 2.0
// Caches ONLY static assets. Never caches API responses, private user data or tokens.

const CACHE_NAME = 'bms-static-v2.41';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './scoring.js',
  './week.js',
  './config.js',
  './manifest.json',
  './hilfe.html',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

// The browser refuses a redirected response for a page load and shows an error page instead.
// A host may redirect /index.html to /, and the installed app starts on /index.html.
function withoutRedirect(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

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
      const cacheable = networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic';
      const response = withoutRedirect(networkResponse);
      if (cacheable) {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
      }
      return response;
    }).catch(() => caches.match(event.request).then(withoutRedirect))
  );
});

// Notifications. The text comes encrypted from the backend, a link can only point into this app.
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  // Without its own tag a message can replace the one before, Firefox on Android does that.
  // The tag of a repeated attempt is the same, so a repeat replaces instead of showing twice.
  event.waitUntil(self.registration.showNotification(data.title || 'SV Union Lohne Badminton', {
    tag: data.tag || 'bms-' + Date.now() + '-' + Math.random(),
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: './index.html' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(w => 'focus' in w);
    return open ? open.focus() : self.clients.openWindow('./index.html');
  }));
});
