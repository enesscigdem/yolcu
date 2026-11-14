// Tüm kişisel veriler sadece telefonda (localStorage) tutulur.
const isPreview = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
const KEY = isPreview ? 'yolcu.preview.v1' : 'yolcu.v1';
const CREDENTIAL_KEY = 'yolcu.tomtom.v1';


const DEFAULTS = {
  home: null,
  work: null,
  places: [],
  recents: [],
  trips: [],
  savedRoutes: [],
  avoids: [],
  activeNav: null,
  parkedCar: null,
  entrances: [],
  reminders: [],
  roadside: { fuel: 'diesel', brands: [], shortcuts: ['fuel','market','duty','break','help'], assistance: {name:'', phone:''} },
  tomtomKey: null,
  radars: [],
  prefs: {
    highways: true,   // ana yolları tercih et
    hills: true,      // yokuşlardan kaçın
    rough: true,      // bozuk yollardan kaçın
    tolls: false,     // ücretli yollardan kaçın
    voice: false,
    radar: true,
    soundMode: 'silent',
    maxExtraMinutes: 5,
    theme: 'auto',
    tilt: true,          // 3B görünüm
    traffic: true,       // trafik katmanı (anahtar varsa)
    mapType: 'standard', // standard | satellite
    voiceEngine: 'system', // system | fahrettin | fettah | dfki
    icon: 'komur'
  }
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(CREDENTIAL_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    const merged = { ...structuredClone(DEFAULTS), ...d, prefs: { ...DEFAULTS.prefs, ...(d.prefs || {}) } };
    merged.tomtomKey=null;if(d.tomtomKey){delete d.tomtomKey;localStorage.setItem(KEY,JSON.stringify(d));}
    // First migration deliberately respects the owner's new silent default.
    if (!['silent', 'alerts', 'guidance'].includes(d.prefs?.soundMode)) merged.prefs.soundMode = 'silent';
    merged.roadside = { ...DEFAULTS.roadside, ...(d.roadside || {}) };
    for (const k of ['places', 'recents', 'trips', 'savedRoutes', 'avoids', 'radars', 'entrances', 'reminders']) if (!Array.isArray(merged[k])) merged[k] = [];
    return merged;
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const store = load();

export function save() {
  try {
    localStorage.removeItem(CREDENTIAL_KEY);
    const { tomtomKey, ...data } = store;
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  }
  catch { globalThis.dispatchEvent?.(new Event('yolcu-storage-error')); return false; }
}

const samePlace = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;

export function addRecent(p) {
  const clean = { name: p.name, sub: p.sub || '', lat: p.lat, lon: p.lon, kind: p.kind || 'pin' };
  store.recents = [clean, ...store.recents.filter(r => !samePlace(r, clean))].slice(0, 12);
  save();
}

export function isSaved(p) { return store.places.some(x => samePlace(x, p)); }

export function toggleSaved(p) {
  if (isSaved(p)) store.places = store.places.filter(x => !samePlace(x, p));
  else store.places.push({ name: p.name, sub: p.sub || '', lat: p.lat, lon: p.lon, kind: p.kind || 'pin',phone:p.phone||'',brand:p.brand||'',openingHours:p.openingHours||null,openingText:p.openingText||'' });
  save();
  return isSaved(p);
}

export function exportBackup() {
  const { activeNav, tomtomKey, ...rest } = store;
  return JSON.stringify({ app: 'yolcu', version: 1, date: new Date().toISOString(), data: rest }, null, 2);
}

export function importBackup(text) {
  const j = JSON.parse(text);
  const d = j && j.app === 'yolcu' ? j.data : null;
  if (!d) throw new Error('Bu bir Yolcu yedeği değil');
  for (const k of ['home', 'work', 'places', 'recents', 'trips', 'savedRoutes', 'avoids', 'radars', 'parkedCar', 'entrances', 'reminders', 'roadside']) if (k in d) store[k] = d[k];
  if (d.prefs) Object.assign(store.prefs, d.prefs);
  save();
}

// Simge değiştirirken ayarları bağlantıya gömmek için (sadece cihazda kalır, sunucuya gitmez)
export function packForLink() {
  const d = { home: store.home, work: store.work, places: store.places, avoids: store.avoids, radars: store.radars, prefs: store.prefs };
  return btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unpackFromLink(str) {
  const b = str.replace(/-/g, '+').replace(/_/g, '/');
  const d = JSON.parse(decodeURIComponent(escape(atob(b))));
  for (const k of ['home', 'work', 'places', 'trips', 'savedRoutes', 'avoids', 'radars']) if (d[k] != null) store[k] = d[k];
  if (d.prefs) Object.assign(store.prefs, d.prefs);
  save();
}

export function addTrip(trip) {
  store.trips = [{ ...trip, id: trip.id || crypto.randomUUID() }, ...store.trips].slice(0, 40);
  save();
}
export function toggleRouteSaved(trip) {
  const i = store.savedRoutes.findIndex(t => t.id === trip.id);
  if (i >= 0) store.savedRoutes.splice(i, 1);
  else store.savedRoutes = [structuredClone(trip), ...store.savedRoutes].slice(0, 20);
  save();
}

// Legacy browser credentials are intentionally no longer read.
