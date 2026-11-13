// Radar (hız kamerası) verisi: OpenStreetMap'teki radarlar + kullanıcının kendi işaretledikleri.
import { projectOnSegment, bearing, dist } from './geo.js';

const SERVERS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const CACHE_KEY = 'yolcu.radars.v1';
const AREA = 0.5;            // konumun ±0,5 derece çevresi (~50 km)
const MAX_AGE = 3 * 864e5;   // 3 gün

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}
function writeCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { } }

function parseDir(d) {
  if (d == null) return null;
  const n = parseFloat(d);
  if (!Number.isNaN(n)) return n;
  const map = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  return map[String(d).toUpperCase()] ?? null;
}

async function query(s, w, n, e) {
  const bb = `${s},${w},${n},${e}`;
  const q = `[out:json][timeout:25];(node["highway"="speed_camera"](${bb});node["enforcement"="maxspeed"](${bb});relation["enforcement"="maxspeed"](${bb}););out center 600;`;
  let lastErr;
  for (const url of SERVERS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('Radar servisi ' + r.status);
      const j = await r.json();
      const out = [];
      for (const el of j.elements || []) {
        const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
        if (lat == null) continue;
        const tg = el.tags || {};
        const sp = parseInt(tg.maxspeed, 10);
        const c = { id: `${el.type}${el.id}`, lat, lon, max: Number.isFinite(sp) ? sp : null, dir: parseDir(tg.direction), src: 'osm' };
        // Aynı noktada iki kayıt varsa (kamera + yaptırım ilişkisi) birini tut
        const dup = out.find(o => dist(o.lon, o.lat, lon, lat) < 30);
        if (dup) { if (!dup.max && c.max) dup.max = c.max; continue; }
        out.push(c);
      }
      return out;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Radar verisi alınamadı');
}

// Konumun çevresindeki radarlar (önbellekli)
export async function around(lat, lon) {
  const c = readCache();
  if (c && Date.now() - c.t < MAX_AGE && Math.abs(c.lat - lat) < AREA * 0.6 && Math.abs(c.lon - lon) < AREA * 0.6) return c.list;
  const list = await query(lat - AREA, lon - AREA, lat + AREA, lon + AREA);
  writeCache({ t: Date.now(), lat, lon, list });
  return list;
}

export function cached() { return readCache()?.list || []; }

// Rotanın üzerindeki radarlar (35 m yakın ve yön uyuşuyorsa)
export function onRoute(cams, route) {
  const { coords, cum } = route;
  const out = [];
  for (const c of cams) {
    let best = { d: Infinity, i: 0, t: 0 };
    for (let i = 0; i < coords.length - 1; i++) {
      const r = projectOnSegment(c.lon, c.lat, coords[i], coords[i + 1]);
      if (r.d < best.d) best = { d: r.d, i, t: r.t };
    }
    if (best.d > 35) continue;
    if (c.dir != null) {
      const a = coords[best.i], b = coords[best.i + 1];
      const br = bearing(a[0], a[1], b[0], b[1]);
      const diff = Math.abs(((br - c.dir) % 360 + 540) % 360 - 180);
      if (diff > 70) continue; // ters yöne bakan kamera
    }
    out.push({ ...c, along: cum[best.i] + best.t * (cum[best.i + 1] - cum[best.i]) });
  }
  return out.sort((a, b) => a.along - b.along);
}

// Kısa uyarı sesi (ses kapalıyken de çalar)
let ctx = null;
export function unlockBeep() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') ctx.resume();
  } catch { }
}
export function beep(times = 2) {
  try {
    if (!ctx) unlockBeep();
    const t0 = ctx.currentTime + 0.02;
    for (let k = 0; k < times; k++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1046, t0 + k * 0.22);
      o.frequency.setValueAtTime(1318, t0 + k * 0.22 + 0.08);
      g.gain.setValueAtTime(0, t0 + k * 0.22);
      g.gain.linearRampToValueAtTime(0.35, t0 + k * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + k * 0.22 + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + k * 0.22); o.stop(t0 + k * 0.22 + 0.2);
    }
  } catch { }
}
