// Yolcu tasarım laboratuvarı — üç tasarım yönü, gerçek harita ve kayıtlı gerçek Valhalla rotalarıyla.
// Bu sayfa ana uygulamaya dokunmaz; yalnız ../js/geo.js ve ../js/guide.js yardımcılarını okur.
import { cumulative, pointAt, bearing, sliceAlong } from '../js/geo.js';
import * as G from '../js/guide.js';
import { baseStyle, buildStyle } from './mapstyle-lab.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const START = { lon: 27.1045, lat: 38.3695 };
const DEST = { name: 'İş', sub: 'Bornova', lon: 27.221539, lat: 38.459727 };

/* ---------- Tek aileden ikonlar (24px, 2px çizgi) ---------- */
const sv = (d, w = 2) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const IC = {
  search: sv('M10.8 4.5a6.3 6.3 0 1 1 0 12.6 6.3 6.3 0 0 1 0-12.6zM15.4 15.4l4.6 4.6', 2.2),
  sliders: sv('M4 7.5h9M18 7.5h2M4 16.5h2M11 16.5h9M15.5 5v5M8.5 14v5'),
  home: sv('M4 10.6 12 4l8 6.6M6 9v11h4.5v-5.5h3V20H18V9'),
  work: sv('M8.5 7V5.5h7V7M5.5 7h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM3.5 12.5h17'),
  plus: sv('M12 5.5v13M5.5 12h13', 2.2),
  road: sv('M8.5 4 5 20M15.5 4 19 20M12 5v2.5M12 11v2.5M12 17v2.5'),
  down: sv('M7 10l5 5 5-5', 2.2), right: sv('M10 7l5 5-5 5', 2.2), back: sv('M14.5 6l-6 6 6 6', 2.2),
  check: sv('M6 12.5l4 4 8-8.5', 2.6), x: sv('M7 7l10 10M17 7 7 17', 2.2),
  layers: sv('M12 4 3.5 8.5 12 13l8.5-4.5L12 4zM3.5 12.5 12 17l8.5-4.5M3.5 16 12 20.5l8.5-4.5'),
  locate: sv('M19.5 4.5 4.5 11l6.5 2.5 2.5 6.5z'),
  cube: sv('M12 3.5 4.5 7.5v9l7.5 4 7.5-4v-9L12 3.5zM4.5 7.5 12 11.5l7.5-4M12 11.5v9'),
  speaker: sv('M4 9.5h3.2L11.5 6v12l-4.3-3.5H4zM15 9.3a4 4 0 0 1 0 5.4M17.8 6.8a7.6 7.6 0 0 1 0 10.4'),
  mute: sv('M4 9.5h3.2L11.5 6v12l-4.3-3.5H4zM15.5 9.5l5 5M20.5 9.5l-5 5'),
  bell: sv('M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5zM10 20.5h4'),
  route: sv('M6 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 18.5h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16'),
  dots: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18.5" cy="12" r="2" fill="currentColor"/></svg>',
  clock: sv('M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4zM12 7.5V12l3 2'),
  star: sv('M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3l-4.8 2.6 1-5.4-4-3.8 5.4-.7z'),
  pin: sv('M12 20.5s-6-5.7-6-10.4a6 6 0 0 1 12 0c0 4.7-6 10.4-6 10.4zM12 8a2.1 2.1 0 1 0 0 4.2A2.1 2.1 0 0 0 12 8z'),
  ban: sv('M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4zM6.2 6.2l11.6 11.6'),
  fuel: sv('M5 20V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14M4 20h11M5 10h9M14 8.5l3 2.5v6.5a1.5 1.5 0 0 0 3 0V9l-2.5-2.5'),
  flag: sv('M6 20.5V4.5M6 5h10l-2 3.5 2 3.5H6'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  share: sv('M12 3.5v11M8 7l4-3.5L16 7M6 11v7.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V11'),
  hill: sv('M3 18.5 9 9l4 6 2.5-3.5 5.5 7z'),
  turns: sv('M6 20v-6a4 4 0 0 1 4-4h8M15 6.5l3.5 3.5-3.5 3.5'),
  overview: sv('M5 5h4M5 5v4M19 5h-4M19 5v4M5 19h4M5 19v-4M19 19h-4M19 19v-4')
};

/* ---------- Yönler ---------- */
export const DIRS = {
  a: { name: 'Kıyı', tag: 'Referansa sadık · sakin, sıcak, tanıdık',
    idea: 'Gönderdiğin görselin en yakın hali. Haritaya yaslanmış tek alt panel, net kart hiyerarşisi, bakır vurgu. Yeni bir şey öğrenmeden “daha rafine Yolcu”.',
    plus: ['Görsele en yakın, risk en düşük', 'Mevcut akışlarla birebir eşleşir', 'Gece/gündüz geçişi doğal'],
    minus: ['En az “şaşırtan” yön', 'Panel ekranın yarısını alabiliyor'] },
  b: { name: 'Ada', tag: 'Haritaya alan açan, yüzen cam yüzeyler',
    idea: 'Harita kenardan kenara; panel kenarlardan kopuk yüzen bir “ada”. Rota seçimi kaydırmalı kartlarla, sürüşte üst bilgi tek bir ada içinde. iPhone’un yeni cam diline yakın ama kendi rengiyle.',
    plus: ['Harita en geniş alan', 'Sürüşte en az ekran kalabalığı', 'Kart kaydırma ile rota karşılaştırma tek elle'],
    minus: ['Cam efekti eski iPhone’larda daha pahalı', 'Güneşte cam yüzey kontrastı dikkat ister'] },
  c: { name: 'Pano', tag: 'Sürüş odaklı · tabela dili, büyük rakamlar',
    idea: 'Yolcu’nun asıl vaadi olan “hangi yoldan gidiyorum” sorusunu öne çıkarır: yol karakteri şeridi, yol levhaları, büyük rakamlar. Gece varsayılan, bakışla okunur.',
    plus: ['Rota farkını en iyi anlatan yön', 'Sürüşte en okunur rakamlar', 'Tek dokunuşla “İşe çık”'],
    minus: ['Daha çok bilgi, daha az sadelik', 'Görselden en uzak yön'] }
};

/* ---------- Veri ---------- */
const SPEED = { motorway: 24, motorway_link: 15, trunk: 20, primary: 13.5, secondary: 12, tertiary: 10, unclassified: 8, residential: 7, service_other: 5, service: 5 };
const MAIN = new Set(['motorway', 'trunk', 'primary']);
let ROUTES = [];
async function loadRoutes() {
  const data = await fetch('routes.json').then(r => r.json());
  ROUTES = data.map((r, i) => {
    const cum = cumulative(r.coords);
    const cls = new Array(r.coords.length).fill('residential'), names = new Array(r.coords.length).fill('');
    for (const [b, e, c, n] of r.edges) for (let k = b; k <= Math.min(e, r.coords.length - 1); k++) { cls[k] = c; names[k] = n; }
    const s = r.stats, mainShare = (s.motorway + s.main) / s.total;
    return { ...r, i, cum, cls, names, mainShare };
  });
}
// Konfor puanı: yokuş, ara sokak, dönüş ve ana yol dışı pay. Düşük = rahat.
const comfort = r => r.stats.steep * 1.2 + r.stats.small * .5 + r.turns * 30 + (1 - r.mainShare) * 900;
function choose(budgetMin) {
  const fastest = ROUTES.reduce((a, b) => (b.time < a.time ? b : a));
  const ok = ROUTES.filter(r => r.time - fastest.time <= budgetMin * 60);
  const best = ok.reduce((a, b) => (comfort(b) < comfort(a) - 60 ? b : a), fastest);
  return { fastest, best };
}
// Gerekçeler yalnız en hızlıyla gerçek karşılaştırmadan üretilir.
function reasons(r, fastest) {
  const out = [];
  if (r === fastest) { out.push({ t: 'En hızlı rota', i: 'clock' }); }
  const dShare = Math.round((r.mainShare - fastest.mainShare) * 100);
  if (r !== fastest && dShare >= 5) out.push({ t: `%${Math.round(r.mainShare * 100)} ana yol`, i: 'road' });
  else if (r.mainShare >= .9) out.push({ t: `%${Math.round(r.mainShare * 100)} ana yol`, i: 'road', neutral: r !== fastest });
  if (r !== fastest && fastest.turns - r.turns >= 2) out.push({ t: `${fastest.turns - r.turns} dönüş daha az`, i: 'turns' });
  if (r !== fastest && fastest.stats.steep - r.stats.steep >= 100) out.push({ t: 'Daha az dik yokuş', i: 'hill' });
  if (r !== fastest && fastest.stats.small - r.stats.small >= 200) out.push({ t: 'Daha az ara sokak', i: 'road' });
  return out;
}
const fmtMin = s => Math.max(1, Math.round(s / 60));
const clock = sec => G.fmtClock(new Date(Date.now() + sec * 1000));
const km = m => G.fmtDist(m);

/* ---------- Durum ---------- */
const q = new URLSearchParams(location.search);
const S = {
  dir: DIRS[q.get('d')] ? q.get('d') : 'a', screen: ['home', 'routes', 'drive', 'trip'].includes(q.get('s')) ? q.get('s') : 'home',
  theme: q.get('t') === 'dark' ? 'dark' : q.get('t') === 'light' ? 'light' : null,
  sat: false, flat: false, budget: 5, sel: 0, detent: q.get('detent') || null, follow: true, sound: 'silent', pop: null,
  sim: null, factor: Number(q.get('x')) || 2, avoided: new Set(), pref: 'main', hills: true, rough: true
};
const theme = () => S.theme || (S.screen === 'drive' ? 'dark' : 'light');
let map, styleKey = '', puck, car, callouts = [];
const phone = $('#phone');

/* ---------- Harita ---------- */
async function applyStyle(force) {
  const mode = S.screen === 'drive' ? 'drive' : S.screen;
  const key = [S.dir, theme(), S.sat, mode, S.flat].join();
  if (!force && key === styleKey) return;
  styleKey = key;
  const style = buildStyle(await baseStyle(), { dir: S.dir, theme: theme(), sat: S.sat, mode, flat: S.flat });
  map.setStyle(style, { diff: false });
  map.once('style.load', overlays);
}
function routeFC(selOnly) {
  return { type: 'FeatureCollection', features: ROUTES.filter(r => !selOnly || r.i === S.sel).map(r => ({ type: 'Feature', properties: { i: r.i, sel: r.i === S.sel ? 1 : 0 }, geometry: { type: 'LineString', coordinates: r.coords } })) };
}
const css = n => getComputedStyle(phone).getPropertyValue(n).trim();
function overlays() {
  if (!map.getSource('routes')) map.addSource('routes', { type: 'geojson', data: routeFC(), lineMetrics: true });
  const accent = css('--route'), accentC = css('--route-case'), alt = css('--alt'), altC = css('--alt-case'), done = css('--route-done');
  const before = map.getLayer('highway-name-minor') ? 'highway-name-minor' : undefined;
  const lw = (a, b, c) => ['interpolate', ['exponential', 1.4], ['zoom'], 10, a, 14, b, 18, c];
  map.addLayer({ id: 'alt-case', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], 0], layout: { 'line-cap': 'round', 'line-join': 'round', visibility: S.screen === 'routes' ? 'visible' : 'none' }, paint: { 'line-color': altC, 'line-width': lw(6, 10, 26) } }, before);
  map.addLayer({ id: 'alt', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], 0], layout: { 'line-cap': 'round', 'line-join': 'round', visibility: S.screen === 'routes' ? 'visible' : 'none' }, paint: { 'line-color': alt, 'line-width': lw(4, 7, 20) } }, before);
  map.addLayer({ id: 'sel-case', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round', 'line-join': 'round', visibility: ['routes', 'drive', 'trip'].includes(S.screen) ? 'visible' : 'none' }, paint: { 'line-color': accentC, 'line-width': lw(7, 11.5, 30) } }, before);
  map.addLayer({ id: 'sel', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round', 'line-join': 'round', visibility: ['routes', 'drive', 'trip'].includes(S.screen) ? 'visible' : 'none' }, paint: { 'line-color': accent, 'line-width': lw(4.5, 8, 22) } }, before);
  map.setPaintProperty('sel', 'line-gradient', progressGradient(S.sim ? S.sim.along / ROUTES[S.sel].lengthM : 0, accent, done));
  map.setPaintProperty('sel-case', 'line-gradient', progressGradient(S.sim ? S.sim.along / ROUTES[S.sel].lengthM : 0, accentC, 'rgba(0,0,0,0)'));
  if (!map._labAltClick) { map._labAltClick = true; map.on('click', e => { if (S.screen !== 'routes' || !map.getLayer('alt')) return; const f = map.queryRenderedFeatures([[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]], { layers: ['alt'] })[0]; if (f) selectRoute(+f.properties.i); }); }
  if (S.screen === 'trip') {
    map.addSource('avoid', { type: 'geojson', data: avoidFC() });
    map.addLayer({ id: 'avoid', type: 'line', source: 'avoid', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#1C1C1E', 'line-width': lw(4, 8, 22), 'line-dasharray': [1, 1.2] } }, before);
  }
}
function progressGradient(f, a, done) {
  f = clamp(f, 0, .9999);
  return f <= 0.0001 ? ['step', ['line-progress'], a, 1, a] : ['step', ['line-progress'], done, f, a];
}
function setRoutes() { map?.getSource('routes')?.setData(routeFC()); }

/* ---------- Konum işareti ve araç ---------- */
const CAR_SVG = `<svg viewBox="0 0 60 104" width="34" height="59" aria-hidden="true">
 <defs><linearGradient id="cb" x1="0" x2="1"><stop offset="0" stop-color="#D9D6D0"/><stop offset=".22" stop-color="#FBFAF8"/><stop offset=".78" stop-color="#FBFAF8"/><stop offset="1" stop-color="#D9D6D0"/></linearGradient></defs>
 <rect x="8" y="5" width="44" height="94" rx="17" fill="url(#cb)" stroke="#25262A" stroke-opacity=".35"/>
 <ellipse cx="6.5" cy="38" rx="3.2" ry="4.4" fill="#E9E6E0" stroke="#25262A" stroke-opacity=".3"/><ellipse cx="53.5" cy="38" rx="3.2" ry="4.4" fill="#E9E6E0" stroke="#25262A" stroke-opacity=".3"/>
 <path d="M13.5 35.5Q30 27 46.5 35.5L43.5 49Q30 45.5 16.5 49Z" fill="#2A2E34"/>
 <rect x="16" y="50" width="28" height="27" rx="6" fill="#F1EFEA"/>
 <path d="M17 80Q30 83.5 43 80L44.5 89.5Q30 94 15.5 89.5Z" fill="#2A2E34"/>
 <rect x="13" y="7" width="9" height="4" rx="2" fill="#FFF3CF"/><rect x="38" y="7" width="9" height="4" rx="2" fill="#FFF3CF"/>
 <rect x="12" y="94" width="10" height="3.5" rx="1.7" fill="#C95D36"/><rect x="38" y="94" width="10" height="3.5" rx="1.7" fill="#C95D36"/>
</svg>`;
function ensurePuck() {
  if (!puck) {
    const el = document.createElement('div'); el.className = 'puck'; el.innerHTML = '<i class="cone"></i><i class="dot"></i>';
    puck = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([START.lon, START.lat]).setRotation(28).addTo(map);
  }
  puck.getElement().hidden = S.screen === 'drive';
}
function ensureCar() {
  if (!car) {
    const el = document.createElement('div'); el.className = 'car'; el.innerHTML = CAR_SVG;
    car = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([START.lon, START.lat]).addTo(map);
  }
  car.getElement().hidden = S.screen !== 'drive';
}

/* ---------- Alt panel (3 durak, hızla fırlatma) ---------- */
const sheet = {
  el: $('#sheet'), body: $('#sheet-body'), y: 0, det: 'half',
  H() { return phone.clientHeight; },
  top() { return parseFloat(css('--safe-top')) + 10; },
  stops() {
    const b = this.body, end = sel => { const n = b.querySelector(sel); return n ? n.offsetTop + n.offsetHeight + 14 + 22 : null; };
    const safe = parseFloat(css('--safe-bottom'));
    const peek = end('[data-peek]') ?? 220, half = end('[data-half]') ?? this.H() * .5;
    return { peek: Math.min(peek + safe, this.H() * .45), half: Math.min(Math.max(half + safe, peek + safe + 60), this.H() * (S.screen === 'home' ? .56 : .62)), full: this.H() - this.top() };
  },
  set(d, anim = true) {
    const st = this.stops(); this.det = d in st ? d : 'half';
    this.el.classList.toggle('anim', anim);
    this.y = this.H() - st[this.det];
    this.apply();
    phone.dataset.detent = this.det;
    this.body.style.overflowY = this.det === 'full' ? 'auto' : 'hidden';
    if (this.det !== 'full') this.body.scrollTop = 0;
    sheetChanged();
  },
  apply() { this.el.style.transform = `translate3d(0,${Math.max(this.top(), this.y)}px,0)`; },
  visible() { return this.H() - this.y; },
  bind() {
    let start = null, moved = false, samples = [];
    this.el.addEventListener('pointerdown', e => {
      if (e.button) return;
      if (this.det === 'full' && this.body.scrollTop > 0 && this.body.contains(e.target)) return;
      start = { y: e.clientY, sheetY: this.y, id: e.pointerId }; moved = false; samples = [[e.timeStamp, e.clientY]];
    });
    addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y;
      if (!moved) { if (Math.abs(dy) < 7) return; if (this.det === 'full' && dy < 0 && this.body.contains(e.target)) { start = null; return; } moved = true; this.el.classList.remove('anim'); this.el.setPointerCapture?.(e.pointerId); }
      const st = this.stops(), minY = this.H() - st.full, maxY = this.H() - st.peek;
      let y = start.sheetY + dy;
      if (y < minY) y = minY - Math.sqrt(minY - y) * 2; // lastik etkisi
      if (y > maxY) y = maxY + Math.sqrt(y - maxY) * 3;
      this.y = y; this.apply(); samples.push([e.timeStamp, e.clientY]); if (samples.length > 6) samples.shift();
    });
    const end = e => {
      if (!start || e.pointerId !== start.id) return; const was = moved; start = null;
      if (!was) return;
      this.el.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
      const [t0, y0] = samples[0], [t1, y1] = samples.at(-1), v = (y1 - y0) / Math.max(16, t1 - t0); // px/ms
      const st = this.stops(), projected = this.y + v * 180;
      const order = ['full', 'half', 'peek'];
      let best = order.reduce((a, d) => (Math.abs(this.H() - st[d] - projected) < Math.abs(this.H() - st[a] - projected) ? d : a), 'half');
      if (Math.abs(v) > .55) { const i = order.indexOf(this.det); best = order[clamp(i + (v > 0 ? 1 : -1), 0, 2)]; }
      this.set(best);
    };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
  }
};
function sheetChanged() {
  if (!map) return;
  const bottom = S.screen === 'drive' ? 0 : Math.min(sheet.visible(), sheet.H() * .62);
  if (S.screen === 'routes') fitRoutes(bottom);
  else if (S.screen === 'trip') fitRoutes(bottom, true);
  else if (S.screen === 'home') map.easeTo({ padding: { top: 0, bottom: bottom - 20, left: 0, right: 0 }, duration: 380 });
}

/* ---------- Ekranlar ---------- */
function favs() {
  const { best } = choose(S.budget);
  const fav = (icon, label, extra) => `<button class="fav" data-act="fav" data-k="${label}">${IC[icon]}<b>${label}</b>${extra ? `<em>${extra}</em>` : ''}</button>`;
  return `${fav('home', 'Ev', '')}${fav('work', 'İş', fmtMin(best.time) + ' dk')}<button class="fav add" data-act="toast" data-msg="Yer ekleme: haritada basılı tut veya ara" aria-label="Yer ekle">${IC.plus}</button>`;
}
const TRIPS = [
  { icon: 'work', t: 'İş', s: 'Bornova', m: 'Dün · 31 dk · 30,8 km' },
  { icon: 'pin', t: 'Eski Bahçe', s: 'Buca', m: 'Cuma · 14 dk · 6,2 km' },
  { icon: 'home', t: 'Ev', s: 'Karabağlar', m: 'Çarşamba · 33 dk · 29,7 km' }
];
const prefLabel = () => ({ main: 'Ana yol odaklı', fast: 'En hızlı', balanced: 'Dengeli' }[S.pref]);
function viewHome() {
  const trips = TRIPS.slice(0, 3).map((t, i) => `<button class="row" data-act="trip" data-i="${i}"><span class="row-ic">${IC[t.icon]}</span><span class="row-main"><b>${esc(t.t)} <span class="dim">· ${esc(t.s)}</span></b><small>${esc(t.m)}</small></span><span class="chev">${IC.right}</span></button>`).join('');
  const { best } = choose(S.budget);
  const next = S.dir === 'c' ? `<button class="next-card" data-act="goWork"><span class="next-ic">${IC.work}</span><span class="next-main"><small>Sıradaki · hafta içi 08:10 alışkanlığı</small><b>İş’e ${fmtMin(best.time)} dk</b><span>${esc(best.via.split(' · ')[0])} üzerinden · ${clock(best.time)} varış</span></span><span class="go">${IC.play}</span></button>` : '';
  return `<div class="home-top" data-peek>
      <div class="search-row"><button class="searchbar" data-act="search">${IC.search}<span>Nereye?</span></button><button class="icon-btn" data-act="toast" data-msg="Ayarlar" aria-label="Ayarlar">${IC.sliders}</button></div>
      <div class="favs">${favs()}</div>
    </div>
    <div data-half class="home-half">
      ${next}
      <button class="pref-chip" data-act="pop" data-pop="pref">${IC.road}<span>${prefLabel()}</span><i>+${S.budget} dk’ya kadar</i>${IC.down}</button>
      <div class="sec-head"><h3>Son yolculuklar</h3><button class="link" data-act="toast" data-msg="Tüm yolculuklar">Tümü</button></div>
      <div class="list">${trips}</div>
    </div>
    <div class="sec-head"><h3>Yakında</h3></div>
    <div class="cats">${[['fuel', 'Yakıt'], ['pin', 'Eczane'], ['star', 'Market'], ['road', 'Otopark']].map(([i, t]) => `<button class="cat" data-act="toast" data-msg="${t} — rota üstü arama">${IC[i]}<span>${t}</span></button>`).join('')}</div>
    <div class="sec-head"><h3>Kişisel</h3></div>
    <div class="list"><button class="row" data-act="toast" data-msg="Favori güzergâhlar"><span class="row-ic">${IC.star}</span><span class="row-main"><b>Favori güzergâhlar</b><small>2 kayıt</small></span><span class="chev">${IC.right}</span></button>
    <button class="row" data-act="toast" data-msg="Kaçındığım yollar"><span class="row-ic">${IC.ban}</span><span class="row-main"><b>Kaçındığım yollar</b><small>${S.avoided.size || 3} kesim · kalıcı</small></span><span class="chev">${IC.right}</span></button></div>
    <p class="legal">© OpenStreetMap · OpenFreeMap · Valhalla · Tasarım önizlemesi: son yolculuklar örnek veridir</p>`;
}
function strip(r) {
  let html = '', L = r.lengthM;
  for (let k = 0; k < r.coords.length - 1; k++) {
    const c = r.cls[k], cls = c === 'motorway' || c === 'trunk' ? 'mw' : c === 'primary' ? 'pri' : c === 'secondary' || c === 'tertiary' ? 'sec' : 'loc';
    const a = r.cum[k] / L * 100, w = (r.cum[k + 1] - r.cum[k]) / L * 100;
    if (html.endsWith(`|${cls}`)) { html = html.replace(/(\d+\.\d+)\|(\w+)$/, (m, prev, c2) => `${(+prev + w).toFixed(3)}|${c2}`); continue; }
    html += `#${a.toFixed(3)}:${w.toFixed(3)}|${cls}`;
  }
  return `<div class="strip">${html.split('#').filter(Boolean).map(s => { const [aw, c] = s.split('|'); const [a, w] = aw.split(':'); return `<i class="${c}" style="left:${a}%;width:${Math.max(.6, +w)}%"></i>`; }).join('')}</div>`;
}
function shield(ref) { if (!ref) return ''; const k = /^O|^E/.test(ref) ? 'o' : 'd'; return `<span class="shield ${k}">${esc(ref.split(';')[0])}</span>`; }
function storyLine(r) {
  return `<div class="story">${r.story.filter(s => s.kind === 'road' && s.m > 400).slice(0, 4).map(s => `<span>${shield(s.ref)}${esc(s.ref && s.name.length > 18 ? '' : s.name)}</span>`).join('<i>›</i>')}</div>`;
}
function routeCard(r, ctx) {
  const { fastest, best } = ctx, sel = r.i === S.sel;
  const label = r === best && r !== fastest ? 'Rahat rota' : r === fastest ? 'En hızlı' : 'Alternatif';
  const extra = r.time - fastest.time, extraKm = (r.lengthM - fastest.lengthM) / 1000;
  const rs = reasons(r, fastest);
  const diff = r === fastest ? '' : `En hızlı rotadan ${extra < 60 ? '1 dk’dan az' : fmtMin(extra) + ' dk'} daha uzun${extraKm >= 1 ? ` · +${Math.round(extraKm)} km` : ''}`;
  const pills = rs.map(x => `<span class="pill ${x.neutral ? 'neutral' : ''}">${IC[x.i]}${esc(x.t)}</span>`).join('');
  if (!sel && S.dir !== 'b') return `<button class="route-card mini" data-act="selRoute" data-i="${r.i}" aria-pressed="false"><span class="mini-l"><span class="rc-label">${label}</span><span class="mini-t"><b>${fmtMin(r.time)} dk</b> · ${km(r.lengthM)}${S.dir === 'c' ? ` · ${esc(r.via.split(' · ')[0])}` : ''}</span></span>${S.dir === 'c' ? strip(r) : ''}<span class="radio"></span></button>`;
  return `<button class="route-card ${sel ? 'sel' : ''}" data-act="selRoute" data-i="${r.i}" aria-pressed="${sel}">
    <span class="rc-top"><span class="rc-label">${label}</span><span class="radio">${sel ? IC.check : ''}</span></span>
    <span class="rc-time"><b>${fmtMin(r.time)}</b> dk</span>
    <span class="rc-sub">${km(r.lengthM)} · ${clock(r.time)} varış</span>
    ${S.dir === 'c' || sel ? strip(r) : ''}
    ${S.dir === 'c' ? storyLine(r) : ''}
    ${sel || S.dir === 'b' ? `<span class="pills">${pills}</span>` : ''}
    ${diff && (sel || S.dir === 'b') ? `<span class="rc-diff">${diff}</span>` : ''}
  </button>`;
}
function viewRoutes() {
  const ctx = choose(S.budget);
  const order = [ctx.best, ...ROUTES.filter(r => r !== ctx.best)];
  const cards = order.map(r => routeCard(r, ctx)).join('');
  return `<div class="routes-head" data-peek><button class="circle" data-act="go" data-s="home" aria-label="Geri">${IC.back}</button><div><h2>İşe</h2><small>Bornova · ${ROUTES.length} güzergâh karşılaştırıldı</small></div><button class="circle" data-act="pop" data-pop="pref" aria-label="Rota tercihleri">${IC.sliders}</button></div>
    <div class="cards ${S.dir === 'b' ? 'carousel' : ''}">${cards}</div>
    <button class="primary start" data-act="go" data-s="drive" data-half>Başlat</button>
    <div class="budget"><span>${IC.clock}<b>Rahat rota için en fazla</b></span><span class="stepper"><button data-act="budget" data-d="-1" aria-label="Azalt">−</button><output>+${S.budget} dk</output><button data-act="budget" data-d="1" aria-label="Arttır">+</button></span></div>
    <div class="legend"><span><i class="mw"></i>Otoyol</span><span><i class="pri"></i>Ana cadde</span><span><i class="sec"></i>Bağlantı</span><span><i class="loc"></i>Ara sokak</span></div>
    <p class="note">Süreler ve yol sınıfları 14 Kasım’da Valhalla’dan kaydedilmiş gerçek İzmir rotalarıdır; canlı trafik içermez. Gerekçeler en hızlı rotayla karşılaştırılarak üretilir — doğrulanamayan özellik olumlu etiket olarak gösterilmez.</p>`;
}
function viewTrip() {
  const r = ROUTES[S.sel];
  const roads = r.story.map((s, k) => s.kind === 'road' ? `<div class="seg ${S.avoided.has(k) ? 'avoided' : ''}"><span class="seg-dot"></span><span class="seg-main"><b>${shield(s.ref)}${esc(s.name)}</b><small>${km(s.m)}${S.avoided.has(k) ? ' · bir daha geçirilmeyecek' : ''}</small></span><button class="seg-act" data-act="avoid" data-k="${k}" aria-label="Bu kesimden geçirme">${S.avoided.has(k) ? IC.x : IC.ban}</button></div>` : `<div class="seg local"><span class="seg-dot"></span><span class="seg-main"><small>Ara sokaklar · ${km(s.m)}</small></span></div>`).join('');
  return `<div class="routes-head" data-peek><button class="circle" data-act="go" data-s="home" aria-label="Geri">${IC.back}</button><div><h2>İş <span class="dim">· Bornova</span></h2><small>Dün 08:12 – 08:48 · Karabağlar’dan</small></div><button class="circle" data-act="toast" data-msg="Paylaş" aria-label="Paylaş">${IC.share}</button></div>
    <div class="trip-stats" data-half><div><b>${fmtMin(r.time)}</b><small>dk</small></div><div><b>${(r.lengthM / 1000).toFixed(1).replace('.', ',')}</b><small>km</small></div><div><b>${Math.round(r.lengthM / r.time * 3.6)}</b><small>ort. km/sa</small></div></div>
    <div class="trip-acts"><button class="primary" data-act="go" data-s="routes">${IC.play}Bu güzergâhla başlat</button><button class="secondary" data-act="toast" data-msg="Favori güzergâhlara eklendi">${IC.star}Favori</button></div>
    <div class="sec-head"><h3>Güzergâh</h3><small class="dim">Bir kesimi işaretle → bir daha geçirmez</small></div>
    <div class="segs">${roads}</div>
    <p class="note">Örnek yolculuk kaydı (tarih örnek); güzergâh gerçek kayıtlı rotadır. İşaretlenen kesimler cihazda saklanır ve silinebilir.</p>`;
}
function avoidFC() {
  const r = ROUTES[S.sel]; let at = 0; const f = [];
  r.story.forEach((s, k) => { if (S.avoided.has(k)) f.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: sliceAlong(r.coords, r.cum, at, at + s.m) } }); at += s.m; });
  return { type: 'FeatureCollection', features: f };
}

