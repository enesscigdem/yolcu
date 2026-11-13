import { store, save, addRecent, isSaved, toggleSaved, exportBackup, importBackup, packForLink, unpackFromLink } from './store.js';
import * as api from './api.js';
import * as traffic from './traffic.js';
import * as radar from './radar.js';
import { loadStyle, applyPalette, PALETTES, firstLabelLayer } from './mapstyle.js';
import * as G from './guide.js';
import { Navigator, Simulator } from './nav.js';
import { I, KIND_ICON } from './icons.js';
import { dist, bearing, sliceAlong, pointAt, compass } from './geo.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IZMIR = { lon: 27.142, lat: 38.423 };
const EMPTY = { type: 'FeatureCollection', features: [] };
const wide = () => window.innerWidth >= 700;
const ICONS = { mavi: 'Mavi Ok', yol: 'Gün Batımı', harita: 'Harita', gece: 'Gece', y: 'Y Ayrımı' };
const TRAVEL = { auto: ['Araba', 'car'], pedestrian: ['Yürüyüş', 'walk'] };

// Eski sürümden gelen ayarları güncelle
if (!store.prefs.v3) {
  store.prefs.tilt = false;           // gezinirken düz harita (Apple gibi), navigasyonda 3B
  store.prefs.radar = true;
  store.prefs.radarSound = true;
  delete store.prefs.voiceEngine;
  store.prefs.v3 = true;
  if (!Array.isArray(store.radars)) store.radars = [];
  save();
}
if (!Array.isArray(store.radars)) store.radars = [];

const S = {
  map: null, mapReady: false, pos: null, firstFix: true, puck: null, destMarker: null,
  view: 'home', place: null, results: null, routes: [], sel: 0, dest: null, routeErr: null, travel: 'auto',
  pickFor: null, nav: null, navRoute: null, sim: null, follow: true, rerouting: false,
  where: null, whereAt: null, whereBusy: false, wake: null, arrowFor: -1, arrived: false,
  dragEnd: 0, autoStart: false, chips: [], incidents: [], incAt: null, navInc: [], said: new Set(),
  trafRatio: null, timers: [], navIntro: null, incident: null,
  cams: [], navCams: [], weather: null, weatherAt: null
};
const key = () => store.tomtomKey;
const theme = () => { const p = store.prefs.theme; return p === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p; };

/* ================= iOS ekran boyu ================= */
// iOS 26 ana ekran uygulamasında görünüm, durum çubuğu kadar kısa geliyor (WebKit 301108).
// CSS'te düzeltiyoruz; burada da yedek olarak ekran boyunu zorluyoruz.
const probeT = document.createElement('div');
probeT.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
const probeB = document.createElement('div');
probeB.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
document.body.append(probeT, probeB);
const safeT = () => probeT.offsetHeight;
const safeB = () => probeB.offsetHeight;

function fitScreen() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const portrait = window.innerWidth < window.innerHeight;
  const html = document.documentElement;
  if (standalone && portrait && screen.height - window.innerHeight > 8 && screen.height - window.innerHeight < 160) {
    html.style.height = screen.height + 'px';
  } else if (standalone) {
    html.style.height = '';
  }
  if (window.scrollY) window.scrollTo(0, 0);
}
function onViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px');
}
fitScreen();
addEventListener('resize', () => { fitScreen(); S.map?.resize(); });
addEventListener('orientationchange', () => setTimeout(() => { fitScreen(); S.map?.resize(); }, 300));
addEventListener('scroll', () => { if (!document.activeElement?.matches?.('input')) window.scrollTo(0, 0); }, { passive: true });
window.visualViewport?.addEventListener('resize', onViewport);
document.addEventListener('focusout', () => setTimeout(() => { window.scrollTo(0, 0); onViewport(); }, 60));

/* ================= Tema ================= */
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = theme();
  document.documentElement.dataset.theme = t;
  if (S.mapReady) { applyPalette(S.map, PALETTES[t], { type: store.prefs.mapType, nav: !!S.nav }); setFlow(); }
}
mq.addEventListener?.('change', applyTheme);

/* ================= Bildirim ================= */
let toastT;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetHeight; t.style.animation = '';
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, ms);
}

/* ================= Ses (telefonun kendi sesi) ================= */
const voice = {
  ok: 'speechSynthesis' in window, v: null,
  init() {
    if (!this.ok) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices().filter(x => /^tr/i.test(x.lang));
      this.v = vs.find(x => /gelişmiş|enhanced|premium/i.test(x.name)) || vs.find(x => /yelda/i.test(x.name)) || vs[0] || null;
    };
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
  },
  unlock() {
    radar.unlockBeep();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { }
    if (this.ok) { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { } }
  },
  say(text, force = false) {
    if (!this.ok || !text || (!store.prefs.voice && !force)) return;
    const go = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'tr-TR'; if (this.v) u.voice = this.v; u.rate = 1;
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(go, 80); } else go();
  },
  stop() { if (this.ok) speechSynthesis.cancel(); }
};

/* ================= Ekranı açık tut ================= */
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) { S.wake = await navigator.wakeLock.request('screen'); }
    else if (!on && S.wake) { await S.wake.release(); S.wake = null; }
  } catch { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.nav) keepAwake(true); });

/* ================= Alt panel (sheet) ================= */
const sheet = {
  el: null, body: null, detent: 'peek', y: 0,
  init() {
    this.el = $('sheet'); this.body = $('sheet-body');
    this.bindDrag();
    addEventListener('resize', () => this.set(this.detent, false));
  },
  H() { return this.el.offsetHeight; },
  peekH() {
    const a = this.body.querySelector('[data-peek]');
    if (!a) return 220;
    const r = a.getBoundingClientRect(), s = this.el.getBoundingClientRect();
    return Math.round(r.bottom - s.top + 16 + safeB());
  },
  heights() {
    const H = this.H();
    return { peek: Math.min(this.peekH(), H), half: Math.min(Math.max(Math.round(H * 0.56), this.peekH()), H), full: H };
  },
  set(d, anim = true) {
    this.detent = d;
    const vis = this.heights()[d];
    this.y = Math.max(0, this.H() - vis);
    this.el.style.transition = anim ? 'transform .55s cubic-bezier(.32,.72,0,1)' : 'none';
    this.el.style.transform = `translateY(${this.y}px)`;
    this.el.dataset.detent = d;
    if (d !== 'full') this.body.scrollTop = 0;
  },
  visible() { return this.H() - this.y; },
  bindDrag() {
    const el = this.el;
    let g = null;
    el.addEventListener('pointerdown', e => {
      if (e.button > 0 || e.target.closest('input, select, textarea, .favs')) return;
      g = { id: e.pointerId, y0: e.clientY, x0: e.clientX, start: this.y, active: false, onGrab: !!e.target.closest('.grab-area'), scrolled: this.body.scrollTop > 2, vy: 0, py: e.clientY, pt: performance.now() };
    });
    el.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const dy = e.clientY - g.y0, dx = e.clientX - g.x0;
      if (!g.active) {
        if (Math.abs(dy) < 7) return;
        if (Math.abs(dx) > Math.abs(dy)) { g = null; return; }
        if (this.detent === 'full' && !g.onGrab && (g.scrolled || dy < 0)) { g = null; return; }
        g.active = true;
        try { el.setPointerCapture(e.pointerId); } catch { }
        el.style.transition = 'none';
        document.activeElement?.blur?.();
      }
      const now = performance.now();
      g.vy = (e.clientY - g.py) / Math.max(1, now - g.pt);
      g.py = e.clientY; g.pt = now;
      const maxY = this.H() - this.heights().peek;
      let y = g.start + dy;
      if (y < 0) y = y * 0.25;
      if (y > maxY) y = maxY + (y - maxY) * 0.25;
      this.y = y;
      el.style.transform = `translateY(${y}px)`;
    });
    const end = e => {
      if (!g || e.pointerId !== g.id) return;
      if (g.active) {
        S.dragEnd = performance.now();
        const proj = this.y + g.vy * 220;
        const hs = this.heights(), H = this.H();
        let best = 'peek', bd = Infinity;
        for (const d of ['peek', 'half', 'full']) { const dd = Math.abs((H - hs[d]) - proj); if (dd < bd) { bd = dd; best = d; } }
        this.set(best);
        if (best === 'peek' && S.view === 'search') goHome();
      }
      g = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
};

/* ================= Harita ================= */
// Apple tarzı navigasyon oku: beyaz çerçeveli mavi daire içinde beyaz ok
const NAV_ARROW = '<svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="23" fill="#0A84FF" stroke="#fff" stroke-width="4.5"/><path d="M28 14 L38.5 38 L28 32.5 L17.5 38 Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
const PIN = '<svg viewBox="0 0 40 48"><path d="M20 47s-16-15-16-27a16 16 0 0 1 32 0c0 12-16 27-16 27z" fill="#FF3B30" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="20" r="6.5" fill="#fff"/></svg>';

async function initMap() {
  let style;
  try { style = await loadStyle(); }
  catch { toast('Harita yüklenemedi. İnternet bağlantını kontrol et.', 5000); return; }
  const map = S.map = new maplibregl.Map({
    container: 'map', style, center: [IZMIR.lon, IZMIR.lat], zoom: 12, attributionControl: false,
    maxPitch: 70, fadeDuration: 200, dragRotate: true, pitchWithRotate: true
  });
  map.on('load', () => {
    addLayers();
    S.mapReady = true;
    applyTheme();
    $('map').classList.add('ready');
    if (S.pos) { S.firstFix = false; map.jumpTo({ center: [S.pos.lon, S.pos.lat], zoom: 15.5, pitch: store.prefs.tilt ? 50 : 0 }); updatePuck(S.pos); }
    loadIncidents();
    drawRadars();
  });
  map.on('styleimagemissing', () => { });
  map.on('dragstart', () => {
    if (S.nav) { S.follow = false; $('nav-recenter').hidden = false; $('nav-street').hidden = true; }
  });
  map.on('rotate', () => updateLocateBtn());
  map.on('moveend', () => { clearTimeout(S.incT); S.incT = setTimeout(loadIncidents, 1200); });

  // Basılı tut => o noktayı seç
  let lp = null, lpPt = null;
  map.on('touchstart', e => {
    if (S.nav || e.originalEvent.touches.length !== 1) return;
    lpPt = e.point;
    clearTimeout(lp);
    lp = setTimeout(() => { lp = null; navigator.vibrate?.(10); openPoint(e.lngLat); }, 550);
  });
  map.on('touchmove', e => { if (lp && Math.hypot(e.point.x - lpPt.x, e.point.y - lpPt.y) > 10) { clearTimeout(lp); lp = null; } });
  map.on('touchend', () => { clearTimeout(lp); lp = null; });
  map.on('touchcancel', () => { clearTimeout(lp); lp = null; });
  map.on('contextmenu', e => { if (!S.nav) openPoint(e.lngLat); });
}

