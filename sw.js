// Yolcu service worker: uygulama dosyalarını önbelleğe alır, internet yokken de açılır
const VERSION = 'yolcu-v3';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/api.js', 'js/geo.js', 'js/guide.js', 'js/icons.js', 'js/mapstyle.js', 'js/nav.js', 'js/store.js',
  'js/traffic.js', 'js/radar.js',
  'icons/mavi-180.png', 'icons/yol-180.png', 'icons/harita-180.png', 'icons/gece-180.png', 'icons/y-180.png'
];
const CDN = ['https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js', 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll([...SHELL, ...CDN])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'yolcu-map' && k !== 'yolcu-voices').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Uygulama dosyaları: önce ağ (güncel kalsın), 3 sn'de gelmezse önbellek
  if (url.origin === location.origin) {
    e.respondWith(
      Promise.race([fetch(req), timeout(3000)])
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // Harita kütüphanesi, yazı tipleri, ikonlar ve stil: önce önbellek
  if (url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net' || (url.hostname === 'tiles.openfreemap.org' && /\/(fonts|sprites|styles)\//.test(url.pathname))) {
    e.respondWith(
      caches.open('yolcu-map').then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
  }
  // Rota / arama / harita karoları: doğrudan ağ
});
