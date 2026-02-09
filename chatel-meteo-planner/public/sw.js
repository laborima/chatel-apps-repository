const BASE_URL = self.registration.scope.replace(/\/$/, '');

// Installation du service worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activation du service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// Gestion des notifications Push
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Châtel Météo Planner';
  const options = {
    body: data.body || 'Nouvelles conditions météo disponibles !',
    icon: `${BASE_URL}/icons/android/android-launchericon-192-192.png`,
    badge: `${BASE_URL}/icons/android/android-launchericon-96-96.png`,
    data: {
      url: data.url || `${BASE_URL}/`
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Gestion du clic sur une notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Vérifier si l'application est déjà ouverte
      for (let client of windowClients) {
        if (client.url.startsWith(BASE_URL) && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow(`${BASE_URL}/`);
      }
    })
  );
});
