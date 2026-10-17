// Offline and fast reloads for the installed app (PWA). Pages: network first, the cached copy when offline.
// Built assets (hashed names), models, images and fonts: from the cache, refreshed in the background.
// Bump VERSION to drop everything cached by an older release.
const VERSION = 'ride-v1';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
    const req = e.request; const url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;
    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('./', copy)); return r; })
            .catch(() => caches.match('./')));
        return;
    }
    if (/\.(js|css|glb|webp|png|jpg|svg|woff2?|webmanifest)$/.test(url.pathname)) {
        e.respondWith(caches.open(VERSION).then(async (c) => {
            const hit = await c.match(req);
            const fresh = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
            return hit || fresh;
        }));
    }
});