function headImage() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.beginPath(); x.moveTo(32, 6); x.lineTo(56, 52); x.lineTo(8, 52); x.closePath();
  x.lineJoin = 'round'; x.lineWidth = 7; x.strokeStyle = '#1c1c1e'; x.stroke();
  x.fillStyle = '#ffffff'; x.fill();
  return x.getImageData(0, 0, 64, 64);
}

function badgeImage(emoji, ring, fill = '#fff') {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d');
  x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
  x.beginPath(); x.arc(48, 46, 38, 0, Math.PI * 2); x.fillStyle = fill; x.fill();
  x.shadowColor = 'transparent';
  x.lineWidth = 7; x.strokeStyle = ring; x.stroke();
  x.font = '40px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 48, 49);
  return x.getImageData(0, 0, 96, 96);
}
const ringColor = i => (i.cat === 8 ? '#8E0000' : i.mag >= 3 ? '#D70015' : i.mag === 2 ? '#FF3B30' : '#FF9500');
function ensureIncImage(i) {
  const id = `inc-${i.cat}-${i.mag}`;
  if (!S.map.hasImage(id)) S.map.addImage(id, badgeImage(i.emoji, ringColor(i)), { pixelRatio: 2 });
  return id;
}

function addLayers() {
  const m = S.map, before = firstLabelLayer(m);
  const w = (a, b) => ['interpolate', ['exponential', 1.5], ['zoom'], 10, a, 18, b];
  const round = { 'line-join': 'round', 'line-cap': 'round' };
  m.addSource('yolcu-routes', { type: 'geojson', data: EMPTY });
  m.addSource('yolcu-jams', { type: 'geojson', data: EMPTY });
  m.addSource('yolcu-arrow', { type: 'geojson', data: EMPTY });
  m.addSource('yolcu-inc', { type: 'geojson', data: EMPTY });
  m.addSource('yolcu-cams', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'yolcu-alt-case', type: 'line', source: 'yolcu-routes', filter: ['!', ['get', 'sel']], layout: round, paint: { 'line-color': '#5E92D2', 'line-width': w(6, 22) } }, before);
  m.addLayer({ id: 'yolcu-alt', type: 'line', source: 'yolcu-routes', filter: ['!', ['get', 'sel']], layout: round, paint: { 'line-color': '#8DBDF7', 'line-width': w(4, 16) } }, before);
  m.addLayer({ id: 'yolcu-route-case', type: 'line', source: 'yolcu-routes', filter: ['get', 'sel'], layout: round, paint: { 'line-color': '#0057D2', 'line-width': w(8, 26) } }, before);
  m.addLayer({ id: 'yolcu-route', type: 'line', source: 'yolcu-routes', filter: ['get', 'sel'], layout: round, paint: { 'line-color': '#0A84FF', 'line-width': w(5.5, 19) } }, before);
  m.addLayer({
    id: 'yolcu-jams', type: 'line', source: 'yolcu-jams', layout: round,
    paint: { 'line-width': w(5, 17), 'line-color': ['match', ['get', 'mag'], 3, '#B3261E', 4, '#5A0B0B', 2, '#FF3B30', '#FF9F0A'] }
  }, before);
  m.addLayer({ id: 'yolcu-arrow-case', type: 'line', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'LineString'], layout: round, paint: { 'line-color': '#1c1c1e', 'line-width': w(5, 24) } });
  m.addLayer({ id: 'yolcu-arrow', type: 'line', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'LineString'], layout: round, paint: { 'line-color': '#fff', 'line-width': w(3, 16) } });
  m.addImage('yolcu-head', headImage(), { pixelRatio: 2 });
  m.addLayer({
    id: 'yolcu-arrow-head', type: 'symbol', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'icon-image': 'yolcu-head', 'icon-rotate': ['get', 'b'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 0.35, 18, 1.5] }
  });
  m.addImage('cam-osm', badgeImage('📷', '#0A84FF'), { pixelRatio: 2 });
  m.addImage('cam-user', badgeImage('📷', '#AF52DE'), { pixelRatio: 2 });
  m.addLayer({
    id: 'yolcu-cams', type: 'symbol', source: 'yolcu-cams', minzoom: 12,
    layout: { 'icon-image': ['get', 'img'], 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 0.85] }
  });
  m.addLayer({
    id: 'yolcu-inc', type: 'symbol', source: 'yolcu-inc', minzoom: 9,
    layout: { 'icon-image': ['get', 'img'], 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 15, 1] }
  });
  m.on('click', 'yolcu-alt', e => {
    const i = e.features[0]?.properties?.i;
    if (i != null && S.view === 'routes') selectRoute(+i);
  });
  m.on('click', 'yolcu-inc', e => {
    const id = e.features[0]?.properties?.id;
    const inc = [...S.incidents, ...S.navInc].find(x => String(x.id) === String(id));
    if (inc && !S.nav) showIncident(inc);
  });
  m.on('click', 'yolcu-cams', e => {
    if (S.nav) return;
    const p = e.features[0]?.properties;
    toast(p?.max ? `Radar · hız sınırı ${p.max} km/sa` : 'Radar');
  });
}

function setRoutesData(features) { S.map?.getSource('yolcu-routes')?.setData({ type: 'FeatureCollection', features }); }
function setArrowData(features) { S.map?.getSource('yolcu-arrow')?.setData({ type: 'FeatureCollection', features }); }
function setJams(jams) { S.map?.getSource('yolcu-jams')?.setData({ type: 'FeatureCollection', features: (jams || []).map(j => line(j.coords, { mag: j.mag })) }); }
const line = (coords, props) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });

function setDest(p) {
  if (!S.map) return;
  if (!p) { S.destMarker?.remove(); S.destMarker = null; return; }
  if (!S.destMarker) {
    const el = document.createElement('div'); el.className = 'dest-pin'; el.innerHTML = PIN;
    S.destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' });
  }
  S.destMarker.setLngLat([p.lon, p.lat]).addTo(S.map);
}

function camPadding() {
  if (wide()) return { top: 60, bottom: 60, left: 450, right: 80 };
  return { top: safeT() + 70, bottom: Math.min(sheet.visible(), window.innerHeight * 0.6) + 20, left: 40, right: 76 };
}

function fitCoords(coords, opts = {}) {
  if (!S.map || !coords.length) return;
  const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) b.extend(c);
  // MapLibre önceki kamera payını yenisine ekliyor; sıfırlamazsak rota sığmıyor
  S.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  S.map.fitBounds(b, { padding: opts.padding || camPadding(), duration: 800, maxZoom: 16, bearing: 0, pitch: 0 });
}

/* ---------- Trafik katmanı ve olaylar ---------- */
function setFlow() {
  const m = S.map;
  if (!m || !S.mapReady) return;
  if (m.getLayer('yolcu-flow')) m.removeLayer('yolcu-flow');
  if (m.getSource('tt-flow')) m.removeSource('tt-flow');
  if (!key() || !store.prefs.traffic) return;
  m.addSource('tt-flow', { type: 'raster', tiles: [traffic.flowTiles(key(), theme() === 'dark')], tileSize: 256, attribution: '© TomTom' });
  m.addLayer({ id: 'yolcu-flow', type: 'raster', source: 'tt-flow', paint: { 'raster-opacity': 0.9 } }, 'yolcu-alt-case');
}

function drawIncidents() {
  if (!S.mapReady) return;
  const list = S.nav ? S.navInc : (store.prefs.traffic ? S.incidents : []);
  S.map.getSource('yolcu-inc')?.setData({
    type: 'FeatureCollection',
    features: list.map(i => ({ type: 'Feature', properties: { id: i.id, img: ensureIncImage(i) }, geometry: { type: 'Point', coordinates: i.point } }))
  });
}

async function loadIncidents(force = false) {
  if (!S.mapReady || !key() || !store.prefs.traffic || S.nav) { drawIncidents(); return; }
  const m = S.map;
  if (m.getZoom() < 10) return;
  const b = m.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const area = (bbox[2] - bbox[0]) * 85 * (bbox[3] - bbox[1]) * 111;
  if (area > 9000) return;
  const prev = S.incAt;
  if (!force && prev && Date.now() - prev.t < 90000 && bbox[0] >= prev.b[0] && bbox[1] >= prev.b[1] && bbox[2] <= prev.b[2] && bbox[3] <= prev.b[3]) return;
  const pad = [(bbox[2] - bbox[0]) * 0.3, (bbox[3] - bbox[1]) * 0.3];
  const big = [bbox[0] - pad[0], bbox[1] - pad[1], bbox[2] + pad[0], bbox[3] + pad[1]];
  try {
    S.incidents = await traffic.incidents(key(), big);
    S.incAt = { b: big, t: Date.now() };
    drawIncidents();
  } catch { }
}

function showIncident(inc) {
  S.incident = inc; S.view = 'incident';
  render(); sheet.set('half');
  S.map?.easeTo({ center: inc.point, zoom: Math.max(S.map.getZoom(), 15), padding: camPadding(), duration: 600 });
}

/* ---------- Radarlar ---------- */
const allCams = () => [...S.cams, ...store.radars.map((r, i) => ({ id: `user${i}`, lat: r.lat, lon: r.lon, max: r.max || null, dir: null, src: 'user' }))];

function drawRadars() {
  if (!S.mapReady) return;
  const list = store.prefs.radar ? (S.nav ? S.navCams : allCams()) : [];
  S.map.getSource('yolcu-cams')?.setData({
    type: 'FeatureCollection',
    features: list.map(c => ({ type: 'Feature', properties: { img: c.src === 'user' ? 'cam-user' : 'cam-osm', max: c.max || 0 }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }))
  });
}

async function loadRadars(p) {
  if (!store.prefs.radar || S.radarLoading) return;
  S.radarLoading = true;
  try { S.cams = await radar.around(p.lat, p.lon); drawRadars(); }
  catch { S.cams = radar.cached(); drawRadars(); }
  finally { S.radarLoading = false; }
}

/* ---------- Hava durumu ---------- */
async function updateWeather(p) {
  if (S.weatherAt && Date.now() - S.weatherAt < 30 * 60e3) return;
  S.weatherAt = Date.now();
  try {
    S.weather = await api.weather(p.lat, p.lon);
    renderWherePill();
  } catch { S.weatherAt = null; }
}

/* ---------- Yol adı rozetleri (rota üzerinde) ---------- */
function clearChips() { S.chips.forEach(m => m.remove()); S.chips = []; }
function drawChips(route) {
  clearChips();
  if (!route?.story || !S.map) return;
  const roads = route.story.filter(s => s.kind === 'road').sort((a, b) => b.m - a.m).slice(0, 4);
  for (const s of roads) {
    const mid = (route.cum[Math.min(s.b, route.cum.length - 1)] + route.cum[Math.min(s.e, route.cum.length - 1)]) / 2;
    const p = pointAt(route.coords, route.cum, mid);
    const el = document.createElement('div');
    const cls = s.cls === 'motorway' ? 'hw' : (s.cls === 'trunk' || s.cls === 'primary') ? 'main' : '';
    el.className = `road-chip ${cls}`;
    el.textContent = api.abbr(s.name);
    S.chips.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(S.map));
  }
}

