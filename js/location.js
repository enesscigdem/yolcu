import { dist, bearing, fixTimestamp } from './geo.js';
export class FixStream {
  constructor() { this.last = null; this.receivedAt = 0; this.rejected = 0; this.reason = ''; this.acceptedReason=''; }
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
    this.last=p;this.receivedAt=now;this.reason=this.acceptedReason=p.acc>45?'GPS doğruluğu düşük':'';return p;
  }
  reject(reason){this.rejected++;this.reason=reason;return null;}
  status(now=Date.now()) {return !this.last||now-this.last.t>5000?'Konum sinyali bekleniyor':this.acceptedReason||'';}
  reset(){this.last=null;this.receivedAt=0;this.reason='';this.acceptedReason='';}
}

// Own the browser watch and bounded one-shot requests. Observation is separate
// from FixStream acceptance: a callback is not proof of a safe road match.
export class GeolocationSession {
  constructor({geolocation,onPosition,onError,onWatch,now=()=>Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}) {
    Object.assign(this,{geo:geolocation,onPosition,onError,onWatch,now,setTimer,clearTimer});
    this.watch=null;this.generation=0;this.request=null;this.active=false;this.receivedAt=0;this.position=null;this.error=null;this.lastProbe=-Infinity;this.retryAt=0;
  }
  receive(g) {
    const c=g?.coords;if(!c)return;
    const p={lat:c.latitude,lon:c.longitude,acc:c.accuracy,heading:c.heading,speed:c.speed,alt:c.altitude,t:fixTimestamp(g.timestamp,this.now())};
    this.position=p;this.receivedAt=this.now();this.error=null;this.retryAt=0;this.onPosition?.(p);
    return p;
  }
  fail(error) {
    const previous=this.error;if(previous?.code===1&&Number(error?.code)!==1)return;
    this.error={code:Number(error?.code)||0,message:geolocationMessage(error)};
    if(this.error.code===1)this.retryAt=Infinity;else if(!previous||!this.retryAt||!Number.isFinite(this.retryAt))this.retryAt=this.now()+2000;
    this.onError?.(this.error);
  }
  start(restart=false) {
    this.active=true;
    if(!this.geo){this.fail({code:0});return;}
    if(restart&&this.watch!==null){this.geo.clearWatch(this.watch);this.watch=null;this.onWatch?.(null);}
    if(this.watch!==null)return;
    const generation=++this.generation;
    try{this.watch=this.geo.watchPosition(g=>{if(this.active&&generation===this.generation)this.receive(g);},e=>{if(this.active&&generation===this.generation)this.fail(e);},{enableHighAccuracy:true,maximumAge:1000,timeout:15000});this.onWatch?.(this.watch);}
    catch(e){this.fail(e);}
  }
  refresh() {
    if(!this.geo)return Promise.resolve(null);
    if(this.request)return this.request.promise;
    let resolve;const promise=new Promise(r=>resolve=r),request={promise,resolve,startedAt:this.now()};this.request=request;
    const finish=(g,error)=>{if(this.request!==request)return;this.clearTimer(request.timer);this.request=null;if(error&&this.receivedAt<=request.startedAt)this.fail(error);resolve(g?this.receive(g):this.receivedAt>request.startedAt?this.position:null);};
    request.timer=this.setTimer(()=>finish(null,{code:3}),8500);
    try{this.geo.getCurrentPosition(g=>finish(g),e=>finish(null,e),{enableHighAccuracy:true,maximumAge:0,timeout:8000});}catch(e){finish(null,e);}
    return promise;
  }
  check() {
    const now=this.now(),observedAt=Math.min(this.receivedAt,this.position?.t||0);if(!this.active||this.error?.code===1||now<this.retryAt||now-observedAt<3500||now-this.lastProbe<4000)return;
    this.lastProbe=now;
    if(this.watch===null||this.error||now-this.receivedAt>15000)this.start(true);
    return this.refresh();
  }
  retry(){this.error=null;this.retryAt=0;this.start(true);return this.refresh();}
  stop() {
    this.active=false;this.generation++;
    if(this.watch!==null)this.geo?.clearWatch(this.watch);this.watch=null;this.onWatch?.(null);
    if(this.request){const request=this.request;this.clearTimer(request.timer);this.request=null;request.resolve(null);}
  }
}
export function geolocationMessage(error) {
  return error?.code===1?'Konum izni kapalı. Safari veya iPhone ayarlarından konuma izin ver.':error?.code===2?'Konum servisi şu anda ölçüm veremiyor.':error?.code===3?'Konum isteği zaman aşımına uğradı.':'Bu cihazda konum servisi kullanılamıyor.';
}
