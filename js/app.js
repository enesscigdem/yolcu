import {navigationTiming,routeSeconds,timingEvidence,hasFreshTraffic} from './timing.js';
import { store, save, addRecent, isSaved, toggleSaved, exportBackup, importBackup, packForLink, unpackFromLink, addTrip, toggleRouteSaved } from './store.js';
import { remainingDwellSeconds } from './stops.js';
import { Roadside } from './roadside.js';
import { RELEASE, hasServerAPI, SERVER_UNAVAILABLE } from './assistant.js';
import { routeCharacter } from './needs.js';
import { FixStream } from './location.js';
import { Replanner } from './replan.js';
import { Diagnostics, FollowCamera } from './diagnostics.js';
import { createAudio, SOUND_MODES } from './audio.js';
import * as api from './api.js';
import * as traffic from './traffic.js';
import * as radar from './radar.js';
import { loadStyle, applyPalette, setTerrain, PALETTES, ACCENT, firstLabelLayer, setRouteBuildings } from './mapstyle.js';
import * as G from './guide.js';
import { Navigator, Simulator } from './nav.js';
import { I, KIND_ICON } from './icons.js';
import { dist, bearing, sliceAlong, pointAt, compass, fixTimestamp } from './geo.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PREVIEW = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
const IZMIR = { lon: 27.142, lat: 38.423 };
const EMPTY = { type: 'FeatureCollection', features: [] };
const wide = () => window.innerWidth >= 700;
const ICONS = { komur: 'Kömür', mavi: 'Mavi Ok', yol: 'Gün Batımı', harita: 'Harita', gece: 'Gece', y: 'Y Ayrımı' };
const TRAVEL = { auto: ['Araba', 'car'], pedestrian: ['Yürüyüş', 'walk'] };

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
const fixes = new FixStream(), diagnostics = new Diagnostics(), camera = new FollowCamera();
const key = () => S.services?.traffic?'server':null;
function tripContext(){const route=S.navRoute||S.routes[S.sel];if(!route||!S.pos||Date.now()-S.pos.t>5000)return null;return {route,along:S.nav?.along||0,from:{...S.pos},to:S.dest,prefs:{...store.prefs},avoids:[...structuredClone(store.avoids),...(S.tripAvoids||[])],stops:structuredClone(S.stops||route.stops||[]),traffic:trafficProvider(),manualOrder:!!S.stopOrderManual,activeDwellSeconds:remainingDwellSeconds([],S.activeDwell)};}
let roadsideMarkers=[];
const roadside=new Roadside({store,save,planner:api.planRoutes,canPark:()=>!S.sim||PREVIEW,position:()=>PREVIEW&&S.pos?Promise.resolve({...S.pos,t:Date.now()}):freshPosition(),context:()=>S.nav?tripContext():null,hasTrip:()=>!!S.nav,getStops:()=>structuredClone(S.stops||[]),toast,
 findNearby:async(cat,point,signal)=>{if(key()){try{const found=await traffic.poiSearch(key(),cat,point,signal);if(found.length)return found;}catch(e){if(e.name==='AbortError')throw e;}}const list=await api.nearby({...cat,r:3500,fallback:cat.label},point,signal);return cat.brand?list.filter(p=>(p.name+' '+p.brand).toLocaleLowerCase('tr-TR').includes(cat.brand.toLocaleLowerCase('tr-TR'))):list;},
 onResults:(options,selected)=>{
  roadsideMarkers.forEach(m=>m.remove());roadsideMarkers=[];
  if(!S.mapReady)return;
  if(options.length&&selected==null&&!S.nav){const bounds=new maplibregl.LngLatBounds();options.forEach(o=>bounds.extend([o.place.lon,o.place.lat]));if(S.pos)bounds.extend([S.pos.lon,S.pos.lat]);S.map.fitBounds(bounds,{padding:{top:70,bottom:$('roadside').getBoundingClientRect().height+30,left:36,right:36},maxZoom:15,duration:500});}
  options.forEach((o,i)=>{
   const el=document.createElement('button');el.type='button';el.className='rs-map-pin'+(i===selected?' selected':'');el.textContent=String(i+1);el.setAttribute('aria-label',o.place.name+' detayları');
   el.addEventListener('click',e=>{e.stopPropagation();roadside.detail(i);});
   roadsideMarkers.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([o.place.lon,o.place.lat]).addTo(S.map));
  });
 },
 onFocus:p=>{if(!p||!S.mapReady)return;if(S.nav)S.follow=false;S.map.easeTo({center:[p.lon,p.lat],zoom:16,padding:{top:S.nav?160:30,bottom:$('roadside').getBoundingClientRect().height+30,left:24,right:24},duration:500});},
 isSaved,onEditPinned:id=>{const origin=S.sideReturnSettings;roadside.close();S.pickPlacesReturnSettings=origin;S.pickFor=id;S.pickReturnPlaces=true;openSearch();},
 savePlace:p=>{if(!isSaved(p))toggleSaved(p);},
 onPickEntrance:p=>{if(S.nav)return toast('Araç girişi kaydetmek için sürüşü bitir');S.entranceGoal={...p};roadside.close();goHome();sheet.set('peek');S.map?.easeTo({center:[p.lon,p.lat],zoom:17,pitch:0,duration:700});toast('Haritada araç girişine basılı tut, ardından Giriş olarak kaydet seç',6000);},
 onDismiss:back=>{const settings=S.sideReturnSettings;S.sideReturnSettings=false;if(back&&settings)ACT.openSettings();},
 onPanel:()=>{if(S.nav&&S.pos)navTick({...S.pos,_received:performance.now()});},
 onAdd:choice=>applyStopChoice(choice),onStops:(stops,route,from)=>changeStops(stops,route,from),
 onPark:choice=>startParkingRoute(choice),onParked:()=>continueAfterParking(),
 onGo:(dest,travel)=>{if(S.nav)endNav();S.travel=travel;openRoutes(dest);},onAvoid:()=>avoidNextTurn()
});
function applyStopChoice(choice){
 if(!S.nav){toast('Durak eklemek için sürüşü başlat');return;}if((choice.route.stops||[]).length>3){toast('En fazla üç durak ekleyebilirsin');return;}
 if(!S.pos||Date.now()-S.pos.t>5000){toast('Güncel konum bekleniyor');return;}
 replanner.cancel();S.stops=choice.route.stops||choice.stops;S.stopOrderManual=true;
 if(dist(choice.from.lon,choice.from.lat,S.pos.lon,S.pos.lat)<45){if(!commitRoute(choice.route))replanner.run('add-stop',true);}else replanner.run('add-stop',true);
 saveActiveNav();toast('Ara durak eklendi');
}
function changeStops(stops,route,from){if(!S.nav)return;S.stops=stops;S.stopOrderManual=true;roadside.invalidate();saveActiveNav();if(route&&from&&dist(from.lon,from.lat,S.pos.lon,S.pos.lat)<45&&commitRoute(route))return;replanner.run('edit-stops',true);}
async function startParkingRoute(choice){if(!S.nav)return;const destination=S.dest;S.walkGoal=choice.finalDest||destination;S.dest={...choice.place,kind:'parking'};S.parkingDwell=choice.place.dwellMinutes||0;S.stops=choice.route.stops||[];S.tripAvoids ||= [];if(dist(choice.from.lon,choice.from.lat,S.pos.lon,S.pos.lat)<45&&commitRoute(choice.route)){setDest(S.dest);saveActiveNav();}else replanner.run('parking',true);}
function continueAfterParking(){if(!S.walkGoal)return;const goal=S.walkGoal,parked=store.parkedCar;S.walkGoal=null;endNav();if(PREVIEW&&parked){fixes.reset();onPos({...parked,acc:8,speed:0,heading:null,t:Date.now()});}S.travel='pedestrian';openRoutes(goal);}
function avoidNextTurn(){if(!S.nav||!S.lastState?.matched||!S.lastState.up)return toast('Yaklaşan dönüş için konumun doğrulanması gerekiyor');const r=S.navRoute,at=Math.min(r.lengthM-30,S.lastState.up.along+25);if(at<=S.nav.along+10)return toast('Bu noktada dışlanacak bir yol kesimi yok');const p=pointAt(r.coords,r.cum,at);S.tripAvoids ||= [];S.tripAvoids.push({...p,name:'Bu yolculukta istenmeyen dönüş'});S.tripAvoids=S.tripAvoids.slice(-12);closeNavMenu();roadside.close();replanner.run('avoid-turn',true);toast('Bu dönüşü kullanmadan alternatif aranıyor');}


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
    center: [p.lon, p.lat], zoom: tilt ? 16.3 : 15.6, pitch: tilt ? 48 : 0, bearing: -18,
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches?0:1800, curve: 1.25, essential: false,
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
  const kb = vv.scale > 1.05 ? 0 : Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px');
}
fitScreen();
addEventListener('resize', () => { fitScreen(); S.map?.resize(); });
addEventListener('orientationchange', () => setTimeout(() => { fitScreen(); S.map?.resize(); }, 300));
addEventListener('scroll', () => { if (!document.activeElement?.matches?.('input')) window.scrollTo(0, 0); }, { passive: true });
window.visualViewport?.addEventListener('resize', onViewport);
window.visualViewport?.addEventListener('scroll', onViewport);
document.addEventListener('focusout', () => setTimeout(() => { window.scrollTo(0, 0); onViewport(); }, 60));

/* ================= Tema ================= */
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = theme();
  document.documentElement.dataset.map = t;
  if (!S.mapReady) return;
  applyPalette(S.map, PALETTES[t], { type: S.nav ? 'standard' : store.prefs.mapType, nav: !!S.nav, relief:!!store.prefs.relief });
  // 3B arazi sadece gezinirken: navigasyonda MapLibre 4 kamerayı deniz seviyesine göre hesapladığından
  // konum oku arazinin üstünde kayıyor; ayrıca iPhone'da navigasyon daha akıcı oluyor.
  setTerrain(S.map, !!(store.prefs.relief && store.prefs.tilt && !S.nav));
  setFlow();
  setRouteBuildings(S.map,S.navRoute,S.nav?.along||0,S.nav?diagnostics.quality:0);
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

addEventListener('yolcu-storage-error', () => toast('Cihazdaki depolama alanına kayıt yapılamadı. Yedek alıp eski yolculukları silebilirsin.', 6000));

/* ================= Ses (telefonun kendi sesi) ================= */
const voice = createAudio(store.prefs);

