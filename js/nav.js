// Navigasyon motoru: konumu rotaya oturtur, sıradaki dönüşü ve sesli uyarıları belirler
import { projectOnSegment, dist, bearing } from './geo.js';
import * as G from './guide.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const add = (a, b) => (a ? a + ' ' + b : b);

export class Navigator {
  constructor(route) { this.setRoute(route); }

  setRoute(route) {
    this.r = route;
    this.seg = 0;
    this.along = 0;
    this.off = 0;
    this.lastReroute = Date.now();
    this.upIdx = -1;
    this.stage = {};
    this.started = false;
    this.arrived = false;
  }

  snap(p) {
    const { coords, cum } = this.r;
    let best = { d: Infinity, i: 0, t: 0 };
    const from = Math.max(0, this.seg - 4);
    const maxAlong = this.along + 1500;
    for (let i = from; i < coords.length - 1; i++) {
      if (cum[i] > maxAlong) break;
      const r = projectOnSegment(p.lon, p.lat, coords[i], coords[i + 1]);
      if (r.d < best.d) best = { ...r, i };
    }
    if (best.d > 120) {
      // Kaybolduysak tüm rotada ara
      for (let i = 0; i < coords.length - 1; i++) {
        const r = projectOnSegment(p.lon, p.lat, coords[i], coords[i + 1]);
        if (r.d < best.d) best = { ...r, i };
      }
    }
    return best;
  }

  speedLimitAt(i) {
    const e = this.r.stats?.edges;
    if (!e) return 0;
    let lo = 0, hi = e.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (e[m].e <= i) lo = m + 1; else if (e[m].b > i) hi = m - 1; else return e[m].limit;
    }
    return 0;
  }

  streetAt(i, k) {
    const e = this.r.stats?.edges;
    if (e) { const x = e.find(x => x.b <= i && x.e > i); if (x?.name) return x.name; }
    return this.r.maneuvers[k]?.street || '';
  }

  update(p) {
    const { coords, cum, maneuvers: M } = this.r;
    const total = cum[cum.length - 1];
    const s = this.snap(p);
    this.seg = s.i;
    const along = cum[s.i] + s.t * (cum[s.i + 1] - cum[s.i]);
    this.along = along;

    // Rotadan çıktı mı?
    const tol = clamp((p.acc || 10) * 1.5, 40, 90);
    this.off = s.d > tol ? this.off + 1 : 0;
    let reroute = false;
    if (this.off >= 3 && Date.now() - this.lastReroute > 10000) { reroute = true; this.lastReroute = Date.now(); }

    // Şu anki ve sıradaki manevra
    let k = 0;
    while (k + 1 < M.length && M[k + 1].along <= along + 3) k++;
    let j = k + 1;
    while (j < M.length && M[j].silent) j++;
    const up = M[j] || null;
    const distToNext = up ? Math.max(0, up.along - along) : 0;
    let j2 = j + 1;
    while (j2 < M.length && M[j2].silent) j2++;
    const then = up && M[j2] ? M[j2] : null;
    const gap = then ? then.along - up.along : Infinity;

    // Kalan süre
    const mk = M[k];
    const frac = mk.lengthM > 0 ? clamp((along - mk.along) / mk.lengthM, 0, 1) : 1;
    let remS = mk.time * (1 - frac);
    for (let i = k + 1; i < M.length; i++) remS += M[i].time;
    const remM = Math.max(0, total - along);

    // Varış
    const dest = coords[coords.length - 1];
    const toDest = dist(p.lon, p.lat, dest[0], dest[1]);
    if (!this.arrived && ((remM < 30 && s.d < 60) || toDest < 25)) this.arrived = true;

    // Sesli uyarılar
    let say = null;
    const v = Math.max(p.speed || 0, 6);
    const farD = v > 22 ? 1600 : v > 14 ? 800 : 450;
    const nearD = v > 22 ? 600 : v > 14 ? 300 : 170;
    const nowD = clamp(v * 3.5, 30, 90);

    if (!this.started) {
      this.started = true;
      const first = M[0];
      const st = first?.street ? `${first.street} üzerinden ilerleyin.` : 'Rota başladı.';
      say = st;
    }

    if (up && !this.arrived && !reroute && this.off === 0) {
      if (this.upIdx !== j) {
        this.upIdx = j;
        this.stage = {};
        if (distToNext > farD + 400 && k > 0) {
          const c = G.continueSpeech(this.streetAt(s.i, k), distToNext);
          if (c) say = c;
          this.stage.post = true;
        }
      }
      const isDest = up.type >= 4 && up.type <= 6;
      const minor = up.type === 7 || up.type === 8;
      const st = this.stage;
      if (!st.now && distToNext <= nowD && !isDest && !minor) {
        st.now = st.near = st.far = true;
        say = add(say, G.speech(up, 'now', distToNext, then, gap));
      } else if (!st.near && distToNext <= nearD && distToNext > nowD + 15) {
        st.near = st.far = true;
        say = add(say, G.speech(up, 'near', distToNext, then, gap));
      } else if (!st.far && distToNext <= farD && distToNext > nearD + 80 && !minor) {
        st.far = true;
        say = add(say, G.speech(up, 'far', distToNext, then, gap));
      }
    }

    // Kamera için rota yönü
    const a = coords[s.i], b = coords[Math.min(s.i + 1, coords.length - 1)];
    const routeBearing = bearing(a[0], a[1], b[0], b[1]);

    return {
      snapped: { lon: s.lon, lat: s.lat, d: s.d },
      along, k, up, upIdx: j, distToNext, then, gap,
      remS, remM, total,
      street: this.streetAt(s.i, k),
      limit: this.speedLimitAt(s.i),
      offRoute: this.off >= 2,
      reroute, arrived: this.arrived, say, routeBearing
    };
  }
}

// Sürüş simülatörü: rotayı gerçek hızlarla (veya hızlandırılmış) sürer
export class Simulator {
  constructor(route, onPos, factor = 3) {
    this.r = route; this.onPos = onPos; this.factor = factor; this.d = 0;
    this.timer = setInterval(() => this.tick(), 500);
  }
  speedAt(d) {
    const M = this.r.maneuvers;
    let k = 0;
    while (k + 1 < M.length && M[k + 1].along <= d) k++;
    const m = M[k];
    return m.time > 0 ? clamp(m.lengthM / m.time, 4, 33) : 10;
  }
  tick() {
    const { coords, cum } = this.r;
    const v = this.speedAt(this.d);
    this.d = Math.min(this.d + v * 0.5 * this.factor, cum[cum.length - 1]);
    let i = 0, lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= this.d) lo = m; else hi = m; }
    i = lo;
    const t = cum[i + 1] > cum[i] ? (this.d - cum[i]) / (cum[i + 1] - cum[i]) : 0;
    const a = coords[i], b = coords[i + 1] || a;
    this.onPos({
      lon: a[0] + t * (b[0] - a[0]), lat: a[1] + t * (b[1] - a[1]),
      heading: bearing(a[0], a[1], b[0], b[1]), speed: v, acc: 5, alt: null, t: Date.now()
    });
  }
  stop() { clearInterval(this.timer); }
}