/* ================= Konum ================= */
function updatePuck(p) {
  if (!S.mapReady) return;
  if (!S.puck) {
    const el = document.createElement('div');
    el.className = 'puck';
    el.innerHTML = `<div class="puck-halo"></div><div class="puck-cone"></div><div class="puck-dot"></div><div class="puck-arrow">${NAV_ARROW}</div>`;
    S.puck = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([p.lon, p.lat]).addTo(S.map);
  }
  if (!S.nav) {
    S.puck.setLngLat([p.lon, p.lat]);
    const hasH = p.heading != null && p.speed > 0.8;
    S.puck.getElement().classList.toggle('has-heading', hasH);
    if (hasH) S.puck.setRotation(p.heading);
  }
}

function onPos(p) {
  const prev = S.pos;
  if (p.speed == null || Number.isNaN(p.speed)) {
    p.speed = 0;
    if (prev) { const dt = (p.t - prev.t) / 1000; if (dt > 0 && dt < 10) p.speed = dist(prev.lon, prev.lat, p.lon, p.lat) / dt; }
  }
  if (p.heading == null || Number.isNaN(p.heading)) {
    p.heading = prev && dist(prev.lon, prev.lat, p.lon, p.lat) > 4 ? bearing(prev.lon, prev.lat, p.lon, p.lat) : prev?.heading ?? null;
  }
  const first = !S.pos;
  S.pos = p;
  updatePuck(p);
  if (first) { updateLocateBtn(); loadRadars(p); updateWeather(p); }
  if (S.firstFix && S.mapReady && !S.nav) { S.firstFix = false; S.map.jumpTo({ center: [p.lon, p.lat], zoom: 15.5, pitch: store.prefs.tilt ? 50 : 0 }); }
  if (S.nav) navTick(p);
  else {
    updateWhere(p);
    updateWeather(p);
    if (S.view === 'where' && (!S.whereRender || Date.now() - S.whereRender > 1000)) { S.whereRender = Date.now(); render(); }
  }
}

function startGeo() {
  if (!('geolocation' in navigator)) { toast('Bu cihazda konum desteği yok'); return; }
  navigator.geolocation.watchPosition(
    g => {
      if (S.sim) return;
      const c = g.coords;
      onPos({ lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: c.speed, heading: c.heading, alt: c.altitude, t: g.timestamp || Date.now() });
    },
    err => {
      if (err.code === 1) toast('Konum izni verilmedi. Ayarlar › Gizlilik › Konum Servisleri’nden izin ver.', 6000);
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
  );
}

function waitPos(ms = 8000) {
  if (S.pos) return Promise.resolve(S.pos);
  return new Promise(res => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (S.pos || Date.now() - t0 > ms) { clearInterval(iv); res(S.pos); }
    }, 250);
  });
}

function updateWhere(p) {
  if (S.whereBusy) return;
  const w = S.whereAt;
  if (w && Date.now() - w.t < 8000) return;
  if (w && dist(w.lon, w.lat, p.lon, p.lat) < 50) return;
  S.whereBusy = true;
  api.reverse(p.lat, p.lon)
    .then(r => { S.where = r; S.whereAt = { lon: p.lon, lat: p.lat, t: Date.now() }; renderWherePill(); if (S.view === 'where') render(); })
    .catch(() => { })
    .finally(() => { S.whereBusy = false; });
}

function renderWherePill() {
  const r = S.where;
  $('where-pill').hidden = !r || !!S.nav;
  if (!r) return;
  $('where-road').textContent = r.road || r.hood || 'Buradasın';
  $('where-area').textContent = [r.road ? r.hood : null, r.district].filter(Boolean).join(', ');
  const w = $('weather');
  if (S.weather) { w.hidden = false; w.innerHTML = `<i>${S.weather.icon}</i>${S.weather.temp}°`; } else w.hidden = true;
}

function updateLocateBtn() {
  const rotated = S.map && Math.abs(S.map.getBearing()) > 2;
  $('btn-locate').innerHTML = rotated ? I.compass : (S.pos ? I.loc : I.locLine);
}

/* ================= Görünümler ================= */
function placeIcon(kind, extra = '') {
  const [ic, col] = KIND_ICON[kind] || KIND_ICON.pin;
  return `<span class="row-icon ${col} ${extra}">${I[ic]}</span>`;
}
function distFromMe(p) {
  if (!S.pos) return '';
  return G.fmtDist(dist(S.pos.lon, S.pos.lat, p.lon, p.lat));
}
function placeRow(p, act, i, kind) {
  return `<button class="row" data-act="${act}" data-i="${i}">${placeIcon(kind || p.kind)}<span class="row-main"><span class="row-title">${esc(p.name)}</span>${p.sub ? `<span class="row-sub">${esc(p.sub)}</span>` : ''}</span><span class="row-meta">${distFromMe(p)}</span></button>`;
}

function prefsList(travel = 'auto') {
  const P = store.prefs;
  const row = (k, title, sub) => `<label class="row"><span class="row-main"><span class="row-title">${title}</span><span class="row-sub wrap">${sub}</span></span><input type="checkbox" class="switch" data-pref="${k}" ${P[k] ? 'checked' : ''}></label>`;
  if (travel !== 'auto') {
    return `<div class="list plain">${row('hills', 'Yokuşlardan kaçın', 'Dik yokuş ve merdivenleri önermez')}</div>`;
  }
  return `<div class="list plain">
    ${row('highways', 'Ana yolları tercih et', 'Otoyol, çevre yolu ve bulvarlardan götürür')}
    ${row('hills', 'Yokuşlardan kaçın', 'Dik yokuşlu yolları önermez')}
    ${row('rough', 'Bozuk yollardan kaçın', 'Bozuk ve kötü yüzeyli yolları önermez')}
    ${row('tolls', 'Ücretli yollardan kaçın', 'Otoyol ve köprü ücretlerinden kaçınır')}
  </div>`;
}

function viewHome() {
  const fav = (k, label, icon, col) => {
    const p = store[k];
    const sub = p ? (distFromMe(p) || 'Git') : 'Ekle';
    return `<button class="fav" data-act="fav" data-k="${k}"><span class="fav-icon ${col}">${I[icon]}</span><span class="fav-title">${label}</span><span class="fav-sub">${sub}</span></button>`;
  };
  const places = store.places.map((p, i) => {
    const [ic, col] = KIND_ICON[p.kind] || KIND_ICON.star;
    return `<button class="fav" data-act="favPlace" data-i="${i}"><span class="fav-icon ${col}">${I[ic]}</span><span class="fav-title">${esc(p.name)}</span><span class="fav-sub">${distFromMe(p) || ''}</span></button>`;
  }).join('');
  const an = store.activeNav;
  const resume = an && !S.nav && Date.now() - an.t < 4 * 3600e3
    ? `<button class="resume" data-act="resumeNav">${I.car}<span style="flex:1"><b>Yola devam et</b><small>${esc(an.dest.name)}</small></span><span class="close" data-act="dismissResume" style="background:rgba(255,255,255,.25);color:#fff">${I.x}</span></button>` : '';
  const recents = store.recents.length
    ? `<div class="list">${store.recents.slice(0, 6).map((p, i) => placeRow(p, 'recent', i, 'recent')).join('')}</div>`
    : `<div class="list"><div class="empty">Gittiğin yerler burada görünecek.</div></div>`;
  const ttHint = !key() ? `<button class="tip" data-act="openSettings"><span class="row-icon c-orange">${I.warn}</span><span class="t"><b>Trafik ve kaza bilgisi kapalı</b><small>Açmak için dokun · 2 dakikalık kurulum</small></span>${I.chevron}</button>` : '';
  return `
    <div class="search-row">
      <button class="searchbar" data-act="openSearch">${I.search}<span>Yolcu’da Ara</span></button>
      <button class="avatar" data-act="openSettings" aria-label="Ayarlar">${I.gear}</button>
    </div>
    ${resume}
    <div class="section" data-peek>
      <div class="section-head"><h3>Favoriler</h3></div>
      <div class="favs">
        ${fav('work', 'İş', 'work', 'c-brown')}
        ${fav('home', 'Ev', 'home', 'c-teal')}
        ${places}
        <button class="fav" data-act="addPlace"><span class="fav-icon add">${I.plus}</span><span class="fav-title">Ekle</span><span class="fav-sub">&nbsp;</span></button>
      </div>
    </div>
    ${ttHint}
    <div class="section">
      <div class="section-head"><h3>Son Kullanılanlar</h3>${store.recents.length ? '<button class="link small" data-act="clearRecents">Temizle</button>' : ''}</div>
      ${recents}
    </div>
    <p class="legal">Harita © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları · OpenFreeMap · Mapterhorn · Uydu © Esri · Rota: Valhalla · Hava: Open‑Meteo${key() ? ' · Trafik © TomTom' : ''}</p>`;
}

function viewSearch() {
  const label = { home: 'Ev adresini ara', work: 'İş yerini ara', place: 'Kaydedilecek yeri ara' }[S.pickFor] || 'Yer, işletme veya adres ara';
  const hint = S.pickFor === 'home' ? '<p class="hint">Sokak adını ve mahalleyi yazman yeterli. Örn: “2996 Sokak Gülyaka”. Adresin sadece bu telefonda saklanır.</p>'
    : S.pickFor === 'work' ? '<p class="hint">İş yerinin adını veya adresini yaz. Bulamazsan Vazgeç’e bas, haritada iş yerinin üstüne basılı tut ve “İş Yap”ı seç.</p>'
      : S.pickFor === 'place' ? '<p class="hint">Sık gittiğin bir yeri ara ve seç, favorilere eklensin.</p>' : '';
  return `
    <div class="search-row" data-peek>
      <label class="searchfield">${I.search}<input id="q" type="search" placeholder="${label}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></label>
      <button class="link" data-act="cancelSearch">Vazgeç</button>
    </div>
    ${hint}
    <div id="results">${resultsHtml(S.results)}</div>`;
}

function resultsHtml(list) {
  const noKeyTip = !key() ? '<p class="hint" style="margin-top:12px">Aradığın işletme çıkmadı mı? Haritada yerin üstüne basılı tut, oradan seçebilirsin. Ayarlar’dan TomTom’u bağlarsan dükkan ve ofisleri de bulur.</p>' : '';
  if (list === 'loading') return '<div class="list"><div class="empty">Aranıyor…</div></div>';
  if (list === 'error') return '<div class="list"><div class="empty">Arama yapılamadı. İnternet bağlantını kontrol et.</div></div>';
  if (Array.isArray(list)) {
    if (!list.length) return `<div class="list"><div class="empty">Sonuç bulunamadı.<br>Farklı yazmayı dene, örn. “Yeşildere Caddesi Karabağlar”.</div></div>${noKeyTip}`;
    return `<div class="list">${list.map((p, i) => placeRow(p, 'pick', i)).join('')}</div>${noKeyTip}`;
  }
  const quick = [];
  if (!S.pickFor) {
    if (store.work) quick.push(`<button class="row" data-act="fav" data-k="work">${placeIcon('work')}<span class="row-main"><span class="row-title">İş</span><span class="row-sub">${esc(store.work.name)}</span></span><span class="row-meta">${distFromMe(store.work)}</span></button>`);
    if (store.home) quick.push(`<button class="row" data-act="fav" data-k="home">${placeIcon('home')}<span class="row-main"><span class="row-title">Ev</span><span class="row-sub">${esc(store.home.sub || store.home.name)}</span></span><span class="row-meta">${distFromMe(store.home)}</span></button>`);
    store.recents.slice(0, 8).forEach((p, i) => quick.push(placeRow(p, 'recent', i, 'recent')));
  }
  return quick.length ? `<div class="list">${quick.join('')}</div>` : '';
}

