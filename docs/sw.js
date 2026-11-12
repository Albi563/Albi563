// Service worker: rende l'app installabile e veloce da riaprire.
// Strategia "rete prima, poi cache" per i file dell'app, così gli
// aggiornamenti arrivano subito quando c'è connessione.
const CACHE = 'albero-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/i18n.js', 'js/relations.js', 'js/store.js',
  'js/tree.js', 'js/map.js', 'js/ui.js', 'js/photo.js', 'js/demo-data.js',
  'icons/icon.svg', 'icons/icon-192.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.markercluster.js', 'vendor/leaflet/MarkerCluster.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
