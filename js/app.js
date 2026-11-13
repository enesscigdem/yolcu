import { store, save, addRecent, isSaved, toggleSaved, exportBackup, importBackup, packForLink, unpackFromLink } from './store.js';
import * as api from './api.js';
import * as traffic from './traffic.js';
import * as radar from './radar.js';
import { loadStyle, applyPalette, setTerrain, PALETTES, ACCENT, firstLabelLayer } from './mapstyle.js';
import * as G from './guide.js';
import { Navigator, Simulator } from './nav.js';
import { I, KIND_ICON } from './icons.js';
import { dist, bearing, sliceAlong, pointAt, compass } from './geo.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IZMIR = { lon: 27.142, lat: 38.423 };
const EMPTY = { type: 'FeatureCollection', features: [] };
const wide = () => window.innerWidth >= 700;
const ICONS = { komur: 'Kömür', mavi: 'Mavi Ok', yol: 'Gün Batımı', harita: 'Harita', gece: 'Gece', y: 'Y Ayrımı' };
const TRAVEL = { auto: ['Araba', 'car'], pedestrian: ['Yürüyüş', 'walk'] };

// Eski sürümden gelen ayarları güncelle
if (!store.prefs.v3) {
  store.prefs.tilt = false;
  store.prefs.radar = true;
  store.prefs.radarSound = true;
  delete store.prefs.voiceEngine;
  store.prefs.v3 = true;
  save();
}
if (!Array.isArray(store.radars)) store.radars = [];

const S = {
  map: null, mapReady: false, pos: null, firstFix: true, puck: null, destMarker: null,
  view: 'home', place: null, results: null, routes: [], sel: 0, details: false, dest: null, routeErr: null, travel: 'auto',
  pickFor: null, nav: null, navRoute: null, sim: null, follow: true, rerouting: false,
  where: null, whereAt: null, whereBusy: false, wake: null, arrowFor: -1, arrived: false,
  dragEnd: 0, autoStart: false, chips: [], incidents: [], incAt: null, navInc: [], said: new Set(),
  trafRatio: null, timers: [], navIntro: null, incident: null,
  cams: [], official: [], navCams: [], weather: null, weatherAt: null,
  eta: {}, helloK: null, trip: null, prog: null, lastView: null
};
const key = () => store.tomtomKey;
// "Otomatik" tema gün doğumu / batımına göre (hava servisinden); bilinmiyorsa telefonun ayarı
const theme = () => {
  const p = store.prefs.theme;
  if (p !== 'auto') return p;
  const w = S.weather;
  if (w?.sunrise && w?.sunset) { const now = Date.now(); return now >= w.sunrise && now < w.sunset ? 'light' : 'dark'; }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// Açılış: harita şehrin üstünden yumuşakça konumuna süzülür ve eğilir
function introFly(p) {
  const m = S.map;
  const tilt = store.prefs.tilt;
  m.jumpTo({ center: [p.lon, p.lat], zoom: 11.6, pitch: 0, bearing: 0 });
  requestAnimationFrame(() => m.flyTo({
    center: [p.lon, p.lat], zoom: tilt ? 16.3 : 15.6, pitch: tilt ? 56 : 30, bearing: -18,
    duration: 2600, curve: 1.25, essential: true,
    padding: { top: 0, bottom: wide() ? 0 : sheet.visible() * 0.5, left: wide() ? 420 : 0, right: 0 }
  }));
}

/* ================= iOS ekran boyu ================= */
// iOS 26 ana ekran uygulamasında görünüm, durum çubuğu kadar kısa geliyor (WebKit 301108).
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
  if (standalone && portrait && screen.height - window.innerHeight > 8 && screen.height - window.innerHeight < 160) html.style.height = screen.height + 'px';
  else if (standalone) html.style.height = '';
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
  document.documentElement.dataset.map = t;
  if (!S.mapReady) return;
  applyPalette(S.map, PALETTES[t], { type: store.prefs.mapType, nav: !!S.nav });
  // 3B arazi sadece gezinirken: navigasyonda MapLibre 4 kamerayı deniz seviyesine göre hesapladığından
  // konum oku arazinin üstünde kayıyor; ayrıca iPhone'da navigasyon daha akıcı oluyor.
  setTerrain(S.map, !!(store.prefs.tilt && !S.nav));
  setFlow();
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
    if (!a) return 200;
    const r = a.getBoundingClientRect(), s = this.el.getBoundingClientRect();
    return Math.round(r.bottom - s.top + 14 + safeB());
  },
  heights() {
    const H = this.H();
    return { peek: Math.min(this.peekH(), H), half: Math.min(Math.max(Math.round(H * 0.55), this.peekH()), H), full: H };
  },
  set(d, anim = true) {
    this.detent = d;
    const vis = this.heights()[d];
    this.y = Math.max(0, this.H() - vis);
    this.el.style.transition = anim ? 'transform .45s cubic-bezier(.32,.72,0,1)' : 'none';
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
const NAV_ARROW = `<svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="23" fill="#16171A" stroke="#fff" stroke-width="3.5"/><path d="M28 13.5 L39 39 L28 33 L17 39 Z" fill="${ACCENT}" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round"/></svg>`;
const PIN = `<svg viewBox="0 0 34 42"><path d="M17 41s-14-12.6-14-23.5a14 14 0 0 1 28 0C31 28.4 17 41 17 41z" fill="#16171A" stroke="#fff" stroke-width="2"/><circle cx="17" cy="17.5" r="5.5" fill="${ACCENT}"/></svg>`;

// Harita simgeleri: emoji yerine sade çizimler (koyu daire + ince halka + beyaz/renkli sembol)
const GLYPH = {
  camera: 'M9.2 4.5h5.6l1.5 2H19a2.5 2.5 0 0 1 2.5 2.5v8.5A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5V9A2.5 2.5 0 0 1 5 6.5h2.7zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  warn: 'M12 3.2c.5 0 1 .3 1.2.7l8.4 15c.5.9-.2 2.1-1.2 2.1H3.6c-1 0-1.7-1.2-1.2-2.1l8.4-15c.2-.4.7-.7 1.2-.7zM11 9.5v5h2v-5zm0 6.5v2h2v-2z',
  cone: 'M10.2 3h3.6l1.3 4.5H8.9zM8.5 9h7l1.1 4H7.4zM7 14.5h10l1.2 4.5H5.8zM3 20h18v1.5H3z',
  closed: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zM6.5 10.4v3.2h11v-3.2z',
  car: 'M5.6 6.3A2.5 2.5 0 0 1 8 4.5h8a2.5 2.5 0 0 1 2.4 1.8L19.8 11H20a2 2 0 0 1 2 2v4.5a1 1 0 0 1-1 1h-1V20a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1.5h-9V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1.5H3a1 1 0 0 1-1-1V13a2 2 0 0 1 2-2h.2zM7.6 7 6.5 11h11l-1.1-4a.8.8 0 0 0-.8-.5H8.4a.8.8 0 0 0-.8.5z',
  // Harita mekan simgeleri
  pharmacy: 'M9.3 3h5.4v6.3H21v5.4h-6.3V21H9.3v-6.3H3V9.3h6.3z',
  hospital: 'M6 4h3v6.5h6V4h3v16h-3v-6.5H9V20H6z',
  fuel: 'M5 4.5A1.5 1.5 0 0 1 6.5 3h6A1.5 1.5 0 0 1 14 4.5V11h1a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0V9.4l-2-2 1.4-1.4 2.6 2.6V17a3 3 0 0 1-6 0v-4h-1v7.5H5zM7 5v5h5V5z',
  parking: 'M6 3h7a6 6 0 0 1 0 12h-3v6H6zm4 4v4h3a2 2 0 0 0 0-4z',
  railway: 'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-2.2 2.9L19.5 21h-2.3l-1.4-3H8.2l-1.4 3H4.5l1.7-3.1A3 3 0 0 1 4 15V6a3 3 0 0 1 3-3zm0 3v4h10V6zm1 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'
};
const POI_COLOR = { pharmacy: '#FF6B60', hospital: '#FF6B60', fuel: '#E6E6E8', parking: '#8FB4FF', railway: '#E6E6E8' };
const INC_GLYPH = { 1: 'warn', 6: 'car', 7: 'cone', 8: 'closed', 9: 'cone', 14: 'car' };
const incGlyph = i => INC_GLYPH[i.cat] || 'warn';
const incColor = i => (i.cat === 8 || i.cat === 1 || i.mag >= 3 ? '#FF453A' : '#FF9F0A');

function glyphImage(glyph, color, ring) {
  const c = document.createElement('canvas');
  c.width = c.height = 72;
  const x = c.getContext('2d');
  x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 6; x.shadowOffsetY = 2;
  x.beginPath(); x.arc(36, 35, 26, 0, Math.PI * 2); x.fillStyle = '#16171A'; x.fill();
  x.shadowColor = 'transparent';
  x.lineWidth = 3; x.strokeStyle = ring; x.stroke();
  x.save(); x.translate(36 - 15, 35 - 15); x.scale(30 / 24, 30 / 24);
  x.fillStyle = color; x.fill(new Path2D(GLYPH[glyph]), 'evenodd');
  x.restore();
  return x.getImageData(0, 0, 72, 72);
}
function ensureImage(id, glyph, color, ring) {
  if (!S.map.hasImage(id)) S.map.addImage(id, glyphImage(glyph, color, ring), { pixelRatio: 2 });
  return id;
}

async function initMap() {
  let style;
  try { style = await loadStyle(); }
  catch { toast('Harita yüklenemedi. İnternet bağlantını kontrol et.', 5000); return; }
  const map = S.map = new maplibregl.Map({
    container: 'map', style, center: [IZMIR.lon, IZMIR.lat], zoom: 12, attributionControl: false,
    maxPitch: 75, fadeDuration: 250, dragRotate: true, pitchWithRotate: true, antialias: true
  });
  map.on('load', () => {
    addLayers();
    S.mapReady = true;
    applyTheme();
    $('map').classList.add('ready');
    if (S.pos) { S.firstFix = false; updatePuck(S.pos); introFly(S.pos); }
    loadIncidents();
    drawRadars();
  });
  // Mekan simgeleri ilk ihtiyaç anında çizilir (koyu daire + tek renkli sembol)
  map.on('styleimagemissing', e => {
    const m = /^poi-(\w+)$/.exec(e.id);
    if (m && GLYPH[m[1]] && !map.hasImage(e.id)) map.addImage(e.id, glyphImage(m[1], POI_COLOR[m[1]] || '#E6E6E8', 'rgba(255,255,255,.18)'), { pixelRatio: 2 });
  });
  map.on('dragstart', () => {
    if (S.nav) { S.follow = false; $('nav-recenter').hidden = false; $('nav-street').hidden = true; }
  });
  // Navigasyonda konum oku kamerayla birlikte akıcı kaysın (GPS adımları arasında zıplamasın)
  map.on('move', () => { if (S.nav && S.follow && S.puck && !S.arrived) puckAt(map.getCenter()); });
  map.on('rotate', () => updateLocateBtn());
  map.on('pitchend', () => updateTiltBtn());
  map.on('moveend', () => { clearTimeout(S.incT); S.incT = setTimeout(() => { loadIncidents(); if (!S.nav) drawRadars(); }, 900); });

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
  x.lineJoin = 'round'; x.lineWidth = 7; x.strokeStyle = '#16171A'; x.stroke();
  x.fillStyle = '#ffffff'; x.fill();
  return x.getImageData(0, 0, 64, 64);
}

function addClusterLayers(m, src, ring, minzoom) {
  m.addLayer({
    id: `${src}-cl`, type: 'circle', source: src, minzoom, filter: ['has', 'point_count'],
    paint: { 'circle-color': '#16171A', 'circle-radius': ['step', ['get', 'point_count'], 13, 5, 16, 20, 20], 'circle-stroke-width': 2, 'circle-stroke-color': ring, 'circle-opacity': 0.95 }
  });
  m.addLayer({
    id: `${src}-cn`, type: 'symbol', source: src, minzoom, filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true },
    paint: { 'text-color': '#F2F2F3' }
  });
  m.on('click', `${src}-cl`, async e => {
    const f = e.features[0];
    try {
      const z = await m.getSource(src).getClusterExpansionZoom(f.properties.cluster_id);
      m.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3, duration: 500 });
    } catch { }
  });
}