/* ---------- Sürüş ---------- */
function driveHTML() {
  const sm = { silent: ['mute', 'Sessiz'], alerts: ['bell', 'Uyarılar'], guidance: ['speaker', 'Sesli'] }[S.sound];
  return `<div class="banner" id="banner"><div class="bn-main"><span class="bn-arrow" id="bn-arrow"></span><span class="bn-text"><b id="bn-dist"></b><span id="bn-act"></span><small id="bn-road"></small></span></div><div class="bn-then" id="bn-then"></div></div>
  <div class="d-ctl"><button class="round" data-act="pop" data-pop="sound" aria-label="Ses: ${sm[1]}">${IC[sm[0]]}</button><button class="round" data-act="overview" aria-label="Tüm rota">${IC.overview}</button></div>
  <button class="recenter" id="recenter" data-act="recenter" hidden>${IC.locate}Ortala</button>
  <div class="speed" id="speed"><b>0</b><small>km/sa</small></div>
  <div class="street" id="street"></div>
  <div class="dash" id="dash"><div class="dash-time"><b id="d-rem">--</b><span>dk</span></div><div class="dash-sub"><span id="d-eta">--:--</span> varış · <span id="d-km">--</span></div>
   <div class="dash-c"><div><small>Varış</small><b id="c-eta">--:--</b></div><div><small>Kalan</small><b id="c-rem">--</b></div><div><small>Mesafe</small><b id="c-km">--</b></div></div>
   <button class="dash-btn" data-act="overview">${IC.route}<small>Tüm rota</small></button><button class="dash-more" data-act="pop" data-pop="more" aria-label="Sürüş seçenekleri">${IC.dots}</button></div>`;
}
function startSim() {
  stopSim();
  const r = ROUTES[S.sel];
  S.sim = { along: 0, v: 0, heading: bearing(...r.coords[0], ...r.coords[3]), camBearing: null, camZoom: 17, last: performance.now(), stopUntil: 0, stopped: new Set(), lastGrad: 0, lastUI: 0, raf: 0, arrived: false };
  S.follow = true;
  const tick = now => {
    const sim = S.sim; if (!sim) return;
    const dt = Math.min(.1, (now - sim.last) / 1000) * S.factor; sim.last = now;
    // Hız profili: yol sınıfına göre hedef hız, dönüş öncesi yavaşlama, bir ışıkta duruş
    const k = idxAt(r, sim.along), target0 = SPEED[r.cls[k]] || 8;
    const nm = r.maneuvers.find(m => m.along > sim.along + 1 && m.type !== 4 && m.type !== 5 && m.type !== 6);
    let target = target0;
    if (nm && [9, 10, 11, 14, 15, 16, 26].includes(nm.type)) target = Math.min(target, 5 + Math.max(0, nm.along - sim.along - 15) * .12);
    if (!sim.stopped.has(1) && sim.along > 250 && sim.along < 262) { sim.stopped.add(1); sim.stopUntil = now + 2600 / S.factor * 2; }
    if (now < sim.stopUntil) target = 0;
    sim.v += clamp(target - sim.v, -4 * dt, 2.2 * dt) * (target < sim.v ? 1.6 : 1);
    sim.v = Math.max(0, sim.v);
    sim.along = Math.min(r.lengthM, sim.along + sim.v * dt);
    const p = pointAt(r.coords, r.cum, sim.along);
    // Yön: duruşta sabit; hareketteyse yolun 6 m gerisi ile 14 m ilerisi
    if (sim.v > .8) { const a = pointAt(r.coords, r.cum, Math.max(0, sim.along - 6)), b = pointAt(r.coords, r.cum, Math.min(r.lengthM, sim.along + 14)); sim.heading = turn(sim.heading, bearing(a.lon, a.lat, b.lon, b.lat), 1 - Math.exp(-dt / S.factor * 9)); }
    car.setLngLat([p.lon, p.lat]).setRotation(sim.heading);
    // Kamera: aracın önünü gösterir, yönü yumuşak izler, hızla uzaklaşır
    const la = pointAt(r.coords, r.cum, Math.min(r.lengthM, sim.along + 45)), ahead = bearing(p.lon, p.lat, la.lon, la.lat);
    sim.camBearing = sim.camBearing == null ? ahead : (sim.v > .8 ? turn(sim.camBearing, ahead, 1 - Math.exp(-dt / S.factor * 2.2)) : sim.camBearing);
    const zTarget = 17.6 - clamp((sim.v - 7) / 17, 0, 1) * 1.5;
    sim.camZoom += (zTarget - sim.camZoom) * (1 - Math.exp(-dt / S.factor * 1.2));
    if (S.follow) map.jumpTo({ center: [p.lon, p.lat], bearing: sim.camBearing, zoom: sim.camZoom, pitch: { a: 58, b: 54, c: 62 }[S.dir], padding: drivePadding() });
    if (now - sim.lastGrad > 90) { sim.lastGrad = now; const f = sim.along / r.lengthM; map.setPaintProperty('sel', 'line-gradient', progressGradient(f, css('--route'), css('--route-done'))); map.setPaintProperty('sel-case', 'line-gradient', progressGradient(f, css('--route-case'), 'rgba(0,0,0,0)')); }
    if (now - sim.lastUI > 220) { sim.lastUI = now; driveUI(r, sim, k); }
    if (sim.along >= r.lengthM - 1) { arrive(); return; }
    sim.raf = requestAnimationFrame(tick);
  };
  S.sim.raf = requestAnimationFrame(tick);
}
const turn = (from, to, f) => (from + (((to - from + 540) % 360) - 180) * f + 360) % 360;
function idxAt(r, along) { let lo = 0, hi = r.cum.length - 1; while (lo < hi - 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= along) lo = m; else hi = m; } return lo; }
function stopSim() { if (S.sim) cancelAnimationFrame(S.sim.raf); S.sim = null; }
function drivePadding() {
  const H = phone.clientHeight, B = ($('#dash')?.offsetHeight || 120) + parseFloat(css('--safe-bottom')) + 16;
  return { top: Math.round(.42 * H + B), bottom: B, left: 0, right: 0 };
}
function driveUI(r, sim, k) {
  const ms = r.maneuvers, i = ms.findIndex(m => m.along > sim.along + 3);
  const m = ms[i] || ms.at(-1), n = ms[i + 1];
  const d = Math.max(0, m.along - sim.along);
  $('#bn-arrow').innerHTML = G.arrowSvg(m);
  $('#bn-dist').textContent = G.fmtDist(d);
  $('#bn-act').textContent = G.action(m);
  const road = m.street || ms[i + 1]?.street || '';
  const ref = r.story.find(s => s.name === m.street)?.ref;
  $('#bn-road').innerHTML = (S.dir === 'c' && ref ? shield(ref) : '') + esc(road || (m.toward?.length ? m.toward.join(', ') + ' yönü' : ''));
  const then = n && n.along - m.along < 1200 ? n : null;
  $('#bn-then').hidden = !then;
  if (then) $('#bn-then').innerHTML = `<span class="bt-arrow">${G.arrowSvg(then)}</span><span>Sonra ${G.action(then).toLocaleLowerCase('tr').replace(/ dönün$/, '').replace(/ın$|in$/, '')}${then.street ? ' · ' + esc(then.street) : ''}</span><small>${G.fmtDist(then.along - m.along)}</small>`;
  const remM = r.lengthM - sim.along, remS = r.time * remM / r.lengthM;
  $('#d-rem').textContent = fmtMin(remS); $('#c-rem').textContent = fmtMin(remS) + ' dk';
  $('#d-eta').textContent = clock(remS); $('#c-eta').textContent = clock(remS);
  $('#d-km').textContent = km(remM); $('#c-km').textContent = km(remM);
  $('#speed b').textContent = Math.round(sim.v * 3.6 / S.factor);
  const cur = r.names[k] || '';
  $('#street').textContent = cur; $('#street').hidden = !cur;
}
function arrive() {
  stopSim();
  toast('Vardın · yolculuk geçmişe kaydedildi');
  setTimeout(() => go('trip'), 1200);
}
function overview() {
  S.follow = false; $('#recenter').hidden = false;
  const r = ROUTES[S.sel], b = new maplibregl.LngLatBounds(); r.coords.forEach(c => b.extend(c));
  map.fitBounds(b, { padding: { top: ($('#banner')?.offsetHeight || 140) + 70, bottom: ($('#dash')?.offsetHeight || 120) + 60, left: 40, right: 40 }, pitch: 0, bearing: 0, duration: 700 });
}