/* ================= Ekranı açık tut ================= */
async function keepAwake(on) {
  try {
    if (on && (!S.wake || S.wake.released) && 'wakeLock' in navigator) { S.wake = await navigator.wakeLock.request('screen'); }
    else if (!on && S.wake) { await S.wake.release(); S.wake = null; }
  } catch { }
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){voice.stop();diagnostics.stop();S.sim?.pause();}
  else if(S.nav){keepAwake(true);S.sim?.resume();diagnostics.start(adaptQuality);navHealth();if(!S.sim)freshPosition();}
});
addEventListener('pagehide',()=>{voice.stop();diagnostics.stop();replanner.cancel();S.sim?.pause();stopGeo();if(S.nav&&!S.sim)saveActiveNav();});
addEventListener('pageshow',()=>{if(!PREVIEW)startGeo();if(S.nav){S.sim?.resume();diagnostics.start(adaptQuality);navHealth();}});
addEventListener('online',()=>{if(S.nav&&S.lastState?.offRoute)replanner.run('online',true);});

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
    if (S.view === 'home') {
      const hasTrips=store.trips.length>0;
      const recent=this.body.querySelector('[data-act=recent]');
      const needed=recent?recent.getBoundingClientRect().bottom-this.el.getBoundingClientRect().top+12:0;
      const card=this.body.querySelector('.home-discover');const essential=card?card.getBoundingClientRect().bottom-this.el.getBoundingClientRect().top+16:300;return {peek:Math.min(essential+safeB(),H*.55),half:Math.min(Math.max(essential+((hasTrips||store.recents.length||store.places.length||store.savedRoutes.length)?100:0),needed)+safeB(),H*.72),full:H};
    }
    if(S.view==='place'){const last=this.body.lastElementChild;const content=last?last.getBoundingClientRect().bottom-this.el.getBoundingClientRect().top+16:260;return {peek:Math.min(this.peekH(),H),half:Math.min(content+safeB(),H*.7),full:H};}
    if (S.view === 'routes') {
      const start = this.body.querySelector('.start-route');
      const needed = start ? start.getBoundingClientRect().bottom - this.el.getBoundingClientRect().top + safeB() + 14 : 380;
      return { peek: Math.min(180 + safeB(), H), half: Math.min(Math.max(380 + safeB(), needed), H * .84), full: H };
    }
    return { peek: Math.min(this.peekH(), H), half: Math.min(Math.max(Math.round(H * 0.55), this.peekH()), H), full: H };
  },
  set(d, anim = true) {
    this.detent = d;
    const vis = this.heights()[d];
    this.y = Math.max(0, this.H() - vis);
    this.el.style.transition = anim ? 'transform .45s cubic-bezier(.32,.72,0,1)' : 'none';
    this.el.style.transform = `translateY(${this.y}px)`;
    this.el.dataset.detent = d;
    this.el.dataset.view = S.view;
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
const NAV_ARROW = `<svg viewBox="0 0 44 48" aria-hidden="true"><path d="M22 3 40 42 22 34 4 42Z" fill="#B65032" stroke="#FFFDF7" stroke-width="3.5" stroke-linejoin="round"/><path d="M22 8v24" stroke="#FFFDF7" stroke-opacity=".25" stroke-width="2"/></svg>`;
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
    maxPitch: 65, fadeDuration: 450, dragRotate: true, pitchWithRotate: true, antialias: true
  });
  map.on('load', () => {
    addLayers();
    S.mapReady = true;
    applyTheme();
    $('map').classList.add('ready');
    if (S.pos) { S.firstFix = false; updatePuck(S.pos); introFly(S.pos); }
    loadIncidents();
    drawRadars();
    if(PREVIEW&&S.pendingPreview){const screen=S.pendingPreview;S.pendingPreview=null;previewScreen(screen);}
  });
  // Mekan simgeleri ilk ihtiyaç anında çizilir (koyu daire + tek renkli sembol)
  map.on('styleimagemissing', e => {
    const m = /^poi-(\w+)$/.exec(e.id);
    if (m && GLYPH[m[1]] && !map.hasImage(e.id)) map.addImage(e.id, glyphImage(m[1], POI_COLOR[m[1]] || '#E6E6E8', 'rgba(255,255,255,.18)'), { pixelRatio: 2 });
  });
  map.on('dragstart', () => {
    if (S.nav) { S.follow = false; S.overview=false; $('nav-recenter').hidden = false; $('nav-street').hidden = true; }
  });
  // The camera never writes the vehicle coordinate. Manual gestures release follow.
  for (const event of ['rotatestart', 'zoomstart', 'pitchstart']) map.on(event, e => {
    if (S.nav && e.originalEvent) { S.follow = false; S.overview=false; $('nav-recenter').hidden = false; }
  });
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
  m.addSource('yolcu-traveled',{type:'geojson',data:EMPTY});
  m.addLayer({id:'yolcu-traveled',type:'line',source:'yolcu-traveled',layout:round,paint:{'line-color':'#8B8580','line-opacity':.55,'line-width':w(4,15)}},before);
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
    paint: { 'line-width': w(1.8, 4), 'line-offset': w(5, 13), 'line-dasharray': [2, 1.5], 'line-color': ['match', ['get', 'mag'], 3, '#D93A2F', 4, '#8E1A12', 2, '#E85A2C', '#F09A2A'] }
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
  rememberScreen();
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
    if (i >= 2 && !S.details && i !== S.sel) return;
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
  if (!r) { try { const v = await api.quickRoute(p, dst, store.prefs); r = { time: v.time, delay: null, lengthM: v.lengthM }; } catch { return null; } }
  if(!Number.isFinite(r.time)||r.time<0)return null;
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
    S.puck = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([p.lon, p.lat]).addTo(S.map);
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

function onPos(input,replay=false) {
  const began=performance.now();
  const p=fixes.accept(input,replay?fixTimestamp(input.t):Date.now());
  if(!p){if(S.nav)navHealth();return;}
  p._received=began;
  if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat) || (S.pos && p.t < S.pos.t)) return;
  const first = !S.pos;
  S.pos = p;
  if (!S.sim) S.realPos = p;
  updatePuck(p);
  if (first) { updateLocateBtn(); loadRadars(p); updateWeather(p); }
  if (S.firstFix && S.mapReady && !S.nav) { S.firstFix = false; introFly(p); }
  if (!S.nav) refreshHello();
  if (S.nav) navTick(p,began);
  else {
    updateWhere(p);
    updateWeather(p);
    if (S.view === 'where' && (!S.whereRender || Date.now() - S.whereRender > 1000)) { S.whereRender = Date.now(); render(); }
  }
}

function stopGeo(){if(S.geoWatch!=null){navigator.geolocation?.clearWatch(S.geoWatch);S.geoWatch=null;}}
function startGeo() {
  if(S.geoWatch!=null)return;
  if (!('geolocation' in navigator)) { toast('Bu cihazda konum desteği yok'); return; }
  S.geoWatch = navigator.geolocation.watchPosition(
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

async function freshPosition() {
  if (S.pos && Date.now() - S.pos.t < 1500 && S.pos.acc <= 50) return S.pos;
  if (!navigator.geolocation) return null;
  try {
    const g = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }));
    const c = g.coords;
    const p = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, heading: c.heading, speed: c.speed, alt: c.altitude, t: g.timestamp || Date.now() };
    onPos(p);
  } catch { }
  return S.pos && Date.now() - S.pos.t < 10000 && S.pos.acc <= 80 ? S.pos : null;
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
  if (travel !== 'auto') return `<div class="list plain">${row('hills', 'Yokuşlardan kaçın', 'Alternatifleri mevcut eğim ve merdiven verisiyle karşılaştırır')}</div>`;
  return `<div class="list plain">
    ${row('highways', 'Ana yolları tercih et', 'Otoyol, çevre yolu ve bulvarlar')}
    ${row('hills', 'Yokuşlardan kaçın', 'Alternatifler arasında mevcut eğim verisini karşılaştırır')}
    ${row('rough', 'Bozuk yollardan kaçın', 'Toprak yolları dışlar; bilinen yüzeyleri karşılaştırır')}
    ${row('tolls', 'Ücretli yollardan kaçın', 'Otoyol ve köprü ücretleri')}
    <label class="row"><span class="row-main"><span class="row-title">Rahat rota için ek süre</span><span class="row-sub">En hızlı bulunan rotaya göre üst sınır</span></span><select data-pref="maxExtraMinutes" aria-label="En fazla ek süre">${[0, 3, 5, 10, 15, 20].map(n => `<option value="${n}" ${Number(P.maxExtraMinutes) === n ? 'selected' : ''}>${n} dk</option>`).join('')}</select></label>
  </div><p class="group-foot">Yokuş tercihi bulunan alternatifleri sıralar; tüm yolların eğim ve yüzey bilgisi bulunmayabilir. Kesin kaçınmak istediğin kesimi ayrıca işaretleyebilirsin.</p>`;
}