function viewPlace() {
  const p = S.place;
  const saved = isSaved(p);
  const same = q => q && Math.abs(q.lat - p.lat) < 1e-4 && Math.abs(q.lon - p.lon) < 1e-4;
  const isHome = same(store.home), isWork = same(store.work);
  return `
    <div class="card-head">
      <div><h2>${esc(p.name)}</h2>${p.sub ? `<p class="sub">${esc(p.sub)}</p>` : ''}</div>
      <button class="close" data-act="goHome" aria-label="Kapat">${I.x}</button>
    </div>
    <div data-peek><button class="btn primary" data-act="directions">${I.car}<span>Yol Tarifi</span>${S.pos ? `<small>· ${distFromMe(p)}</small>` : ''}</button></div>
    <div class="action-grid">
      <button data-act="setHomeHere" class="${isHome ? 'on' : ''}">${I.home}<span>${isHome ? 'Evin' : 'Ev Yap'}</span></button>
      <button data-act="setWorkHere" class="${isWork ? 'on' : ''}">${I.work}<span>${isWork ? 'İşin' : 'İş Yap'}</span></button>
      <button data-act="saveHere" class="${saved ? 'on' : ''}">${I.star}<span>${saved ? 'Kayıtlı' : 'Kaydet'}</span></button>
      <button data-act="sharePlace">${I.share}<span>Paylaş</span></button>
    </div>
    ${p.isPoint ? `<div class="section"><div class="list plain">
      <button class="row danger" data-act="avoidHere"><span class="row-icon c-red">${I.noentry}</span><span class="row-main"><span class="row-title">Bu yoldan beni geçirme</span><span class="row-sub wrap">Rotalar artık bu noktadaki yolu kullanmaz</span></span></button>
      <button class="row" data-act="radarHere"><span class="row-icon c-purple">${I.camera}</span><span class="row-main"><span class="row-title">Burada radar var</span><span class="row-sub wrap">Buradan geçerken seni uyarır</span></span></button>
    </div></div>` : ''}`;
}

function viewIncident() {
  const i = S.incident;
  const since = i.start ? new Date(i.start) : null;
  const d = Math.round(i.delay / 60);
  return `
    <div class="card-head">
      <div><p class="eyebrow" style="color:${ringColor(i)}">${esc(i.label)}</p><h2>${esc(i.desc)}</h2>
      <p class="sub">${esc([i.road, i.from && i.to ? `${i.from} → ${i.to}` : i.from].filter(Boolean).join(' · '))}</p></div>
      <button class="close" data-act="goHome" aria-label="Kapat">${I.x}</button>
    </div>
    <div class="stats-grid" data-peek>
      <div class="stat-card"><small>Gecikme</small><b>${d >= 1 ? d : '—'}<span>${d >= 1 ? 'dk' : ''}</span></b></div>
      <div class="stat-card"><small>Başlangıç</small><b style="font-size:21px">${since ? G.fmtClock(since) : '—'}</b></div>
    </div>
    <p class="legal" style="text-align:left;margin-top:6px">Kaynak: TomTom canlı trafik</p>`;
}