function addLayers() {
  const m = S.map, before = firstLabelLayer(m);
  const w = (a, b) => ['interpolate', ['exponential', 1.5], ['zoom'], 10, a, 18, b];
  const round = { 'line-join': 'round', 'line-cap': 'round' };
  m.addSource('yolcu-routes', { type: 'geojson', data: EMPTY });
  m.addSource('yolcu-jams', { type: 'geojson', data: EMPTY });
  m.addSource('yolcu-arrow', { type: 'geojson', data: EMPTY });
  m.addSource('yolcu-inc', { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 44, clusterMaxZoom: 13 });
  m.addSource('yolcu-cams', { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 44, clusterMaxZoom: 13 });
  m.addLayer({ id: 'yolcu-alt-case', type: 'line', source: 'yolcu-routes', filter: ['!', ['get', 'sel']], layout: round, paint: { 'line-color': '#6F8C88', 'line-width': w(6, 22) } }, before);
  m.addLayer({ id: 'yolcu-alt', type: 'line', source: 'yolcu-routes', filter: ['!', ['get', 'sel']], layout: round, paint: { 'line-color': '#9FB9B5', 'line-width': w(4, 16) } }, before);
  m.addLayer({ id: 'yolcu-route-case', type: 'line', source: 'yolcu-routes', filter: ['get', 'sel'], layout: round, paint: { 'line-color': '#0B6B62', 'line-width': w(8, 26) } }, before);
  m.addLayer({ id: 'yolcu-route', type: 'line', source: 'yolcu-routes', filter: ['get', 'sel'], layout: round, paint: { 'line-color': ACCENT, 'line-width': w(5.5, 19) } }, before);
  m.addLayer({
    id: 'yolcu-jams', type: 'line', source: 'yolcu-jams', layout: round,
    paint: { 'line-width': w(5, 17), 'line-color': ['match', ['get', 'mag'], 3, '#D93A2F', 4, '#8E1A12', 2, '#E85A2C', '#F09A2A'] }
  }, before);
  m.addLayer({ id: 'yolcu-arrow-case', type: 'line', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'LineString'], layout: round, paint: { 'line-color': '#16171A', 'line-width': w(5, 24) } });
  m.addLayer({ id: 'yolcu-arrow', type: 'line', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'LineString'], layout: round, paint: { 'line-color': '#fff', 'line-width': w(3, 16) } });
  m.addImage('yolcu-head', headImage(), { pixelRatio: 2 });
  m.addLayer({
    id: 'yolcu-arrow-head', type: 'symbol', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'icon-image': 'yolcu-head', 'icon-rotate': ['get', 'b'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 0.35, 18, 1.5] }
  });
  ensureImage('cam', 'camera', '#E6E6E8', 'rgba(255,255,255,.35)');
  addClusterLayers(m, 'yolcu-cams', 'rgba(255,255,255,.35)', 12.5);
  m.addLayer({
    id: 'yolcu-cams', type: 'symbol', source: 'yolcu-cams', minzoom: 12.5, filter: ['!', ['has', 'point_count']],
    layout: { 'icon-image': 'cam', 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.75, 16, 1] }
  });
  addClusterLayers(m, 'yolcu-inc', 'rgba(255,159,10,.7)', 11.5);
  m.addLayer({
    id: 'yolcu-inc', type: 'symbol', source: 'yolcu-inc', minzoom: 11.5, filter: ['!', ['has', 'point_count']],
    layout: { 'icon-image': ['get', 'img'], 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 1.05] }
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
    toast([p?.desc ? `Radar · ${p.desc}` : 'Radar', p?.max ? `sınır ${p.max} km/sa` : ''].filter(Boolean).join(' · '), 3500);
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
  if (wide()) return { top: 60, bottom: 60, left: 440, right: 80 };
  return { top: safeT() + 64, bottom: Math.min(sheet.visible(), window.innerHeight * 0.6) + 20, left: 36, right: 72 };
}

function fitCoords(coords, opts = {}) {
  if (!S.map || !coords.length) return;
  const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) b.extend(c);
  // MapLibre önceki kamera payını yenisine ekliyor; sıfırlamazsak rota sığmıyor
  S.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  S.map.fitBounds(b, { padding: opts.padding || camPadding(), duration: 900, maxZoom: 16, bearing: 0, pitch: 0 });
}

/* ---------- Trafik katmanı (TomTom vektör) ---------- */
const FLOW_LAYERS = ['yolcu-flow-slow', 'yolcu-flow-jam', 'yolcu-flow-closed'];
function setFlow() {
  const m = S.map;
  if (!m || !S.mapReady) return;
  for (const id of FLOW_LAYERS) if (m.getLayer(id)) m.removeLayer(id);
  if (m.getSource('tt-flow')) m.removeSource('tt-flow');
  // Navigasyonda şehrin tamamını boyama: sadece rotadaki sıkışıklıklar (yolcu-jams) görünür
  if (!key() || !store.prefs.traffic || S.nav) return;
  m.addSource('tt-flow', { type: 'vector', tiles: [traffic.flowTiles(key())], maxzoom: 22, attribution: '© TomTom' });
  const lvl = ['to-number', ['get', 'traffic_level'], 1];
  const closed = ['==', ['get', 'road_closure'], true];
  // Sadece ana yollar (ara sokaklardaki küçük yavaşlamalar haritayı kalabalıklaştırıyor)
  const major = ['match', ['get', 'road_type'], ['Motorway', 'International road', 'Major road', 'Secondary road', 'Connecting road', 'Major local road'], true, false];
  const width = ['interpolate', ['linear'], ['zoom'], 10, 1.4, 14, 2.8, 18, 6];
  const base = { type: 'line', source: 'tt-flow', 'source-layer': 'Traffic flow', minzoom: 9, layout: { 'line-cap': 'round', 'line-join': 'round' } };
  m.addLayer({ ...base, id: 'yolcu-flow-slow', filter: ['all', major, ['!', closed], ['>=', lvl, 0.35], ['<', lvl, 0.62]],
    paint: { 'line-color': '#F09A2A', 'line-width': width, 'line-dasharray': [1.6, 1.1], 'line-opacity': 0.9 } }, 'yolcu-alt-case');
  m.addLayer({ ...base, id: 'yolcu-flow-jam', filter: ['all', major, ['!', closed], ['<', lvl, 0.35]],
    paint: { 'line-color': '#D93A2F', 'line-width': width, 'line-opacity': 0.9 } }, 'yolcu-alt-case');
  m.addLayer({ ...base, id: 'yolcu-flow-closed', filter: closed,
    paint: { 'line-color': '#8E1A12', 'line-width': width, 'line-dasharray': [0.8, 1.2] } }, 'yolcu-alt-case');
}

