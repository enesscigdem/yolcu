export class Diagnostics {
  constructor(){this.frames=[];this.processing=[];this.render=[];this.fixAge=0;this.slow=0;this.quality=0;this.lastQuality=0;this.running=false;}
  record(list,value){if(Number.isFinite(value)){list.push(value);if(list.length>600)list.shift();}}
  sampleFix(p,start){this.fixAge=Math.max(0,Date.now()-p.t);this.record(this.processing,performance.now()-start);}
  start(onQuality){if(this.running)return;this.running=true;let last=0,lastReview=0;const frame=now=>{if(!this.running)return;if(last&&now-last<1000)this.record(this.frames,now-last);last=now;if(now-lastReview>5000&&this.frames.length>120){lastReview=now;const p95=this.percentile(this.frames,.95);this.slow=p95>32?this.slow+1:0;if(this.slow>=2&&this.quality<2&&now-this.lastQuality>15000){this.quality++;this.lastQuality=now;onQuality?.(this.quality);}else if(p95<20&&this.quality>0&&now-this.lastQuality>45000){this.quality--;this.lastQuality=now;onQuality?.(this.quality);}}this.raf=requestAnimationFrame(frame);};this.raf=requestAnimationFrame(frame);}
  stop(){this.running=false;cancelAnimationFrame(this.raf);this.raf=null;}
  percentile(a,p){if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))];}
  snapshot(){return {fixAgeMs:this.fixAge,processingP95Ms:this.percentile(this.processing,.95),renderP95Ms:this.percentile(this.render,.95),frameP50Ms:this.percentile(this.frames,.5),frameP95Ms:this.percentile(this.frames,.95),quality:this.quality,frameSamples:this.frames.length,memoryMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null};}
}
export class FollowCamera {
  reset(){this.bearing=null;this.zoom=null;this.pitch=null;this.last=0;}
  constructor(){this.reset();}
  target(p,st,now=performance.now(),tilt=true){
    const near=st.matched&&st.up&&st.distToNext<180,zoom=p.speed>24?16:p.speed>13?16.6:17.1;
    const z=near?Math.max(zoom,17.2):zoom, pitch=tilt?(near?45:55):0;
    const dt=this.last?Math.min(2,Math.max(.1,(now-this.last)/1000)):1;this.last=now;
    const b=p.heading??st.position.heading??0;
    const d=this.bearing==null?0:((b-this.bearing+540)%360)-180;
    this.bearing=this.bearing==null?b:(this.bearing+Math.max(-45*dt,Math.min(45*dt,d))+360)%360;
    this.zoom=this.zoom==null?z:this.zoom+(z-this.zoom)*.3;this.pitch=this.pitch==null?pitch:this.pitch+(pitch-this.pitch)*.3;
    return {bearing:this.bearing,zoom:this.zoom,pitch:this.pitch,duration:Math.min(600,Math.max(180,dt*600))};
  }
}