function tripRows(list, act = 'openTrip') {
  return list.map((t, i) => `<button class="row trip-row" data-act="${act}" data-i="${i}">${placeIcon(t.dest.kind || 'work')}<span class="row-main"><span class="row-title">${esc(t.dest.name)}${t.dest.sub ? ' · ' + esc(t.dest.sub) : ''}</span><span class="row-sub">${new Date(t.endedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} · ${G.fmtDur(t.duration)} · ${G.fmtDist(t.distance)}</span></span><span class="row-chevron">${I.chevron}</span></button>`).join('');
}
function viewHome() {
  const fav = (k,label,icon) => `<button class="fav" data-act="fav" data-k="${k}"><span class="fav-icon">${I[icon]}</span><span class="fav-title"><b>${label}</b><small>${store[k]?esc(store[k].name):'Yerini ekle'}</small>${S.eta[k]?`<em>~${G.fmtDur(S.eta[k].time)}</em>`:''}</span></button>`;
  const an = store.activeNav;
  return `<div class="home-greeting"><span>${greeting()}</span><b>Yolcu</b></div><div class="search-row"><button class="searchbar" data-act="openSearch">${I.search}<span>Nereye?</span></button><button class="icon-btn" data-act="openSettings" aria-label="Ayarlar">${I.gear}</button></div>
    <div class="favs">${fav('home', 'Ev', 'home')}${fav('work', 'İş', 'work')}<button class="fav fav-add" data-act="addPlace" aria-label="Yer ekle">${I.plus}</button></div>
    <button class="preference-chip" data-act="routePrefs">${I.road}<span>${store.prefs.highways ? 'Ana yol odaklı' : 'Rota tercihleri'}</span><span class="down">${I.chevron}</span></button>
    ${an && Date.now() - an.t < 4 * 3600e3 ? `<button class="resume" data-act="resumeNav">${I.car}<span style="flex:1"><b>Yola devam et</b><small>${esc(an.dest.name)}</small></span><span class="close" data-act="dismissResume">${I.x}</span></button>` : ''}
    ${store.trips.length?`<div class="section home-trips ${store.trips.length?'':'compact-empty'}"><div class="section-head"><h3>Son yolculuklar</h3>${store.trips.length?'<button class="link small" data-act="allTrips">Tümü</button>':''}</div><div class="list">${store.trips.length ? tripRows(store.trips.slice(0, 3)) : '<div class="empty">Tamamladığın yolculuklar burada görünecek.</div>'}</div></div>`: ''}
    <div class="home-discover"><button data-act="openRoadside"><span class="discover-icon">${I.route}</span><span><b>Yakında bul</b><small>Yakıt, eczane, market ve daha fazlası</small></span>${I.chevron}</button><button data-act="personalPlaces"><span class="discover-icon">${I.star}</span><span><b>Benim yerlerim</b><small>${store.places.length?store.places.length+' kayıtlı yer':'Sana ait duraklar'}</small></span>${I.chevron}</button></div>
    ${store.savedRoutes.length ? `<div class="section"><div class="section-head"><h3>Favori güzergâhlar</h3></div><div class="list">${tripRows(store.savedRoutes, 'openSavedRoute')}</div></div>` : ''}
    ${store.places.length ? `<div class="section"><div class="section-head"><h3>Kayıtlı yerler</h3></div><div class="list">${store.places.map((p, i) => placeRow(p, 'favPlace', i)).join('')}</div></div>` : ''}
    ${store.recents.length?`<div class="section"><div class="section-head"><h3>Son aramalar</h3>${store.recents.length ? '<button class="link small" data-act="clearRecents">Temizle</button>' : ''}</div><div class="list">${store.recents.length ? store.recents.map((p, i) => placeRow(p, 'recent', i, 'recent')).join('') : '<div class="empty">Aradığın yerler burada görünecek.</div>'}</div></div>`: ''}
    ${store.avoids.length?`<button class="row" data-act="avoidList">${placeIcon('road')}<span class="row-main"><span class="row-title">Kaçındığım yollar</span><span class="row-sub">${store.avoids.length} kayıt · haritada basılı tutarak ekle</span></span>${I.chevron}</button>`: ''}
    <p class="legal">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · OpenFreeMap · Mapterhorn · Esri · Valhalla${key() ? ' · TomTom' : ''}</p>`;
}
function viewHistory() {
  const t = S.tripView;
  if (!t) return `<div class="card-head"><h2>Yolculuklar</h2><button class="close" data-act="goHome" aria-label="Kapat">${I.x}</button></div><div class="list">${tripRows(store.trips) || '<div class="empty">Henüz tamamlanan yolculuk yok.</div>'}</div>`;
  const saved = store.savedRoutes.some(x => x.id === t.id);
  return `<div class="card-head"><div><p class="eyebrow">${new Date(t.endedAt).toLocaleString('tr-TR')}</p><h2>${esc(t.dest.name)}</h2></div><button class="close" data-act="allTrips" aria-label="Geri">${I.x}</button></div>
    <div class="trip-summary"><p>${esc(t.origin.name)} → ${esc(t.dest.name)}</p><b>${G.fmtDur(t.duration)} · ${G.fmtDist(t.distance)}</b></div>
    <div class="action-grid"><button data-act="tripGo">${I.route}<span>Tekrar git</span></button><button data-act="saveTrip">${I.star}<span>${saved ? 'Favoriden çıkar' : 'Güzergâhı kaydet'}</span></button></div>
    <div class="section"><div class="section-head"><h3>Geçilen güzergâh</h3></div><p class="group-foot">İstemediğin yol kesiminin yanındaki düğmeyle sonraki rotalardan çıkar.</p><div class="list">${(t.segments || []).map((seg, i) => `<div class="row"><button class="row-main segment-title" data-act="showTripSeg" data-i="${i}"><span class="row-title">${esc(seg.name || 'Ara sokaklar')}</span><span class="row-sub">${G.fmtDist(seg.m)}</span></button><button class="avoid-segment" data-act="avoidTripSeg" data-i="${i}" aria-label="${esc(seg.name || 'Bu kesim')}: bu yoldan beni geçirme">${I.noentry}</button></div>`).join('') || '<div class="empty">Güzergâh detayları alınamamış.</div>'}</div></div>
    <button class="link danger-link" data-act="deleteTrip">Bu kaydı sil</button>`;
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
    return `<div class="list">${list.map((p, i) => placeRow(p, 'pick', i)).join('')}</div>${key() ? '<p class="legal">İşletme bilgileri © TomTom · OpenStreetMap</p>' : noKeyTip}`;
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
      <button class="close" data-act="backScreen" aria-label="Geri">${I.back}</button>
    </div>
    <div data-peek><button class="btn primary" data-act="directions">${I.car}<span>Yol Tarifi</span>${S.pos ? `<small>· ${distFromMe(p)}</small>` : ''}</button></div>
    <div class="action-grid">
      <button data-act="setHomeHere" class="${isHome ? 'on' : ''}">${I.home}<span>${isHome ? 'Evin' : 'Ev Yap'}</span></button>
      <button data-act="setWorkHere" class="${isWork ? 'on' : ''}">${I.work}<span>${isWork ? 'İşin' : 'İş Yap'}</span></button>
      <button data-act="saveHere" class="${saved ? 'on' : ''}">${I.star}<span>${saved ? 'Kayıtlı' : 'Kaydet'}</span></button>
      <button data-act="sharePlace">${I.share}<span>Paylaş</span></button>
    </div>
    ${p.isPoint ? `<div class="section"><div class="list plain">
      ${S.entranceGoal?`<button class="row" data-act="saveEntrance">${esc(S.entranceGoal.name)} için giriş olarak kaydet</button>`:''}
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
      <button class="close" data-act="backScreen" aria-label="Geri">${I.x}</button>
    </div>
    <div class="stats-grid" data-peek>
      <div class="stat-card"><small>Gecikme</small><b>${d >= 1 ? d : '—'}<span>${d >= 1 ? 'dk' : ''}</span></b></div>
      <div class="stat-card"><small>Başlangıç</small><b>${since ? G.fmtClock(since) : '—'}</b></div>
    </div>
    <p class="legal" style="text-align:left;margin-top:6px">Kaynak: TomTom canlı trafik</p>`;
}

const rtime = r => routeSeconds(r)+remainingDwellSeconds(r.stops||[],S.resumeDwell||null);
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

  const L = r.lengthM || 1;
  const seg = (a, b, cls) => `<i class="${cls}" style="left:${(a / L * 100).toFixed(2)}%;width:${Math.max(0.8, (b - a) / L * 100).toFixed(2)}%"></i>`;
  let html = '';
  for (const s of r.story || []) {
    if (s.kind !== 'road' || !['motorway', 'trunk', 'primary', 'secondary'].includes(s.cls)) continue;
    html += seg(r.cum[Math.min(s.b, r.cum.length - 1)], r.cum[Math.min(s.e, r.cum.length - 1)], 'main');
  }
  for (const j of hasFreshTraffic(r)?(r.jams||[]):[]) {
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
  const d = hasFreshTraffic(r)?Math.round((r.trafficDelay || 0) / 60):0;
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
    const d = hasFreshTraffic(r)?r.trafficDelay:null;
    cells.push(m('Trafik', d == null ? '—' : d >= 120 ? `+${Math.round(d / 60)} dk` : 'Akıcı', d >= 360 ? 'bad' : d >= 120 ? 'warn' : 'good'));
  }
  cells.push(m('Yokuş', !a.total || a.gradeKnown < a.total * .95 ? 'Bilinmiyor' : a.steep < 150 ? 'Az / kayıt yok' : dist(a.steep), a.steep >= 600 ? 'bad' : a.steep >= 150 ? 'warn' : 'good'));
  cells.push(m('Bozuk yol', !a.total || a.surfaceKnown < a.total * .95 ? 'Bilinmiyor' : a.rough < 80 ? 'Kayıt yok' : dist(a.rough), a.rough >= 400 ? 'warn' : 'good'));
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
      <p class="story-text">${esc(routeCharacter(r))}</p><p class="story-text">${esc(G.storySpeech(st, S.dest.name))}</p>
    </div>`;
}

function trafficCaption(r) {
  if (hasFreshTraffic(r)) {
    const delay = Math.round((r.trafficDelay || 0) / 60);
    const when = G.fmtClock(new Date(r.trafficCheckedAt));
    return `<div class="traffic-caption"><i></i>Canlı trafik${delay >= 1 ? ` · +${delay} dk` : ''} · ${when}</div>`;
  }
  return `<div class="traffic-caption unavailable">${key() ? 'Canlı trafik alınamadı · tahmini süre' : 'Tahmini süre · canlı trafik bağlı değil'}</div>`;
}
function viewRoutes() {
  const d = S.dest;
  let cards = '';
  if (S.routeErr) cards = `<div class="list"><div class="empty">${esc(S.routeErr)}<br><button class="link" data-act="replan">Tekrar dene</button></div></div>`;
  else if (!S.routes.length) cards = '<div class="skeleton"></div><div class="skeleton"></div>';
  else cards = S.routes.map((r, i) => {
    if (i >= 2 && !S.details && i !== S.sel) return '';
    const sel = i === S.sel;
    const eta = G.fmtClock(new Date(Date.now() + rtime(r) * 1000));
    const extra = r.fastest ? 'Bulunan en hızlı rota' : `En hızlı rotadan ${r.extraSeconds < 60 ? '1 dk’dan az' : Math.round(r.extraSeconds / 60) + ' dk'} daha uzun`;
    return `<div class="route ${sel ? 'sel' : ''}"><button class="route-top" data-act="selRoute" data-i="${i}" aria-pressed="${sel}"><div class="route-main"><div class="route-label">${r.best ? 'Rahat rota' : r.fastest ? 'En hızlı' : 'Alternatif rota'}</div><div class="rt-time">${fmtTime(rtime(r))}</div><div class="rt-sub">${G.fmtDist(r.lengthM)} · ${eta} varış</div>${sel ? `<div class="notes">${(r.reasons || []).slice(0, 2).map(t => `<span class="note">${t.includes('dönüş') ? I.route : I.road}${esc(t === 'Ana yollar ağırlıkta' ? 'Ana yollar' : t)}</span>`).join('')}</div><p class="route-compare">${extra}</p>${trafficCaption(r)}` : ''}</div><span class="route-radio">${sel ? I.check : ''}</span></button></div>`;
  }).join('');
  const r = S.routes[S.sel];
  return `<div class="card-head route-head"><button class="circle-btn" data-act="closeRoutes" aria-label="Geri">${I.back}</button><h2>${esc(d.name)}</h2><button class="circle-btn" data-act="shareEta" aria-label="Varışı paylaş">${I.share}</button></div>
    ${cards}
    ${r ? `<button class="btn primary start-route" data-act="go" data-i="${S.sel}">Başlat</button><div class="route-more"><button class="link" data-act="routeDetails">${S.details ? 'Detayları gizle' : 'Rota detayları'}</button><button class="link" data-act="preview" data-i="${S.sel}">Önizle</button></div>` : ''}
    ${S.details && r ? metricsHtml(r) + storyHtml(r) : ''}
    <div class="section"><div class="section-head"><h3>Rota tercihleri</h3></div>${prefsList(S.travel)}</div>
    <div class="mode-seg">${Object.entries(TRAVEL).map(([k, [l, ic]]) => `<button class="${S.travel === k ? 'on' : ''}" data-act="travel" data-v="${k}">${I[ic]}<span>${l}</span></button>`).join('')}</div>
    ${S.details && r ? `<div class="section"><div class="section-head"><h3>Adım adım</h3></div><div class="list plain steps">${r.maneuvers.filter(m => !m.silent).map(m => `<div class="row"><span class="step-icon">${G.arrowSvg(m)}</span><span class="row-main"><span class="row-title">${esc(G.action(m))}</span><span class="row-sub wrap">${esc(m.street)}</span></span></div>`).join('')}</div></div>` : ''}`;
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
      <button class="close" data-act="backScreen" aria-label="Geri">${I.x}</button>
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
  let comparisonExpired=false;
  if(S.view==='routes'&&!S.nav&&S.routes.length&&S.routes.some(r=>r.trafficTime)&&!S.routes.every(r=>hasFreshTraffic(r))){const chosen=S.routes[S.sel];S.routes=api.rankRoutes(S.routes,store.prefs);S.sel=Math.max(0,S.routes.indexOf(chosen));comparisonExpired=true;}
  const v = { home: viewHome, search: viewSearch, place: viewPlace, routes: viewRoutes, where: viewWhere, incident: viewIncident, history: viewHistory }[S.view];
  if (S.view === 'search' && $('q')) { $('results').innerHTML = resultsHtml(S.results); return; }
  sheet.body.innerHTML = v();
  sheet.el.dataset.view = S.view;
  if(comparisonExpired&&S.mapReady)drawRoutes();
  // Görünüm değiştiyse içerik yumuşakça belirsin
  if (S.lastView !== S.view) {
    S.lastView = S.view;
    const b = sheet.body;
    b.classList.remove('enter'); void b.offsetWidth; b.classList.add('enter');
    clearTimeout(S.enterT); S.enterT = setTimeout(() => b.classList.remove('enter'), 500);
  }
}

const screenHistory=[];
function rememberScreen(){
 if(S.nav)return;
 const values={};for(const k of ['view','place','pickFor','results','dest','routes','sel','details','tripView'])values[k]=S[k];
 screenHistory.push({values,scroll:sheet.body.scrollTop,detent:sheet.detent,query:$('q')?.value||'',center:S.map?.getCenter(),zoom:S.map?.getZoom(),pitch:S.map?.getPitch(),bearing:S.map?.getBearing()});
 if(screenHistory.length>20)screenHistory.shift();
}
function backScreen(){
 if(S.view==='routes'&&!S.nav){S.resumeStops=null;S.resumeDwell=null;S.resumeAvoids=null;S.resumeWalkGoal=null;S.autoStart=false;}
 S.planAbort?.abort();S.searchAbort?.abort();clearTimeout(S.searchT);S.catToken={};
 const previous=screenHistory.pop();if(!previous)return goHome();
 Object.assign(S,previous.values);sheet.body.innerHTML='';render();sheet.set(previous.detent);sheet.body.scrollTop=previous.scroll;
 if(S.view==='search'){bindSearch();$('q').value=previous.query;if(S.results==='loading')onSearchInput(previous.query,true);}
 setDest(S.view==='place'?S.place:S.view==='routes'?S.dest:null);if(S.view==='routes')drawRoutes();else{setRoutesData([]);setJams([]);clearChips();}
 if(previous.center&&!S.nav)S.map?.jumpTo({center:previous.center,zoom:previous.zoom,pitch:previous.pitch,bearing:previous.bearing});
}
function bindSearch(){const q=$('q');if(!q)return;q.addEventListener('input',()=>onSearchInput(q.value));q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();q.blur();onSearchInput(q.value,true);}});}
function goHome() {
  S.resumeStops=null;S.resumeDwell=null;S.resumeAvoids=null;S.resumeWalkGoal=null;S.autoStart=false;
  screenHistory.length=0;S.searchAbort?.abort();clearTimeout(S.searchT);S.catToken={};
  S.view = 'home'; S.place = null; S.pickFor = null; S.results = null; S.incident = null;
  S.planAbort?.abort();
  setDest(null); setRoutesData([]); setJams([]); clearChips();
  render();
  sheet.set('half');
}

/* ================= Arama ================= */
function openSearch() {
  rememberScreen();
  S.view = 'search'; S.results = null;
  sheet.body.innerHTML = '';
  render();
  // Önce paneli anında yukarı al, sonra klavyeyi aç: iOS sayfayı kaydırmasın
  sheet.set('full', false);
  const q = $('q');
  q.focus({ preventScroll: true });
  bindSearch();
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
      const list = [];
      const active = () => !ac.signal.aborted && S.view === 'search';
      const merge = results => {
        if (!active()) return;
        for (const p of results) if (!list.some(x => x.name === p.name && near(x, p))) list.push(p);
        list.sort((a, b) => Number(b.src === 'tt') - Number(a.src === 'tt'));
        if (list.length) { S.results = list.slice(0, 14); render(); }
      };
      const jobs = [api.search(q, center, ac.signal).then(merge)];
      if (key()) jobs.unshift(traffic.search(key(), q, center, ac.signal).then(merge));
      await Promise.allSettled(jobs);
      if (!active()) return;
      if (!list.length || now) merge(await api.searchFallback(q, ac.signal).catch(() => []));
      if (active()) { S.results = list.slice(0, 14); render(); }
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
    goHome();if(S.pickReturnPlaces){S.pickReturnPlaces=false;S.sideReturnSettings=!!S.pickPlacesReturnSettings;S.pickPlacesReturnSettings=false;roadside.places();}if(S.pickReturnSettings){S.pickReturnSettings=false;ACT.openSettings();}
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
  if(S.view!=='place')rememberScreen();
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
function openRoutes(dest, preferredTrip = null) {
  if(!S.nav&&S.view!=='routes')rememberScreen();
  roadside.close();S.originalDest={...dest};const entrance=S.travel==='auto'?store.entrances.find(e=>dist(e.goal.lon,e.goal.lat,dest.lon,dest.lat)<80):null;if(entrance)dest={...dest,...entrance.point,name:dest.name+' · araç girişi'};roadside.checkReminders(S.originalDest);
  S.preferredTrip = preferredTrip || store.savedRoutes.find(t=>t.dest&&dist(t.dest.lon,t.dest.lat,dest.lon,dest.lat)<100&&(t.mode||'auto')===S.travel) || null;
  document.activeElement?.blur?.();
  S.dest = { name: dest.name, sub: dest.sub || '', lat: dest.lat, lon: dest.lon, kind: dest.kind || 'pin' };
  S.view = 'routes'; S.details = false; S.plannedFrom = null;
  setDest(S.dest);
  planRoutes();
  sheet.set('half');
}

function friendlyErr(e) {
  const m = String(e?.message || '');
  if(m.includes('kapalı'))return m+'. Farklı bir güzergâh gerekli.';
  if (/path|unreachable|No suitable edges|connect|distance/i.test(m)) {
    return 'Bu hedefe bu şekilde gidilebilecek bir yol bulunamadı.' + (store.avoids.length && S.travel === 'auto' ? ' Kaçındığın yollardan biri engel olabilir (Ayarlar).' : '');
  }
  return 'Rota alınamadı. İnternet bağlantını kontrol edip tekrar dene.';
}

async function planRoutes() {
  roadside.invalidate();
  S.planAbort?.abort();
  const ac = S.planAbort = new AbortController();
  S.routes = []; S.routeErr = null; S.sel = 0;
  render();
  setRoutesData([]); setJams([]); clearChips();
  const from = PREVIEW ? (S.pos||await waitPos()) : await freshPosition();
  if (ac.signal.aborted) return;
  if (!from) { S.routeErr = 'Konumun alınamadı. Konum iznini kontrol et.'; render(); return; }
  try {
    const tf = trafficProvider();
    const routes = await api.planRoutes(from, S.dest, store.prefs, [...store.avoids,...(S.resumeAvoids||[])], ac.signal, S.travel, tf, S.preferredTrip?.coords,S.resumeStops||[]);
    S.resumeStops=null;
    if (ac.signal.aborted || S.view !== 'routes') return;
    S.routes = routes; S.plannedFrom = { ...from };
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
  const fs = S.routes.flatMap((r, i) => i >= 2 && !S.details && i !== S.sel ? [] : [line(r.coords, { i, sel: i === S.sel })]);
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
async function startNav(i, simulate = false) {
  simulate = simulate || PREVIEW;
  let route = S.routes[i];
  if (!route || S.starting || S.nav) return;
  S.starting = true;
  const button = document.querySelector('.start-route');
  if (button) { button.disabled = true; button.textContent = 'Konum güncelleniyor…'; }
  if (!simulate) {
    const from = await freshPosition();
    if (!from || S.view !== 'routes' || S.routes[i] !== route) { S.starting = false; if (button) { button.disabled = false; button.textContent = 'Başlat'; } toast('Güncel ve doğru konum bekleniyor. Tekrar dene.'); return; }
    if (!S.plannedFrom || dist(from.lon, from.lat, S.plannedFrom.lon, S.plannedFrom.lat) > 35) {
      const destination = S.dest;
      try {
        route = await api.reroute(from, destination, route, 0, store.prefs, store.avoids, trafficProvider(), undefined, route.stops || []);
        if (S.view !== 'routes' || S.dest !== destination) { S.starting = false; return; }
      } catch { S.starting = false; if (button) { button.disabled = false; button.textContent = 'Başlat'; } toast('Güncel konumdan rota alınamadı. Tekrar dene.'); return; }
    }
  }
  S.starting = false;
  addRecent(S.dest);
  if (!simulate) { store.activeNav = { dest: S.dest, t: Date.now() }; save(); }
  S.navRoute = route;
  S.nav = new Navigator(route);
  replanner.cancel();camera.reset();S.tripAvoids=S.resumeAvoids||[];S.resumeAvoids=null;S.walkGoal=S.resumeWalkGoal||null;S.resumeWalkGoal=null;S.activeDwell=S.resumeDwell||null;S.resumeDwell=null;S.stops=route.stops||[];S.overview=false;S.lastDrawAlong=-1;S.buildingAlong=-1000;
  S.rerouting = false;
  S.follow = true; S.arrowFor = -1; S.arrived = false; S.bannerFor = null;
  S.navInc = []; S.said = new Set(); S.remainingTraffic=null;S.trafRatio = route.trafficRatio || null;
  S.navCams = route.mode === 'auto' ? routeCams(route) : [];
  S.trip = { t0: Date.now(), m: 0, last: null, origin: { ...(S.pos || {}), name: S.where?.road || S.where?.hood || 'Başlangıç konumu' }, routes: [{ route, from: null, to: null }], track: [], simulated: simulate };
  S.prog = null;
  $('arrive').hidden = true;
  document.body.classList.remove('arrived');
  const eta = G.fmtClock(new Date(Date.now() + rtime(route) * 1000));
  S.navIntro = [G.storyShort(route.story), `Tahmini varış ${eta}.`].filter(Boolean).join(' ');
  document.body.classList.add('navigating');
  for (const id of ['nav', 'nav-side', 'nav-bottom', 'speed-badge']) $(id).hidden = false;
  $('nav-recenter').hidden = true;
  $('nav-alert').hidden = true;
  $('speed-limit').hidden = true;
  closeNavMenu();
  $('nav-bottom').classList.toggle('walk', route.mode !== 'auto');
  updateMuteBtn();
  $('nav-overview').innerHTML = I.loc;
  $('nav-overview').dataset.act = 'recenter';
  $('nav-overview').setAttribute('aria-label', 'Konuma dön');
  $('overview-icon').innerHTML = I.route;
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
  diagnostics.start(adaptQuality);
  S.timers.push(setInterval(navHealth,1000));
  if (simulate) {
    fixes.reset();
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
    if (!S.nav || S.navRoute !== r) return;
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
    if (S.nav && S.navRoute === r) { S.remainingTraffic={baseSeconds:rem.time,seconds:t.trafficTime,at:t.trafficCheckedAt};setJams(t.jams); }
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
  if(!$('roadside').hidden&&!wide()){const top=Math.ceil($('nav').getBoundingClientRect().bottom+14),bottom=Math.ceil($('roadside').getBoundingClientRect().height+28);return {top,bottom:Math.min(bottom,H-top-80),left:0,right:0};}
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

function navTick(p,processingStart=performance.now()) {
  if (!S.nav || S.arrived) return;
  const st = S.nav.update(p); S.lastState=st;
  const r = S.navRoute;
  const walk = r.mode !== 'auto';
  const pp = st.position, hd = pp.heading;
  S.displayPosition = pp;
  if (S.puck) { puckAt([pp.lon, pp.lat]); S.puck.setRotation(hd); }
  // Yolculuk özeti için gerçekten gidilen mesafe
  if (S.trip) {
    const leg = S.trip.routes.at(-1);
    if (st.matched && leg) { if (leg.from == null) leg.from = st.along; leg.to = st.along; }
    if ((p.acc || 10) < 50) {
      const last = S.trip.last, d = last ? dist(last.lon, last.lat, pp.lon, pp.lat) : 0;
      if (!last || d > Math.max(5, (p.acc || 10) * .4)) {
        if (last && d < 300) S.trip.m += d;
        S.trip.last = { lon: pp.lon, lat: pp.lat };
        S.trip.track.push([pp.lon, pp.lat]);
        if (S.trip.track.length > 5000) S.trip.track = S.trip.track.filter((_, i) => i % 2 === 0);
      }
    }
  }

  if(S.lastDrawAlong<0||Math.abs(st.along-S.lastDrawAlong)>3){
    setRoutesData([line(sliceAlong(r.coords,r.cum,st.along,st.total),{i:0,sel:true})]);
    S.map?.getSource('yolcu-traveled')?.setData({type:'FeatureCollection',features:st.along>2?[line(sliceAlong(r.coords,r.cum,0,st.along),{})]:[]});
    S.lastDrawAlong=st.along;
  }
  if(S.mapReady&&Math.abs(st.along-S.buildingAlong)>100){setRouteBuildings(S.map,r,st.along,diagnostics.quality);S.buildingAlong=st.along;}
  if (st.upIdx !== S.arrowFor) { S.arrowFor = st.upIdx; maneuverArrow(st.up); }
  if(st.matched)renderBanner(st);else renderUncertain(st);


  if(S.activeDwell&&(p.speed||0)>2&&dist(p.lon,p.lat,S.activeDwell.lon,S.activeDwell.lat)>70)S.activeDwell=null;
  const dwellSeconds=remainingDwellSeconds(S.stops,S.activeDwell);
  const timing=navigationTiming(r,st,dwellSeconds,S.remainingTraffic);S.timing=timing;S.lastRemS=timing.baseSeconds;S.remainingSeconds=timing.totalSeconds;
  $('nav-timing').textContent=timing.live?'Canlı trafik dahil':'Tahmini süre · canlı trafik güncel değil';
  $('nav-eta').textContent = G.fmtClock(new Date(Date.now() + timing.totalSeconds * 1000));
  setDur(timing.totalSeconds);
  setKm(st.remM);
  const kmh = Math.round((p.speed || 0) * 3.6);
  $('speed-val').textContent = kmh;

  let say = st.say;
  if (say && S.navIntro) { say = `${S.navIntro} ${say}`; S.navIntro = null; }
  const cam = store.prefs.radar && st.matched ? S.navCams.find(c => c.along > st.along - 15 && c.along - st.along < 1000) : null;
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
  const inc = st.matched ? S.navInc.find(i => i.endAlong > st.along && i.along - st.along < 4000) : null;
  if (cam) {
    const dd = Math.max(0, cam.along - st.along);
    al.hidden = false;
    al.className = `nav-alert${over ? ' over' : ''}`;
    al.innerHTML = `<span class="na-ic">${I.camera}</span><span><b>Radar</b> · ${G.fmtDist(dd)}${cam.max ? ` · sınır ${cam.max}` : ''}</span>`;
    if (dd < 550 && !S.said.has('cam' + cam.id)) {
      S.said.add('cam' + cam.id);
      voice.beep(over ? 3 : 2);
      const t = `Radar var${cam.max ? `, hız sınırı ${cam.max}` : ''}.`;
      say = say ? `${say} ${t}` : t;
    }
  } else if (inc) {
    const dd = Math.max(0, inc.along - st.along);
    const dm = Math.round(inc.delay / 60);
    const icon = { warn: I.warn, car: I.car, cone: I.cone, closed: I.noentry }[incGlyph(inc)] || I.warn;
    al.hidden = false;
    al.className = `nav-alert m${Math.min(inc.mag, 3)}`;
    al.innerHTML = `<span class="na-ic">${icon}</span><span><b>${esc(inc.label)}</b> · ${dd>0?G.fmtDist(dd):'bu kesimde'}${dm >= 1 ? ` · olay toplamı ${dm} dk` : ''}</span>`;
    if (dd < 1500 && !S.said.has('inc' + inc.id)) {
      S.said.add('inc' + inc.id);
      voice.beep(1);
      const t = `Dikkat, ileride ${inc.label.toLocaleLowerCase('tr')} var${dm >= 1 ? `; olayın toplam gecikmesi ${dm} dakika, yolculuğuna etkisi farklı olabilir` : ''}.`;
      say = say ? `${say} ${t}` : t;
    }
  } else al.hidden = true;

  if (say && document.visibilityState === 'visible') voice.say(say);
  if(S.stops?.length){const stop=S.stops[0];if((st.along>=stop.along-25&&dist(p.lon,p.lat,stop.lon,stop.lat)<55)||st.along>stop.along+50){S.stops.shift();if(stop.dwellMinutes>0)S.activeDwell={lon:stop.lon,lat:stop.lat,until:Date.now()+stop.dwellMinutes*60000};saveActiveNav();toast('Ara durağa ulaşıldı');}}
  if (st.arrived) { arrive(); return; }
  if(st.reroute)doReroute();
  navHealth();

  const nb = Math.round($('nav').getBoundingClientRect().bottom + 12);
  if (nb !== S.sideTop) { S.sideTop = nb; $('nav-side').style.top = nb + 'px'; }

  if(S.follow&&S.map){
    const target=camera.target({...p,heading:hd},st,performance.now(),store.prefs.tilt);
    S.map.stop();S.map.easeTo({center:[pp.lon,pp.lat],...target,easing:t=>t,padding:navPadding()});
  }
  if(S.map&&!S.renderPending){S.renderPending=true;const begin=performance.now();S.map.once('render',()=>{S.renderPending=false;diagnostics.record(diagnostics.render,performance.now()-begin);});}
  diagnostics.sampleFix(p,processingStart);

}

function trafficProvider(){
  if(!key())return null;
  const provider=(r,signal)=>traffic.routeTraffic(key(),r,signal);
  provider.checkClosures=async(routes,signal)=>{
    try {const incidents=await traffic.incidents(key(),traffic.bboxOf(routes.flatMap(r=>r.coords),.003),signal);for(const r of routes)r.closed=traffic.onRoute(incidents.filter(i=>i.cat===8),r).length>0;}
    catch(e){if(e.name==='AbortError')throw e;}
  };
  return provider;
}
function saveActiveNav(){if(!S.nav||S.sim)return;store.activeNav={dest:S.dest,stops:S.stops||[],walkGoal:S.walkGoal||null,activeDwell:S.activeDwell||null,tripAvoids:S.tripAvoids||[],t:Date.now()};save();}
function renderUncertain(st){
  S.bannerFor=null;$('nav-icon').innerHTML=I.locLine;$('nav-dist').textContent=st.offRoute?'Rota dışında':'Konum doğrulanıyor';$('nav-action').textContent=st.offRoute?'Yeni güzergâh aranıyor':'GPS ölçümü bekleniyor';$('nav-road').textContent='';$('nav-then').hidden=true;setArrowData([]);S.arrowFor=-1;
}
function adaptQuality(level){if(S.mapReady){setRouteBuildings(S.map,S.navRoute,S.nav?.along||0,level);if(S.nav&&S.map.getLayer('yolcu-hillshade'))S.map.setLayoutProperty('yolcu-hillshade','visibility','none');}}
function navHealth(){
  if(!S.nav)return;
  const quality=fixes.status(),reason=!navigator.onLine?'İnternet bağlantısı bekleniyor':quality||(S.rerouting?'Rota yenileniyor':S.replanMessage||'');
  const el=$('nav-status');el.hidden=!reason;el.textContent=reason;el.className='nav-status';
  if(quality){$('nav-timing').textContent='Konum bekleniyor · son tahmin';$('speed-val').textContent='—';if(S.lastState)renderUncertain({...S.lastState,offRoute:false});}
  if(S.diagnostics){const data=diagnostics.snapshot();if(S.timing)data.timing={...S.timing.evidence,remainingBaseSeconds:S.timing.baseSeconds,remainingDriveSeconds:S.timing.driveSeconds,dwellSeconds:S.timing.dwellSeconds,totalSeconds:S.timing.totalSeconds,live:S.timing.live};data.fixAgeMs=S.pos?Math.max(0,Date.now()-S.pos.t):null;data.deviationMs=S.lastState?.deviationMs;data.replans=replanner.metrics.slice(-3);data.inFlight=!!replanner.controller;data.gpsWatches=S.geoWatch==null?0:1;data.navTimers=S.timers.length;$('diagnostics-data').textContent=JSON.stringify(data,null,2);}
}
function commitRoute(r){
  if(!S.nav)return false;
  const current=S.pos,probe=new Navigator(r).snap(current);
  if(probe.d>45)return false;
  roadside.invalidate();
  S.remainingTraffic=null;S.navRoute=r;setDest(S.dest);S.stops=r.stops||[];S.trafRatio=r.trafficRatio||null;S.lastRemS=r.time;
  S.trip?.routes.push({route:r,from:null,to:null});if(S.trip.routes.length>30)S.trip.routes.shift();
  S.nav.setRoute(r);S.bannerFor=null;S.arrowFor=-1;S.lastDrawAlong=-1;S.buildingAlong=-1000;S.replanMessage='';
  S.navCams=r.mode==='auto'?routeCams(r):[];S.navInc=[];setJams(r.jams);drawRadars();saveActiveNav();
  if(S.sim){const factor=S.sim.factor;S.sim.stop();fixes.reset();S.sim=new Simulator(r,p=>onPos(p),factor);}
  navTick(current);if(S.sim)S.sim.d=S.nav.along;if(key())refreshNavIncidents();return true;
}
const replanner=new Replanner({
  getContext:()=>S.nav&&S.pos&&Date.now()-S.pos.t<5000&&!S.arrived?{from:{...S.pos},to:{...S.dest},route:S.navRoute,along:S.nav.along,prefs:{...store.prefs},avoids:[...structuredClone(store.avoids),...(S.tripAvoids||[])],stops:structuredClone(S.stops||[]),confirmedAt:S.lastState?.confirmedAt,deviationMs:S.lastState?.deviationMs}:null,
  request:async(c,signal)=>{if(!navigator.onLine)throw new Error('offline');return api.reroute(c.from,c.to,c.route,c.along,c.prefs,c.avoids,trafficProvider(),signal,c.stops);},
  commit:commitRoute,
  status:message=>{S.rerouting=message==='Rota yenileniyor';S.replanMessage=message;navHealth();}
});
function doReroute(){return replanner.run('deviation');}

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
  replanner.cancel();diagnostics.stop();
  closeNavMenu();
  // Varış özeti: ne zaman vardın, ne kadar sürdü, kaç km, ortalama hız
  const tr = S.trip || { t0: Date.now(), m: 0 };
  const secs = Math.max(1, (Date.now() - tr.t0) / 1000);
  const meters = tr.m;
  if (!tr.simulated) {
    const compact = (coords, limit = 1200) => coords.filter((_, i) => i === 0 || i === coords.length - 1 || i % Math.max(1, Math.ceil(coords.length / limit)) === 0).map(c => c.map(v => +v.toFixed(6)));
    const segments = (tr.routes || []).flatMap(leg => {
      if (leg.from == null || leg.to == null) return [];
      const r = leg.route;
      return (r.story?.length ? r.story : [{ name: 'Güzergâh', b: 0, e: r.coords.length - 1 }]).flatMap(seg => {
        const from = Math.max(leg.from, r.cum[seg.b]), to = Math.min(leg.to, r.cum[seg.e]);
        return to - from < 10 ? [] : [{ name: seg.name || 'Ara sokaklar', m: to - from, coords: compact(sliceAlong(r.coords, r.cum, from, to), 120) }];
      });
    });
    const completed={ mode: S.navRoute.mode, origin: tr.origin, dest: { ...S.dest }, startedAt: tr.t0, endedAt: Date.now(), duration: secs, distance: tr.m, coords: compact(tr.track), segments, id:crypto.randomUUID() };
    addTrip(completed);S.completedTrip=completed;
  }
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
    ${S.navRoute.mode==='auto'?`<button class="btn" data-act="openPark">Park ettim${S.walkGoal?' · yürüyüşe devam':''}</button>`:''}
    ${!tr.simulated?`<button class="btn like-route" data-act="likeCompleted">${I.star} Bu güzergâhı beğendim</button>`:''}
    <button class="btn primary" data-act="endNav">Tamam</button>`;
  a.hidden = false;
  document.body.classList.add('arrived');
  clearTimeout(S.arriveT);
  S.arriveT = setTimeout(() => { if (S.nav && S.arrived) endNav(); }, 45000);
}