function fmtBig(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min}<small> dk</small>`;
  return `${Math.floor(min / 60)}<small> sa </small>${min % 60}<small> dk</small>`;
}
const rtime = r => r.trafficTime || r.time;

function storyHtml(r) {
  const st = r.story;
  if (!st || !st.length) return '';
  const items = st.map((s, i) => {
    if (s.kind === 'local') return `<div class="tl-item local"><span class="tl-dot"></span><div><small>Ara sokaklar · ${G.fmtDist(s.m)}</small></div></div>`;
    const cls = s.cls === 'motorway' ? 'hw' : (s.cls === 'trunk' || s.cls === 'primary') ? 'main' : '';
    const tw = s.toward?.length ? ` · ${esc(s.toward.join(', '))} yönü` : '';
    return `<button class="tl-item road ${cls}" data-act="focusSeg" data-i="${i}"><span class="tl-dot"></span><div><b>${esc(s.name)}${s.ref ? ` <span class="ref">${esc(s.ref)}</span>` : ''}</b><small>${G.fmtDist(s.m)}${tw}</small></div></button>`;
  }).join('');
  return `
    <div class="section">
      <div class="section-head"><h3>Hangi yoldan?</h3><button class="link small icon-link" data-act="speakStory">${I.speaker}<span>Sesli anlat</span></button></div>
      <div class="list plain timeline">
        <div class="tl-item start"><span class="tl-dot"></span><div><b>Konumun</b></div></div>
        ${items}
        <div class="tl-item end"><span class="tl-dot"></span><div><b>${esc(S.dest.name)}</b></div></div>
      </div>
      <p class="story-text">${esc(G.storySpeech(st, S.dest.name))}</p>
    </div>`;
}

function viewRoutes() {
  const d = S.dest;
  const modes = Object.entries(TRAVEL).map(([k, [label, ic]]) => `<button class="${S.travel === k ? 'on' : ''}" data-act="travel" data-v="${k}">${I[ic]}<span>${label}</span></button>`).join('');
  let cards;
  if (S.routeErr) cards = `<div class="list"><div class="empty">${esc(S.routeErr)}<br><br><button class="link" data-act="replan">Tekrar dene</button></div></div>`;
  else if (!S.routes.length) cards = '<div class="skeleton" data-peek></div><div class="skeleton"></div>';
  else {
    const best = S.routes[0];
    cards = S.routes.map((r, i) => {
      const eta = G.fmtClock(new Date(Date.now() + rtime(r) * 1000));
      const diff = i > 0 ? Math.round((rtime(r) - rtime(best)) / 60) : 0;
      const diffTxt = i > 0 && diff !== 0 ? ` · ${diff > 0 ? '+' : ''}${diff} dk` : '';
      const badges = (r.best ? '<span class="badge best">Önerilen</span>' : '') + (r.fastest ? '<span class="badge fast">En hızlı</span>' : '');
      const via = r.story ? r.story.filter(s => s.kind === 'road').map(s => api.abbr(s.name)).filter((v, k, a) => a.indexOf(v) === k).slice(0, 4).join(' › ') : r.via;
      return `<div class="route-card ${i === S.sel ? 'sel' : ''}" data-act="selRoute" data-i="${i}" ${i === 0 ? 'data-peek' : ''}>
        <div class="rc-main">
          ${badges ? `<div class="rc-badges">${badges}</div>` : ''}
          <div class="rc-time">${fmtBig(rtime(r))}</div>
          <div class="rc-sub">${eta} varış · ${G.fmtDist(r.lengthM)}${diffTxt}</div>
          ${via ? `<div class="rc-via">${esc(via)}</div>` : ''}
          <div class="tags">${r.tags.map(t => `<span class="tag ${t.c}">${esc(t.t)}</span>`).join('')}</div>
        </div>
        <div class="rc-side">
          <button class="go" data-act="go" data-i="${i}">GİT</button>
          <button class="link small" data-act="preview" data-i="${i}">Önizle</button>
        </div>
      </div>`;
    }).join('');
  }
  const r = S.routes[S.sel];
  let steps = '';
  if (r) {
    let prev = 0;
    steps = r.maneuvers.filter(m => !m.silent).map(m => {
      const seg = m.along - prev; prev = m.along;
      const signs = (m.toward.length ? m.toward : m.branch).slice(0, 3).join(', ');
      const sub = signs ? `${signs} yönü` : m.street;
      return `<div class="row"><span class="step-icon">${G.arrowSvg(m)}</span><span class="row-main"><span class="row-title">${esc(G.action(m))}</span>${sub ? `<span class="row-sub wrap">${esc(sub)}</span>` : ''}</span><span class="row-meta">${seg > 5 ? G.fmtDist(seg) : ''}</span></div>`;
    }).join('');
  }
  const destKind = d.kind === 'work' ? ['work', 'c-brown'] : d.kind === 'home' ? ['home', 'c-teal'] : ['pin', 'c-red'];
  return `
    <div class="card-head center">
      <button class="circle-btn" data-act="shareEta" aria-label="Paylaş">${I.share}</button>
      <div><h2>Yol Tarifi</h2></div>
      <button class="close" data-act="closeRoutes" aria-label="Kapat">${I.x}</button>
    </div>
    <div class="mode-seg">${modes}</div>
    <div class="fromto">
      <div class="ft-row"><span class="ft-dot c-blue">${I.loc}</span><span>Konumum</span></div>
      <div class="ft-row"><span class="ft-dot ${destKind[1]}">${I[destKind[0]]}</span><span>${esc(d.name)}</span></div>
    </div>
    ${cards}
    ${r ? storyHtml(r) : ''}
    <div class="section"><div class="section-head"><h3>Rota Tercihleri</h3></div>${prefsList(S.travel)}</div>
    ${steps ? `<div class="section"><div class="section-head"><h3>Adım Adım</h3></div><div class="list plain steps">${steps}</div></div>` : ''}`;
}

function viewWhere() {
  const r = S.where || {};
  const p = S.pos;
  const kmh = p ? Math.round((p.speed || 0) * 3.6) : 0;
  const area = [r.hood, r.district, r.city].filter(Boolean).join(', ');
  const w = S.weather;
  return `
    <div class="card-head">
      <div><p class="eyebrow">Şu an buradasın</p><h2>${esc(r.road || r.hood || 'Konum alınıyor…')}</h2>${area ? `<p class="sub">${esc(area)}</p>` : ''}</div>
      <button class="close" data-act="goHome" aria-label="Kapat">${I.x}</button>
    </div>
    <div class="stats-grid" data-peek>
      <div class="stat-card"><small>Hız</small><b>${kmh}<span>km/sa</span></b></div>
      <div class="stat-card"><small>Hava</small><b>${w ? `${w.icon} ${w.temp}°` : '—'}</b></div>
      <div class="stat-card"><small>Yön</small><b style="font-size:21px">${p?.heading != null && p.speed > 0.8 ? compass(p.heading) : '—'}</b></div>
      <div class="stat-card"><small>Rakım</small><b>${p?.alt != null ? Math.round(p.alt) : '—'}<span>${p?.alt != null ? 'm' : ''}</span></b></div>
    </div>
    ${p ? `<div class="list plain"><button class="row" data-act="copyCoords"><span class="row-main"><span class="row-title">Koordinatlar</span><span class="row-sub">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · ±${Math.round(p.acc || 0)} m</span></span><span class="row-meta" style="color:var(--blue)">Kopyala</span></button></div>` : ''}
    <div class="action-grid" style="grid-template-columns:repeat(2,1fr)">
      <button data-act="shareMe">${I.share}<span>Konumumu Paylaş</span></button>
      <button data-act="saveMe">${I.star}<span>Burayı Kaydet</span></button>
    </div>`;
}

function render() {
  const v = { home: viewHome, search: viewSearch, place: viewPlace, routes: viewRoutes, where: viewWhere, incident: viewIncident }[S.view];
  if (S.view === 'search' && $('q')) { $('results').innerHTML = resultsHtml(S.results); return; }
  sheet.body.innerHTML = v();
}

function goHome() {
  S.view = 'home'; S.place = null; S.pickFor = null; S.results = null; S.incident = null;
  S.planAbort?.abort();
  setDest(null); setRoutesData([]); setJams([]); clearChips();
  render();
  sheet.set('peek');
}

/* ================= Arama ================= */
function openSearch() {
  S.view = 'search'; S.results = null;
  sheet.body.innerHTML = '';
  render();
  // Önce paneli anında yukarı al, sonra klavyeyi aç: iOS sayfayı kaydırmasın
  sheet.set('full', false);
  const q = $('q');
  q.focus({ preventScroll: true });
  q.addEventListener('input', () => onSearchInput(q.value));
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); q.blur(); onSearchInput(q.value, true); } });
}

const near = (a, b) => dist(a.lon, a.lat, b.lon, b.lat) < 60;
function onSearchInput(q, now = false) {
  clearTimeout(S.searchT);
  S.searchAbort?.abort();
  q = q.trim();
  if (q.length < 2) { S.results = null; render(); return; }
  S.searchT = setTimeout(async () => {
    const ac = S.searchAbort = new AbortController();
    if (!Array.isArray(S.results)) { S.results = 'loading'; render(); }
    const center = S.pos || (S.map ? { lat: S.map.getCenter().lat, lon: S.map.getCenter().lng } : IZMIR);
    try {
      const [tt, ph] = await Promise.all([
        key() ? traffic.search(key(), q, center, ac.signal).catch(e => { if (e.name === 'AbortError') throw e; return []; }) : [],
        api.search(q, center, ac.signal)
      ]);
      let list = [...tt];
      for (const p of ph) if (!list.some(x => x.name === p.name && near(x, p))) list.push(p);
      if (!list.length || now) {
        const more = await api.searchFallback(q, ac.signal).catch(() => []);
        for (const p of more) if (!list.some(x => x.name === p.name && near(x, p))) list.push(p);
      }
      S.results = list.slice(0, 14); render();
    } catch (e) {
      if (e.name !== 'AbortError') { S.results = 'error'; render(); }
    }
  }, now ? 0 : 280);
}

function choosePlace(p) {
  if (S.pickFor === 'home' || S.pickFor === 'work') {
    store[S.pickFor] = { name: p.name, sub: p.sub, lat: p.lat, lon: p.lon, kind: S.pickFor };
    save();
    toast(S.pickFor === 'home' ? 'Ev kaydedildi' : 'İş kaydedildi');
    goHome();
    return;
  }
  if (S.pickFor === 'place') {
    if (!isSaved(p)) toggleSaved(p);
    toast(`${p.name} favorilere eklendi`);
    goHome();
    return;
  }
  showPlace(p);
}

function showPlace(p) {
  document.activeElement?.blur?.();
  S.place = p; S.view = 'place';
  render();
  sheet.set('half');
  setDest(p);
  setRoutesData([]); setJams([]); clearChips();
  S.map?.easeTo({ center: [p.lon, p.lat], zoom: Math.max(S.map.getZoom(), 15.5), padding: camPadding(), duration: 700 });
}

async function openPoint(ll) {
  const p = { name: 'İşaretli Konum', sub: 'Adres alınıyor…', lat: ll.lat, lon: ll.lng, kind: 'pin', isPoint: true };
  showPlace(p);
  try {
    const r = await api.reverse(ll.lat, ll.lng);
    if (S.place !== p) return;
    p.name = r.name || r.road || 'İşaretli Konum';
    p.road = r.road;
    p.sub = [r.name ? r.road : null, r.hood, r.district].filter(Boolean).join(', ');
  } catch { p.sub = ''; }
  if (S.place === p) render();
}

/* ================= Rotalar ================= */
function openRoutes(dest) {
  document.activeElement?.blur?.();
  S.dest = { name: dest.name, sub: dest.sub || '', lat: dest.lat, lon: dest.lon, kind: dest.kind || 'pin' };
  S.view = 'routes';
  setDest(S.dest);
  planRoutes();
  sheet.set('half');
}

function friendlyErr(e) {
  const m = String(e?.message || '');
  if (/path|unreachable|No suitable edges|connect|distance/i.test(m)) {
    return 'Bu hedefe bu şekilde gidilebilecek bir yol bulunamadı.' + (store.avoids.length && S.travel === 'auto' ? ' Kaçındığın yollardan biri engel olabilir (Ayarlar).' : '');
  }
  return 'Rota alınamadı. İnternet bağlantını kontrol edip tekrar dene.';
}

async function planRoutes() {
  S.planAbort?.abort();
  const ac = S.planAbort = new AbortController();
  S.routes = []; S.routeErr = null; S.sel = 0;
  render();
  setRoutesData([]); setJams([]); clearChips();
  const from = await waitPos();
  if (ac.signal.aborted) return;
  if (!from) { S.routeErr = 'Konumun alınamadı. Konum iznini kontrol et.'; render(); return; }
  try {
    const tf = key() ? (r, signal) => traffic.routeTraffic(key(), r, signal) : null;
    const routes = await api.planRoutes(from, S.dest, store.prefs, store.avoids, ac.signal, S.travel, tf);
    if (ac.signal.aborted || S.view !== 'routes') return;
    S.routes = routes;
    render();
    sheet.set(sheet.detent === 'full' ? 'full' : 'half');
    drawRoutes();
    fitCoords(routes.flatMap(r => r.coords));
    if (S.autoStart) { S.autoStart = false; startNav(0); }
  } catch (e) {
    if (e.name === 'AbortError') return;
    S.routeErr = friendlyErr(e);
    S.autoStart = false;
    render();
  }
}

function drawRoutes() {
  const fs = S.routes.map((r, i) => line(r.coords, { i, sel: i === S.sel }));
  fs.sort((a, b) => a.properties.sel - b.properties.sel);
  setRoutesData(fs);
  const r = S.routes[S.sel];
  setJams(r?.jams);
  drawChips(r);
}

function selectRoute(i) {
  S.sel = i;
  const sc = sheet.body.scrollTop;
  render();
  sheet.body.scrollTop = sc;
  drawRoutes();
}

/* ================= Navigasyon ================= */
function startNav(i, simulate = false) {
  const route = S.routes[i];
  if (!route) return;
  voice.unlock();
  addRecent(S.dest);
  store.activeNav = { dest: S.dest, t: Date.now() };
  save();
  S.navRoute = route;
  S.nav = new Navigator(route);
  S.follow = true; S.arrowFor = -1; S.arrived = false; S.bannerFor = null;
  S.navInc = []; S.said = new Set(); S.trafRatio = route.trafficRatio || null;
  S.navCams = route.mode === 'auto' ? radar.onRoute(allCams(), route) : [];
  const eta = G.fmtClock(new Date(Date.now() + rtime(route) * 1000));
  S.navIntro = [G.storyShort(route.story), `Tahmini varış ${eta}.`].filter(Boolean).join(' ');
  document.body.classList.add('navigating');
  for (const id of ['nav', 'nav-side', 'nav-speed', 'nav-bottom']) $(id).hidden = false;
  $('nav-recenter').hidden = true;
  $('nav-alert').hidden = true;
  $('speed-limit').hidden = true;
  closeNavMenu();
  $('nav-speed').classList.toggle('walk', route.mode !== 'auto');
  $('nav-radar').hidden = route.mode !== 'auto';
  updateMuteBtn();
  $('nav-overview').innerHTML = I.route;
  $('nav-radar').innerHTML = I.camera;
  S.puck?.getElement().classList.add('nav');
  clearChips();
  setRoutesData([line(route.coords, { i: 0, sel: true })]);
  setJams(route.jams);
  setDest(S.dest);
  applyTheme();
  drawIncidents();
  drawRadars();
  keepAwake(true);
  if (key() && route.mode === 'auto') {
    refreshNavIncidents();
    S.timers.push(setInterval(refreshNavIncidents, 120000));
    S.timers.push(setInterval(refreshNavTraffic, 300000));
  }
  if (simulate) {
    S.sim = new Simulator(route, p => { onPos(p); }, 3);
    showSimStatus();
  } else {
    $('nav-status').hidden = true;
    if (S.pos) navTick(S.pos);
  }
}

async function refreshNavIncidents() {
  if (!S.nav || !key()) return;
  const r = S.navRoute;
  const rem = sliceAlong(r.coords, r.cum, S.nav.along, Math.min(r.lengthM, S.nav.along + 60000));
  try {
    const list = await traffic.incidents(key(), traffic.bboxOf(rem, 0.004));
    if (!S.nav) return;
    S.navInc = traffic.onRoute(list, S.navRoute);
    drawIncidents();
  } catch { }
}

async function refreshNavTraffic() {
  if (!S.nav || !key()) return;
  const r = S.navRoute;
  try {
    const rem = { coords: sliceAlong(r.coords, r.cum, S.nav.along, r.lengthM), time: 1 };
    const t = await traffic.routeTraffic(key(), rem);
    if (S.nav) { S.trafRatio = t.trafficRatio; setJams(t.jams); }
  } catch { }
}

function showSimStatus() {
  const s = $('nav-status');
  s.hidden = false; s.className = 'nav-status sim';
  s.dataset.act = 'simSpeed';
  s.textContent = `Önizleme · ${S.sim.factor}× hız (değiştirmek için dokun)`;
}

function navPadding() {
  const H = window.innerHeight;
  if (wide()) return { top: Math.round(H * 0.35), bottom: 60, left: 450, right: 40 };
  return { top: Math.round(H * 0.44), bottom: 120 + safeB(), left: 0, right: 0 };
}

function maneuverArrow(m) {
  const r = S.navRoute;
  if (!m || (m.type >= 1 && m.type <= 6)) { setArrowData([]); return; }
  const c = sliceAlong(r.coords, r.cum, Math.max(0, m.along - 40), Math.min(r.lengthM, m.along + 30));
  if (c.length < 2) { setArrowData([]); return; }
  const a = c[c.length - 2], b = c[c.length - 1];
  setArrowData([
    line(c, {}),
    { type: 'Feature', properties: { b: bearing(a[0], a[1], b[0], b[1]) }, geometry: { type: 'Point', coordinates: b } }
  ]);
}

function renderBanner(st) {
  const up = st.up;
  if (!up) return;
  if (S.bannerFor !== up) {
    S.bannerFor = up;
    $('nav-icon').innerHTML = G.arrowSvg(up);
    $('nav-action').textContent = G.action(up);
    const signs = (up.toward.length ? up.toward : up.branch).slice(0, 3);
    let road = '';
    if (up.exitNo) road += `<span class="sign exit">Çıkış ${esc(up.exitNo)}</span>`;
    road += signs.map(t => `<span class="sign">${esc(t)}</span>`).join('');
    if (!signs.length) road += esc(up.type >= 4 && up.type <= 6 ? S.dest?.name : up.street);
    $('nav-road').innerHTML = road;
  }
  $('nav-dist').textContent = G.fmtDist(st.distToNext);
  const th = $('nav-then');
  if (st.then && st.gap < 400 && st.distToNext < 1200) {
    th.hidden = false;
    th.innerHTML = `${G.arrowSvg(st.then)}<span><span class="lbl">Ardından</span> ${esc(G.action(st.then))}${st.then.street ? ` · ${esc(st.then.street)}` : ''}</span>`;
  } else th.hidden = true;
}

function setDur(sec, valId, unitId) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) { $(valId).textContent = min; $(unitId).textContent = 'dk'; }
  else { $(valId).textContent = `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; $(unitId).textContent = 'sa'; }
}
function setKm(m) {
  if (m >= 1000) { $('nav-km').textContent = m >= 10000 ? Math.round(m / 1000) : (m / 1000).toFixed(1).replace('.', ','); $('nav-km-u').textContent = 'km'; }
  else { $('nav-km').textContent = Math.round(m / 10) * 10; $('nav-km-u').textContent = 'm'; }
}

