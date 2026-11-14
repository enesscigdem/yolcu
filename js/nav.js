// Navigasyon motoru: konumu rotaya oturtur, sıradaki dönüşü ve sesli uyarıları belirler
import { projectOnSegment, dist, bearing } from './geo.js';
import * as G from './guide.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const add = (a, b) => (a ? a + ' ' + b : b);

export class Navigator {
  constructor(route) { this.setRoute(route); }

  setRoute(route) {
    this.r = route;
    this.levels=[];for(const e of route.stats?.edges||[]){if(e.bridge==null&&e.tunnel==null)continue;for(let i=e.b;i<e.e;i++)this.levels[i]=e.bridge?'bridge':e.tunnel?'tunnel':'ground';}
    this.seg = 0;
    this.along = 0;
    this.off = 0;
    this.heading = null;
    this.lastFix = null; this.lastPosition = null;
    this.lastReroute = 0;
    this.offSince = null; this.confirmedAt = null;
    this.upIdx = -1;
    this.stage = {};
    this.started = false;
    this.arrived = false;
  }

  snap(p) {
    const {coords,cum}=this.r;
    const dt=this.lastFix?Math.max(0,(p.t-this.lastFix.t)/1000):0;
    const reach=this.started?Math.max(100,(p.speed||0)*Math.min(dt,30)*2+100):1500;
    let best={d:Infinity,score:Infinity,i:0,t:0};const nearby=[];
    const from=this.started?Math.max(0,this.seg-10):0;
    for(let i=from;i<coords.length-1;i++){
      if(cum[i]>this.along+reach)break;
      const r=projectOnSegment(p.lon,p.lat,coords[i],coords[i+1]);
      const heading=bearing(...coords[i],...coords[i+1]);
      const delta=p.heading==null?0:Math.abs(((heading-p.heading+540)%360)-180);
      const along=cum[i]+r.t*(cum[i+1]-cum[i]);
      const travel=dist(this.lastFix?.lon??p.lon,this.lastFix?.lat??p.lat,p.lon,p.lat);
      const jump=this.started?Math.max(0,Math.abs(along-this.along)-travel*2-35):0;
      const score=r.d+(p.speed>2&&delta>70?40:0)+jump*.8;
      if(r.d<8&&delta<35&&this.levels[i])nearby.push({level:this.levels[i],score});
      if(score<best.score)best={...r,i,score};
    }
    best.verticalAmbiguous=(!this.started||dt>6)&&nearby.some(a=>a.score<best.score+10&&nearby.some(b=>b.level!==a.level&&b.score<best.score+10));
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
    const rawAlong = cum[s.i] + s.t * (cum[s.i + 1] - cum[s.i]);
    const a = coords[s.i], b = coords[Math.min(s.i + 1, coords.length - 1)];
    const routeBearing = bearing(a[0], a[1], b[0], b[1]);
    const delta = p.heading == null ? 0 : Math.abs(((routeBearing - p.heading + 540) % 360) - 180);
    const matched = !s.verticalAmbiguous && (p.acc || 100) <= 45 && s.d <= clamp((p.acc || 10) * .9, 7, 16) && (p.speed < 2 || delta < 65);
    // A remote projection must never advance the route or trigger arrival.
    const along = matched ? rawAlong : this.along;
    if (matched) { this.seg = s.i; this.along = along; }
    const moving = (p.speed || 0) > (this.r.mode === 'auto' ? 1.5 : .7);
    const targetHeading = moving && p.heading != null ? p.heading : matched ? routeBearing : this.heading ?? 0;
    if (this.heading == null || moving) this.heading = this.heading == null ? targetHeading : (this.heading + (((targetHeading - this.heading + 540) % 360) - 180) * .65 + 360) % 360;
    let position = { lon: matched ? s.lon : p.lon, lat: matched ? s.lat : p.lat, heading: this.heading };
    if(this.lastPosition && p.speed<.7 && dist(this.lastPosition.lon,this.lastPosition.lat,position.lon,position.lat)<Math.max(4,Math.min(10,p.acc*.8)))position={...this.lastPosition,heading:this.heading};
    this.lastPosition=position;

    // Rotadan çıktı mı?
    const mode = this.r.mode || 'auto';
    const tol = clamp((p.acc || 10)*1.6,12,45);
    const distinct=!this.lastFix||p.t>this.lastFix.t;
    const suspect=(p.acc||100)<=35 && (s.d>tol || (p.speed>2&&delta>=95));
    if(distinct){
      if(suspect){this.off++;if(this.offSince==null)this.offSince=p.t;}
      else {this.off=0;this.offSince=null;this.confirmedAt=null;}
    }
    this.lastFix=p;
    const confirmed=this.off>=2 && p.t-this.offSince>=650;
    if(confirmed&&this.confirmedAt==null)this.confirmedAt=performance.now();
    const reroute=confirmed;

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
    if (!this.arrived && (matched && remM < 30 && toDest < 40 && (p.acc || 10) < 40)) this.arrived = true;

    // Sesli uyarılar
    let say = null;
    const v = Math.max(p.speed || 0, mode === 'auto' ? 6 : 1.2);
    let farD, nearD, nowD;
    if (mode === 'pedestrian') { farD = 150; nearD = 50; nowD = 15; }
    else if (mode === 'bicycle') { farD = 300; nearD = 100; nowD = 25; }
    else { farD = v > 22 ? 1600 : v > 14 ? 800 : 450; nearD = v > 22 ? 600 : v > 14 ? 300 : 170; nowD = clamp(v * 3.5, 30, 90); }

    if (!this.started && matched) {
      this.started = true;
      const first = M[0];
      const st = first?.street ? `${first.street} üzerinden ilerleyin.` : 'Rota başladı.';
      say = st;
    }

    if (up && matched && !this.arrived && !reroute && this.off === 0) {
      if (this.upIdx !== j) {
        this.upIdx = j;
        this.stage = {};
        if (distToNext > Math.max(farD + 400, 1500) && k > 0) {
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

    return {
      position, matched, verticalAmbiguous:s.verticalAmbiguous,
      snapped: { lon: s.lon, lat: s.lat, d: s.d },
      along, k, up, upIdx: j, distToNext, then, gap,
      remS, remM, total,
      street: matched ? this.streetAt(s.i, k) : '',
      limit: matched ? this.speedLimitAt(s.i) : 0,
      offRoute: confirmed, uncertain: !matched, confirmedAt: this.confirmedAt, deviationMs: confirmed ? p.t-this.offSince : 0,
      reroute, arrived: this.arrived, say, routeBearing
    };
  }
}

// Sürüş simülatörü: rotayı gerçek hızlarla (veya hızlandırılmış) sürer
export class Simulator {
  constructor(route, onPos, factor = 3) {
    this.r = route;
    this.levels=[];for(const e of route.stats?.edges||[]){if(e.bridge==null&&e.tunnel==null)continue;for(let i=e.b;i<e.e;i++)this.levels[i]=e.bridge?'bridge':e.tunnel?'tunnel':'ground';} this.onPos = onPos; this.factor = factor; this.d = 0;
    this.resume();
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
  pause(){clearInterval(this.timer);this.timer=null;}
  resume(){if(this.timer==null)this.timer=setInterval(()=>this.tick(),500);}
  stop(){this.pause();}
}