/* ---------- Açılır menüler ---------- */
function popHTML(kind) {
  if (kind === 'pref') return `<h4>Rota tercihi</h4>${[['main', 'Ana yol odaklı', 'Ara sokaklara küçük kazanç için sapmaz'], ['balanced', 'Dengeli', 'Konfor ve süre eşit ağırlıkta'], ['fast', 'En hızlı', 'Süre her şeyden önce']].map(([k, t, s]) => `<button class="opt ${S.pref === k ? 'on' : ''}" data-act="pref" data-v="${k}"><span><b>${t}</b><small>${s}</small></span>${S.pref === k ? IC.check : ''}</button>`).join('')}
    <div class="opt static"><span><b>Rahat rota için ek süre</b><small>Bundan uzun rahat rotalar önerilmez</small></span><span class="stepper"><button data-act="budget" data-d="-1">−</button><output>+${S.budget} dk</output><button data-act="budget" data-d="1">+</button></span></div>
    <button class="opt" data-act="tog" data-k="hills"><span><b>Dik yokuşlardan kaçın</b><small>Gerçek eğim verisiyle alternatifler arasında</small></span><i class="sw ${S.hills ? 'on' : ''}"></i></button>
    <button class="opt" data-act="tog" data-k="rough"><span><b>Toprak / bozuk yoldan kaçın</b><small>Yalnız OSM yüzey kaydı olan yollar</small></span><i class="sw ${S.rough ? 'on' : ''}"></i></button>`;
  if (kind === 'sound') return `<h4>Ses</h4>${[['silent', 'mute', 'Tamamen sessiz', 'Hiçbir ses oturumu açılmaz · müziğe dokunmaz'], ['alerts', 'bell', 'Yalnız uyarılar', 'Radar ve kaza için kısa ton'], ['guidance', 'speaker', 'Yönlendirme + uyarılar', 'Anons sırasında müzik kısa süre kısılır']].map(([k, i, t, s]) => `<button class="opt ${S.sound === k ? 'on' : ''}" data-act="sound" data-v="${k}">${IC[i]}<span><b>${t}</b><small>${s}</small></span>${S.sound === k ? IC.check : ''}</button>`).join('')}`;
  if (kind === 'more') return `<h4>Sürüş</h4><button class="opt" data-act="toast" data-msg="Rota üstü yakıt aranıyor">${IC.fuel}<span><b>Yol üstü</b><small>Yakıt, eczane, market — ek süreyle</small></span></button><button class="opt" data-act="toast" data-msg="Sonraki kesim dışlandı · yeni rota aranıyor">${IC.ban}<span><b>Bu yoldan geçirme</b><small>Sıradaki kesimi bu ve sonraki yolculuklarda dışla</small></span></button><button class="opt" data-act="speed">${IC.play}<span><b>Simülasyon hızı</b><small>Şu an ${S.factor}× · demo</small></span></button><button class="opt danger" data-act="go" data-s="trip">${IC.flag}<span><b>Yolculuğu bitir</b></span></button>`;
  if (kind === 'layers') return `<h4>Harita</h4><div class="seg2"><button class="${!S.sat ? 'on' : ''}" data-act="sat" data-v="0">Sade</button><button class="${S.sat ? 'on' : ''}" data-act="sat" data-v="1">Uydu</button></div><button class="opt" data-act="flat"><span><b>3B binalar</b><small>Gerçek OSM yükseklikleri</small></span><i class="sw ${!S.flat ? 'on' : ''}"></i></button><button class="opt" data-act="theme"><span><b>Görünüm</b><small>${theme() === 'dark' ? 'Gece · grafit' : 'Gündüz · kırık beyaz'}</small></span><i class="sw ${theme() === 'dark' ? 'on' : ''}"></i></button>`;
  return '';
}
function openPop(kind) { S.pop = kind; const p = $('#pop'); p.innerHTML = `<div class="pop-card" role="dialog">${popHTML(kind)}</div>`; p.hidden = false; p.dataset.kind = kind; }
function closePop() { S.pop = null; $('#pop').hidden = true; }

