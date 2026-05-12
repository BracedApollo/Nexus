// NEXUS Service Worker v1.0
// Handles: offline caching, push notifications, background sync

const CACHE_NAME = 'nexus-v1';
const BASE = '/Nexus/';

// Files to cache for offline use
const PRECACHE = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
];

// ── Install: cache core files ──────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE).catch(err => {
        console.log('[SW] Pre-cache partial fail (ok for first run):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fallback to network ───────────
self.addEventListener('fetch', e => {
  // Only handle same-origin GET requests
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful responses for the dashboard
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — serve cached index
        return caches.match(BASE + 'index.html');
      });
    })
  );
});

// ── Push notifications ─────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'NEXUS', body: 'Time to check in.', tag: 'nexus-default' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: BASE + 'icon-192.png',
      badge: BASE + 'icon-192.png',
      tag: data.tag || 'nexus',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || BASE, view: data.view || '' },
      actions: data.actions || [],
    })
  );
});

// ── Notification click ─────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || BASE;
  const view = (e.notification.data && e.notification.data.view) || '';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus existing window if open
      for (const client of list) {
        if (client.url.includes('/Nexus/') && 'focus' in client) {
          client.focus();
          if (view) client.postMessage({ type: 'NAVIGATE', view });
          return;
        }
      }
      // Open new window
      const url = view ? BASE + '?view=' + view : BASE;
      return clients.openWindow(url);
    })
  );
});

// ── Background scheduled notifications ────────────────────
// These fire from the app via self.registration.showNotification
// when the page is active. True background push needs a push server.
// For local scheduling we use the message channel below.

self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SCHEDULE_NOTIFICATION') {
    const { delay, title, body, tag, view } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title || 'NEXUS', {
        body: body || '',
        tag: tag || 'nexus-sched',
        icon: BASE + 'icon-192.png',
        vibrate: [150, 75, 150],
        data: { url: BASE, view: view || '' },
        renotify: true,
      });
    }, delay || 0);
  }

  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