function endNav() {
  roadside.close();S.walkGoal=null;S.activeDwell=null;S.tripAvoids=[];
  replanner.cancel();S.stopAbort?.abort();S.stopVersion=(S.stopVersion||0)+1;diagnostics.stop();camera.reset();S.stops=[];S.replanMessage='';S.rerouting=false;
  $('diagnostics').hidden=true;
  const simulated = !!S.sim;
  S.sim?.stop(); S.sim = null;
  if (simulated) { S.pos = S.realPos || null;fixes.reset();if(S.pos)fixes.last=S.pos; }
  S.nav = null; S.navRoute = null; S.bannerFor = null; S.navInc = []; S.navCams = [];
  S.timers.forEach(clearInterval); S.timers = [];
  document.body.classList.remove('navigating');
  closeNavMenu();
  for (const id of ['nav', 'nav-side', 'nav-bottom', 'nav-recenter', 'nav-street', 'sim-badge', 'arrive', 'speed-badge']) $(id).hidden = true;
  document.body.classList.remove('arrived');
  clearTimeout(S.arriveT);
  S.trip = null; S.arrived = false;
  setPuckNav(false);
  keepAwake(false);
  voice.stop();
  store.activeNav = null; save();
  S.map?.getSource('yolcu-traveled')?.setData(EMPTY);
  setRoutesData([]); setArrowData([]); setJams([]); setDest(null);
  applyTheme();
  drawRadars();
  if (S.map) {
    S.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const c = S.pos ? [S.pos.lon, S.pos.lat] : S.map.getCenter();
    S.map.easeTo({ center: c, pitch: store.prefs.tilt ? 48 : 0, bearing: 0, zoom: store.prefs.tilt ? 16.4 : 15.5, duration: 900 });
  }
  if (S.pos) updatePuck(S.pos);
  renderWherePill();
  S.view = 'home'; S.dest = null; S.routes = [];
  render();
  sheet.set('half');
  loadIncidents(true);
  S.helloAt = null; S.eta = {}; refreshHello();
}