/* ---------- Ekran geçişleri ---------- */
function render() {
  phone.dataset.dir = S.dir; phone.dataset.screen = S.screen; phone.dataset.theme = theme();
  document.documentElement.dataset.theme = theme();
  const drive = S.screen === 'drive';
  $('#sheet').hidden = drive; $('#drive').hidden = !drive; $('#ctl').hidden = drive;
  if (!drive) { stopSim(); sheet.body.innerHTML = S.screen === 'home' ? viewHome() : S.screen === 'routes' ? viewRoutes() : viewTrip(); }
  else $('#drive').innerHTML = driveHTML();
  $('#ctl').innerHTML = `<button data-act="pop" data-pop="layers" aria-label="Harita katmanları">${IC.layers}</button><button data-act="locate" aria-label="Konumuma git">${IC.locate}</button>`;
  syncRail();
}
async function go(screen, opts = {}) {
  closePop(); S.screen = screen; clearCallouts();
  if (screen === 'routes') { const { best } = choose(S.budget); if (!opts.keepSel) S.sel = best.i; }
  render();
  await applyStyle();
  ensurePuck(); ensureCar();
  if (screen === 'home') { sheet.set(S.detent || 'half', false); map.jumpTo({ center: [START.lon, START.lat], zoom: 15.7, pitch: S.dir === 'c' ? 0 : 38, bearing: -18, padding: { top: 0, bottom: sheet.visible() - 20, left: 0, right: 0 } }); }
  if (screen === 'routes' || screen === 'trip') { setRoutes(); sheet.set(S.detent || 'half', false); }
  if (screen === 'drive') { setRoutes(); car.setLngLat(ROUTES[S.sel].coords[0]); startSim(); }
  const u = new URL(location.href); u.searchParams.set('d', S.dir); u.searchParams.set('s', screen); history.replaceState(null, '', u);
  S.detent = null;
}
function fitRoutes(bottom, selOnly) {
  const b = new maplibregl.LngLatBounds(); (selOnly ? [ROUTES[S.sel]] : ROUTES).forEach(r => r.coords.forEach(c => b.extend(c)));
  map.fitBounds(b, { padding: { top: parseFloat(css('--safe-top')) + 40, bottom: bottom + 24, left: 34, right: 70 }, pitch: 0, bearing: 0, duration: 500 });
  if (!selOnly) setTimeout(drawCallouts, 560);
}
function clearCallouts() { callouts.forEach(m => m.remove()); callouts = []; }
function drawCallouts() {
  clearCallouts(); if (S.screen !== 'routes') return;
  const { fastest } = choose(S.budget), sel = ROUTES[S.sel];
  for (const r of ROUTES) {
    // Etiket rotanın diğerlerinden en uzak noktasına konur
    let bestP = null, bestD = -1;
    for (let k = Math.floor(r.coords.length * .2); k < r.coords.length * .8; k += 6) {
      const c = r.coords[k]; let dmin = Infinity;
      for (const o of ROUTES) if (o !== r) for (let j = 0; j < o.coords.length; j += 4) dmin = Math.min(dmin, Math.hypot(o.coords[j][0] - c[0], o.coords[j][1] - c[1]));
      if (dmin > bestD) { bestD = dmin; bestP = c; }
    }
    const el = document.createElement('button'); el.className = 'callout' + (r === sel ? ' sel' : '');
    const dd = r === sel ? '' : ` <small>${r.time >= sel.time ? '+' : '−'}${fmtMin(Math.abs(r.time - sel.time))}</small>`;
    el.innerHTML = `<b>${fmtMin(r.time)} dk</b>${dd}`; el.addEventListener('click', e => { e.stopPropagation(); selectRoute(r.i); });
    callouts.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(bestP).addTo(map));
  }
}
function selectRoute(i) { S.sel = i; setRoutes(); const st = sheet.body.querySelector('.cards')?.scrollLeft; sheet.body.innerHTML = viewRoutes(); if (st != null && sheet.body.querySelector('.cards')) sheet.body.querySelector('.cards').scrollLeft = st; drawCallouts(); bindCarousel(); }
function bindCarousel() {
  const c = sheet.body.querySelector('.carousel'); if (!c) return;
  const sel = c.querySelector('.route-card.sel'); if (sel && !c.dataset.bound) c.scrollLeft = sel.offsetLeft - 16;
  c.dataset.bound = 1;
  let t; c.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const cards = [...c.children]; const mid = c.scrollLeft + c.clientWidth / 2; const k = cards.reduce((a, el, j) => Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid) < Math.abs(cards[a].offsetLeft + cards[a].offsetWidth / 2 - mid) ? j : a, 0); const i = +cards[k].dataset.i; if (i !== S.sel) { S.sel = i; setRoutes(); cards.forEach(el => { el.classList.toggle('sel', +el.dataset.i === i); }); drawCallouts(); } }, 120); });
}

