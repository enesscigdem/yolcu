import { dist, bearing, fixTimestamp } from './geo.js';
export class FixStream {
  constructor() { this.last = null; this.receivedAt = 0; this.rejected = 0; this.reason = ''; }
  accept(input, now = Date.now()) {
    const p = { ...input, t: fixTimestamp(input.t, now) };
    if (![p.lon,p.lat].every(Number.isFinite) || Math.abs(p.lat)>90 || Math.abs(p.lon)>180) return this.reject('Konum geçersiz');
    if (p.t > now + 1500 || now-p.t>5000 || (this.last && p.t<=this.last.t)) return this.reject('Güncel konum bekleniyor');
    p.acc = Number.isFinite(p.acc) && p.acc>0 ? p.acc : 100;
    if(p.acc>60)return this.reject('GPS doğruluğu düşük');
    const previous=this.last, dt=previous?(p.t-previous.t)/1000:0, moved=previous?dist(previous.lon,previous.lat,p.lon,p.lat):0;
    if (previous && dt<5 && moved>Math.max(100,(Math.max(previous.speed||0,p.speed||0)+15)*dt+previous.acc+p.acc)) return this.reject('Konum sıçraması doğrulanıyor');
    p.speed=Number.isFinite(p.speed)&&p.speed>=0?Math.min(p.speed,70):(dt>0&&dt<8&&moved>Math.max(5,p.acc*.7)?Math.min(55,moved/dt):0);
    p.heading=Number.isFinite(p.heading)&&p.heading>=0?p.heading%360:(previous&&p.speed>1.5&&moved>Math.max(5,p.acc*.7)?bearing(previous.lon,previous.lat,p.lon,p.lat):previous?.heading??null);
    // Stationary GPS noise is held at the last observed coordinate; never extrapolate.
    if(previous&&p.speed<.7&&moved<Math.max(4,Math.min(p.acc,previous.acc)*.8)){p.lon=previous.lon;p.lat=previous.lat;p.heading=previous.heading;}
    this.last=p;this.receivedAt=now;this.reason=p.acc>45?'GPS doğruluğu düşük':'';return p;
  }
  reject(reason){this.rejected++;this.reason=reason;return null;}
  status(now=Date.now()) {return !this.last||now-this.last.t>5000?'Konum sinyali bekleniyor':this.reason;}
  reset(){this.last=null;this.receivedAt=0;this.reason='';}
}