function updateMuteBtn() {
  const b = $('nav-mute');
  b.innerHTML = store.prefs.soundMode === 'silent' ? I.mute : I.speaker;
  b.classList.toggle('off', store.prefs.soundMode === 'silent');
  b.setAttribute('aria-label', 'Ses: ' + SOUND_MODES[store.prefs.soundMode]);
}

function renderNavMenu() {
  const P = store.prefs;
  $('nav-menu').innerHTML = `
    <div class="list">
      <button class="row" data-act="overview"><span class="row-icon">${I.route}</span><span class="row-main"><span class="row-title">Tüm rotayı gör</span></span></button>
      <button class="row" data-act="avoidNextTurn">${placeIcon('road')}<span class="row-main"><span class="row-title">Bu dönüşü istemiyorum</span></span></button>
      <button class="row" data-act="openPark">${placeIcon('parking')}<span class="row-main"><span class="row-title">${S.lastState?.remM<1000?'Hedef yakınında park':'Park & araç'}</span></span></button>
      ${S.activeDwell&&S.activeDwell.until>Date.now()?`<button class="row" data-act="finishDwell">${placeIcon('recent')}<span class="row-main"><span class="row-title">Duraklamayı bitir</span><span class="row-sub">Bekleme süresini kalan yolculuktan çıkar</span></span></button>`:''}
      ${(S.stops||[]).map((stop,i)=>`<button class="row" data-act="removeStop" data-i="${i}">${placeIcon(stop.kind)}<span class="row-main"><span class="row-title">${esc(stop.name)}</span><span class="row-sub">Ara durağı kaldır</span></span></button>`).join('')}
      <button class="row" data-act="navTilt">${placeIcon('road')}<span class="row-main"><span class="row-title">${store.prefs.tilt?'2D harita':'3D harita'}</span></span></button>
      ${soundControls()}
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
<label class="row"><span class="row-main"><span class="row-title">Arazi ve gölgeler</span><span class="row-sub">Binalardan bağımsız yeryüzü ayrıntıları</span></span><input type="checkbox" class="switch" data-pref="relief" ${P.relief?'checked':''}></label>
      <label class="row"><span class="row-main"><span class="row-title">Trafik</span><span class="row-sub">${key() ? 'Yavaş ve sıkışık yollar, kazalar' : 'Güvenli trafik sunucusu bağlantısı bekleniyor'}</span></span><input type="checkbox" class="switch" data-pref="traffic" ${P.traffic && key() ? 'checked' : ''} ${key() ? '' : 'disabled'}></label>
      <label class="row"><span class="row-main"><span class="row-title">Radarlar</span><span class="row-sub">EDS ve hız kameraları</span></span><input type="checkbox" class="switch" data-pref="radar" ${P.radar ? 'checked' : ''}></label>
    </div>`;
}