function navTick(p) {
  if (!S.nav) return;
  const st = S.nav.update(p);
  const r = S.navRoute;
  const walk = r.mode !== 'auto';
  const onRoute = st.snapped.d < 30;
  const pp = onRoute ? st.snapped : p;
  const hd = p.speed > (walk ? 0.8 : 2) && p.heading != null ? p.heading : st.routeBearing;
  if (S.puck) { S.puck.setLngLat([pp.lon, pp.lat]); S.puck.setRotation(hd); }

  setRoutesData([line(sliceAlong(r.coords, r.cum, st.along, st.total), { i: 0, sel: true })]);
  if (st.upIdx !== S.arrowFor) { S.arrowFor = st.upIdx; maneuverArrow(st.up); }
  renderBanner(st);

  const remS = st.remS * (S.trafRatio && !walk ? Math.max(0.85, S.trafRatio) : 1);
  $('nav-eta').textContent = G.fmtClock(new Date(Date.now() + remS * 1000));
  setDur(remS, 'nav-rem', 'nav-rem-u');
  setKm(st.remM);
  const kmh = Math.round((p.speed || 0) * 3.6);
  $('speed-val').textContent = kmh;

  // Radar
  let say = st.say;
  if (say && S.navIntro) { say = `${S.navIntro} ${say}`; S.navIntro = null; }
  const cam = store.prefs.radar ? S.navCams.find(c => c.along > st.along - 15 && c.along - st.along < 1000) : null;
  let limit = st.limit;
  if (cam?.max && cam.along - st.along < 600) limit = cam.max;
  const lim = $('speed-limit');
  lim.hidden = !limit || walk;
  if (limit) lim.textContent = limit;
  const over = !walk && !!limit && kmh > limit + 4;
  $('nav-speed').classList.toggle('over', over);

  const street = $('nav-street');
  street.hidden = !st.street || !S.follow;
  street.textContent = st.street;

  // Uyarı balonu: önce radar (yakınsa), sonra kaza/yol çalışması
  const al = $('nav-alert');
  const inc = S.navInc.find(i => i.along > st.along - 30 && i.along - st.along < 5000);
  if (cam) {
    const dd = Math.max(0, cam.along - st.along);
    al.hidden = false;
    al.className = `nav-alert radar${over ? ' over' : ''}`;
    al.innerHTML = `<span class="na-emoji">📷</span><span><b>Radar</b> · ${G.fmtDist(dd)}${cam.max ? ` · Sınır ${cam.max}` : ''}</span>`;
    if (dd < 550 && !S.said.has('cam' + cam.id)) {
      S.said.add('cam' + cam.id);
      if (store.prefs.radarSound) radar.beep(over ? 3 : 2);
      const t = `Radar var${cam.max ? `, hız sınırı ${cam.max}` : ''}.`;
      say = say ? `${say} ${t}` : t;
    }
  } else if (inc) {
    const dd = Math.max(0, inc.along - st.along);
    const dm = Math.round(inc.delay / 60);
    al.hidden = false;
    al.className = `nav-alert m${Math.min(inc.mag, 3)}`;
    al.innerHTML = `<span class="na-emoji">${inc.emoji}</span><span><b>${esc(inc.label)}</b> · ${G.fmtDist(dd)}${dm >= 1 ? ` · +${dm} dk` : ''}</span>`;
    if (dd < 1500 && !S.said.has('inc' + inc.id)) {
      S.said.add('inc' + inc.id);
      if (store.prefs.radarSound) radar.beep(1);
      const t = `Dikkat, ileride ${inc.label.toLocaleLowerCase('tr')} var${dm >= 1 ? `, yaklaşık ${dm} dakika gecikme` : ''}.`;
      say = say ? `${say} ${t}` : t;
    }
  } else al.hidden = true;

  if (say) voice.say(say);
  if (st.arrived) { arrive(); return; }
  if (st.reroute) doReroute(p);
  else if (!S.sim && !S.rerouting) $('nav-status').hidden = !st.offRoute;
  if (st.offRoute && !S.sim && !S.rerouting) { const s = $('nav-status'); s.className = 'nav-status'; s.textContent = 'Rotanın dışındasın'; delete s.dataset.act; }

  // Yan düğmeler üst kartın hemen altında dursun (kart büyüyüp küçülünce çakışmasın)
  const nb = Math.round($('nav').getBoundingClientRect().bottom + 12);
  if (nb !== S.sideTop) { S.sideTop = nb; $('nav-side').style.top = nb + 'px'; }

  if (S.follow && S.map) {
    let z;
    if (walk) z = 18;
    else z = st.distToNext < 220 ? 17.3 : p.speed > 22 ? 15.6 : p.speed > 13 ? 16.2 : 16.8;
    S.map.easeTo({ center: [pp.lon, pp.lat], bearing: hd, pitch: walk ? 45 : 60, zoom: z, duration: S.sim ? 480 : 950, easing: t => t, padding: navPadding() });
  }
}

async function doReroute(p) {
  if (S.rerouting) return;
  S.rerouting = true;
  const s = $('nav-status');
  s.hidden = false; s.className = 'nav-status'; s.textContent = 'Rota yeniden hesaplanıyor…'; delete s.dataset.act;
  try {
    const r = await api.reroute(p, S.dest, S.navRoute, S.nav.along, store.prefs, store.avoids);
    if (!S.nav) return;
    S.navRoute = r;
    S.nav.setRoute(r);
    S.nav.started = true;
    S.arrowFor = -1; S.bannerFor = null;
    S.navCams = r.mode === 'auto' ? radar.onRoute(allCams(), r) : [];
    drawRadars();
    setJams([]);
    if (key() && r.mode === 'auto') { refreshNavIncidents(); refreshNavTraffic(); }
    voice.say('Rota güncellendi.');
  } catch {
    toast('Yeni rota alınamadı, tekrar denenecek');
  } finally {
    S.rerouting = false;
    if (S.sim) showSimStatus(); else s.hidden = true;
  }
}

function arrive() {
  if (S.arrived) return;
  S.arrived = true;
  voice.say('Hedefinize vardınız.');
  $('nav-icon').innerHTML = G.arrowSvg({ type: 4 });
  $('nav-dist').textContent = 'Vardınız';
  $('nav-action').textContent = S.dest?.name || '';
  $('nav-road').innerHTML = '';
  $('nav-then').hidden = true;
  $('nav-alert').hidden = true;
  S.sim?.stop();
  setTimeout(() => { if (S.nav) endNav(); }, 4000);
}

function endNav() {
  S.sim?.stop(); S.sim = null;
  S.nav = null; S.navRoute = null; S.bannerFor = null; S.navInc = []; S.navCams = [];
  S.timers.forEach(clearInterval); S.timers = [];
  document.body.classList.remove('navigating');
  closeNavMenu();
  for (const id of ['nav', 'nav-side', 'nav-speed', 'nav-bottom', 'nav-recenter', 'nav-street']) $(id).hidden = true;
  S.puck?.getElement().classList.remove('nav');
  keepAwake(false);
  voice.stop();
  store.activeNav = null; save();
  setRoutesData([]); setArrowData([]); setJams([]); setDest(null);
  applyTheme();
  drawRadars();
  if (S.map) {
    S.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const c = S.pos ? [S.pos.lon, S.pos.lat] : S.map.getCenter();
    S.map.easeTo({ center: c, pitch: store.prefs.tilt ? 50 : 0, bearing: 0, zoom: 15.5, duration: 800 });
  }
  if (S.pos) updatePuck(S.pos);
  renderWherePill();
  S.view = 'home'; S.dest = null; S.routes = [];
  render();
  sheet.set('peek');
  loadIncidents(true);
}

function updateMuteBtn() {
  const b = $('nav-mute');
  b.innerHTML = store.prefs.voice ? I.speaker : I.mute;
  b.classList.toggle('off', !store.prefs.voice);
}

function renderNavMenu() {
  const P = store.prefs;
  $('nav-menu').innerHTML = `
    <div class="list">
      <button class="row" data-act="overview"><span class="row-icon c-blue">${I.route}</span><span class="row-main"><span class="row-title">Tüm rotayı gör</span></span></button>
      <label class="row"><span class="row-icon c-gray">${I.speaker}</span><span class="row-main"><span class="row-title">Sesli yönlendirme</span></span><input type="checkbox" class="switch" data-pref="voice" ${P.voice ? 'checked' : ''}></label>
      <label class="row"><span class="row-icon c-purple">${I.camera}</span><span class="row-main"><span class="row-title">Radar uyarı sesi</span></span><input type="checkbox" class="switch" data-pref="radarSound" ${P.radarSound ? 'checked' : ''}></label>
      ${S.navRoute?.mode === 'auto' ? `<button class="row" data-act="reportRadar"><span class="row-icon c-purple">${I.plus}</span><span class="row-main"><span class="row-title">Burada radar var</span></span></button>` : ''}
      <button class="row" data-act="shareEta"><span class="row-icon c-green">${I.share}</span><span class="row-main"><span class="row-title">Varış saatini paylaş</span></span></button>
    </div>
    <button class="end-route" data-act="endNav">Rotayı Bitir</button>`;
}
function closeNavMenu() { $('nav-menu').hidden = true; document.body.classList.remove('nav-menu-open'); }

