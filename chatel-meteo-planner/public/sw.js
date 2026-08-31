const BASE_URL = self.registration.scope.replace(/\/$/, '');

// Incrementer a chaque changement de strategie de cache.
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `chatel-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `chatel-assets-${CACHE_VERSION}`;
const DATA_CACHE = `chatel-data-${CACHE_VERSION}`;

// Coque minimale a precacher pour un demarrage hors ligne.
const SHELL_URLS = [
  `${BASE_URL}/`,
  `${BASE_URL}/manifest.json`,
  `${BASE_URL}/activities/activities.json`,
  `${BASE_URL}/icons/ios/180.png`
];

// Au-dela, une donnee en cache est trop vieille pour etre affichee sans reseau.
const DATA_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Installation : precacher la coque
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Une seule URL absente ne doit pas faire echouer toute l'installation.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

// Activation : ne supprimer que les caches d'une version precedente
self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => !keep.includes(name)).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * Reseau d'abord, cache en secours : pour les donnees SignalK et la config.
 * Une meteo perimee vaut mieux qu'une page vide, mais on prefere toujours le
 * reseau quand il repond.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      const headers = new Headers(copy.headers);
      headers.set('x-cached-at', String(Date.now()));
      cache.put(request, new Response(await copy.blob(), {
        status: copy.status,
        statusText: copy.statusText,
        headers
      }));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = Number(cached.headers.get('x-cached-at') || 0);
      if (!cachedAt || Date.now() - cachedAt < DATA_MAX_AGE_MS) {
        return cached;
      }
    }
    throw error;
  }
}

/** Cache d'abord, revalidation en arriere-plan : pour les assets versionnes. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || network || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Le cache HTTP ne gere que les GET ; le reste passe directement au reseau.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Ne rien intercepter hors de notre origine (webcam, CDN, ...).
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation : servir la coque en secours pour que l'app s'ouvre hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(`${BASE_URL}/`, { ignoreSearch: true })
          .then((cached) => cached || Response.error())
      )
    );
    return;
  }

  // Donnees SignalK et configuration : fraicheur d'abord.
  if (url.pathname.startsWith('/signalk/') || url.pathname.endsWith('activities.json')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // Assets versionnes par le build et icones : cache d'abord.
  if (url.pathname.includes('/_next/static/') || /\.(png|svg|ico|woff2?|css|js)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
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
