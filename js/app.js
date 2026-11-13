import { store, save, addRecent, isSaved, toggleSaved, exportBackup, importBackup } from './store.js';
import * as api from './api.js';
import { loadStyle, applyPalette, PALETTES, firstLabelLayer } from './mapstyle.js';
import * as G from './guide.js';
import { Navigator, Simulator } from './nav.js';
import { I, KIND_ICON } from './icons.js';
import { dist, bearing, sliceAlong, compass } from './geo.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IZMIR = { lon: 27.142, lat: 38.423 };
const EMPTY = { type: 'FeatureCollection', features: [] };
const wide = () => window.innerWidth >= 700;

const S = {
  map: null, mapReady: false, pos: null, firstFix: true, puck: null, destMarker: null,
  view: 'home', place: null, results: null, routes: [], sel: 0, dest: null, routeErr: null,
  pickFor: null, nav: null, navRoute: null, sim: null, follow: true, rerouting: false,
  where: null, whereAt: null, whereBusy: false, wake: null, arrowFor: -1, arrived: false,
  dragEnd: 0, autoStart: false
};

/* ================= Tema ================= */
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const p = store.prefs.theme;
  const t = p === 'auto' ? (mq.matches ? 'dark' : 'light') : p;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#000000' : '#F3F1EC';
  if (S.mapReady) applyPalette(S.map, PALETTES[t]);
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

/* ================= Ses ================= */
const voice = {
  ok: 'speechSynthesis' in window, v: null,
  init() {
    if (!this.ok) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.v = vs.find(x => /^tr/i.test(x.lang) && /yelda/i.test(x.name)) || vs.find(x => /^tr/i.test(x.lang)) || null;
    };
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
  },
  unlock() {
    if (!this.ok) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { }
  },
  say(text, force = false) {
    if (!this.ok || !text || (!store.prefs.voice && !force)) return;
    const go = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'tr-TR'; if (this.v) u.voice = this.v; u.rate = 1;
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(go, 80); } else go();
  }
};

/* ================= Ekranı açık tut ================= */
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) { S.wake = await navigator.wakeLock.request('screen'); }
    else if (!on && S.wake) { await S.wake.release(); S.wake = null; }
  } catch { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.nav) keepAwake(true); });