/* ================= Harita görünümü menüsü ================= */
function renderLayers() {
  const P = store.prefs;
  $('layers').innerHTML = `
    <div class="layers-head"><b>Harita</b><button class="close" data-act="closeLayers" aria-label="Kapat">${I.x}</button></div>
    <div class="map-types">
      <button class="mt ${P.mapType !== 'satellite' ? 'on' : ''}" data-act="mapType" data-v="standard"><span class="mt-img std"></span><span>Standart</span></button>
      <button class="mt ${P.mapType === 'satellite' ? 'on' : ''}" data-act="mapType" data-v="satellite"><span class="mt-img sat"></span><span>Uydu</span></button>
    </div>
    <div class="list plain">
      <label class="row"><span class="row-main"><span class="row-title">3B görünüm</span><span class="row-sub">Binalar ve eğik bakış</span></span><input type="checkbox" class="switch" data-pref="tilt" ${P.tilt ? 'checked' : ''}></label>
      <label class="row"><span class="row-main"><span class="row-title">Radarlar</span><span class="row-sub">Hız kameralarını göster ve uyar</span></span><input type="checkbox" class="switch" data-pref="radar" ${P.radar ? 'checked' : ''}></label>
      <label class="row"><span class="row-main"><span class="row-title">Trafik</span><span class="row-sub">${key() ? 'Yoğunluk, kaza ve yol çalışması' : 'Önce Ayarlar’dan TomTom’u bağla'}</span></span><input type="checkbox" class="switch" data-pref="traffic" ${P.traffic && key() ? 'checked' : ''} ${key() ? '' : 'disabled'}></label>
    </div>`;
}

/* ================= Ayarlar ================= */
function renderSettings() {
  const P = store.prefs;
  const seg = (v, l) => `<button class="${P.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`;
  const favRow = (k, label, icon) => {
    const p = store[k];
    return `<button class="row" data-act="setFav" data-k="${k}">${placeIcon(icon)}<span class="row-main"><span class="row-title">${label}</span><span class="row-sub">${p ? esc(p.name + (p.sub ? ', ' + p.sub : '')) : 'Ayarlanmadı'}</span></span><span class="row-meta" style="color:var(--blue)">${p ? 'Değiştir' : 'Ekle'}</span></button>`;
  };
  const places = store.places.length ? store.places.map((p, i) => `<div class="row">${placeIcon(p.kind || 'star')}<span class="row-main"><span class="row-title">${esc(p.name)}</span><span class="row-sub">${esc(p.sub)}</span></span><button class="close" data-act="delPlace" data-i="${i}" aria-label="Sil">${I.trash}</button></div>`).join('')
    : '<div class="empty">Henüz kayıtlı yer yok.</div>';
  const avoids = store.avoids.length ? store.avoids.map((a, i) => `<div class="row"><span class="row-icon c-red">${I.noentry}</span><span class="row-main"><span class="row-title">${esc(a.name || 'Yol')}</span><span class="row-sub">${esc(a.sub || '')}</span></span><button class="close" data-act="delAvoid" data-i="${i}" aria-label="Sil">${I.trash}</button></div>`).join('')
    : '<div class="empty">Henüz kaçındığın yol yok.</div>';
  const myRadars = store.radars.length ? store.radars.map((r, i) => `<div class="row"><span class="row-icon c-purple">${I.camera}</span><span class="row-main"><span class="row-title">${esc(r.name || 'Radar')}</span><span class="row-sub">${new Date(r.t).toLocaleDateString('tr-TR')} tarihinde işaretlendi</span></span><button class="close" data-act="delRadar" data-i="${i}" aria-label="Sil">${I.trash}</button></div>`).join('')
    : '<div class="empty">Henüz işaretlediğin radar yok.</div>';
  const icons = Object.entries(ICONS).map(([id, name]) => `<button class="icon-opt ${P.icon === id ? 'on' : ''}" data-act="pickIcon" data-v="${id}"><img src="icons/${id}-180.png" alt=""><span>${name}</span></button>`).join('');

  $('settings-body').innerHTML = `
    <div class="group-title">Görünüm</div>
    <div class="segmented">${seg('auto', 'Otomatik')}${seg('light', 'Açık')}${seg('dark', 'Koyu')}</div>

    <div class="group-title">Radar</div>
    <div class="list plain">
      <label class="row"><span class="row-main"><span class="row-title">Radar uyarıları</span><span class="row-sub">${S.cams.length ? `Çevrende ${S.cams.length} radar biliniyor` : 'Radar verisi yükleniyor'}</span></span><input type="checkbox" class="switch" data-pref="radar" ${P.radar ? 'checked' : ''}></label>
      <label class="row"><span class="row-main"><span class="row-title">Uyarı sesi</span><span class="row-sub">Sesli yönlendirme kapalıyken de kısa bir “bip” çalar</span></span><input type="checkbox" class="switch" data-pref="radarSound" ${P.radarSound ? 'checked' : ''}></label>
    </div>
    <div class="group-title">İşaretlediğin Radarlar</div>
    <div class="list plain">${myRadars}</div>
    <p class="group-foot">Radar konumları OpenStreetMap’ten gelir ve her yerde eksiksiz olmayabilir. Bilmediği bir radar görürsen navigasyonda kamera düğmesine bas ya da haritada o noktaya basılı tutup “Burada radar var”ı seç.</p>

    <div class="group-title">Sesli Yönlendirme</div>
    <div class="list plain">
      <label class="row"><span class="row-main"><span class="row-title">Sesli yönlendirme</span><span class="row-sub">${voice.v ? esc(voice.v.name) : 'Telefonun sesi'}</span></span><input type="checkbox" class="switch" data-pref="voice" ${P.voice ? 'checked' : ''}></label>
    </div>

    <div class="group-title">Trafik ve İşletme Arama</div>
    <div class="list plain">
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <span class="row-main"><span class="row-title">TomTom</span><span class="row-sub">${key() ? '<span style="color:var(--green)">● Bağlı</span> · Trafik, kazalar, işletme arama açık' : 'Bağlı değil'}</span></span>
        ${key() ? `<button class="pill-btn" data-act="removeKey">Kaldır</button>` : ''}
      </div>
      ${key() ? '' : `<div class="row" style="gap:8px"><input id="tt-key" class="text-input" placeholder="API anahtarını yapıştır" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="pill-btn blue" data-act="saveKey">Kaydet</button></div>`}
    </div>
    ${key() ? '' : `<p class="group-foot"><b>Nasıl alınır (ücretsiz, kredi kartı yok):</b><br>1. <a href="https://developer.tomtom.com/user/register" target="_blank" rel="noopener">developer.tomtom.com</a>’da hesap aç.<br>2. Giriş yap, “Dashboard › Keys” bölümündeki anahtarı kopyala.<br>3. Buraya yapıştırıp Kaydet’e bas.</p>`}

    <div class="group-title">Uygulama Simgesi</div>
    <div class="icon-grid">${icons}</div>
    <div class="list plain" style="margin-top:12px"><button class="row blue" data-act="applyIcon"><span class="row-icon c-blue">${I.copy}</span><span class="row-main"><span class="row-title">Simgeyi telefona uygula</span><span class="row-sub wrap">Bağlantıyı kopyalar ve adımları gösterir</span></span></button></div>
    <div id="icon-steps"></div>

    <div class="group-title">Rota Tercihleri</div>
    ${prefsList('auto')}

    <div class="group-title">Ev ve İş</div>
    <div class="list plain">${favRow('home', 'Ev', 'home')}${favRow('work', 'İş', 'work')}</div>

    <div class="group-title">Kayıtlı Yerler</div>
    <div class="list plain">${places}</div>

    <div class="group-title">Kaçındığın Yollar</div>
    <div class="list plain">${avoids}</div>
    <p class="group-foot">Haritada bir yola basılı tut ve “Bu yoldan beni geçirme”ye dokun. Yolcu seni bir daha oradan geçirmez.</p>

    <div class="group-title">Yedek</div>
    <div class="list plain">
      <button class="row blue" data-act="backup"><span class="row-icon c-blue">${I.download}</span><span class="row-main"><span class="row-title">Yedeği indir</span></span></button>
      <button class="row blue" data-act="restore"><span class="row-icon c-gray">${I.upload}</span><span class="row-main"><span class="row-title">Yedekten geri yükle</span></span></button>
    </div>
    <p class="group-foot">Ev, iş, kayıtlı yerler ve tercihlerin sadece bu telefonda saklanır, hiçbir sunucuya gönderilmez.</p>

    <div class="group-title">Hakkında</div>
    <div class="list plain"><div class="row"><span class="row-main"><span class="row-title">Yolcu</span><span class="row-sub wrap">Harita © OpenStreetMap katkıcıları, OpenFreeMap. Arazi © Mapterhorn. Uydu © Esri, Maxar. Rota: Valhalla (FOSSGIS). Arama: Photon, Nominatim${key() ? ', TomTom' : ''}. Hava: Open‑Meteo. Radar: OpenStreetMap.</span></span></div></div>`;
}

function applyIconLink() {
  const link = document.querySelector('link[rel=apple-touch-icon]');
  if (link) link.href = `icons/${store.prefs.icon || 'mavi'}-180.png`;
}

function addRadarAt(lat, lon, name) {
  store.radars.push({ lat, lon, name: name || 'Radar', t: Date.now() });
  save();
  if (S.nav) S.navCams = radar.onRoute(allCams(), S.navRoute);
  drawRadars();
  toast('Radar işaretlendi, buradan geçerken uyaracağım');
}