/* ================= Ayarlar ================= */
const SETTINGS_SECTIONS={
 appearance:{title:'Harita ve görünüm',icon:'layers',groups:['Harita teması','Uygulama simgesi'],sub:'Tema, harita ve uygulama simgesi'},
 sound:{title:'Ses ve radar',icon:'speaker',groups:['Ses','Radar','Elle işaretlenmiş radarlar'],sub:'Sessizlik, yönlendirme ve uyarılar'},
 routing:{title:'Rota tercihleri',icon:'road',groups:['Rota tercihleri'],sub:'Ana yollar, eğim, yüzey ve ücretler'},
 journey:{title:'Yerlerim ve yolculuk',icon:'star',groups:['Ev ve iş','Yol üstü & kişisel yardım','Benim yerlerim','Kaçındığın yollar'],sub:'Ev, iş, duraklar ve hatırlatmalar'},
 connections:{title:'Trafik bağlantısı',icon:'route',groups:['Trafik ve işletmeler'],sub:'Sunucuda tutulan servis bağlantısı'},
 privacy:{title:'Verilerim ve uygulama',icon:'download',groups:['Yedek','Hakkında'],sub:'Yedekleme, kaynaklar ve sürüm'}
};
function arrangeSettings(){
 const body=$('settings-body'),groups=[];let current;
 for(const node of [...body.children]){if(node.classList.contains('group-title')){current={title:node.textContent,nodes:[]};groups.push(current);}current?.nodes.push(node);}
 const section=SETTINGS_SECTIONS[S.settingsSection];
 if(section){body.replaceChildren(...groups.filter(g=>section.groups.includes(g.title)).flatMap(g=>g.nodes));$('settings').querySelector('.page-head h1').textContent=section.title;$('settings').querySelector('[data-act=closeSettings]').textContent='Geri';return;}
 const rows=Object.entries(SETTINGS_SECTIONS).map(([id,c])=>`<button class="row" data-act="openSettingsSection" data-section="${id}"><span class="row-icon">${I[c.icon]}</span><span class="row-main"><span class="row-title">${c.title}</span><span class="row-sub">${c.sub}</span></span>${I.chevron}</button>`).join('');
 const theme=groups.find(g=>g.title==='Harita teması');
 body.innerHTML=`<div class="settings-overview"><p class="eyebrow">Yolcu</p><h2>Yolculuğun sana göre.</h2></div><div id="quick-theme"></div><div class="list settings-menu">${rows}</div><div class="group-title">Yolculuk asistanı</div><div class="list"><button class="row" data-act="openModels"><span class="row-icon">${I.star}</span><span class="row-main"><span class="row-title">Yapay zekâ ve modeller</span><span class="row-sub">Hesabındaki modeller · güvenli bağlantı</span></span>${I.chevron}</button></div><div class="group-title">Hızlı ses seçimi</div><div class="list plain">${soundControls()}</div>`;
 if(theme)$('quick-theme').append(...theme.nodes);
}

