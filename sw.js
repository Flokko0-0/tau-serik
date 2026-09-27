// Офлайн: оболочка приложения в кэше, тайлы карты и шрифты кэшируются при просмотре, прогноз - последняя копия
const VERSION = 'ts-v1';
const SHELL = [
  './', 'index.html', 'guardian.html', 'manifest.webmanifest', 'icon.svg', 'css/app.css',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/qrcode.js',
  'js/app.js', 'js/core.js', 'js/store.js', 'js/ui.js', 'js/icons.js', 'js/iin.js', 'js/geo.js', 'js/time.js',
  'js/weather.js', 'js/risk.js', 'js/gear.js', 'js/detect.js', 'js/sensors.js', 'js/alarm.js', 'js/relay.js',
  'js/safety.js', 'js/assistant.js', 'js/mapview.js', 'js/chart.js', 'js/topo.js', 'js/guardian.js',
  'js/data/routes.js', 'js/data/places.js', 'js/data/firstaid.js', 'js/data/people.js',
  'js/views/home.js', 'js/views/routes.js', 'js/views/route.js', 'js/views/map.js', 'js/views/company.js',
  'js/views/aid.js', 'js/views/assistant.js', 'js/views/profile.js', 'js/views/onboarding.js',
  'js/views/alert.js', 'js/views/demo.js',
];
const TILES = 'ts-tiles';
const MAX_TILES = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILES && k !== 'ts-fonts' && k !== 'ts-api').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    c.put(req, res.clone());
    if (name === TILES && Math.random() < 0.05) trim(TILES, MAX_TILES);
  }
  return res;
}

async function networkFirst(req, name) {
  const c = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch {
    const hit = await c.match(req, { ignoreSearch: false });
    if (hit) return hit;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/tile\.(opentopomap|openstreetmap)\.org$/.test(url.hostname)) {
    e.respondWith(cacheFirst(req, TILES));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, 'ts-fonts'));
  } else if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(networkFirst(req, 'ts-api'));
  } else if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, VERSION).catch(() => caches.match('index.html')));
  }
});