/* ---------- Etkileşim ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) { if (S.pop && !e.target.closest('.pop-card')) closePop(); return; }
  const a = b.dataset.act;
  if (a !== 'pop' && a !== 'budget' && a !== 'tog' && a !== 'flat' && !b.closest('.pop-card')) closePop();
  const A = {
    go: () => go(b.dataset.s), fav: () => b.dataset.k === 'İş' ? go('routes') : toast('Ev konumu henüz kayıtlı değil — demo'), goWork: () => go('routes'), trip: () => go('trip'),
    search: () => sheet.set('full'), toast: () => toast(b.dataset.msg), selRoute: () => selectRoute(+b.dataset.i),
    pop: () => S.pop === b.dataset.pop ? closePop() : openPop(b.dataset.pop),
    budget: () => { S.budget = clamp(S.budget + +b.dataset.d, 0, 15); if (S.pop) openPop(S.pop); if (S.screen === 'routes') { S.sel = choose(S.budget).best.i; selectRoute(S.sel); } else if (S.screen === 'home') sheet.body.innerHTML = viewHome(); },
    pref: () => { S.pref = b.dataset.v; S.budget = { main: 5, balanced: 3, fast: 0 }[S.pref]; closePop(); if (S.screen === 'routes') { S.sel = choose(S.budget).best.i; selectRoute(S.sel); } else render(); },
    tog: () => { S[b.dataset.k] = !S[b.dataset.k]; openPop('pref'); },
    sound: () => { S.sound = b.dataset.v; closePop(); $('#drive').querySelector('.d-ctl .round').innerHTML = IC[{ silent: 'mute', alerts: 'bell', guidance: 'speaker' }[S.sound]]; toast({ silent: 'Tamamen sessiz', alerts: 'Yalnız uyarılar', guidance: 'Yönlendirme + uyarılar' }[S.sound]); },
    sat: () => { S.sat = b.dataset.v === '1'; closePop(); applyStyle(); }, flat: () => { S.flat = !S.flat; openPop('layers'); applyStyle(); },
    theme: () => { S.theme = theme() === 'dark' ? 'light' : 'dark'; closePop(); render(); applyStyle(); setTimeout(() => sheet.set(sheet.det, false), 30); },
    locate: () => map.easeTo({ center: [START.lon, START.lat], zoom: 16.4, duration: 600 }),
    overview, recenter: () => { S.follow = true; $('#recenter').hidden = true; },
    avoid: () => { const k = +b.dataset.k; S.avoided.has(k) ? S.avoided.delete(k) : S.avoided.add(k); const sc = sheet.body.scrollTop; sheet.body.innerHTML = viewTrip(); sheet.body.scrollTop = sc; map.getSource('avoid')?.setData(avoidFC()); toast(S.avoided.has(k) ? 'Bu kesimden bir daha geçirilmeyecek' : 'Kesim kaldırıldı'); },
    speed: () => { S.factor = S.factor >= 8 ? 1 : S.factor * 2; toast(`Simülasyon ${S.factor}×`); closePop(); },
    dir: () => { S.dir = b.dataset.v; styleKey = ''; go(S.screen, { keepSel: true }); },
    scr: () => go(b.dataset.v), lab: () => document.body.classList.toggle('rail-open'),
    th: () => { S.theme = b.dataset.v === 'auto' ? null : b.dataset.v; render(); applyStyle(); setTimeout(() => sheet.set(sheet.det, false), 30); if (S.screen === 'drive') startSim(); }
  };
  A[a]?.();
});
function syncRail() {
  document.querySelectorAll('[data-act=dir]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.dir));
  document.querySelectorAll('[data-act=scr]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.screen));
  document.querySelectorAll('[data-act=th]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === (S.theme || 'auto')));
  const d = DIRS[S.dir]; const info = $('#dir-info');
  if (info) info.innerHTML = `<h3>${d.name} <small>${d.tag}</small></h3><p>${d.idea}</p><ul class="pm">${d.plus.map(x => `<li class="p">${x}</li>`).join('')}${d.minus.map(x => `<li class="m">${x}</li>`).join('')}</ul>`;
}

/* ---------- Açılış ---------- */
async function boot() {
  if (q.get('frame') === 'phone') document.body.classList.add('sim-safe');
  await loadRoutes();
  map = new maplibregl.Map({ container: 'map', style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EEE' } }] }, center: [START.lon, START.lat], zoom: 16.2, pitch: 40, bearing: -18, attributionControl: false, maxPitch: 70, fadeDuration: 150 });
  ['dragstart', 'rotatestart', 'pitchstart', 'zoomstart'].forEach(ev => map.on(ev, e => { if (e.originalEvent && S.screen === 'drive' && S.follow) { S.follow = false; const r = $('#recenter'); if (r) r.hidden = false; } }));
  window.__lab = { S, map, go, ROUTES };
  sheet.bind();
  addEventListener('resize', () => { if (S.screen !== 'drive') sheet.set(sheet.det, false); });
  render();
  await go(S.screen);
  map.once('idle', () => document.body.dataset.ready = '1');
}
boot();