function drawIncidents() {
  if (!S.mapReady) return;
  const list = (S.nav ? S.navInc : (store.prefs.traffic ? S.incidents : [])).filter(i => i.cat !== 6 || (S.nav && i.delay >= 60));
  S.map.getSource('yolcu-inc')?.setData({
    type: 'FeatureCollection',
    features: list.map(i => {
      const g = incGlyph(i), col = incColor(i);
      return { type: 'Feature', properties: { id: i.id, img: ensureImage(`inc-${g}-${col}`, g, col, col) }, geometry: { type: 'Point', coordinates: i.point } };
    })
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

/* ---------- Radarlar (otomatik: EGM resmi listesi + OpenStreetMap) ---------- */
const userCams = () => store.radars.map((r, i) => ({ id: `user${i}`, lat: r.lat, lon: r.lon, max: r.max || null, dir: null, src: 'user' }));
const allCams = () => radar.merge(S.cams, S.official, userCams());
function routeCams(route) {
  const bb = traffic.bboxOf(route.coords, 0.01);
  return radar.onRoute(radar.merge(radar.inBox(S.cams, bb), radar.inBox(S.official, bb), userCams()), route);
}

function drawRadars() {
  if (!S.mapReady) return;
  let list = [];
  if (store.prefs.radar) {
    if (S.nav) list = S.navCams;
    else {
      const b = S.map.getBounds();
      const pw = (b.getEast() - b.getWest()) * 0.5, ph = (b.getNorth() - b.getSouth()) * 0.5;
      list = radar.inBox(allCams(), [b.getWest() - pw, b.getSouth() - ph, b.getEast() + pw, b.getNorth() + ph]);
    }
  }
  S.map.getSource('yolcu-cams')?.setData({
    type: 'FeatureCollection',
    features: list.map(c => ({ type: 'Feature', properties: { max: c.max || 0, desc: c.desc || '' }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }))
  });
}

async function loadRadars(p) {
  if (!store.prefs.radar || S.radarLoading) return;
  S.radarLoading = true;
  radar.official().then(list => { S.official = list; drawRadars(); });
  try { S.cams = await radar.around(p.lat, p.lon); drawRadars(); }
  catch { S.cams = radar.cached(); drawRadars(); }
  finally { S.radarLoading = false; }
}

/* ---------- Hava durumu ---------- */
async function updateWeather(p) {
  if (S.weatherAt && Date.now() - S.weatherAt < 30 * 60e3) return;
  S.weatherAt = Date.now();
  try { S.weather = await api.weather(p.lat, p.lon); renderWherePill(); checkTheme(); }
  catch { S.weatherAt = null; }
}
// Tema değiştiyse (gün battı / doğdu) haritayı yeniden boya
function checkTheme() { if (document.documentElement.dataset.map !== theme()) applyTheme(); }

/* ---------- Haritada rota balonları ve yol adı rozetleri ---------- */
function clearChips() { S.chips.forEach(m => m.remove()); S.chips = []; }
// Alternatif rotanın, seçili rotadan en çok ayrıldığı nokta (balon oraya konur)
function divergePoint(r, base) {
  let best = null, bd = -1;
  for (let s = 1; s < 24; s++) {
    const p = pointAt(r.coords, r.cum, r.lengthM * s / 24);
    let d = Infinity;
    for (let i = 0; i < base.coords.length; i += 3) { const c = base.coords[i]; const x = dist(p.lon, p.lat, c[0], c[1]); if (x < d) d = x; }
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}
function drawChips(route) {
  clearChips();
  if (!S.map) return;
  const best = S.routes[0];
  // Süre balonları: seçili rota vurgulu, alternatifler "+11 dk"; dokununca o rota seçilir
  S.routes.forEach((r, i) => {
    const sel = i === S.sel;
    const p = sel ? pointAt(r.coords, r.cum, r.lengthM * 0.55) : divergePoint(r, route);
    if (!p) return;
    const el = document.createElement('div');
    el.className = `rt-bubble${sel ? ' sel' : ''}`;
    const diff = Math.round((rtime(r) - rtime(best)) / 60);
    el.innerHTML = sel ? `${Math.max(1, Math.round(rtime(r) / 60))} dk` : `${Math.max(1, Math.round(rtime(r) / 60))} dk<small>${diff > 0 ? '+' + diff : diff}</small>`;
    el.addEventListener('click', ev => { ev.stopPropagation(); selectRoute(i); });
    S.chips.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat([p.lon, p.lat]).addTo(S.map));
  });
  if (!route?.story) return;
  const roads = route.story.filter(s => s.kind === 'road').sort((a, b) => b.m - a.m).slice(0, 2);
  for (const s of roads) {
    const mid = (route.cum[Math.min(s.b, route.cum.length - 1)] + route.cum[Math.min(s.e, route.cum.length - 1)]) / 2;
    const p = pointAt(route.coords, route.cum, mid);
    const el = document.createElement('div');
    el.className = `road-chip ${s.cls === 'motorway' || s.cls === 'trunk' || s.cls === 'primary' ? 'main' : ''}`;
    el.textContent = api.abbr(s.name);
    S.chips.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(S.map));
  }
}

/* ---------- Haritada zaten yüklü mekanlardan kategori araması (anında) ---------- */
function tileNearby(cat) {
  if (!S.map) return [];
  let feats = [];
  try { feats = S.map.querySourceFeatures('openmaptiles', { sourceLayer: 'poi', filter: ['match', ['get', 'class'], cat.tiles, true, false] }); } catch { return []; }
  return feats.filter(f => f.geometry?.type === 'Point').map(f => {
    const pr = f.properties || {};
    const [lon, lat] = f.geometry.coordinates;
    return { name: pr['name:tr'] || pr.name || cat.fallback, sub: pr.subclass && pr.subclass !== pr.class ? '' : '', lat, lon };
  });
}

/* ---------- Akıllı karşılama ve favori süreleri ---------- */
// Sabah işe, akşam eve; evdeysen işe, işteysen eve. Süre trafikli (TomTom) ya da tahmini.
function helloTarget() {
  const p = S.pos;
  if (!p || (!store.home && !store.work)) return null;
  const near = q => q && dist(p.lon, p.lat, q.lon, q.lat) < 600;
  if (near(store.home) && store.work) return 'work';
  if (near(store.work) && store.home) return 'home';
  const h = new Date().getHours();
  const k = h >= 4 && h < 13 ? 'work' : 'home';
  if (store[k] && dist(p.lon, p.lat, store[k].lon, store[k].lat) > 600) return k;
  const o = k === 'work' ? 'home' : 'work';
  return store[o] && dist(p.lon, p.lat, store[o].lon, store[o].lat) > 600 ? o : null;
}
async function etaTo(k) {
  const p = S.pos, dst = store[k];
  if (!p || !dst) return null;
  const c = S.eta[k];
  if (c && Date.now() - c.at < 4 * 60e3 && dist(p.lon, p.lat, c.lon, c.lat) < 400) return c;
  let r;
  if (key()) { try { r = await traffic.quickEta(key(), p, dst); } catch { } }
  if (!r) { try { const v = await api.quickRoute(p, dst, store.prefs); r = { time: v.time * 0.85, delay: null, lengthM: v.lengthM }; } catch { return null; } }
  S.eta[k] = { ...r, at: Date.now(), lon: p.lon, lat: p.lat };
  return S.eta[k];
}
async function refreshHello() {
  if (S.helloBusy || S.nav || !S.pos) return;
  if (S.helloAt && Date.now() - S.helloAt < 60e3) return;
  S.helloBusy = true; S.helloAt = Date.now();
  try {
    S.helloK = helloTarget();
    await Promise.all(['work', 'home'].filter(k => store[k]).map(etaTo));
    if (S.view === 'home' && !S.nav) { const sc = sheet.body.scrollTop; render(); sheet.body.scrollTop = sc; if (sheet.detent === 'peek') sheet.set('peek'); }
  } finally { S.helloBusy = false; }
}
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : h < 22 ? 'İyi akşamlar' : 'İyi geceler';
}

/* ================= Konum ================= */
// Konum işareti iki parça: yerde yatan nefes alan hale (eğik bakışta doğal elips olur)
// ve üstünde her açıdan dik duran nokta / navigasyon oku (artık ezik görünmez)
function puckAt(lngLat) { S.puck?.setLngLat(lngLat); S.puckGround?.setLngLat(lngLat); }
function updatePuck(p) {
  if (!S.mapReady) return;
  if (!S.puck) {
    const g = document.createElement('div');
    g.className = 'puck-ground';
    S.puckGround = new maplibregl.Marker({ element: g, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([p.lon, p.lat]).addTo(S.map);
    const el = document.createElement('div');
    el.className = 'puck';
    el.innerHTML = `<div class="puck-cone"></div><div class="puck-dot"></div><div class="puck-arrow">${NAV_ARROW}</div>`;
    S.puck = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'viewport' }).setLngLat([p.lon, p.lat]).addTo(S.map);
  }
  if (!S.nav) {
    puckAt([p.lon, p.lat]);
    const hasH = p.heading != null && p.speed > 0.8;
    S.puck.getElement().classList.toggle('has-heading', hasH);
    if (hasH) S.puck.setRotation(p.heading);
  }
}
function setPuckNav(on) {
  S.puck?.getElement().classList.toggle('nav', on);
  S.puckGround?.getElement().classList.toggle('nav', on);
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
  if (S.firstFix && S.mapReady && !S.nav) { S.firstFix = false; introFly(p); }
  if (!S.nav) refreshHello();
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
    err => { if (err.code === 1) toast('Konum izni verilmedi. Ayarlar › Gizlilik › Konum Servisleri’nden izin ver.', 6000); },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
  );
}

