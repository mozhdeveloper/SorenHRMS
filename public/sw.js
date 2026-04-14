/**
 * NexHRMS Service Worker
 * Handles push notifications and caching for PWA functionality.
 */

const CACHE_NAME = 'nexhrms-v1';
const OFFLINE_URL = '/login';

// Install event — cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        OFFLINE_URL,
        '/manifest.json',
      ]);
    })
  );
  self.skipWaiting();
});

// Activate event — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch event — serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and external URLs
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  // Skip API routes and Supabase calls
  if (event.request.url.includes('/api/') || event.request.url.includes('supabase')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, show offline page
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});

// ─── Push Notification Handling ─────────────────────────────────────────────

self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {
    title: 'NexHRMS Notification',
    body: 'You have a new notification',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    tag: 'nexhrms-notification',
    data: { url: '/notifications' },
  };

  // Parse push payload if available
  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.tag || `nexhrms-${Date.now()}`,
        data: {
          url: payload.url || payload.link || '/notifications',
          notificationId: payload.notificationId,
        },
      };
    } catch (e) {
      // If not JSON, use text
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    vibrate: [100, 50, 100],
    requireInteraction: false,
    actions: [
      { action: 'open', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Known role slugs used in the [role]/ dynamic route segment
const KNOWN_ROLES = ['admin', 'hr', 'finance', 'employee', 'supervisor', 'payroll_admin', 'auditor'];

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const action = event.action;
  if (action === 'dismiss') {
    return;
  }

  // Get the URL to open (may or may not already have a role prefix)
  const rawUrl = event.notification.data?.url || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      let urlToOpen = rawUrl;

      // If the URL doesn't already start with a known role prefix, try to
      // extract the role from an existing open window and prepend it.
      const firstSegment = rawUrl.split('/').filter(Boolean)[0];
      if (!KNOWN_ROLES.includes(firstSegment)) {
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);
            const clientRole = clientUrl.pathname.split('/').filter(Boolean)[0];
            if (KNOWN_ROLES.includes(clientRole)) {
              urlToOpen = '/' + clientRole + rawUrl;
              break;
            }
          } catch (e) { /* ignore */ }
        }
      }

      // If there's already a window open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// Notification close handler (for analytics)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

// Push subscription change handler
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed');
  
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.applicationServerKey,
    }).then((newSubscription) => {
      // Send new subscription to server
      return fetch('/api/push/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldEndpoint: event.oldSubscription?.endpoint,
          newSubscription: newSubscription.toJSON(),
        }),
      });
    })
  );
});

// ─── App Badge API Support ──────────────────────────────────────────────────
// Works on Android PWA and iOS 16.4+ Safari PWA (added to home screen)

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  
  if (type === 'SET_BADGE') {
    const count = payload?.count ?? 0;
    
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count).catch((err) => {
          console.warn('[SW] Failed to set app badge:', err);
        });
      } else {
        navigator.clearAppBadge().catch((err) => {
          console.warn('[SW] Failed to clear app badge:', err);
        });
      }
    }
    
    // Respond to confirm badge was set
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true, count });
    }
  }
  
  if (type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch((err) => {
        console.warn('[SW] Failed to clear app badge:', err);
      });
    }
    
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true });
    }
  }
  
  // Skip waiting if requested (for updates)
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