/* ================= Güvenli alan ================= */
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
document.body.appendChild(probe);
const safeB = () => probe.offsetHeight;

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
    return { peek: Math.min(this.peekH(), H), half: Math.min(Math.max(Math.round(window.innerHeight * 0.52), this.peekH()), H), full: H };
  },
  set(d, anim = true) {
    this.detent = d;
    const vis = this.heights()[d];
    this.y = Math.max(0, this.H() - vis);
    this.el.style.transition = anim ? 'transform .5s cubic-bezier(.32,.72,0,1)' : 'none';
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
const NAV_ARROW = '<svg viewBox="0 0 50 50"><path d="M25 3 L43 45 L25 35 L7 45 Z" fill="#0A84FF" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>';
const PIN = '<svg viewBox="0 0 38 46"><path d="M19 45s-15-14-15-26a15 15 0 0 1 30 0c0 12-15 26-15 26z" fill="#FF3B30" stroke="#fff" stroke-width="2.5"/><circle cx="19" cy="19" r="6" fill="#fff"/></svg>';

async function initMap() {
  let style;
  try { style = await loadStyle(); }
  catch { toast('Harita yüklenemedi. İnternet bağlantını kontrol et.', 5000); return; }
  const map = S.map = new maplibregl.Map({
    container: 'map', style, center: [IZMIR.lon, IZMIR.lat], zoom: 12, attributionControl: false,
    maxPitch: 65, fadeDuration: 150, dragRotate: true, pitchWithRotate: true
  });
  map.on('load', () => {
    addLayers();
    S.mapReady = true;
    applyTheme();
    $('map').classList.add('ready');
    if (S.pos) { S.firstFix = false; map.jumpTo({ center: [S.pos.lon, S.pos.lat], zoom: 15 }); updatePuck(S.pos); }
  });
  map.on('styleimagemissing', () => { });
  map.on('dragstart', () => {
    if (S.nav) { S.follow = false; $('nav-recenter').hidden = false; }
  });
  map.on('rotate', () => updateLocateBtn());

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

function addLayers() {
  const m = S.map, before = firstLabelLayer(m);
  const w = (a, b) => ['interpolate', ['exponential', 1.5], ['zoom'], 10, a, 18, b];
  const round = { 'line-join': 'round', 'line-cap': 'round' };
  m.addSource('yolcu-routes', { type: 'geojson', data: EMPTY });
  m.addSource('yolcu-arrow', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'yolcu-alt-case', type: 'line', source: 'yolcu-routes', filter: ['!', ['get', 'sel']], layout: round, paint: { 'line-color': '#6E9FD8', 'line-width': w(6, 22) } }, before);
  m.addLayer({ id: 'yolcu-alt', type: 'line', source: 'yolcu-routes', filter: ['!', ['get', 'sel']], layout: round, paint: { 'line-color': '#9EC5F5', 'line-width': w(4, 16) } }, before);
  m.addLayer({ id: 'yolcu-route-case', type: 'line', source: 'yolcu-routes', filter: ['get', 'sel'], layout: round, paint: { 'line-color': '#0060DF', 'line-width': w(8, 26) } }, before);
  m.addLayer({ id: 'yolcu-route', type: 'line', source: 'yolcu-routes', filter: ['get', 'sel'], layout: round, paint: { 'line-color': '#0A84FF', 'line-width': w(5.5, 19) } }, before);
  m.addLayer({ id: 'yolcu-arrow-case', type: 'line', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'LineString'], layout: round, paint: { 'line-color': '#1c1c1e', 'line-width': w(5, 24) } });
  m.addLayer({ id: 'yolcu-arrow', type: 'line', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'LineString'], layout: round, paint: { 'line-color': '#fff', 'line-width': w(3, 16) } });
  m.addImage('yolcu-head', headImage(), { pixelRatio: 2 });
  m.addLayer({
    id: 'yolcu-arrow-head', type: 'symbol', source: 'yolcu-arrow', minzoom: 13, filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'icon-image': 'yolcu-head', 'icon-rotate': ['get', 'b'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 0.35, 18, 1.5] }
  });
  m.on('click', 'yolcu-alt', e => {
    const i = e.features[0]?.properties?.i;
    if (i != null && S.view === 'routes') selectRoute(+i);
  });
}

function setRoutesData(features) { S.map?.getSource('yolcu-routes')?.setData({ type: 'FeatureCollection', features }); }
function setArrowData(features) { S.map?.getSource('yolcu-arrow')?.setData({ type: 'FeatureCollection', features }); }
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
  if (wide()) return { top: 60, bottom: 60, left: 440, right: 70 };
  return { top: 70, bottom: Math.min(sheet.visible(), window.innerHeight * 0.6) + 20, left: 40, right: 70 };
}

