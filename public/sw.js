const CACHE_NAME = 'upsa-attendance-v1';
const STATIC_CACHE_NAME = 'upsa-static-v1';
const DYNAMIC_CACHE_NAME = 'upsa-dynamic-v1';

// Files to cache for offline functionality
const STATIC_FILES = [
  '/',
  '/dashboard',
  '/dashboard/attendance/take',
  '/dashboard/verify-attendance',
  '/dashboard/schedules',
  '/offline',
  '/manifest.json',
  // Add critical CSS and JS files
  '/_next/static/css/app/layout.css',
  '/_next/static/chunks/webpack.js',
  '/_next/static/chunks/main.js',
  '/_next/static/chunks/pages/_app.js'
];

// API endpoints that should work offline with cached data
const CACHE_API_ENDPOINTS = [
  '/api/auth/session',
  '/api/class-groups/my-class',
  '/api/schedules/my-schedules',
  '/api/attendance/recent'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES.map(url => new Request(url, { credentials: 'same-origin' })));
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static files and pages
  if (STATIC_FILES.includes(url.pathname) || url.pathname.startsWith('/_next/')) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // Handle other requests with network first strategy
  event.respondWith(handleDynamicRequest(request));
});

// Handle API requests with cache-first for specific endpoints
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // For cacheable API endpoints, try cache first
  if (CACHE_API_ENDPOINTS.some(endpoint => url.pathname.startsWith(endpoint))) {
    try {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) {
        // Return cached response and update in background
        fetchAndCache(request, cache);
        return cachedResponse;
      }
      
      // If not in cache, fetch and cache
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
  
  // For other API requests, try network first
  try {
    const response = await fetch(request);
    
    // Cache successful responses for future offline access
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // Try to return cached version if available
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

// Handle static requests with cache-first strategy
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
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const cache = await caches.open(STATIC_CACHE_NAME);
      return cache.match('/offline') || new Response('Offline', { status: 503 });
    }
    throw error;
  }
}

// Handle dynamic requests with network-first strategy
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
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const staticCache = await caches.open(STATIC_CACHE_NAME);
      return staticCache.match('/offline') || new Response('Offline', { status: 503 });
    }
    throw error;
  }
}

// Listen for sync events
self.addEventListener('sync', (event) => {
  if (event.tag === 'attendance-sync') {
    event.waitUntil(syncPendingAttendance());
  } else if (event.tag === 'verification-sync') {
    event.waitUntil(syncPendingVerifications());
  }
});

// Listen for messages from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_NOW') {
    console.log('Service Worker: Manual sync triggered');
    event.waitUntil(Promise.all([
      syncPendingAttendance(),
      syncPendingVerifications()
    ]));
  }
});

// Helper to access IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('upsa-attendance-db', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function syncPendingAttendance() {
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingAttendance'], 'readwrite');
    const store = transaction.objectStore('pendingAttendance');
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const pendingItems = request.result;
        if (!pendingItems || pendingItems.length === 0) {
          resolve();
          return;
        }

        console.log(`Service Worker: Syncing ${pendingItems.length} attendance records`);

        // Process sequentially to ensure order
        for (const item of pendingItems) {
          try {
            // Determine endpoint based on item structure
            let endpoint = '/api/attendance/sync'; 
            
            // Check if it's a lecturer "taking" attendance (start session)
            if (item.scheduleId && item.method) {
               endpoint = '/api/attendance/take';
            } else if (item.sessionId && item.attendanceRecords) {
               // Use sync endpoint for student records
               endpoint = '/api/attendance/sync'; 
            }

            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(item)
            });

            if (response.ok || response.status === 409) { // 409 conflict might mean already exists
              // Remove from IDB on success using a NEW transaction (async/await breaks transaction scope)
              const deleteTx = db.transaction(['pendingAttendance'], 'readwrite');
              deleteTx.objectStore('pendingAttendance').delete(item.id);
              console.log('Service Worker: Synced item', item.id);
            } else {
              console.error('Service Worker: Sync failed for item', item.id, response.status);
            }
          } catch (error) {
            console.error('Service Worker: Sync failed for item', item.id, error);
          }
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Service Worker: DB error during attendance sync', error);
  }
}

async function syncPendingVerifications() {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains('pendingVerifications')) return;

    const transaction = db.transaction(['pendingVerifications'], 'readwrite');
    const store = transaction.objectStore('pendingVerifications');
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const pendingItems = request.result;
        if (!pendingItems || pendingItems.length === 0) {
          resolve();
          return;
        }

        console.log(`Service Worker: Syncing ${pendingItems.length} verification records`);

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
              const deleteTx = db.transaction(['pendingVerifications'], 'readwrite');
              deleteTx.objectStore('pendingVerifications').delete(item.id);
              console.log('Service Worker: Synced verification', item.id);
            }
          } catch (error) {
            console.error('Service Worker: Sync failed for verification', item.id, error);
          }
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Service Worker: DB error during verification sync', error);
  }
}

// Background fetch and cache helper
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

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  if (event.tag === 'attendance-sync') {
    event.waitUntil(syncAttendanceData());
  } else if (event.tag === 'verification-sync') {
    event.waitUntil(syncVerificationData());
  }
});

// Sync attendance data when back online
async function syncAttendanceData() {
  try {
    // Get pending attendance records from IndexedDB
    const pendingRecords = await getPendingAttendanceRecords();
    
    for (const record of pendingRecords) {
      try {
        const response = await fetch('/api/attendance/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(record)
        });
        
        if (response.ok) {
          await removePendingAttendanceRecord(record.id);
          console.log('Synced attendance record:', record.id);
        }
      } catch (error) {
        console.log('Failed to sync attendance record:', record.id, error);
      }
    }
  } catch (error) {
    console.log('Background sync failed:', error);
  }
}

// Sync verification data when back online
async function syncVerificationData() {
  try {
    const pendingVerifications = await getPendingVerifications();
    
    for (const verification of pendingVerifications) {
      try {
        const response = await fetch('/api/attendance/verify-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(verification)
        });
        
        if (response.ok) {
          await removePendingVerification(verification.id);
          console.log('Synced verification:', verification.id);
        }
      } catch (error) {
        console.log('Failed to sync verification:', verification.id, error);
      }
    }
  } catch (error) {
    console.log('Verification sync failed:', error);
  }
}

// Push notification handling
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

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/dashboard')
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    return;
  } else {
    // Default action - open the app
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
      })
    );
  }
});

// IndexedDB helpers for offline storage
const DB_NAME = 'upsa-attendance-db';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getPendingAttendanceRecords() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pendingAttendance'], 'readonly');
      const store = transaction.objectStore('pendingAttendance');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting pending attendance records:', error);
    return [];
  }
}

async function removePendingAttendanceRecord(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pendingAttendance'], 'readwrite');
      const store = transaction.objectStore('pendingAttendance');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error removing pending attendance record:', error);
  }
}

async function getPendingVerifications() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pendingVerifications'], 'readonly');
      const store = transaction.objectStore('pendingVerifications');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting pending verifications:', error);
    return [];
  }
}

async function removePendingVerification(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pendingVerifications'], 'readwrite');
      const store = transaction.objectStore('pendingVerifications');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error removing pending verification:', error);
  }
}

// Message handling for communication with main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});