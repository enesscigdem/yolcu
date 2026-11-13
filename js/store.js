// Tüm kişisel veriler sadece telefonda (localStorage) tutulur.
const KEY = 'yolcu.v1';

const DEFAULTS = {
  home: null,
  work: null,
  places: [],
  recents: [],
  avoids: [],
  activeNav: null,
  tomtomKey: null,
  radars: [],
  prefs: {
    highways: true,   // ana yolları tercih et
    hills: true,      // yokuşlardan kaçın
    rough: true,      // bozuk yollardan kaçın
    tolls: false,     // ücretli yollardan kaçın
    voice: true,
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
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...d, prefs: { ...DEFAULTS.prefs, ...(d.prefs || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const store = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* gizli sekme vb. */ }
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
  else store.places.push({ name: p.name, sub: p.sub || '', lat: p.lat, lon: p.lon, kind: p.kind || 'pin' });
  save();
  return isSaved(p);
}

export function exportBackup() {
  const { activeNav, ...rest } = store;
  return JSON.stringify({ app: 'yolcu', version: 1, date: new Date().toISOString(), data: rest }, null, 2);
}

export function importBackup(text) {
  const j = JSON.parse(text);
  const d = j && j.app === 'yolcu' ? j.data : null;
  if (!d) throw new Error('Bu bir Yolcu yedeği değil');
  for (const k of ['home', 'work', 'places', 'recents', 'avoids', 'radars', 'tomtomKey']) if (k in d) store[k] = d[k];
  if (d.prefs) store.prefs = { ...store.prefs, ...d.prefs };
  save();
}

// Simge değiştirirken ayarları bağlantıya gömmek için (sadece cihazda kalır, sunucuya gitmez)
export function packForLink() {
  const d = { home: store.home, work: store.work, places: store.places, avoids: store.avoids, radars: store.radars, prefs: store.prefs, tomtomKey: store.tomtomKey };
  return btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unpackFromLink(str) {
  const b = str.replace(/-/g, '+').replace(/_/g, '/');
  const d = JSON.parse(decodeURIComponent(escape(atob(b))));
  for (const k of ['home', 'work', 'places', 'avoids', 'radars', 'tomtomKey']) if (d[k] != null) store[k] = d[k];
  if (d.prefs) store.prefs = { ...store.prefs, ...d.prefs };
  save();
}