/* ================= Eylemler ================= */
const ACT = {
  openSearch: () => openSearch(),
  cancelSearch: () => { document.activeElement?.blur?.(); goHome(); },
  pick: el => { const p = Array.isArray(S.results) ? S.results[+el.dataset.i] : null; if (p) choosePlace(p); },
  recent: el => { const p = store.recents[+el.dataset.i]; if (p) showPlace(p); },
  fav: el => {
    const k = el.dataset.k;
    if (store[k]) openRoutes({ ...store[k], name: k === 'home' ? 'Ev' : 'İş', sub: store[k].name, kind: k });
    else { S.pickFor = k; openSearch(); }
  },
  favPlace: el => { const p = store.places[+el.dataset.i]; if (p) showPlace(p); },
  addPlace: () => { S.pickFor = 'place'; openSearch(); },
  clearRecents: () => { store.recents = []; save(); render(); },
  goHome: () => goHome(),
  directions: () => openRoutes(S.place),
  setHomeHere: () => { const p = S.place; store.home = { name: p.name, sub: p.sub, lat: p.lat, lon: p.lon, kind: 'home' }; save(); toast('Ev olarak kaydedildi'); render(); },
  setWorkHere: () => { const p = S.place; store.work = { name: p.name, sub: p.sub, lat: p.lat, lon: p.lon, kind: 'work' }; save(); toast('İş olarak kaydedildi'); render(); },
  saveHere: () => { const on = toggleSaved(S.place); toast(on ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı'); render(); },
  sharePlace: () => sharePlace(S.place),
  avoidHere: () => {
    const p = S.place;
    store.avoids.push({ lat: p.lat, lon: p.lon, name: p.road || p.name, sub: p.sub, t: Date.now() });
    save();
    toast('Tamam, seni bir daha bu yoldan geçirmeyeceğim');
    goHome();
  },
  radarHere: () => { const p = S.place; addRadarAt(p.lat, p.lon, p.road || p.name); goHome(); },
  reportRadar: () => { if (!S.pos) return; addRadarAt(S.pos.lat, S.pos.lon, S.nav ? $('nav-street').textContent : (S.where?.road || 'Radar')); closeNavMenu(); },
  closeRoutes: () => { S.planAbort?.abort(); S.routes = []; setRoutesData([]); setJams([]); clearChips(); if (S.place) showPlace(S.place); else goHome(); },
  replan: () => planRoutes(),
  travel: el => { if (S.travel === el.dataset.v) return; S.travel = el.dataset.v; planRoutes(); },
  selRoute: (el, e) => { if (e.target.closest('.go, [data-act=preview]')) return; selectRoute(+el.dataset.i); },
  focusSeg: el => {
    const r = S.routes[S.sel]; const s = r?.story?.[+el.dataset.i]; if (!s) return;
    const c = r.coords.slice(s.b, s.e + 1);
    sheet.set('peek');
    setTimeout(() => fitCoords(c), 80);
  },
  speakStory: () => { const r = S.routes[S.sel]; if (!r?.story) return; voice.unlock(); voice.say(G.storySpeech(r.story, S.dest.name), true); },
  go: el => startNav(+el.dataset.i),
  preview: el => startNav(+el.dataset.i, true),
  endNav: () => endNav(),
  toggleNavMenu: () => {
    const m = $('nav-menu');
    if (m.hidden) { renderNavMenu(); m.hidden = false; document.body.classList.add('nav-menu-open'); }
    else closeNavMenu();
  },
  shareEta: async () => {
    const r = S.routes[S.sel];
    const t = S.nav ? $('nav-eta').textContent : (r ? G.fmtClock(new Date(Date.now() + rtime(r) * 1000)) : null);
    if (!t || !S.dest) return;
    let text = `${G.suffix(S.dest.name, 'loc')} yaklaşık ${t}’de olacağım.`;
    text = text.charAt(0).toLocaleUpperCase('tr') + text.slice(1);
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Kopyalandı'); } } catch { }
  },
  recenter: () => { S.follow = true; $('nav-recenter').hidden = true; if (S.pos) navTick(S.pos); },
  overview: () => {
    if (!S.navRoute) return;
    closeNavMenu();
    S.follow = false;
    $('nav-recenter').hidden = false; $('nav-street').hidden = true;
    const r = S.navRoute, st = S.nav;
    const c = sliceAlong(r.coords, r.cum, st.along, r.lengthM);
    const top = $('nav').getBoundingClientRect().bottom + 20;
    fitCoords(c, { padding: { top, bottom: 150 + safeB(), left: wide() ? 470 : 40, right: 80 } });
  },
  toggleVoice: () => {
    store.prefs.voice = !store.prefs.voice; save(); updateMuteBtn();
    if (!store.prefs.voice) voice.stop();
    toast(store.prefs.voice ? 'Sesli yönlendirme açık' : 'Sesli yönlendirme kapalı', 1500);
  },
  simSpeed: () => { if (!S.sim) return; const f = [1, 3, 8]; S.sim.factor = f[(f.indexOf(S.sim.factor) + 1) % f.length]; showSimStatus(); },
  locate: () => {
    if (!S.pos) { toast('Konumun bekleniyor…'); return; }
    S.map.easeTo({ center: [S.pos.lon, S.pos.lat], zoom: Math.max(S.map.getZoom(), 16), bearing: 0, pitch: store.prefs.tilt ? 50 : 0, duration: 700, padding: { top: 0, bottom: wide() ? 0 : sheet.visible() * 0.5, left: wide() ? 430 : 0, right: 0 } });
  },
  openLayers: () => { renderLayers(); $('layers').hidden = false; },
  closeLayers: () => { $('layers').hidden = true; },
  mapType: el => { store.prefs.mapType = el.dataset.v; save(); applyTheme(); renderLayers(); },
  openWhere: () => { S.view = 'where'; render(); sheet.set('half'); },
  copyCoords: async () => { const p = S.pos; if (!p) return; try { await navigator.clipboard.writeText(`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`); toast('Koordinatlar kopyalandı'); } catch { toast('Kopyalanamadı'); } },
  shareMe: () => { const p = S.pos; if (!p) return; const r = S.where || {}; sharePlace({ name: r.road || 'Konumum', sub: [r.hood, r.district].filter(Boolean).join(', '), lat: p.lat, lon: p.lon }); },
  saveMe: () => {
    const p = S.pos; if (!p) return; const r = S.where || {};
    const pl = { name: r.road || r.hood || 'Kayıtlı Konum', sub: [r.hood, r.district].filter(Boolean).join(', '), lat: p.lat, lon: p.lon, kind: 'star' };
    if (!isSaved(pl)) toggleSaved(pl);
    toast('Burası favorilere eklendi');
  },
  resumeNav: (el, e) => {
    if (e.target.closest('[data-act=dismissResume]')) return;
    const an = store.activeNav; if (!an) return;
    S.autoStart = true; openRoutes(an.dest);
  },
  dismissResume: (el, e) => { e.stopPropagation(); store.activeNav = null; save(); render(); },

  openSettings: () => { renderSettings(); $('settings').hidden = false; $('layers').hidden = true; },
  closeSettings: () => { $('settings').hidden = true; render(); },
  theme: el => { store.prefs.theme = el.dataset.v; save(); applyTheme(); renderSettings(); },
  saveKey: async () => {
    const v = ($('tt-key')?.value || '').trim();
    if (!v) return;
    toast('Kontrol ediliyor…', 1500);
    try {
      if (!(await traffic.testKey(v))) throw new Error();
      store.tomtomKey = v; store.prefs.traffic = true; save();
      setFlow(); loadIncidents(true);
      toast('TomTom bağlandı. Trafik ve işletme arama açık.');
    } catch { toast('Anahtar çalışmadı. Doğru kopyaladığından emin ol.'); }
    renderSettings();
  },
  removeKey: () => { store.tomtomKey = null; save(); setFlow(); S.incidents = []; drawIncidents(); renderSettings(); },
  pickIcon: el => { store.prefs.icon = el.dataset.v; save(); applyIconLink(); renderSettings(); },
  applyIcon: () => {
    const url = `${location.origin}${location.pathname}?icon=${store.prefs.icon}#r=${packForLink()}`;
    navigator.clipboard?.writeText(url).catch(() => { });
    $('icon-steps').innerHTML = `<div class="steps-box">
      <b>Bağlantı kopyalandı. Şimdi:</b>
      <ol>
        <li>Ana ekrandaki Yolcu’ya basılı tut › <b>Uygulamayı Sil</b>.</li>
        <li><b>Safari</b>’yi aç, adres çubuğuna basılı tut › <b>Yapıştır ve Git</b>.</li>
        <li>Paylaş düğmesi › <b>Ana Ekrana Ekle</b>.</li>
      </ol>
      <small>Ev, iş, favoriler ve ayarların bağlantının içinde, yeni uygulamaya otomatik taşınır.</small>
    </div>`;
  },
  setFav: el => { $('settings').hidden = true; S.pickFor = el.dataset.k; openSearch(); },
  delPlace: el => { store.places.splice(+el.dataset.i, 1); save(); renderSettings(); },
  delAvoid: el => { store.avoids.splice(+el.dataset.i, 1); save(); renderSettings(); toast('Kaldırıldı'); },
  delRadar: el => { store.radars.splice(+el.dataset.i, 1); save(); drawRadars(); renderSettings(); toast('Kaldırıldı'); },
  backup: () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yolcu-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  restore: () => $('file-import').click()
};

async function sharePlace(p) {
  const url = `https://maps.apple.com/?ll=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&q=${encodeURIComponent(p.name)}`;
  try {
    if (navigator.share) await navigator.share({ title: p.name, text: [p.name, p.sub].filter(Boolean).join('\n'), url });
    else { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı'); }
  } catch { }
}

document.addEventListener('click', e => {
  if (performance.now() - S.dragEnd < 350) { e.preventDefault(); e.stopPropagation(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) { if (!$('layers').hidden && !e.target.closest('#layers')) $('layers').hidden = true; return; }
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
}, true);

document.addEventListener('change', e => {
  const k = e.target.dataset?.pref;
  if (!k) return;
  store.prefs[k] = e.target.checked;
  save();
  if (k === 'voice') { updateMuteBtn(); if (!store.prefs.voice) voice.stop(); }
  else if (k === 'radarSound') { if (store.prefs.radarSound) { radar.unlockBeep(); radar.beep(1); } }
  else if (k === 'tilt') { if (!S.nav) S.map?.easeTo({ pitch: store.prefs.tilt ? 50 : 0, duration: 600 }); }
  else if (k === 'traffic') { setFlow(); if (store.prefs.traffic) loadIncidents(true); else { S.incidents = []; drawIncidents(); } }
  else if (k === 'radar') { if (store.prefs.radar && S.pos) loadRadars(S.pos); drawRadars(); }
  else if (S.view === 'routes' && S.dest && !S.nav) planRoutes();
  if (!$('settings').hidden) renderSettings();
});

$('file-import').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  try { importBackup(await f.text()); toast('Yedek geri yüklendi'); applyTheme(); renderSettings(); render(); }
  catch (err) { toast(err.message || 'Yedek okunamadı'); }
  e.target.value = '';
});

/* ================= Başlat ================= */
function readUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get('icon') && ICONS[q.get('icon')]) { store.prefs.icon = q.get('icon'); save(); }
  if (q.get('tomtom')) {
    store.tomtomKey = q.get('tomtom'); save();
    q.delete('tomtom');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    setTimeout(() => toast('TomTom bağlandı'), 800);
  }
  const m = location.hash.match(/#r=([\w-]+)/);
  if (m && !store.home && !store.work && !store.places.length) {
    try { unpackFromLink(m[1]); setTimeout(() => toast('Ayarların geri yüklendi'), 800); } catch { }
  }
}

function boot() {
  readUrl();
  applyIconLink();
  applyTheme();
  $('btn-locate').innerHTML = I.locLine;
  $('btn-layers').innerHTML = I.map;
  sheet.init();
  render();
  requestAnimationFrame(() => sheet.set('peek', false));
  setTimeout(() => { fitScreen(); sheet.set(sheet.detent, false); }, 400);
  voice.init();
  initMap();
  startGeo();
  setInterval(() => { if (S.view === 'home' && !S.nav && sheet.detent === 'peek') { const sc = sheet.body.scrollTop; render(); sheet.body.scrollTop = sc; } }, 60000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}
boot();

// Geliştirme ve test için
window.__yolcu = { S, store, onPos, startNav, sheet };