function modelRows(data,query=''){
 const list=(data?.models||[]).filter(m=>(m.id+' '+m.label).toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))).sort((a,b)=>Number(b.id===data.model)-Number(a.id===data.model));
 return list.map(m=>`<button class="model-option" role="radio" aria-checked="${m.id===data.model}" data-act="chooseModel" data-model="${esc(m.id)}" ${data.modelLocked||S.modelSaving?'disabled':''}><span class="model-mark">${m.id===data.model?I.check:''}</span><span><b>${esc(m.label||m.id)}</b>${m.label&&m.label!==m.id?`<small>${esc(m.id)}</small>`:''}</span>${m.id===data.model?'<em>Seçili</em>':''}</button>`).join('')||'<p class="model-empty">Bu aramaya uyan model yok.</p>';
}
function renderModels(){
 if(S.settingsSection!=='models')return;
 $('settings').querySelector('.page-head h1').textContent='Yolculuk asistanı';$('settings').querySelector('[data-act=closeSettings]').textContent='Geri';
 const data=S.aiCatalog,locked=data?.modelLocked;
 $('settings-body').innerHTML=`<div class="settings-intro"><span class="assistant-emblem">${I.star}</span><p class="eyebrow">YapayZekaLab</p><h2>İsteğini anlasın.<br>Kararı sen ver.</h2><p>Yalnız yazdığın istek çözümlenir. Konum akışın paylaşılmaz; model kullanılamasa da yol tarifi ve ihtiyaç araması devam eder.</p></div><div class="model-status" role="status">${S.modelsLoading?'Hesabındaki modeller yükleniyor…':S.modelError?esc(S.modelError):data?.models?.length?`${data.models.length} kullanılabilir model${locked?' · sunucudan yönetiliyor':''}`:data?.models?'Bu hesapta model listelenmiyor.':'Henüz model listesi alınmadı.'}</div>${locked?'<p class="model-notice">Model sunucu ayarıyla sabitlenmiş. Uygulamadan değiştirmek için sunucu yöneticisinin AI_MODEL sabitlemesini kaldırması gerekiyor.</p>':''}${data?.models?.length?`<label class="model-search">${I.search}<input id="model-query" type="search" placeholder="Modellerde ara" aria-label="Modellerde ara"></label><div id="model-options" class="model-options" role="radiogroup" aria-label="Hesabındaki modeller">${modelRows(data)}</div>`:''}<button class="btn secondary" data-act="refreshModels" ${S.modelsLoading||!hasServerAPI()?'disabled':''}>${I.refresh||I.route} Listeyi yenile</button><details class="model-details"><summary>Bağlantı ve gizlilik</summary><p>Anahtar bu uygulamaya veya yedeğine konmaz; sunucuda tutulur. GitHub Pages üzerinde sunucu özellikleri ayrıca yayımlanmış bir backend gerektirir.</p></details>`;
 $('model-query')?.addEventListener('input',e=>{$('model-options').innerHTML=modelRows(S.aiCatalog,e.target.value);});
 $('settings-body').scrollTop=0;
}
async function loadModels(){
 S.modelsController?.abort();const ac=S.modelsController=new AbortController();const version=S.modelsVersion=(S.modelsVersion||0)+1;S.modelError=null;S.modelsLoading=true;
 if(!hasServerAPI()){S.modelsLoading=false;S.modelError='Bu statik yayında model sunucusu bağlı değil. Normal arama ve yol tarifi kullanılabilir.';renderModels();return;}
 renderModels();
 try{const r=await fetch('/api/ai/models',{signal:AbortSignal.any([ac.signal,AbortSignal.timeout(15000)])});if(!r.headers.get('content-type')?.includes('application/json'))throw new Error('Bu yayında model sunucusu bağlı değil. Normal arama ve yol tarifi kullanılabilir.');const data=await r.json();if(!r.ok)throw new Error(data.error||'Model listesi alınamadı');if(version!==S.modelsVersion)return;S.aiCatalog=data;}
 catch(e){if(version!==S.modelsVersion)return;S.aiCatalog=null;S.modelError=e.name==='TimeoutError'?'Bağlantı zaman aşımına uğradı. Yeniden deneyebilirsin.':e.message;}
 finally{if(version===S.modelsVersion){S.modelsLoading=false;renderModels();}}
}