function fitCoords(coords, opts = {}) {
  if (!S.map || !coords.length) return;
  const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) b.extend(c);
  // MapLibre önceki kamera payını yenisine ekliyor; sıfırlamazsak rota sığmıyor
  S.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  S.map.fitBounds(b, { padding: opts.padding || camPadding(), duration: 800, maxZoom: 16, bearing: 0, pitch: 0 });
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
  if (first) updateLocateBtn();
  if (S.firstFix && S.mapReady && !S.nav) { S.firstFix = false; S.map.jumpTo({ center: [p.lon, p.lat], zoom: 15 }); }
  if (S.nav) navTick(p);
  else {
    updateWhere(p);
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
      if (err.code === 1) toast('Konum izni verilmedi. Ayarlar › Gizlilik › Konum Servisleri’nden Safari’ye izin ver.', 6000);
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

function prefsList() {
  const P = store.prefs;
  const row = (k, title, sub) => `<label class="row"><span class="row-main"><span class="row-title">${title}</span><span class="row-sub wrap">${sub}</span></span><input type="checkbox" class="switch" data-pref="${k}" ${P[k] ? 'checked' : ''}></label>`;
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
    let sub = 'Ekle';
    if (p) sub = distFromMe(p) || 'Git';
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
    ? `<div class="list">${store.recents.map((p, i) => placeRow(p, 'recent', i, 'recent')).join('')}</div>`
    : `<div class="list"><div class="empty">Gittiğin yerler burada görünecek.</div></div>`;
  return `
    <div class="search-row">
      <button class="searchbar" data-act="openSearch">${I.search}<span>Yolcu’da Ara</span></button>
    </div>
    ${resume}
    <div class="section" data-peek>
      <div class="section-head"><h3>Favoriler</h3></div>
      <div class="favs">
        ${fav('home', 'Ev', 'home', 'c-blue')}
        ${fav('work', 'İş', 'work', 'c-brown')}
        ${places}
        <button class="fav" data-act="addPlace"><span class="fav-icon add">${I.plus}</span><span class="fav-title">Ekle</span><span class="fav-sub">&nbsp;</span></button>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Son Kullanılanlar</h3>${store.recents.length ? '<button class="link small" data-act="clearRecents">Temizle</button>' : ''}</div>
      ${recents}
    </div>
    <p class="legal">Harita verisi © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları · OpenFreeMap · Valhalla</p>`;
}

function viewSearch() {
  const label = { home: 'Ev adresini ara', work: 'İş adresini ara', place: 'Kaydedilecek yeri ara' }[S.pickFor] || 'Yer veya adres ara';
  const hint = S.pickFor === 'home' ? '<p class="hint">Sokak adını ve mahalleyi yazman yeterli. Örn: “2996 Sokak Gülyaka”. Adresin sadece bu telefonda saklanır.</p>'
    : S.pickFor === 'work' ? '<p class="hint">İş yerinin adını veya adresini yaz. Örn: “Ege Üniversitesi”.</p>'
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
  if (list === 'loading') return '<div class="list"><div class="empty">Aranıyor…</div></div>';
  if (list === 'error') return '<div class="list"><div class="empty">Arama yapılamadı. İnternet bağlantını kontrol et.</div></div>';
  if (Array.isArray(list)) {
    if (!list.length) return '<div class="list"><div class="empty">Sonuç bulunamadı.<br>Farklı yazmayı dene, örn. “Yeşildere Caddesi Karabağlar”.</div></div>';
    return `<div class="list">${list.map((p, i) => placeRow(p, 'pick', i)).join('')}</div>`;
  }
  const quick = [];
  if (!S.pickFor) {
    if (store.home) quick.push(`<button class="row" data-act="fav" data-k="home">${placeIcon('home')}<span class="row-main"><span class="row-title">Ev</span><span class="row-sub">${esc(store.home.sub || store.home.name)}</span></span><span class="row-meta">${distFromMe(store.home)}</span></button>`);
    if (store.work) quick.push(`<button class="row" data-act="fav" data-k="work">${placeIcon('work')}<span class="row-main"><span class="row-title">İş</span><span class="row-sub">${esc(store.work.name)}</span></span><span class="row-meta">${distFromMe(store.work)}</span></button>`);
    store.recents.slice(0, 8).forEach((p, i) => quick.push(placeRow(p, 'recent', i, 'recent')));
  }
  return quick.length ? `<div class="list">${quick.join('')}</div>` : '';
}

function viewPlace() {
  const p = S.place;
  const saved = isSaved(p);
  const isHome = store.home && Math.abs(store.home.lat - p.lat) < 1e-4 && Math.abs(store.home.lon - p.lon) < 1e-4;
  const isWork = store.work && Math.abs(store.work.lat - p.lat) < 1e-4 && Math.abs(store.work.lon - p.lon) < 1e-4;
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
    ${p.isPoint ? `<div class="section"><div class="list plain"><button class="row danger" data-act="avoidHere"><span class="row-icon c-red">${I.noentry}</span><span class="row-main"><span class="row-title">Bu yoldan beni geçirme</span><span class="row-sub wrap">Rotalar artık bu noktadaki yolu kullanmaz</span></span></button></div></div>` : ''}`;
}

function fmtBig(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min}<small> dk</small>`;
  return `${Math.floor(min / 60)}<small> sa </small>${min % 60}<small> dk</small>`;
}

function viewRoutes() {
  const d = S.dest;
  let cards;
  if (S.routeErr) cards = `<div class="list"><div class="empty">${esc(S.routeErr)}<br><br><button class="link" data-act="replan">Tekrar dene</button></div></div>`;
  else if (!S.routes.length) cards = '<div class="skeleton" data-peek></div><div class="skeleton"></div>';
  else {
    const best = S.routes[0];
    cards = S.routes.map((r, i) => {
      const eta = G.fmtClock(new Date(Date.now() + r.time * 1000));
      const diff = i > 0 ? Math.round((r.time - best.time) / 60) : 0;
      const diffTxt = i > 0 && diff !== 0 ? ` · ${diff > 0 ? '+' : ''}${diff} dk` : '';
      const badges = (r.best ? '<span class="badge best">Önerilen</span>' : '') + (r.fastest ? '<span class="badge fast">En hızlı</span>' : '');
      return `<div class="route-card ${i === S.sel ? 'sel' : ''}" data-act="selRoute" data-i="${i}" ${i === 0 ? 'data-peek' : ''}>
        <div class="rc-main">
          ${badges ? `<div class="rc-badges">${badges}</div>` : ''}
          <div class="rc-time">${fmtBig(r.time)}</div>
          <div class="rc-sub">${G.fmtDist(r.lengthM)} · Varış ${eta}${diffTxt}</div>
          ${r.via ? `<div class="rc-via">${esc(r.via)}</div>` : ''}
          <div class="tags">${r.tags.map(t => `<span class="tag ${t.c}">${esc(t.t)}</span>`).join('')}</div>
        </div>
        <div class="rc-side">
          <button class="go" data-act="go" data-i="${i}">Git</button>
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
  return `
    <div class="card-head">
      <div><h2>${esc(d.name)}</h2><p class="sub">Konumundan${S.routes.length ? ` · ${S.routes.length} rota` : ''}</p></div>
      <button class="close" data-act="closeRoutes" aria-label="Kapat">${I.x}</button>
    </div>
    ${cards}
    <div class="section"><div class="section-head"><h3>Rota Tercihleri</h3></div>${prefsList()}</div>
    ${steps ? `<div class="section"><div class="section-head"><h3>Adım Adım</h3></div><div class="list plain steps">${steps}</div></div>` : ''}`;
}

function viewWhere() {
  const r = S.where || {};
  const p = S.pos;
  const kmh = p ? Math.round((p.speed || 0) * 3.6) : 0;
  const area = [r.hood, r.district, r.city].filter(Boolean).join(', ');
  return `
    <div class="card-head">
      <div><p class="eyebrow">Şu an buradasın</p><h2>${esc(r.road || r.hood || 'Konum alınıyor…')}</h2>${area ? `<p class="sub">${esc(area)}</p>` : ''}</div>
      <button class="close" data-act="goHome" aria-label="Kapat">${I.x}</button>
    </div>
    <div class="stats-grid" data-peek>
      <div class="stat-card"><small>Hız</small><b>${kmh}<span>km/sa</span></b></div>
      <div class="stat-card"><small>Yön</small><b style="font-size:20px">${p?.heading != null && p.speed > 0.8 ? compass(p.heading) : '—'}</b></div>
      <div class="stat-card"><small>Rakım</small><b>${p?.alt != null ? Math.round(p.alt) : '—'}<span>${p?.alt != null ? 'm' : ''}</span></b></div>
      <div class="stat-card"><small>Konum hassasiyeti</small><b>${p ? '±' + Math.round(p.acc || 0) : '—'}<span>${p ? 'm' : ''}</span></b></div>
    </div>
    ${p ? `<div class="list plain"><button class="row" data-act="copyCoords"><span class="row-main"><span class="row-title">Koordinatlar</span><span class="row-sub">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span></span><span class="row-meta" style="color:var(--blue)">Kopyala</span></button></div>` : ''}
    <div class="action-grid" style="grid-template-columns:repeat(2,1fr)">
      <button data-act="shareMe">${I.share}<span>Konumumu Paylaş</span></button>
      <button data-act="saveMe">${I.star}<span>Burayı Kaydet</span></button>
    </div>`;
}

function render() {
  const v = { home: viewHome, search: viewSearch, place: viewPlace, routes: viewRoutes, where: viewWhere }[S.view];
  const keepFocus = S.view === 'search' && document.activeElement?.id === 'q';
  if (S.view === 'search' && $('q')) { $('results').innerHTML = resultsHtml(S.results); return; }
  sheet.body.innerHTML = v();
  if (keepFocus) $('q')?.focus();
}

function goHome() {
  S.view = 'home'; S.place = null; S.pickFor = null; S.results = null;
  S.planAbort?.abort();
  setDest(null); setRoutesData([]);
  render();
  sheet.set('peek');
}

/* ================= Arama ================= */
function openSearch() {
  S.view = 'search'; S.results = null;
  sheet.body.innerHTML = '';
  render();
  const q = $('q');
  q.focus();
  q.addEventListener('input', () => onSearchInput(q.value));
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); q.blur(); onSearchInput(q.value, true); } });
  sheet.set('full');
}

function onSearchInput(q, now = false) {
  clearTimeout(S.searchT);
  S.searchAbort?.abort();
  q = q.trim();
  if (q.length < 2) { S.results = null; render(); return; }
  S.searchT = setTimeout(async () => {
    const ac = S.searchAbort = new AbortController();
    if (!Array.isArray(S.results)) { S.results = 'loading'; render(); }
    try {
      let list = await api.search(q, S.pos || (S.map ? { lat: S.map.getCenter().lat, lon: S.map.getCenter().lng } : IZMIR), ac.signal);
      if (!list.length || now) {
        const more = await api.searchFallback(q, ac.signal).catch(() => []);
        const seen = new Set(list.map(p => p.name + p.sub));
        list = [...list, ...more.filter(p => !seen.has(p.name + p.sub))];
      }
      S.results = list; render();
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
    const wasSettings = !$('settings').hidden;
    goHome();
    if (wasSettings) renderSettings();
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
  setRoutesData([]);
  S.map?.easeTo({ center: [p.lon, p.lat], zoom: Math.max(S.map.getZoom(), 15), padding: camPadding(), duration: 700 });
}

async function openPoint(ll) {
  const p = { name: 'İşaretli Konum', sub: 'Adres alınıyor…', lat: ll.lat, lon: ll.lng, kind: 'pin', isPoint: true };
  showPlace(p);
  try {
    const r = await api.reverse(ll.lat, ll.lng);
    if (S.place !== p) return;
    p.name = r.road || r.name || 'İşaretli Konum';
    p.road = r.road;
    p.sub = [r.road ? r.hood : null, r.district, r.city].filter(Boolean).join(', ');
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
  if (/path|unreachable|No suitable edges|connect/i.test(m)) {
    return 'Bu hedefe araçla gidilebilecek bir yol bulunamadı.' + (store.avoids.length ? ' Kaçındığın yollardan biri engel olabilir (Ayarlar).' : '');
  }
  return 'Rota alınamadı. İnternet bağlantını kontrol edip tekrar dene.';
}

async function planRoutes() {
  S.planAbort?.abort();
  const ac = S.planAbort = new AbortController();
  S.routes = []; S.routeErr = null; S.sel = 0;
  render();
  setRoutesData([]);
  const from = await waitPos();
  if (ac.signal.aborted) return;
  if (!from) { S.routeErr = 'Konumun alınamadı. Konum iznini kontrol et.'; render(); return; }
  try {
    const routes = await api.planRoutes(from, S.dest, store.prefs, store.avoids, ac.signal);
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
}

function selectRoute(i) {
  S.sel = i;
  render();
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
  S.follow = true; S.arrowFor = -1; S.arrived = false;
  document.body.classList.add('navigating');
  for (const id of ['nav', 'nav-side', 'nav-speed', 'nav-bottom']) $(id).hidden = false;
  $('nav-recenter').hidden = true;
  updateMuteBtn();
  $('nav-overview').innerHTML = I.map;
  S.puck?.getElement().classList.add('nav');
  setRoutesData([line(route.coords, { i: 0, sel: true })]);
  setDest(S.dest);
  keepAwake(true);
  if (simulate) {
    S.sim = new Simulator(route, p => { onPos(p); }, 3);
    showSimStatus();
  } else {
    $('nav-status').hidden = true;
    if (S.pos) navTick(S.pos);
  }
}

function showSimStatus() {
  const s = $('nav-status');
  s.hidden = false; s.className = 'nav-status sim';
  s.dataset.act = 'simSpeed';
  s.textContent = `Önizleme · ${S.sim.factor}× hız (değiştirmek için dokun)`;
}

function navPadding() {
  const H = window.innerHeight;
  if (wide()) return { top: Math.round(H * 0.35), bottom: 60, left: 440, right: 40 };
  return { top: Math.round(H * 0.42), bottom: 110 + safeB(), left: 0, right: 0 };
}

function maneuverArrow(m) {
  const r = S.navRoute;
  if (!m || (m.type >= 4 && m.type <= 6) || m.type === 1 || m.type === 2 || m.type === 3) { setArrowData([]); return; }
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
    th.innerHTML = `<span>Ardından</span>${G.arrowSvg(st.then)}<span>${esc(G.action(st.then))}</span>`;
  } else th.hidden = true;
}

function navTick(p) {
  if (!S.nav) return;
  const st = S.nav.update(p);
  const r = S.navRoute;
  const onRoute = st.snapped.d < 30;
  const pp = onRoute ? st.snapped : p;
  const hd = p.speed > 2 && p.heading != null ? p.heading : st.routeBearing;
  if (S.puck) { S.puck.setLngLat([pp.lon, pp.lat]); S.puck.setRotation(hd); }

  setRoutesData([line(sliceAlong(r.coords, r.cum, st.along, st.total), { i: 0, sel: true })]);
  if (st.upIdx !== S.arrowFor) { S.arrowFor = st.upIdx; maneuverArrow(st.up); }
  renderBanner(st);

  $('nav-eta').textContent = G.fmtClock(new Date(Date.now() + st.remS * 1000));
  $('nav-rem').textContent = G.fmtDur(st.remS);
  $('nav-km').textContent = G.fmtDist(st.remM);
  const kmh = Math.round((p.speed || 0) * 3.6);
  $('speed-val').textContent = kmh;
  const lim = $('speed-limit');
  lim.hidden = !st.limit;
  if (st.limit) lim.textContent = st.limit;
  $('nav-speed').classList.toggle('over', !!st.limit && kmh > st.limit + 5);
  const street = $('nav-street');
  street.hidden = !st.street || !S.follow;
  street.textContent = st.street;

  if (st.say) voice.say(st.say);
  if (st.arrived) { arrive(); return; }
  if (st.reroute) doReroute(p);
  else if (!S.sim && !S.rerouting) $('nav-status').hidden = !st.offRoute;
  if (st.offRoute && !S.sim && !S.rerouting) { const s = $('nav-status'); s.className = 'nav-status'; s.textContent = 'Rotanın dışındasın'; delete s.dataset.act; }

  if (S.follow && S.map) {
    const z = st.distToNext < 220 ? 17.3 : p.speed > 22 ? 15.4 : p.speed > 13 ? 16.1 : 16.8;
    S.map.easeTo({ center: [pp.lon, pp.lat], bearing: hd, pitch: 55, zoom: z, duration: S.sim ? 480 : 950, easing: t => t, padding: navPadding() });
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
  S.sim?.stop();
  setTimeout(() => { if (S.nav) endNav(); }, 4000);
}

function endNav() {
  S.sim?.stop(); S.sim = null;
  S.nav = null; S.navRoute = null; S.bannerFor = null;
  document.body.classList.remove('navigating');
  for (const id of ['nav', 'nav-side', 'nav-speed', 'nav-bottom', 'nav-recenter', 'nav-street']) $(id).hidden = true;
  S.puck?.getElement().classList.remove('nav');
  keepAwake(false);
  if (voice.ok) speechSynthesis.cancel();
  store.activeNav = null; save();
  setRoutesData([]); setArrowData([]); setDest(null);
  if (S.map) {
    S.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const c = S.pos ? [S.pos.lon, S.pos.lat] : S.map.getCenter();
    S.map.easeTo({ center: c, pitch: 0, bearing: 0, zoom: 15, duration: 800 });
  }
  if (S.pos) updatePuck(S.pos);
  renderWherePill();
  S.view = 'home'; S.dest = null; S.routes = [];
  render();
  sheet.set('peek');
}

function updateMuteBtn() {
  const b = $('nav-mute');
  b.innerHTML = store.prefs.voice ? I.speaker : I.mute;
  b.classList.toggle('off', !store.prefs.voice);
}

/* ================= Ayarlar ================= */
function renderSettings() {
  const t = store.prefs.theme;
  const seg = (v, l) => `<button class="${t === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`;
  const favRow = (k, label, icon) => {
    const p = store[k];
    return `<button class="row" data-act="setFav" data-k="${k}">${placeIcon(icon)}<span class="row-main"><span class="row-title">${label}</span><span class="row-sub">${p ? esc(p.name + (p.sub ? ', ' + p.sub : '')) : 'Ayarlanmadı'}</span></span><span class="row-meta" style="color:var(--blue)">${p ? 'Değiştir' : 'Ekle'}</span></button>`;
  };
  const places = store.places.length ? store.places.map((p, i) => `<div class="row">${placeIcon(p.kind || 'star')}<span class="row-main"><span class="row-title">${esc(p.name)}</span><span class="row-sub">${esc(p.sub)}</span></span><button class="close" data-act="delPlace" data-i="${i}" aria-label="Sil">${I.trash}</button></div>`).join('')
    : '<div class="empty">Henüz kayıtlı yer yok.</div>';
  const avoids = store.avoids.length ? store.avoids.map((a, i) => `<div class="row"><span class="row-icon c-red">${I.noentry}</span><span class="row-main"><span class="row-title">${esc(a.name || 'Yol')}</span><span class="row-sub">${esc(a.sub || '')}</span></span><button class="close" data-act="delAvoid" data-i="${i}" aria-label="Sil">${I.trash}</button></div>`).join('')
    : '<div class="empty">Henüz kaçındığın yol yok.</div>';
  $('settings-body').innerHTML = `
    <div class="group-title">Görünüm</div>
    <div class="segmented">${seg('auto', 'Otomatik')}${seg('light', 'Açık')}${seg('dark', 'Koyu')}</div>

    <div class="group-title">Sesli Yönlendirme</div>
    <div class="list plain">
      <label class="row"><span class="row-main"><span class="row-title">Sesli yönlendirme</span></span><input type="checkbox" class="switch" data-pref="voice" ${store.prefs.voice ? 'checked' : ''}></label>
      <button class="row blue" data-act="testVoice"><span class="row-main"><span class="row-title">Sesi dene</span></span></button>
    </div>
    <p class="group-foot">Ses gelmezse telefonun yanındaki sessiz düğmesini kontrol et.</p>

    <div class="group-title">Rota Tercihleri</div>
    ${prefsList()}

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
    <p class="group-foot">Ev, iş, kayıtlı yerler ve tercihlerin sadece bu telefonda saklanır, hiçbir sunucuya gönderilmez. Telefon değiştirirken yedeği indirip yeni telefonda geri yükleyebilirsin.</p>

    <div class="group-title">Hakkında</div>
    <div class="list plain"><div class="row"><span class="row-main"><span class="row-title">Yolcu</span><span class="row-sub wrap">Harita © OpenStreetMap katkıcıları, OpenFreeMap. Rota: Valhalla (FOSSGIS). Arama: Photon, Nominatim.</span></span></div></div>`;
}

/* ================= Eylemler ================= */
const ACT = {
  openSearch: () => openSearch(),
  cancelSearch: () => { document.activeElement?.blur?.(); goHome(); },
  pick: el => { const p = S.results?.[+el.dataset.i]; if (p) choosePlace(p); },
  recent: el => { const p = store.recents[+el.dataset.i]; if (p) showPlace(p); },
  fav: el => {
    const k = el.dataset.k;
    if (store[k]) openRoutes({ ...store[k], name: k === 'home' ? 'Ev' : 'İş', sub: store[k].name });
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
  closeRoutes: () => { S.planAbort?.abort(); S.routes = []; setRoutesData([]); if (S.place) showPlace(S.place); else goHome(); },
  replan: () => planRoutes(),
  selRoute: (el, e) => { if (e.target.closest('.go, [data-act=preview]')) return; selectRoute(+el.dataset.i); },
  go: el => startNav(+el.dataset.i),
  preview: el => startNav(+el.dataset.i, true),
  endNav: () => endNav(),
  recenter: () => { S.follow = true; $('nav-recenter').hidden = true; if (S.pos) navTick(S.pos); },
  overview: () => {
    if (!S.navRoute) return;
    S.follow = false;
    $('nav-recenter').hidden = false; $('nav-street').hidden = true;
    const r = S.navRoute, st = S.nav;
    const c = sliceAlong(r.coords, r.cum, st.along, r.lengthM);
    const top = $('nav').getBoundingClientRect().bottom + 20;
    fitCoords(c, { padding: { top, bottom: 140 + safeB(), left: wide() ? 460 : 40, right: 70 } });
  },
  toggleVoice: () => {
    store.prefs.voice = !store.prefs.voice; save(); updateMuteBtn();
    if (!store.prefs.voice && voice.ok) speechSynthesis.cancel();
    toast(store.prefs.voice ? 'Sesli yönlendirme açık' : 'Sesli yönlendirme kapalı', 1500);
  },
  simSpeed: () => { if (!S.sim) return; const f = [1, 3, 8]; S.sim.factor = f[(f.indexOf(S.sim.factor) + 1) % f.length]; showSimStatus(); },
  locate: () => {
    if (!S.pos) { toast('Konumun bekleniyor…'); return; }
    S.map.easeTo({ center: [S.pos.lon, S.pos.lat], zoom: Math.max(S.map.getZoom(), 15.5), bearing: 0, pitch: S.map.getPitch() > 10 ? S.map.getPitch() : 0, duration: 700, padding: { top: 0, bottom: wide() ? 0 : sheet.visible() * 0.5, left: wide() ? 420 : 0, right: 0 } });
  },
  toggle3d: el => {
    const on = S.map.getPitch() < 10;
    S.map.easeTo({ pitch: on ? 58 : 0, duration: 600 });
    el.classList.toggle('on', on);
    el.textContent = on ? '2B' : '3B';
  },
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

  openSettings: () => { renderSettings(); $('settings').hidden = false; },
  closeSettings: () => { $('settings').hidden = true; },
  theme: el => { store.prefs.theme = el.dataset.v; save(); applyTheme(); renderSettings(); },
  testVoice: () => { voice.unlock(); voice.say('300 metre sonra sağa dönün ve Yeşildere Caddesi’ne girin.', true); },
  setFav: el => { $('settings').hidden = true; S.pickFor = el.dataset.k; openSearch(); },
  delPlace: el => { store.places.splice(+el.dataset.i, 1); save(); renderSettings(); if (S.view === 'home') render(); },
  delAvoid: el => { store.avoids.splice(+el.dataset.i, 1); save(); renderSettings(); toast('Kaldırıldı'); },
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
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
}, true);

document.addEventListener('change', e => {
  const k = e.target.dataset?.pref;
  if (!k) return;
  store.prefs[k] = e.target.checked;
  save();
  if (k === 'voice') updateMuteBtn();
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
function boot() {
  applyTheme();
  $('btn-locate').innerHTML = I.locLine;
  $('btn-settings').innerHTML = I.gear;
  sheet.init();
  render();
  requestAnimationFrame(() => sheet.set('peek', false));
  voice.init();
  initMap();
  startGeo();
  setInterval(() => { if (S.view === 'home' && !S.nav && sheet.detent === 'peek') { /* mesafeleri tazele */ const sc = sheet.body.scrollTop; render(); sheet.body.scrollTop = sc; } }, 60000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}
boot();

// Geliştirme ve test için
window.__yolcu = { S, store, onPos, startNav };