function waitPos(ms = 8000) {
  if (S.pos) return Promise.resolve(S.pos);
  return new Promise(res => {
    const t0 = Date.now();
    const iv = setInterval(() => { if (S.pos || Date.now() - t0 > ms) { clearInterval(iv); res(S.pos); } }, 250);
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
  $('where-road').textContent = r.hood || r.road || r.district || 'Buradasın';
  $('weather').textContent = S.weather ? `${S.weather.icon} ${S.weather.temp}°` : '';
}

function updateLocateBtn() {
  const rotated = S.map && Math.abs(S.map.getBearing()) > 2;
  $('btn-locate').innerHTML = rotated ? I.compass : (S.pos ? I.loc : I.locLine);
}
function updateTiltBtn() {
  const on = S.map && S.map.getPitch() > 15;
  $('btn-3d').classList.toggle('on', !!on);
}

/* ================= Görünümler ================= */
function placeIcon(kind) {
  const [ic, col] = KIND_ICON[kind] || KIND_ICON.pin;
  return `<span class="row-icon ${col}">${I[ic]}</span>`;
}
function distFromMe(p) { return S.pos ? G.fmtDist(dist(S.pos.lon, S.pos.lat, p.lon, p.lat)) : ''; }
function placeRow(p, act, i, kind) {
  return `<button class="row" data-act="${act}" data-i="${i}">${placeIcon(kind || p.kind)}<span class="row-main"><span class="row-title">${esc(p.name)}</span>${p.sub ? `<span class="row-sub">${esc(p.sub)}</span>` : ''}</span><span class="row-meta">${distFromMe(p)}</span></button>`;
}

function prefsList(travel = 'auto') {
  const P = store.prefs;
  const row = (k, title, sub) => `<label class="row"><span class="row-main"><span class="row-title">${title}</span><span class="row-sub wrap">${sub}</span></span><input type="checkbox" class="switch" data-pref="${k}" ${P[k] ? 'checked' : ''}></label>`;
  if (travel !== 'auto') return `<div class="list plain">${row('hills', 'Yokuşlardan kaçın', 'Dik yokuş ve merdivenleri önermez')}</div>`;
  return `<div class="list plain">
    ${row('highways', 'Ana yolları tercih et', 'Otoyol, çevre yolu ve bulvarlar')}
    ${row('hills', 'Yokuşlardan kaçın', 'Dik yokuşlu yolları önermez')}
    ${row('rough', 'Bozuk yollardan kaçın', 'Kötü yüzeyli yolları önermez')}
    ${row('tolls', 'Ücretli yollardan kaçın', 'Otoyol ve köprü ücretleri')}
  </div>`;
}

function viewHome() {
  const fav = (k, label, icon) => {
    const p = store[k];
    const e = S.eta[k];
    const sub = p ? (e ? `${Math.max(1, Math.round(e.time / 60))} dk` : (distFromMe(p) || 'Git')) : 'Ekle';
    return `<button class="fav" data-act="fav" data-k="${k}"><span class="fav-icon k-${k}">${I[icon]}</span><span class="fav-title">${label}</span><span class="fav-sub">${sub}</span></button>`;
  };
  const places = store.places.map((p, i) => {
    const [ic, col] = KIND_ICON[p.kind] || KIND_ICON.star;
    return `<button class="fav" data-act="favPlace" data-i="${i}"><span class="fav-icon ${col}">${I[ic]}</span><span class="fav-title">${esc(p.name)}</span><span class="fav-sub">${distFromMe(p) || ''}</span></button>`;
  }).join('');
  const an = store.activeNav;
  const resume = an && !S.nav && Date.now() - an.t < 4 * 3600e3
    ? `<button class="resume" data-act="resumeNav">${I.car}<span style="flex:1"><b>Yola devam et</b><small>${esc(an.dest.name)}</small></span><span class="close" data-act="dismissResume">${I.x}</span></button>` : '';
  const recents = store.recents.length
    ? `<div class="list">${store.recents.slice(0, 6).map((p, i) => placeRow(p, 'recent', i, 'recent')).join('')}</div>`
    : `<div class="list"><div class="empty">Gittiğin yerler burada görünecek.</div></div>`;
  const ttHint = !key() ? `<button class="tip" data-act="openSettings"><span class="row-icon c-orange">${I.warn}</span><span class="t"><b>Trafik bilgisi kapalı</b><small>Açmak için dokun</small></span>${I.chevron}</button>` : '';
  // Akıllı karşılama: günün saatine ve nerede olduğuna göre tek dokunuşla yola çık
  let hello = '';
  const hk = !resume && S.helloK;
  if (hk) {
    const e = S.eta[hk];
    const label = hk === 'work' ? 'İşe' : 'Eve';
    const min = e ? Math.max(1, Math.round(e.time / 60)) : null;
    const dm = e?.delay != null ? Math.round(e.delay / 60) : null;
    const eta = e ? G.fmtClock(new Date(Date.now() + e.time * 1000)) : '';
    const sub = !e ? 'Süre hesaplanıyor…'
      : dm == null ? `${eta} varış · tahmini`
        : dm >= 2 ? `Trafikte +${dm} dk · ${eta} varış` : `Trafik akıcı · ${eta} varış`;
    const dot = dm == null ? '' : dm >= 6 ? 'bad' : dm >= 2 ? 'warn' : '';
    hello = `<div class="hello${e ? '' : ' loading'}" data-act="helloOpen" data-k="${hk}" data-peek>
      <div class="hello-main">
        <div class="hello-eyebrow">${greeting()}</div>
        <div class="hello-title">${label} <em>${min ? `${min} dk` : '…'}</em></div>
        <div class="hello-sub">${e && dm != null ? `<span class="dot ${dot}"></span>` : ''}${esc(sub)}</div>
      </div>
      <button class="go" data-act="helloGo" data-k="${hk}">GİT</button>
    </div>`;
  }
  return `
    <div class="search-row">
      <button class="searchbar" data-act="openSearch">${I.search}<span>Nereye?</span></button>
      <button class="icon-btn" data-act="openSettings" aria-label="Ayarlar">${I.gear}</button>
    </div>
    ${resume}${hello}
    <div class="favs" ${hello ? '' : 'data-peek'}>
      ${fav('work', 'İş', 'work')}
      ${fav('home', 'Ev', 'home')}
      ${places}
      <button class="fav" data-act="addPlace"><span class="fav-icon add">${I.plus}</span><span class="fav-title">Ekle</span><span class="fav-sub">&nbsp;</span></button>
    </div>
    ${ttHint}
    <div class="section">
      <div class="section-head"><h3>Son kullanılanlar</h3>${store.recents.length ? '<button class="link small" data-act="clearRecents">Temizle</button>' : ''}</div>
      ${recents}
    </div>
    <p class="legal">Harita © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları · OpenFreeMap · Mapterhorn · Uydu © Esri · Rota: Valhalla · Hava: Open‑Meteo · Radar: EGM, OSM${key() ? ' · Trafik © TomTom' : ''}</p>`;
}

function viewSearch() {
  const label = { home: 'Ev adresini ara', work: 'İş yerini ara', place: 'Kaydedilecek yeri ara' }[S.pickFor] || 'Yer, işletme veya adres';
  const hint = S.pickFor === 'home' ? '<p class="hint">Sokak adını ve mahalleyi yazman yeterli. Örn: “2996 Sokak Gülyaka”. Adresin sadece bu telefonda saklanır.</p>'
    : S.pickFor === 'work' ? '<p class="hint">İş yerinin adını veya adresini yaz. Bulamazsan haritada iş yerinin üstüne basılı tut ve “İş Yap”ı seç.</p>'
      : S.pickFor === 'place' ? '<p class="hint">Sık gittiğin bir yeri ara ve seç, favorilere eklensin.</p>' : '';
  return `
    <div class="search-row" data-peek>
      <label class="searchfield">${I.search}<input id="q" type="search" placeholder="${label}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></label>
      <button class="link" data-act="cancelSearch">Vazgeç</button>
    </div>
    ${hint}
    ${S.pickFor ? '' : `<div class="cats">${api.CATEGORIES.map(c => `<button class="cat" data-act="cat" data-v="${c.id}">${I[KIND_ICON[c.kind]?.[0] || 'pin']}${c.label}</button>`).join('')}</div>`}
    <div id="results">${resultsHtml(S.results)}</div>`;
}

function resultsHtml(list) {
  const noKeyTip = !key() ? '<p class="hint" style="margin-top:12px">Aradığın işletme çıkmadı mı? Haritada yerin üstüne basılı tut, oradan seçebilirsin.</p>' : '';
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
    </div></div>` : ''}`;
}

function viewIncident() {
  const i = S.incident;
  const since = i.start ? new Date(i.start) : null;
  const d = Math.round(i.delay / 60);
  return `
    <div class="card-head">
      <div><p class="eyebrow" style="color:${incColor(i)}">${esc(i.label)}</p><h2>${esc(i.desc)}</h2>
      <p class="sub">${esc([i.road, i.from && i.to ? `${i.from} → ${i.to}` : i.from].filter(Boolean).join(' · '))}</p></div>
      <button class="close" data-act="goHome" aria-label="Kapat">${I.x}</button>
    </div>
    <div class="stats-grid" data-peek>
      <div class="stat-card"><small>Gecikme</small><b>${d >= 1 ? d : '—'}<span>${d >= 1 ? 'dk' : ''}</span></b></div>
      <div class="stat-card"><small>Başlangıç</small><b>${since ? G.fmtClock(since) : '—'}</b></div>
    </div>
    <p class="legal" style="text-align:left;margin-top:6px">Kaynak: TomTom canlı trafik</p>`;
}

const rtime = r => r.trafficTime || r.time;
function fmtTime(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min}<small> dk</small>`;
  return `${Math.floor(min / 60)}<small> sa </small>${min % 60}<small> dk</small>`;
}

// Kartta sadece en önemli 1-2 not; geri kalan her şey "Detaylar"da
// Rota şeridi: rotanın uzunluğu boyunca ana yol kısımları ve trafik (yavaş / sıkışık) nerede
function alongOf(r, pt) {
  let best = { d: Infinity, a: 0 };
  for (let i = 0; i < r.coords.length - 1; i += 1) {
    const a = r.coords[i], b = r.coords[i + 1];
    const d = dist(pt[0], pt[1], a[0], a[1]);
    if (d < best.d) best = { d, a: r.cum[i] };
    if (i === r.coords.length - 2) { const d2 = dist(pt[0], pt[1], b[0], b[1]); if (d2 < best.d) best = { d: d2, a: r.cum[i + 1] }; }
  }
  return best.d < 120 ? best.a : null;
}
function routeStrip(r) {
  if (r._strip != null) return r._strip;
  const L = r.lengthM || 1;
  const seg = (a, b, cls) => `<i class="${cls}" style="left:${(a / L * 100).toFixed(2)}%;width:${Math.max(0.8, (b - a) / L * 100).toFixed(2)}%"></i>`;
  let html = '';
  for (const s of r.story || []) {
    if (s.kind !== 'road' || !['motorway', 'trunk', 'primary', 'secondary'].includes(s.cls)) continue;
    html += seg(r.cum[Math.min(s.b, r.cum.length - 1)], r.cum[Math.min(s.e, r.cum.length - 1)], 'main');
  }
  for (const j of r.jams || []) {
    const a = alongOf(r, j.coords[0]), b = alongOf(r, j.coords[j.coords.length - 1]);
    if (a == null || b == null || b <= a) continue;
    html += seg(a, b, j.mag >= 2 ? 'jam' : 'slow');
  }
  r._strip = html ? `<div class="strip">${html}</div>` : '';
  return r._strip;
}

function routeNotes(r) {
  const n = [];
  if (r.best) n.push(['Önerilen', 'best']);
  const a = r.stats;
  const d = Math.round((r.trafficDelay || 0) / 60);
  if (r.trafficDelay != null && d >= 2) n.push([`Trafik +${d} dk`, d >= 6 ? 'bad' : 'warn']);
  else if (a && a.steep >= 300) n.push(['Yokuşlu', 'warn']);
  else if (a && a.rough >= 400) n.push(['Bozuk yol', 'warn']);
  else if (r.mode === 'auto' && a && a.total && (a.motorway + a.main) / a.total > 0.6 && !r.best) n.push(['Ana yollardan', '']);
  return n.slice(0, 2);
}
function metricsHtml(r) {
  const a = r.stats || {};
  const m = (label, val, cls = 'good') => `<div class="metric"><small>${label}</small><b class="${cls}">${val}</b></div>`;
  const dist = v => G.fmtDist(v);
  const cells = [];
  if (r.mode === 'auto') {
    const d = r.trafficDelay;
    cells.push(m('Trafik', d == null ? '—' : d >= 120 ? `+${Math.round(d / 60)} dk` : 'Akıcı', d >= 360 ? 'bad' : d >= 120 ? 'warn' : 'good'));
  }
  cells.push(m('Yokuş', !a.total ? '—' : a.steep < 150 ? 'Yok' : dist(a.steep), a.steep >= 600 ? 'bad' : a.steep >= 150 ? 'warn' : 'good'));
  cells.push(m('Bozuk yol', !a.total ? '—' : a.rough < 80 ? 'Yok' : dist(a.rough), a.rough >= 400 ? 'warn' : 'good'));
  if (r.mode === 'auto') {
    cells.push(m('Ara sokak', !a.total ? '—' : dist(a.small), a.small > 1500 ? 'warn' : 'good'));
    cells.push(m('Ana yol', !a.total ? '—' : `%${Math.round(((a.motorway + a.main) / a.total) * 100)}`));
  } else cells.push(m('Merdiven', a.steps ? 'Var' : 'Yok', a.steps ? 'warn' : 'good'));
  cells.push(m('Dönüş', r.turns ?? '—'));
  return `<div class="metrics">${cells.join('')}</div>`;
}

function storyHtml(r) {
  const st = r.story;
  if (!st || !st.length) return '';
  const items = st.map((s, i) => {
    if (s.kind === 'local') return `<div class="tl-item local"><span class="tl-dot"></span><div><small>Ara sokaklar · ${G.fmtDist(s.m)}</small></div></div>`;
    const tw = s.toward?.length ? ` · ${esc(s.toward.join(', '))} yönü` : '';
    return `<button class="tl-item road" data-act="focusSeg" data-i="${i}"><span class="tl-dot"></span><div><b>${esc(s.name)}${s.ref ? `<span class="ref">${esc(s.ref)}</span>` : ''}</b><small>${G.fmtDist(s.m)}${tw}</small></div></button>`;
  }).join('');
  return `
    <div class="section">
      <div class="section-head"><h3>Hangi yoldan</h3><button class="link small icon-link" data-act="speakStory">${I.speaker}<span>Dinle</span></button></div>
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
      const sel = i === S.sel;
      const eta = G.fmtClock(new Date(Date.now() + rtime(r) * 1000));
      const diff = i > 0 ? Math.round((rtime(r) - rtime(best)) / 60) : 0;
      const via = r.story ? r.story.filter(s => s.kind === 'road').map(s => api.abbr(s.name)).filter((v, k, a) => a.indexOf(v) === k).slice(0, 3).join(' › ') : r.via;
      const notes = routeNotes(r).map(([t, c]) => `<span class="note ${c}">${esc(t)}</span>`).join('');
      return `<div class="route ${sel ? 'sel' : ''}" ${i === 0 ? 'data-peek' : ''}>
        <div class="route-top" data-act="selRoute" data-i="${i}">
          <div class="route-main">
            <div class="rt-time">${fmtTime(rtime(r))}${diff ? `<span class="rt-diff">${diff > 0 ? '+' : ''}${diff} dk</span>` : ''}</div>
            <div class="rt-sub">${eta} varış · ${G.fmtDist(r.lengthM)}</div>
            ${via ? `<div class="rt-via">${esc(via)}</div>` : ''}
            ${notes ? `<div class="notes">${notes}</div>` : ''}
            ${r.mode === 'auto' ? routeStrip(r) : ''}
          </div>
          ${sel ? `<button class="go" data-act="go" data-i="${i}">GİT</button>` : ''}
        </div>
        ${sel ? `<div class="route-more"><button class="link" data-act="routeDetails">${S.details ? 'Detayları gizle' : 'Detaylar'}</button><button class="link" data-act="preview" data-i="${i}">Önizle</button></div>${S.details ? metricsHtml(r) : ''}` : ''}
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
  return `
    <div class="card-head center">
      <button class="circle-btn" data-act="shareEta" aria-label="Paylaş">${I.share}</button>
      <div><h2>Rotalar</h2></div>
      <button class="close" data-act="closeRoutes" aria-label="Kapat">${I.x}</button>
    </div>
    <div class="mode-seg">${modes}</div>
    <div class="fromto"><span>Konumum</span>${I.arrowR}<b>${esc(d.name)}</b></div>
    ${cards}
    ${r ? storyHtml(r) : ''}
    <div class="section"><div class="section-head"><h3>Rota tercihleri</h3></div>${prefsList(S.travel)}</div>
    ${steps ? `<div class="section"><div class="section-head"><h3>Adım adım</h3></div><div class="list plain steps">${steps}</div></div>` : ''}`;
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
      <div class="stat-card"><small>Hava</small><b>${w ? `${w.temp}°` : '—'}<span>${w ? w.icon : ''}</span></b></div>
      <div class="stat-card"><small>Yön</small><b>${p?.heading != null && p.speed > 0.8 ? compass(p.heading) : '—'}</b></div>
      <div class="stat-card"><small>Rakım</small><b>${p?.alt != null ? Math.round(p.alt) : '—'}<span>${p?.alt != null ? 'm' : ''}</span></b></div>
    </div>
    ${p ? `<div class="list plain"><button class="row" data-act="copyCoords"><span class="row-main"><span class="row-title">Koordinatlar</span><span class="row-sub">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · ±${Math.round(p.acc || 0)} m</span></span><span class="row-meta" style="color:var(--accent)">Kopyala</span></button></div>` : ''}
    <div class="action-grid" style="grid-template-columns:repeat(2,1fr)">
      <button data-act="shareMe">${I.share}<span>Konumumu paylaş</span></button>
      <button data-act="saveMe">${I.star}<span>Burayı kaydet</span></button>
    </div>`;
}

function render() {
  const v = { home: viewHome, search: viewSearch, place: viewPlace, routes: viewRoutes, where: viewWhere, incident: viewIncident }[S.view];
  if (S.view === 'search' && $('q')) { $('results').innerHTML = resultsHtml(S.results); return; }
  sheet.body.innerHTML = v();
  // Görünüm değiştiyse içerik yumuşakça belirsin
  if (S.lastView !== S.view) {
    S.lastView = S.view;
    const b = sheet.body;
    b.classList.remove('enter'); void b.offsetWidth; b.classList.add('enter');
    clearTimeout(S.enterT); S.enterT = setTimeout(() => b.classList.remove('enter'), 500);
  }
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
    S.helloAt = null; S.eta = {};
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
  S.map?.easeTo({ center: [p.lon, p.lat], zoom: Math.max(S.map.getZoom(), 15.5), padding: camPadding(), duration: 800 });
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
  S.view = 'routes'; S.details = false;
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
  if (S.sel === i) return;
  S.sel = i; S.details = false;
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
  S.navCams = route.mode === 'auto' ? routeCams(route) : [];
  S.trip = { t0: Date.now(), m: 0, last: null };
  S.prog = null;
  $('arrive').hidden = true;
  document.body.classList.remove('arrived');
  const eta = G.fmtClock(new Date(Date.now() + rtime(route) * 1000));
  S.navIntro = [G.storyShort(route.story), `Tahmini varış ${eta}.`].filter(Boolean).join(' ');
  document.body.classList.add('navigating');
  for (const id of ['nav', 'nav-side', 'nav-bottom']) $(id).hidden = false;
  $('nav-recenter').hidden = true;
  $('nav-alert').hidden = true;
  $('speed-limit').hidden = true;
  closeNavMenu();
  $('nav-bottom').classList.toggle('walk', route.mode !== 'auto');
  updateMuteBtn();
  $('nav-overview').innerHTML = I.route;
  setPuckNav(true);
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
  $('nav-status').hidden = true;
  if (simulate) {
    S.sim = new Simulator(route, p => { onPos(p); }, 3);
    showSimStatus();
  } else {
    $('sim-badge').hidden = true;
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
    S.navInc = traffic.onRoute(list.filter(i => i.cat !== 6 || i.delay >= 60), S.navRoute);
    drawIncidents();
  } catch { }
}

async function refreshNavTraffic() {
  if (!S.nav || !key()) return;
  const r = S.navRoute;
  try {
    if (!S.lastRemS) return;
    const rem = { coords: sliceAlong(r.coords, r.cum, S.nav.along, r.lengthM), time: S.lastRemS };
    const t = await traffic.routeTraffic(key(), rem);
    if (S.nav) { S.trafRatio = t.trafficRatio; setJams(t.jams); }
  } catch { }
}

// Önizleme (simülasyon) bilgisi altta küçük bir rozet; üst kartı kalabalıklaştırmaz
function showSimStatus() {
  const b = $('sim-badge');
  b.hidden = false;
  b.textContent = `Önizleme · ${S.sim.factor}×`;
}

function navPadding() {
  const H = window.innerHeight;
  if (wide()) return { top: Math.round(H * 0.38), bottom: 60, left: 440, right: 40 };
  // Araç ekranın alt üçte birinde: önündeki yol ve yaklaşan kavşaklar görünsün
  return { top: Math.round(H * 0.5), bottom: 96 + safeB(), left: 0, right: 0 };
}

function maneuverArrow(m) {
  const r = S.navRoute;
  if (!m || (m.type >= 1 && m.type <= 6)) { setArrowData([]); return; }
  const c = sliceAlong(r.coords, r.cum, Math.max(0, m.along - 40), Math.min(r.lengthM, m.along + 30));
  if (c.length < 2) { setArrowData([]); return; }
  const a = c[c.length - 2], b = c[c.length - 1];
  setArrowData([line(c, {}), { type: 'Feature', properties: { b: bearing(a[0], a[1], b[0], b[1]) }, geometry: { type: 'Point', coordinates: b } }]);
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
  // Dönüşe yaklaştıkça dolan ince çizgi (son 800 m)
  if (!S.prog || S.prog.idx !== st.upIdx) S.prog = { idx: st.upIdx, start: Math.max(60, Math.min(800, st.distToNext)) };
  const pr = Math.max(0, Math.min(1, 1 - st.distToNext / S.prog.start));
  $('nav-prog').style.width = `${(pr * 100).toFixed(1)}%`;
  const th = $('nav-then');
  if (st.then && st.gap < 400 && st.distToNext < 1200) {
    th.hidden = false;
    th.innerHTML = `${G.arrowSvg(st.then)}<span><span class="lbl">Ardından</span> ${esc(G.action(st.then))}${st.then.street ? ` · ${esc(st.then.street)}` : ''}</span>`;
  } else th.hidden = true;
}

function setDur(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) { $('nav-rem').textContent = min; $('nav-rem-u').textContent = 'dk'; }
  else { $('nav-rem').textContent = `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; $('nav-rem-u').textContent = 'sa'; }
}
function setKm(m) {
  if (m >= 1000) { $('nav-km').textContent = m >= 10000 ? Math.round(m / 1000) : (m / 1000).toFixed(1).replace('.', ','); $('nav-km-u').textContent = 'km'; }
  else { $('nav-km').textContent = Math.round(m / 10) * 10; $('nav-km-u').textContent = 'm'; }
}

function navTick(p) {
  if (!S.nav || S.arrived) return;
  const st = S.nav.update(p);
  const r = S.navRoute;
  const walk = r.mode !== 'auto';
  const onRoute = st.snapped.d < 30;
  const pp = onRoute ? st.snapped : p;
  const hd = p.speed > (walk ? 0.8 : 2) && p.heading != null ? p.heading : st.routeBearing;
  if (S.puck) { if (!S.follow) puckAt([pp.lon, pp.lat]); S.puck.setRotation(hd); }
  // Yolculuk özeti için gerçekten gidilen mesafe
  if (S.trip) {
    if (S.trip.last) { const d = dist(S.trip.last.lon, S.trip.last.lat, p.lon, p.lat); if (d < 300) S.trip.m += d; }
    S.trip.last = { lon: p.lon, lat: p.lat };
  }

  setRoutesData([line(sliceAlong(r.coords, r.cum, st.along, st.total), { i: 0, sel: true })]);
  if (st.upIdx !== S.arrowFor) { S.arrowFor = st.upIdx; maneuverArrow(st.up); }
  renderBanner(st);

  S.lastRemS = st.remS;
  const remS = st.remS * (S.trafRatio && !walk ? Math.min(2.5, Math.max(0.5, S.trafRatio)) : 1);
  $('nav-eta').textContent = G.fmtClock(new Date(Date.now() + remS * 1000));
  setDur(remS);
  setKm(st.remM);
  const kmh = Math.round((p.speed || 0) * 3.6);
  $('speed-val').textContent = kmh;

  let say = st.say;
  if (say && S.navIntro) { say = `${S.navIntro} ${say}`; S.navIntro = null; }
  const cam = store.prefs.radar ? S.navCams.find(c => c.along > st.along - 15 && c.along - st.along < 1000) : null;
  let limit = st.limit;
  if (cam?.max && cam.along - st.along < 600) limit = cam.max;
  const lim = $('speed-limit');
  lim.hidden = !limit || walk;
  if (limit) lim.textContent = limit;
  const over = !walk && !!limit && kmh > limit + 4;
  $('nav-bottom').classList.toggle('over', over);

  const street = $('nav-street');
  street.hidden = !st.street || !S.follow || !$('nav-menu').hidden;
  street.textContent = st.street;

  // Uyarı: sadece gerektiğinde (önce yakındaki radar, sonra yoldaki olay)
  const al = $('nav-alert');
  const inc = S.navInc.find(i => i.along > st.along - 30 && i.along - st.along < 4000);
  if (cam) {
    const dd = Math.max(0, cam.along - st.along);
    al.hidden = false;
    al.className = `nav-alert${over ? ' over' : ''}`;
    al.innerHTML = `<span class="na-ic">${I.camera}</span><span><b>Radar</b> · ${G.fmtDist(dd)}${cam.max ? ` · sınır ${cam.max}` : ''}</span>`;
    if (dd < 550 && !S.said.has('cam' + cam.id)) {
      S.said.add('cam' + cam.id);
      if (store.prefs.radarSound) radar.beep(over ? 3 : 2);
      const t = `Radar var${cam.max ? `, hız sınırı ${cam.max}` : ''}.`;
      say = say ? `${say} ${t}` : t;
    }
  } else if (inc) {
    const dd = Math.max(0, inc.along - st.along);
    const dm = Math.round(inc.delay / 60);
    const icon = { warn: I.warn, car: I.car, cone: I.cone, closed: I.noentry }[incGlyph(inc)] || I.warn;
    al.hidden = false;
    al.className = `nav-alert m${Math.min(inc.mag, 3)}`;
    al.innerHTML = `<span class="na-ic">${icon}</span><span><b>${esc(inc.label)}</b> · ${G.fmtDist(dd)}${dm >= 1 ? ` · +${dm} dk` : ''}</span>`;
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
  if (st.offRoute && !S.sim && !S.rerouting) { const s = $('nav-status'); s.className = 'nav-status off'; s.textContent = 'Rotanın dışındasın'; delete s.dataset.act; }

  const nb = Math.round($('nav').getBoundingClientRect().bottom + 12);
  if (nb !== S.sideTop) { S.sideTop = nb; $('nav-side').style.top = nb + 'px'; }

  if (S.follow && S.map) {
    // Arkadan takip eden 3B kamera; hız arttıkça biraz uzaklaşır, dönüşe yaklaşınca yakınlaşır
    let z;
    if (walk) z = 18;
    else z = st.distToNext < 220 ? 17.4 : p.speed > 22 ? 15.8 : p.speed > 13 ? 16.4 : 17;
    S.map.easeTo({ center: [pp.lon, pp.lat], bearing: hd, pitch: walk ? 50 : 64, zoom: z, duration: S.sim ? 480 : 1000, easing: t => t, padding: navPadding() });
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
    S.navCams = r.mode === 'auto' ? routeCams(r) : [];
    drawRadars();
    setJams([]);
    if (key() && r.mode === 'auto') { refreshNavIncidents(); refreshNavTraffic(); }
    voice.say('Rota güncellendi.');
  } catch {
    toast('Yeni rota alınamadı, tekrar denenecek');
  } finally {
    S.rerouting = false;
    s.hidden = true;
    if (S.sim) showSimStatus();
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
  $('nav-prog').style.width = '100%';
  S.sim?.stop();
  closeNavMenu();
  // Varış özeti: ne zaman vardın, ne kadar sürdü, kaç km, ortalama hız
  const tr = S.trip || { t0: Date.now(), m: 0 };
  const secs = Math.max(60, (Date.now() - tr.t0) / 1000);
  const meters = tr.m > 200 ? tr.m : (S.navRoute?.lengthM || 0);
  const avg = Math.round((meters / secs) * 3.6);
  const a = $('arrive');
  a.innerHTML = `
    <div class="arrive-flag">${I.check}</div>
    <h2>${esc(S.dest?.name === 'Ev' ? 'Eve vardın' : S.dest?.name === 'İş' ? 'İşe vardın' : 'Vardın')}</h2>
    <p>${esc(S.dest?.name && S.dest.name !== 'Ev' && S.dest.name !== 'İş' ? S.dest.name + ' · ' : '')}${G.fmtClock(new Date())}</p>
    <div class="arrive-stats">
      <div><b>${G.fmtDur(secs)}</b><small>süre</small></div>
      <div><b>${G.fmtDist(meters)}</b><small>mesafe</small></div>
      <div><b>${avg}</b><small>ort. km/sa</small></div>
    </div>
    <button class="btn primary" data-act="endNav">Tamam</button>`;
  a.hidden = false;
  document.body.classList.add('arrived');
  clearTimeout(S.arriveT);
  S.arriveT = setTimeout(() => { if (S.nav && S.arrived) endNav(); }, 45000);
}

function endNav() {
  S.sim?.stop(); S.sim = null;
  S.nav = null; S.navRoute = null; S.bannerFor = null; S.navInc = []; S.navCams = [];
  S.timers.forEach(clearInterval); S.timers = [];
  document.body.classList.remove('navigating');
  closeNavMenu();
  for (const id of ['nav', 'nav-side', 'nav-bottom', 'nav-recenter', 'nav-street', 'sim-badge', 'arrive']) $(id).hidden = true;
  document.body.classList.remove('arrived');
  clearTimeout(S.arriveT);
  S.trip = null; S.arrived = false;
  setPuckNav(false);
  keepAwake(false);
  voice.stop();
  store.activeNav = null; save();
  setRoutesData([]); setArrowData([]); setJams([]); setDest(null);
  applyTheme();
  drawRadars();
  if (S.map) {
    S.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const c = S.pos ? [S.pos.lon, S.pos.lat] : S.map.getCenter();
    S.map.easeTo({ center: c, pitch: store.prefs.tilt ? 58 : 0, bearing: 0, zoom: store.prefs.tilt ? 16.4 : 15.5, duration: 900 });
  }
  if (S.pos) updatePuck(S.pos);
  renderWherePill();
  S.view = 'home'; S.dest = null; S.routes = [];
  render();
  sheet.set('peek');
  loadIncidents(true);
  S.helloAt = null; S.eta = {}; refreshHello();
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
      <button class="row" data-act="overview"><span class="row-icon">${I.route}</span><span class="row-main"><span class="row-title">Tüm rotayı gör</span></span></button>
      <label class="row"><span class="row-icon">${I.speaker}</span><span class="row-main"><span class="row-title">Sesli yönlendirme</span></span><input type="checkbox" class="switch" data-pref="voice" ${P.voice ? 'checked' : ''}></label>
      <label class="row"><span class="row-icon">${I.camera}</span><span class="row-main"><span class="row-title">Radar uyarı sesi</span></span><input type="checkbox" class="switch" data-pref="radarSound" ${P.radarSound ? 'checked' : ''}></label>
      <button class="row" data-act="shareEta"><span class="row-icon">${I.share}</span><span class="row-main"><span class="row-title">Varış saatini paylaş</span></span></button>
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
      <label class="row"><span class="row-main"><span class="row-title">Trafik</span><span class="row-sub">${key() ? 'Yavaş ve sıkışık yollar, kazalar' : 'Önce Ayarlar’dan TomTom’u bağla'}</span></span><input type="checkbox" class="switch" data-pref="traffic" ${P.traffic && key() ? 'checked' : ''} ${key() ? '' : 'disabled'}></label>
      <label class="row"><span class="row-main"><span class="row-title">Radarlar</span><span class="row-sub">EDS ve hız kameraları</span></span><input type="checkbox" class="switch" data-pref="radar" ${P.radar ? 'checked' : ''}></label>
    </div>`;
}

/* ================= Ayarlar ================= */
function renderSettings() {
  const P = store.prefs;
  const seg = (v, l) => `<button class="${P.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`;
  const favRow = (k, label, icon) => {
    const p = store[k];
    return `<button class="row" data-act="setFav" data-k="${k}">${placeIcon(icon)}<span class="row-main"><span class="row-title">${label}</span><span class="row-sub">${p ? esc(p.name + (p.sub ? ', ' + p.sub : '')) : 'Ayarlanmadı'}</span></span><span class="row-meta" style="color:var(--accent)">${p ? 'Değiştir' : 'Ekle'}</span></button>`;
  };
  const places = store.places.length ? store.places.map((p, i) => `<div class="row">${placeIcon(p.kind || 'star')}<span class="row-main"><span class="row-title">${esc(p.name)}</span><span class="row-sub">${esc(p.sub)}</span></span><button class="close" data-act="delPlace" data-i="${i}" aria-label="Sil">${I.trash}</button></div>`).join('')
    : '<div class="empty">Henüz kayıtlı yer yok.</div>';
  const avoids = store.avoids.length ? store.avoids.map((a, i) => `<div class="row"><span class="row-icon c-red">${I.noentry}</span><span class="row-main"><span class="row-title">${esc(a.name || 'Yol')}</span><span class="row-sub">${esc(a.sub || '')}</span></span><button class="close" data-act="delAvoid" data-i="${i}" aria-label="Sil">${I.trash}</button></div>`).join('')
    : '<div class="empty">Henüz kaçındığın yol yok.</div>';
  const oldRadars = store.radars.length ? `<div class="group-title">Elle işaretlenmiş radarlar</div><div class="list plain">${store.radars.map((r, i) => `<div class="row"><span class="row-icon">${I.camera}</span><span class="row-main"><span class="row-title">${esc(r.name || 'Radar')}</span></span><button class="close" data-act="delRadar" data-i="${i}" aria-label="Sil">${I.trash}</button></div>`).join('')}</div>` : '';
  const icons = Object.entries(ICONS).map(([id, name]) => `<button class="icon-opt ${P.icon === id ? 'on' : ''}" data-act="pickIcon" data-v="${id}"><img src="icons/${id}-180.png" alt=""><span>${name}</span></button>`).join('');

  $('settings-body').innerHTML = `
    <div class="group-title">Harita teması</div>
    <div class="segmented">${seg('auto', 'Otomatik')}${seg('light', 'Gündüz')}${seg('dark', 'Gece')}</div>

    <div class="group-title">Radar</div>
    <div class="list plain">
      <label class="row"><span class="row-main"><span class="row-title">Radar uyarıları</span><span class="row-sub">${S.official.length ? `${S.official.length} resmi EDS noktası + çevrende ${S.cams.length} radar` : 'Radar verisi yükleniyor'}</span></span><input type="checkbox" class="switch" data-pref="radar" ${P.radar ? 'checked' : ''}></label>
      <label class="row"><span class="row-main"><span class="row-title">Uyarı sesi</span><span class="row-sub">Sesli yönlendirme kapalıyken de kısa bir “bip”</span></span><input type="checkbox" class="switch" data-pref="radarSound" ${P.radarSound ? 'checked' : ''}></label>
    </div>
    <p class="group-foot">Radarlar otomatik gelir, senin bir şey eklemen gerekmez: Emniyet Genel Müdürlüğü’nün resmi EDS listesi (her hafta güncellenir) ve OpenStreetMap’teki hız kameraları. Gezici radarların yeri hiçbir yerde yayınlanmadığı için gösterilemez.</p>
    ${oldRadars}

    <div class="group-title">Sesli yönlendirme</div>
    <div class="list plain">
      <label class="row"><span class="row-main"><span class="row-title">Sesli yönlendirme</span><span class="row-sub">${voice.v ? esc(voice.v.name) : 'Telefonun sesi'}</span></span><input type="checkbox" class="switch" data-pref="voice" ${P.voice ? 'checked' : ''}></label>
    </div>

    <div class="group-title">Trafik ve işletme arama</div>
    <div class="list plain">
      <div class="row" style="gap:8px">
        <span class="row-main"><span class="row-title">TomTom</span><span class="row-sub">${key() ? 'Bağlı · trafik, kazalar ve işletme arama açık' : 'Bağlı değil'}</span></span>
        ${key() ? `<button class="pill-btn" data-act="removeKey">Kaldır</button>` : ''}
      </div>
      ${key() ? '' : `<div class="row" style="gap:8px"><input id="tt-key" class="text-input" placeholder="API anahtarını yapıştır" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="pill-btn accent" data-act="saveKey">Kaydet</button></div>`}
    </div>
    ${key() ? '' : `<p class="group-foot">Ücretsiz anahtar: <a href="https://developer.tomtom.com/user/register" target="_blank" rel="noopener">developer.tomtom.com</a> › hesap aç › Dashboard › Keys.</p>`}

    <div class="group-title">Uygulama simgesi</div>
    <div class="icon-grid">${icons}</div>
    <div class="list plain" style="margin-top:12px"><button class="row accent" data-act="applyIcon"><span class="row-icon">${I.copy}</span><span class="row-main"><span class="row-title">Simgeyi telefona uygula</span><span class="row-sub wrap">Bağlantıyı kopyalar ve adımları gösterir</span></span></button></div>
    <div id="icon-steps"></div>

    <div class="group-title">Rota tercihleri</div>
    ${prefsList('auto')}

    <div class="group-title">Ev ve iş</div>
    <div class="list plain">${favRow('home', 'Ev', 'home')}${favRow('work', 'İş', 'work')}</div>

    <div class="group-title">Kayıtlı yerler</div>
    <div class="list plain">${places}</div>

    <div class="group-title">Kaçındığın yollar</div>
    <div class="list plain">${avoids}</div>
    <p class="group-foot">Haritada bir yola basılı tut ve “Bu yoldan beni geçirme”ye dokun.</p>

    <div class="group-title">Yedek</div>
    <div class="list plain">
      <button class="row" data-act="backup"><span class="row-icon">${I.download}</span><span class="row-main"><span class="row-title">Yedeği indir</span></span></button>
      <button class="row" data-act="restore"><span class="row-icon">${I.upload}</span><span class="row-main"><span class="row-title">Yedekten geri yükle</span></span></button>
    </div>
    <p class="group-foot">Tüm kişisel bilgiler sadece bu telefonda saklanır.</p>

    <div class="group-title">Hakkında</div>
    <div class="list plain"><div class="row"><span class="row-main"><span class="row-title">Yolcu</span><span class="row-sub wrap">Harita © OpenStreetMap katkıcıları, OpenFreeMap. Arazi © Mapterhorn. Uydu © Esri, Maxar. Rota: Valhalla (FOSSGIS). Arama: Photon, Nominatim${key() ? ', TomTom' : ''}. Hava: Open‑Meteo. Radar: EGM EDS Haritası, OpenStreetMap.</span></span></div></div>`;
}

function applyIconLink() {
  const link = document.querySelector('link[rel=apple-touch-icon]');
  if (link) link.href = `icons/${store.prefs.icon || 'komur'}-180.png`;
}

function setTilt(on) {
  store.prefs.tilt = on; save();
  if (!S.map) return;
  setTerrain(S.map, on && !S.nav);
  const z = S.map.getZoom();
  S.map.easeTo({ pitch: on ? 58 : 0, zoom: on ? Math.max(z, 15.8) : z, bearing: on ? S.map.getBearing() : 0, duration: 900 });
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
  helloOpen: (el, e) => {
    if (e.target.closest('[data-act=helloGo]')) return;
    const k = el.dataset.k; if (!store[k]) return;
    openRoutes({ ...store[k], name: k === 'home' ? 'Ev' : 'İş', sub: store[k].name, kind: k });
  },
  helloGo: (el, e) => {
    e.stopPropagation();
    const k = el.dataset.k; if (!store[k]) return;
    S.autoStart = true;
    openRoutes({ ...store[k], name: k === 'home' ? 'Ev' : 'İş', sub: store[k].name, kind: k });
  },
  cat: async el => {
    const c = api.CATEGORIES.find(x => x.id === el.dataset.v); if (!c) return;
    document.querySelectorAll('.cat').forEach(b => b.classList.toggle('on', b === el));
    const q = $('q'); if (q) q.value = '';
    document.activeElement?.blur?.();
    S.searchAbort?.abort();
    S.results = 'loading'; render();
    const center = S.pos || (S.map ? { lat: S.map.getCenter().lat, lon: S.map.getCenter().lng } : IZMIR);
    const token = S.catToken = {};
    const show = list => {
      if (S.catToken !== token || S.view !== 'search') return;
      // Aynı yer (harita karoları üst üste biner; TomTom ile harita aynı yeri iki kez verebilir) tek satır olsun
      const kept = [];
      const items = list.map(p => ({ ...p, kind: c.kind, _d: dist(center.lon, center.lat, p.lon, p.lat) }))
        .filter(p => p._d < 15000)
        .sort((a, b) => (a.name === c.fallback) - (b.name === c.fallback) || a._d - b._d);
      for (const p of items) {
        const dup = kept.some(q => { const d = dist(q.lon, q.lat, p.lon, p.lat); return (d < 150 && q.name === p.name) || (d < 60 && (p.name === c.fallback || q.name === c.fallback)); });
        if (!dup) kept.push(p);
      }
      S.results = kept.sort((a, b) => a._d - b._d).slice(0, 15);
      render();
    };
    // 1) Haritada yüklü mekanlar: anında
    const tiles = tileNearby(c);
    if (tiles.length) show(tiles);
    // 2) TomTom kategori araması: hızlı
    let tt = [];
    if (key() && c.tt) tt = await traffic.nearby(key(), c.tt, center, c.r).catch(() => []);
    if (tt.length || tiles.length) { show([...tiles, ...tt]); return; }
    // 3) Son çare OpenStreetMap Overpass (yavaş olabilir)
    try { show(await api.nearby(c, center)); } catch { if (S.catToken === token) { S.results = 'error'; render(); } }
  },
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
  closeRoutes: () => { S.planAbort?.abort(); S.routes = []; setRoutesData([]); setJams([]); clearChips(); if (S.place) showPlace(S.place); else goHome(); },
  replan: () => planRoutes(),
  travel: el => { if (S.travel === el.dataset.v) return; S.travel = el.dataset.v; planRoutes(); },
  selRoute: (el, e) => { if (e.target.closest('.go')) return; selectRoute(+el.dataset.i); },
  routeDetails: () => { S.details = !S.details; const sc = sheet.body.scrollTop; render(); sheet.body.scrollTop = sc; },
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
    fitCoords(c, { padding: { top, bottom: 130 + safeB(), left: wide() ? 460 : 36, right: 72 } });
  },
  toggleVoice: () => {
    store.prefs.voice = !store.prefs.voice; save(); updateMuteBtn();
    if (!store.prefs.voice) voice.stop();
    toast(store.prefs.voice ? 'Sesli yönlendirme açık' : 'Sesli yönlendirme kapalı', 1500);
  },
  simSpeed: () => { if (!S.sim) return; const f = [1, 3, 8]; S.sim.factor = f[(f.indexOf(S.sim.factor) + 1) % f.length]; showSimStatus(); },
  locate: () => {
    if (!S.pos) { toast('Konumun bekleniyor…'); return; }
    const tilt = store.prefs.tilt;
    S.map.easeTo({ center: [S.pos.lon, S.pos.lat], zoom: Math.max(S.map.getZoom(), tilt ? 16.4 : 16), bearing: 0, pitch: tilt ? 58 : 0, duration: 900, padding: { top: 0, bottom: wide() ? 0 : sheet.visible() * 0.5, left: wide() ? 420 : 0, right: 0 } });
  },
  toggle3d: () => setTilt(!(S.map && S.map.getPitch() > 15)),
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
      toast('TomTom bağlandı');
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
        <li>Paylaş › <b>Ana Ekrana Ekle</b>.</li>
      </ol>
      <small>Ev, iş, favoriler ve ayarların bağlantının içinde, yeni uygulamaya taşınır.</small>
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
  $('btn-layers').innerHTML = I.layers;
  $('btn-3d').classList.toggle('on', !!store.prefs.tilt);
  sheet.init();
  render();
  requestAnimationFrame(() => sheet.set('peek', false));
  setTimeout(() => { fitScreen(); sheet.set(sheet.detent, false); }, 400);
  voice.init();
  initMap();
  startGeo();
  setInterval(() => {
    checkTheme();
    if (S.view === 'home' && !S.nav) { refreshHello(); if (sheet.detent === 'peek') { const sc = sheet.body.scrollTop; render(); sheet.body.scrollTop = sc; } }
  }, 60000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}
boot();

// Geliştirme ve test için
window.__yolcu = { S, store, onPos, startNav, sheet };
