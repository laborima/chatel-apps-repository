const CACHE_NAME = 'chatel-meteo-planner-v3';
const urlsToCache = [
  '/chatel-apps-repository/',
  '/chatel-apps-repository/manifest.json',
  '/chatel-apps-repository/logo.png',
  '/chatel-apps-repository/favicon.ico'
];

// Installation du service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache ouvert');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activation du service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Suppression de l\'ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Retourner la réponse en cache ou faire la requête réseau
        return response || fetch(event.request);
      })
  );
});

// Gestion des notifications Push
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Châtel Météo Planner';
  const options = {
    body: data.body || 'Nouvelles conditions météo disponibles !',
    icon: '/chatel-apps-repository/icons/android/android-launchericon-192-192.png',
    badge: '/chatel-apps-repository/icons/android/android-launchericon-96-96.png',
    data: {
      url: data.url || '/chatel-apps-repository/'
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
        if (client.url.includes('/chatel-apps-repository') && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow('/chatel-apps-repository/');
      }
    })
  );
});