function renderSettings() {
  if(S.settingsSection==='models')return renderModels();
  $('settings').querySelector('.page-head h1').textContent='Ayarlar';$('settings').querySelector('[data-act=closeSettings]').textContent='Kapat';
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

    <div class="group-title">Ses</div>
    <div class="list plain">${soundControls()}</div>
    <p class="group-foot">Sessiz modda ses sistemi başlatılmaz. Sesli modlarda kısa anonslar diğer seslerle karışacak şekilde istenir; son davranış iOS ve Bluetooth aygıtına bağlıdır.</p>
    <div class="group-title">Radar</div><div class="list plain"><label class="row"><span class="row-main"><span class="row-title">Haritada radar uyarıları</span><span class="row-sub">${S.official.length} EDS · ${S.cams.length} çevredeki radar</span></span><input type="checkbox" class="switch" data-pref="radar" ${P.radar ? 'checked' : ''}></label></div>${oldRadars}

    <div class="group-title">Trafik ve işletmeler</div><div class="list plain"><div class="row">${placeIcon('road')}<span class="row-main"><span class="row-title">Güvenli sunucu bağlantısı</span><span class="row-sub wrap">${key()?'Sunucuda yapılandırıldı · servis erişimi istekte doğrulanır':'Temel harita ve rota kullanılabilir. Canlı trafik için sunucu bağlantısı gerekiyor.'}</span></span></div><button class="row" data-act="testTraffic" ${key()?'':'disabled'}>Bağlantıyı doğrula</button></div><p id="traffic-connection-result" class="group-foot" role="status">${esc(S.trafficTest||'')}</p>

    <div class="group-title">Uygulama simgesi</div>
    <div class="icon-grid">${icons}</div>
    <div class="list plain" style="margin-top:12px"><button class="row accent" data-act="applyIcon"><span class="row-icon">${I.copy}</span><span class="row-main"><span class="row-title">Simgeyi telefona uygula</span><span class="row-sub wrap">Bağlantıyı kopyalar ve adımları gösterir</span></span></button></div>
    <div id="icon-steps"></div>

    <div class="group-title">Rota tercihleri</div>
    <div id="route-preferences">${prefsList('auto')}</div>

    <div class="group-title">Ev ve iş</div>
    <div class="list plain">${favRow('home', 'Ev', 'home')}${favRow('work', 'İş', 'work')}</div>

    <div class="group-title">Yol üstü & kişisel yardım</div><div class="list plain"><button class="row" data-act="openRoadside">Yol üstü tercihleri ve ihtiyaçlar</button><button class="row" data-act="personalPlaces">Benim yerlerim & hatırlatmalar</button><button class="row" data-act="openPark">Park konumu & Arabaya dön</button><button class="row" data-act="pickEntrance" data-v="home">Ev için araç girişi kaydet</button><button class="row" data-act="pickEntrance" data-v="work">İş için araç girişi kaydet</button></div>
    <div class="group-title">Yolculuk asistanı</div><div class="list plain"><button class="row" data-act="openModels">${placeIcon('star')}<span class="row-main"><span class="row-title">Yapay zekâ ve modeller</span><span class="row-sub">Hesabındaki modeller · güvenli sunucu bağlantısı</span></span>${I.chevron}</button></div>
    <div class="group-title">Benim yerlerim</div>
    <div class="list plain">${places}</div>

    <div id="avoided-roads" class="group-title">Kaçındığın yollar</div>
    <div class="list plain">${avoids}</div>
    <p class="group-foot">Haritada bir yola basılı tut ve “Bu yoldan beni geçirme”ye dokun.</p>

    <div class="group-title">Yedek</div>
    <div class="list plain">
      <button class="row" data-act="backup"><span class="row-icon">${I.download}</span><span class="row-main"><span class="row-title">Yedeği indir</span></span></button>
      <button class="row" data-act="restore"><span class="row-icon">${I.upload}</span><span class="row-main"><span class="row-title">Yedekten geri yükle</span></span></button>
    </div>
    <p class="group-foot">Yerler, park konumu ve tercihler bu cihazda saklanır. Modelle çözümlemeyi seçtiğinde yazdığın istek sağlayıcıya gönderilir.</p>

    <div class="group-title">Hakkında</div>
    <div class="list plain"><div class="row"><span class="row-main"><span class="row-title">Yolcu · ${RELEASE}</span><span class="row-sub wrap">Harita © OpenStreetMap katkıcıları, OpenFreeMap. Arazi © Mapterhorn. Uydu © Esri, Maxar. Rota: Valhalla (FOSSGIS). Arama: Photon, Nominatim${key() ? ', TomTom' : ''}. Hava: Open‑Meteo. Radar: EGM EDS Haritası, OpenStreetMap.</span></span></div></div>`;

  arrangeSettings();
}

function applyIconLink() {
  const link = document.querySelector('link[rel=apple-touch-icon]');
  if (link) link.href = `icons/${store.prefs.icon || 'komur'}-180.png`;
}

function setTilt(on) {
  store.prefs.tilt = on; save();
  if (!S.map) return;
  setTerrain(S.map, on && store.prefs.relief && !S.nav);
  const z = S.map.getZoom();
  S.map.easeTo({ pitch: on ? 48 : 0, zoom: on ? Math.max(z, 15.8) : z, bearing: on ? S.map.getBearing() : 0, duration: 900 });
}

function soundControls() {
  return Object.entries(SOUND_MODES).map(([mode, label]) => `<button class="row sound-option" data-act="soundMode" data-v="${mode}" aria-pressed="${store.prefs.soundMode === mode}"><span class="row-icon">${mode === 'silent' ? I.mute : mode === 'alerts' ? I.camera : I.speaker}</span><span class="row-main"><span class="row-title">${label}</span></span><span class="sound-check">${store.prefs.soundMode === mode ? I.check : ''}</span></button>`).join('');
}
function openTrip(t) {
  if (!t) return;
  S.tripView = t; S.view = 'history'; render(); sheet.set('half');
  setRoutesData(t.coords?.length > 1 ? [line(t.coords, { sel: true })] : []);
  if (t.coords?.length > 1) fitCoords(t.coords);
}
/* ================= Eylemler ================= */
const ACT = {
  openRoadside:()=>{S.sideReturnSettings=!$('settings').hidden;closeNavMenu();$('settings').hidden=true;document.body.classList.remove('settings-open');roadside.home();},openPark:()=>{S.sideReturnSettings=!$('settings').hidden;closeNavMenu();$('settings').hidden=true;document.body.classList.remove('settings-open');roadside.park();},avoidNextTurn:()=>avoidNextTurn(),
  personalPlaces:()=>{S.sideReturnSettings=!$('settings').hidden;$('settings').hidden=true;document.body.classList.remove('settings-open');roadside.places();},
  saveEntrance:()=>{const goal=S.entranceGoal;if(!goal||!S.place)return toast('Önce girişin ait olduğu hedefi seç');store.entrances=store.entrances.filter(e=>dist(e.goal.lon,e.goal.lat,goal.lon,goal.lat)>80);store.entrances.push({goal:{...goal},point:{lon:S.place.lon,lat:S.place.lat},note:S.place.name});save();S.entranceGoal=null;render();toast('Araç girişi kaydedildi');},
  pickEntrance:el=>{const goal=store[el.dataset.v];if(!goal)return toast('Önce bu hedefin konumunu kaydet');document.body.classList.remove('settings-open');$('settings').hidden=true;roadside.onPickEntrance(goal);},



  removeStop:el=>{const stops=[...(S.stops||[])];stops.splice(+el.dataset.i,1);closeNavMenu();changeStops(stops);},
  likeCompleted: el=>{if(!S.completedTrip)return;if(!store.savedRoutes.some(t=>t.id===S.completedTrip.id))toggleRouteSaved(S.completedTrip);el.textContent='Güzergâh kaydedildi';el.disabled=true;},
  navTilt:()=>{setTilt(!store.prefs.tilt);camera.reset();closeNavMenu();if(S.pos)navTick(S.pos);},
  openModels:()=>{S.settingsSection='models';renderSettings();loadModels();},
  refreshModels:()=>loadModels(),
  testTraffic:async el=>{el.disabled=true;const status=$('traffic-connection-result');if(status)status.textContent='Bağlantı doğrulanıyor…';try{await traffic.testKey('server');S.trafficTest='Doğrulandı · arama sağlayıcısı sunucudan yanıt verdi';}catch(e){S.trafficTest=e.message||'Bağlantı doğrulanamadı';}finally{el.disabled=false;if($('traffic-connection-result'))$('traffic-connection-result').textContent=S.trafficTest;}},
  chooseModel:async el=>{if(S.modelSaving)return;S.modelSaving=true;S.modelError=null;el.disabled=true;try{const r=await fetch('/api/ai/model',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:el.dataset.model}),signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Model seçilemedi');S.aiCatalog={...S.aiCatalog,model:data.model};roadside.assistant.cancel();roadside.assistant.cache.clear();toast('Model seçildi');}catch(e){S.modelError=e.name==='TimeoutError'?'Model seçimi zaman aşımına uğradı':e.message;toast(S.modelError);}finally{S.modelSaving=false;if(S.settingsSection==='models')renderModels();}},
  openSettingsSection:el=>{S.settingsSection=el.dataset.section;renderSettings();$('settings-body').scrollTop=0;},
  routePrefs:()=>{S.settingsSection='routing';ACT.openSettings();},
  avoidList: () => { S.settingsSection='journey';ACT.openSettings(); requestAnimationFrame(() => $('avoided-roads')?.scrollIntoView({ block: 'start' })); },
  allTrips: () => { S.tripView = null; S.view = 'history'; render(); sheet.set('full'); setRoutesData([]); },
  openTrip: el => openTrip(store.trips[+el.dataset.i]),
  openSavedRoute: el => openTrip(store.savedRoutes[+el.dataset.i]),
  tripGo: () => { if (S.tripView) { S.travel = S.tripView.mode || 'auto'; openRoutes(S.tripView.dest, S.tripView); } },
  saveTrip: () => { if (S.tripView) { toggleRouteSaved(S.tripView); render(); } },
  deleteTrip: () => { if (!S.tripView) return; const id = S.tripView.id; store.trips = store.trips.filter(t => t.id !== id); store.savedRoutes = store.savedRoutes.filter(t => t.id !== id); save(); ACT.allTrips(); },
  showTripSeg: el => { const seg = S.tripView?.segments[+el.dataset.i]; if (seg?.coords.length > 1) { setRoutesData([line(seg.coords, { sel: true })]); sheet.set('peek'); setTimeout(() => fitCoords(seg.coords), 80); } },
  avoidTripSeg: el => {
    const seg = S.tripView?.segments[+el.dataset.i]; if (!seg?.coords?.length) return;
    const points = Array.from({ length: Math.min(8, seg.coords.length) }, (_, i) => seg.coords[Math.min(seg.coords.length - 1, Math.round((i + .5) * seg.coords.length / Math.min(8, seg.coords.length)))]);
    const c = points[Math.floor(points.length / 2)];
    store.avoids.push({ lon: c[0], lat: c[1], name: seg.name, points, t: Date.now() }); save(); toast('Yol kesimi kaçınılan yollara eklendi');
  },
  soundMode: el => { voice.setMode(el.dataset.v); save(); updateMuteBtn(); if (!$('settings').hidden) renderSettings(); if (!$('nav-menu').hidden) renderNavMenu(); },
  cycleSheet: () => sheet.set(({ peek: 'half', half: 'full', full: 'peek' })[sheet.detent]),
  openSearch: () => openSearch(),
  backScreen:()=>backScreen(),
  cancelSearch: () => { document.activeElement?.blur?.(); backScreen();S.pickFor=null;if(S.pickReturnPlaces){S.pickReturnPlaces=false;S.sideReturnSettings=!!S.pickPlacesReturnSettings;S.pickPlacesReturnSettings=false;roadside.places();}if(S.pickReturnSettings){S.pickReturnSettings=false;ACT.openSettings();} },
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
    toast('Bu yol noktası sonraki rota hesaplarında dışlanacak');
    goHome();
  },
  closeRoutes:()=>backScreen(),
  replan: () => planRoutes(),
  travel: el => { if (S.travel === el.dataset.v) return; S.travel = el.dataset.v; planRoutes(); },
  selRoute: (el, e) => { if (e.target.closest('.go')) return; selectRoute(+el.dataset.i); },
  routeDetails: () => { S.details = !S.details; const sc = sheet.body.scrollTop; render(); sheet.body.scrollTop = sc; drawRoutes(); },
  focusSeg: el => {
    const r = S.routes[S.sel]; const s = r?.story?.[+el.dataset.i]; if (!s) return;
    const c = r.coords.slice(s.b, s.e + 1);
    sheet.set('peek');
    setTimeout(() => fitCoords(c), 80);
  },
  speakStory: () => { const r = S.routes[S.sel]; if (!r?.story) return; if (store.prefs.soundMode !== 'guidance') { toast('Dinlemek için Yönlendirme + uyarılar modunu seç'); return; } voice.say(G.storySpeech(r.story, S.dest.name)); },
  go: el => startNav(+el.dataset.i),
  preview: el => startNav(+el.dataset.i, true),
  finishDwell:()=>{S.activeDwell=null;saveActiveNav();closeNavMenu();if(S.pos)navTick(S.pos);toast('Duraklama bitirildi');},
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
  recenter: () => { S.overview=false;setPuckNav(true);camera.reset(); S.follow = true; $('nav-recenter').hidden = true; if (S.pos) navTick(S.pos); },
  overview: () => {
    if (!S.navRoute) return;
    closeNavMenu();
    S.follow = false;S.overview=true;setPuckNav(false);
    $('nav-recenter').hidden = false; $('nav-street').hidden = true;
    const r = S.navRoute, st = S.nav;
    const c = sliceAlong(r.coords, r.cum, st.along, r.lengthM);
    const top = $('nav').getBoundingClientRect().bottom + 20;
    fitCoords(c, { padding: { top, bottom: 130 + safeB(), left: wide() ? 460 : 36, right: 72 } });
  },
  toggleVoice: () => { renderNavMenu(); $('nav-menu').hidden = false; document.body.classList.add('nav-menu-open'); },
  simSpeed: () => { if (!S.sim) return; const f = [1, 3, 8]; S.sim.factor = f[(f.indexOf(S.sim.factor) + 1) % f.length]; showSimStatus(); },
  locate: () => {
    if (!S.pos) { toast('Konumun bekleniyor…'); return; }
    const tilt = store.prefs.tilt;
    S.map.easeTo({ center: [S.pos.lon, S.pos.lat], zoom: Math.max(S.map.getZoom(), tilt ? 16.4 : 16), bearing: 0, pitch: tilt ? 48 : 0, duration: 900, padding: { top: 0, bottom: wide() ? 0 : sheet.visible() * 0.5, left: wide() ? 420 : 0, right: 0 } });
  },
  toggle3d: () => setTilt(!(S.map && S.map.getPitch() > 15)),
  openLayers: () => { renderLayers(); $('layers').hidden = false; },
  closeLayers: () => { $('layers').hidden = true; },
  mapType: el => { store.prefs.mapType = el.dataset.v; save(); applyTheme(); renderLayers(); },
  openWhere: () => { rememberScreen();S.view = 'where'; render(); sheet.set('half'); },
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
    S.autoStart = true; S.resumeStops=an.stops||[];S.resumeAvoids=an.tripAvoids||[];S.resumeWalkGoal=an.walkGoal||null;S.resumeDwell=an.activeDwell||null;openRoutes(an.dest);
  },
  dismissResume: (el, e) => { e.stopPropagation(); store.activeNav = null; save(); render(); },

  openSettings: el => { if(el?.dataset?.act==='openSettings')S.settingsSection=null;document.body.classList.add('settings-open');renderSettings(); $('settings').hidden = false; $('layers').hidden = true; },
  closeSettings: () => { if(S.settingsSection){S.modelsController?.abort();S.settingsSection=null;S.modelsVersion=(S.modelsVersion||0)+1;renderSettings();return;}document.body.classList.remove('settings-open');$('settings').hidden = true; render(); },
  theme: el => { store.prefs.theme = el.dataset.v; save(); applyTheme(); renderSettings(); },
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
  setFav: el => { document.body.classList.remove('settings-open');$('settings').hidden = true; S.pickReturnSettings=true;S.pickFor = el.dataset.k; openSearch(); },
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

document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.grab-area')) { e.preventDefault(); ACT.cycleSheet(); } });

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
  store.prefs[k] = k === 'maxExtraMinutes' ? Number(e.target.value) : e.target.checked;
  save();
  if (k === 'traffic') { setFlow(); if (store.prefs.traffic) loadIncidents(true); else { S.incidents = []; drawIncidents(); } }
  else if (k === 'relief') { applyTheme(); }
  else if (k === 'radar') { if (store.prefs.radar && S.pos) loadRadars(S.pos); drawRadars(); }
  else if (S.view === 'routes' && S.dest && !S.nav) planRoutes();
  if (!$('settings').hidden) renderSettings();
});

$('file-import').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  try { importBackup(await f.text()); voice.setMode(store.prefs.soundMode); toast('Yedek geri yüklendi'); applyTheme(); renderSettings(); render(); }
  catch (err) { toast(err.message || 'Yedek okunamadı'); }
  e.target.value = '';
});

/* ================= Başlat ================= */
function readUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get('icon') && ICONS[q.get('icon')]) { store.prefs.icon = q.get('icon'); save(); }
  if (q.has('tomtom')) {
    // Discard legacy credential links without reading their value into app state.
    q.delete('tomtom');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    setTimeout(() => toast('Trafik bağlantısı artık güvenli sunucudan yönetiliyor'), 800);
  }
  const m = location.hash.match(/#r=([\w-]+)/);
  if (m && !store.home && !store.work && !store.places.length) {
    try { unpackFromLink(m[1]); setTimeout(() => toast('Ayarların geri yüklendi'), 800); } catch { }
  }
}

function boot() {
  if (PREVIEW) { store.prefs.theme = 'light'; store.prefs.soundMode = 'silent'; store.activeNav = null; }
  readUrl();
  applyIconLink();
  applyTheme();
  $('btn-locate').innerHTML = I.locLine;
  $('btn-layers').innerHTML = I.layers;
  $('btn-3d').classList.toggle('on', !!store.prefs.tilt);
  sheet.init();
  render();
  requestAnimationFrame(() => sheet.set('half', false));
  setTimeout(() => { fitScreen(); sheet.set(sheet.detent, false); }, 400);
  if(hasServerAPI())fetch('/api/services').then(r=>r.ok?r.json():{}).then(services=>{S.services=services;if(S.mapReady){setFlow();loadIncidents(true);}if(S.view==='home')render();}).catch(()=>{});
  voice.init();
  initMap();
  if(new URLSearchParams(location.search).get('diagnostics')==='1'){S.diagnostics=true;$('diagnostics').hidden=false;}
  if (PREVIEW) onPos({ lon: 27.1045, lat: 38.3695, acc: 8, speed: 0, heading: null, t: Date.now() });
  else startGeo();
  setInterval(() => {
    checkTheme();if(S.view==='routes'&&!S.nav){const scroll=sheet.body.scrollTop;render();sheet.body.scrollTop=scroll;}
    if (S.view === 'home' && !S.nav) { refreshHello(); if (sheet.detent === 'peek') { const sc = sheet.body.scrollTop; render(); sheet.body.scrollTop = sc; } }
  }, 60000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}
boot();

// Geliştirme ve test için
window.__yolcu = { S, store, onPos, replayPos:p=>onPos(p,true), startNav, sheet, diagnostics, fixes, replanner, endNav, navTick, roadside };

function previewScreen(screen){
  if(!S.mapReady){S.pendingPreview=screen;return;}
  if(S.nav)endNav();
  store.prefs.theme=screen==='drive'?'dark':'light';applyTheme();
  if(screen==='home'){goHome();if(S.pos)introFly(S.pos);}
  else{S.autoStart=screen==='drive';openRoutes({name:'Bornova',lat:38.4599,lon:27.2215,kind:'work'});}
}
if(PREVIEW)addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='yolcu-preview')return;
  if(e.data.screen==='diagnostics'){S.diagnostics=!S.diagnostics;$('diagnostics').hidden=!S.diagnostics;navHealth();return;}
  if(['home','routes','drive'].includes(e.data.screen))previewScreen(e.data.screen);
});
