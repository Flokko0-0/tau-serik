// Офлайн: оболочка приложения в кэше, тайлы карты и шрифты кэшируются при просмотре, прогноз - последняя копия
const VERSION = 'ts-v6';
const SHELL = [
  './', 'index.html', 'guardian.html', 'manifest.webmanifest', 'icon.svg', 'css/app.css',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/qrcode.js',
  'js/app.js', 'js/core.js', 'js/store.js', 'js/ui.js', 'js/icons.js', 'js/iin.js', 'js/geo.js', 'js/time.js',
  'js/weather.js', 'js/risk.js', 'js/gear.js', 'js/detect.js', 'js/sensors.js', 'js/alarm.js', 'js/relay.js',
  'js/safety.js', 'js/assistant.js', 'js/mapview.js', 'js/chart.js', 'js/topo.js', 'js/guardian.js',
  'js/p2p.js', 'js/company.js', 'js/ai.js', 'js/config.js', 'js/views/custom.js',
  'js/data/routes.js', 'js/data/places.js', 'js/data/firstaid.js', 'js/data/people.js',
  'js/views/home.js', 'js/views/routes.js', 'js/views/route.js', 'js/views/map.js', 'js/views/company.js',
  'js/views/aid.js', 'js/views/assistant.js', 'js/views/profile.js', 'js/views/onboarding.js',
  'js/views/alert.js', 'js/views/demo.js',
  'js/i18n.js', 'js/i18n/ui.js', 'js/i18n/safety.js', 'js/i18n/social.js', 'js/i18n/aid.js', 'js/i18n/data.js',
];
const TILES = 'ts-tiles';
const FONTS = 'ts-fonts-2';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Sofia+Sans:wght@400;500;600;700;800&family=Sofia+Sans+Extra+Condensed:wght@700;800;900&family=JetBrains+Mono:wght@500;600&display=swap';
const MAX_TILES = 3000;

// Шрифты кладём в кэш сразу: кириллица и латиница, чтобы офлайн не было системных шрифтов
async function cacheFonts() {
  try {
    const c = await caches.open(FONTS);
    const res = await fetch(FONT_CSS, { mode: 'cors' });
    if (!res.ok) return;
    const css = await res.clone().text();
    await c.put(FONT_CSS, res);
    const urls = css.split('/* ').slice(1)
      .filter((block) => /^(cyrillic|cyrillic-ext|latin) \*\//.test(block))
      .map((block) => block.match(/url\((https:[^)]+)\)/)?.[1])
      .filter(Boolean);
    await Promise.all(urls.map((u) => fetch(u, { mode: 'cors' }).then((r) => r.ok && c.put(u, r)).catch(() => {})));
  } catch {
    // без сети при установке: шрифты докэшируются при просмотре
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(cacheFonts).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![VERSION, TILES, FONTS, 'ts-api'].includes(k)).map((k) => caches.delete(k))))
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
  const hit = await c.match(req, { ignoreVary: true });
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
    e.respondWith(cacheFirst(req, FONTS));
  } else if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(networkFirst(req, 'ts-api'));
  } else if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, VERSION).catch(() => caches.match('index.html')));
  }
});
