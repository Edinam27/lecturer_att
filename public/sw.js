const CACHE_NAME = 'upsa-attendance-v1';
const STATIC_CACHE_NAME = 'upsa-static-v1';
const DYNAMIC_CACHE_NAME = 'upsa-dynamic-v1';
const DB_NAME = 'upsa-attendance-db';
const DB_VERSION = 1;

// Files to cache for offline functionality
const STATIC_FILES = [
  '/',
  '/offline',
  '/manifest.json'
];

// API endpoints that should work offline with cached data
const CACHE_API_ENDPOINTS = [
  '/api/auth/session',
  '/api/class-groups/my-class',
  '/api/schedules/my-schedules',
  '/api/attendance/recent'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');

  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES.map((url) => new Request(url, { credentials: 'same-origin' })));
      }),
      self.skipWaiting()
    ])
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');

  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
            return Promise.resolve(false);
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  if (STATIC_FILES.includes(url.pathname) || url.pathname.startsWith('/_next/')) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  event.respondWith(handleDynamicRequest(request));
});

self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);

  if (event.tag === 'attendance-sync') {
    event.waitUntil(runAttendanceSync('background'));
  } else if (event.tag === 'verification-sync') {
    event.waitUntil(runVerificationSync('background'));
  }
});

self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data);

  if (!event.data) {
    return;
  }

  if (event.data.type === 'SYNC_NOW') {
    event.waitUntil(
      Promise.all([
        runAttendanceSync('manual'),
        runVerificationSync('manual')
      ])
    );
    return;
  }

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

async function handleApiRequest(request) {
  const url = new URL(request.url);

  if (CACHE_API_ENDPOINTS.some((endpoint) => url.pathname.startsWith(endpoint))) {
    try {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        fetchAndCache(request, cache);
        return cachedResponse;
      }

      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      console.log('Service Worker: API request failed:', error);
      return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  try {
    const response = await fetch(request);

    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response(JSON.stringify({ error: 'Offline', message: 'No cached data available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleStaticRequest(request) {
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      const cache = await caches.open(STATIC_CACHE_NAME);
      return (await cache.match('/offline')) || new Response('Offline', { status: 503 });
    }
    throw error;
  }
}

async function handleDynamicRequest(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === 'navigate') {
      const staticCache = await caches.open(STATIC_CACHE_NAME);
      return (await staticCache.match('/offline')) || new Response('Offline', { status: 503 });
    }
    throw error;
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }

    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function deleteFromStore(db, storeName, id) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve();
      return;
    }

    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function notifyClients(message) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(clientList.map((client) => client.postMessage(message)));
}

async function runAttendanceSync(source) {
  const result = await syncPendingAttendance();
  await notifyClients({
    type: 'SYNC_COMPLETE',
    scope: 'attendance',
    source,
    synced: result.synced,
    failed: result.failed,
    remaining: result.remaining
  });
}

async function runVerificationSync(source) {
  const result = await syncPendingVerifications();
  await notifyClients({
    type: 'SYNC_COMPLETE',
    scope: 'verification',
    source,
    synced: result.synced,
    failed: result.failed,
    remaining: result.remaining
  });
}

async function syncPendingAttendance() {
  try {
    const db = await openDB();
    const pendingItems = await getAllFromStore(db, 'pendingAttendance');

    if (!pendingItems.length) {
      return { synced: 0, failed: 0, remaining: 0 };
    }

    console.log(`Service Worker: Syncing ${pendingItems.length} attendance records`);

    let synced = 0;
    let failed = 0;

    for (const item of pendingItems) {
      try {
        let endpoint = '/api/attendance/sync';

        if (item.scheduleId && item.method) {
          endpoint = '/api/attendance/take';
        } else if (item.sessionId && item.attendanceRecords) {
          endpoint = '/api/attendance/sync';
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(item)
        });

        if (response.ok || response.status === 409) {
          await deleteFromStore(db, 'pendingAttendance', item.id);
          synced += 1;
          console.log('Service Worker: Synced item', item.id);
        } else {
          failed += 1;
          console.error('Service Worker: Sync failed for item', item.id, response.status);
        }
      } catch (error) {
        failed += 1;
        console.error('Service Worker: Sync failed for item', item.id, error);
      }
    }

    const remaining = (await getAllFromStore(db, 'pendingAttendance')).length;
    return { synced, failed, remaining };
  } catch (error) {
    console.error('Service Worker: DB error during attendance sync', error);
    return { synced: 0, failed: 0, remaining: 0 };
  }
}

async function syncPendingVerifications() {
  try {
    const db = await openDB();
    const pendingItems = await getAllFromStore(db, 'pendingVerifications');

    if (!pendingItems.length) {
      return { synced: 0, failed: 0, remaining: 0 };
    }

    console.log(`Service Worker: Syncing ${pendingItems.length} verification records`);

    let synced = 0;
    let failed = 0;

    for (const item of pendingItems) {
      try {
        const response = await fetch('/api/attendance/verify-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(item)
        });

        if (response.ok || response.status === 409) {
          await deleteFromStore(db, 'pendingVerifications', item.id);
          synced += 1;
          console.log('Service Worker: Synced verification', item.id);
        } else {
          failed += 1;
          console.error('Service Worker: Sync failed for verification', item.id, response.status);
        }
      } catch (error) {
        failed += 1;
        console.error('Service Worker: Sync failed for verification', item.id, error);
      }
    }

    const remaining = (await getAllFromStore(db, 'pendingVerifications')).length;
    return { synced, failed, remaining };
  } catch (error) {
    console.error('Service Worker: DB error during verification sync', error);
    return { synced: 0, failed: 0, remaining: 0 };
  }
}

async function fetchAndCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
  } catch (error) {
    console.log('Background fetch failed:', error);
  }
}

self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');

  let notificationData = {
    title: 'UPSA Attendance',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'upsa-notification',
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icons/action-view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/action-dismiss.png'
      }
    ]
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.log('Failed to parse push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');

  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(clients.openWindow('/dashboard'));
    return;
  }

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/dashboard');
      }
      return undefined;
    })
  );
});
