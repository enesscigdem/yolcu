import test from 'node:test';import assert from 'node:assert/strict';
import {FixStream} from '../js/location.js';import {Replanner} from '../js/replan.js';import {Navigator} from '../js/nav.js';import {FollowCamera,Diagnostics} from '../js/diagnostics.js';import {cumulative,pointAt,bearing} from '../js/geo.js';import {analyze,planRoutes,rankRoutes} from '../js/api.js';import {onRoute} from '../js/traffic.js';import {stopOptions} from '../js/stops.js';
const base=Date.now();
function route(coords=[[27,38],[27,38.005],[27,38.01],[27.005,38.01]]){const cum=cumulative(coords);return {coords,cum,lengthM:cum.at(-1),mode:'auto',time:200,maneuvers:[{along:0,lengthM:cum.at(-1),time:200,type:1,street:'Ana yol'},{along:cum.at(-1),lengthM:0,time:0,type:4}],stats:{edges:[]}};}
const fix=(p,t=0)=>({acc:5,speed:10,heading:0,t:base+t,...p});
test('stale, future, inaccurate and out-of-order GPS cannot advance the shared stream',()=>{
 const s=new FixStream();assert.ok(s.accept(fix({lon:27,lat:38}),base));assert.equal(s.accept(fix({lon:27,lat:38},-1000),base),null);assert.equal(s.accept(fix({lon:27,lat:38},10000),base),null);assert.equal(s.accept(fix({lon:27,lat:38,acc:120},1000),base+1000),null);assert.equal(s.status(base+6000),'Konum sinyali bekleniyor');
});
test('stationary GPS jitter and missing heading stay at the observed position',()=>{
 const s=new FixStream();s.accept(fix({lon:27,lat:38,speed:0,heading:80}),base);const p=s.accept(fix({lon:27.00001,lat:38.00001,speed:0,heading:200},1000),base+1000);assert.equal(p.lon,27);assert.equal(p.lat,38);assert.equal(p.heading,80);
});
test('one GPS spike cannot confirm a deviation',()=>{const n=new Navigator(route());n.update(fix({lon:27,lat:38.001}));assert.equal(n.update(fix({lon:27.0004,lat:38.0011},1000)).reroute,false);assert.equal(n.update(fix({lon:27,lat:38.0012},2000)).reroute,false);});
test('parallel street remains raw and confirms deviation with two reliable fixes',()=>{const n=new Navigator(route());n.update(fix({lon:27,lat:38.001}));n.update(fix({lon:27.00035,lat:38.0011},1000));const st=n.update(fix({lon:27.00035,lat:38.0012},2000));assert.equal(st.matched,false);assert.equal(st.position.lon,27.00035);assert.equal(st.reroute,true);assert.equal(st.deviationMs,1000);});
test('opposite heading on the same line is not glued to the original driving direction',()=>{const n=new Navigator(route());n.update(fix({lon:27,lat:38.001}));n.update(fix({lon:27,lat:38.0009,heading:180},1000));const st=n.update(fix({lon:27,lat:38.0008,heading:180},2000));assert.equal(st.matched,false);assert.ok(st.reroute);});
test('missed exit and connected wrong street trigger confirmation without a ten-second gate',()=>{const n=new Navigator(route([[27,38],[27,38.001],[27.002,38.001]]));n.update(fix({lon:27,lat:38.0009}));n.update(fix({lon:27,lat:38.0013},1000));const st=n.update(fix({lon:27,lat:38.0015},2000));assert.equal(st.reroute,true);});
test('self-crossing geometry does not jump to the distant end or arrive prematurely',()=>{const r=route([[27,38],[27,38.005],[27.005,38.005],[27.005,38],[27,38]]),n=new Navigator(r);const st=n.update(fix({lon:27,lat:38}));assert.equal(st.along,0);assert.equal(st.arrived,false);});
test('camera uses short rotation across north and limits corner swings',()=>{const c=new FollowCamera();const st={matched:true,distToNext:500,up:{},position:{heading:359}};const a=c.target({speed:10,heading:359},st,1000);const b=c.target({speed:10,heading:1},st,2000);assert.ok(Math.abs(((b.bearing-a.bearing+540)%360)-180)<5);const d=c.target({speed:10,heading:180},{...st,distToNext:100},3000);assert.ok(Math.abs(((d.bearing-b.bearing+540)%360)-180)<=45);assert.ok(d.pitch<a.pitch);});
test('newer replan wins even when the server ignores abort and replies in reverse order',async()=>{let resolve1,resolve2;const commits=[];let count=0;const r=new Replanner({getContext:()=>({from:fix({lon:27,lat:38})}),request:()=>new Promise(res=>{if(++count===1)resolve1=res;else resolve2=res;}),commit:x=>commits.push(x)});const a=r.run();const b=r.run('new-intent',true);resolve2('new');await b;resolve1('old');await a;assert.deepEqual(commits,['new']);assert.equal(r.controller,null);});
test('replan starts under one second after confirmation and separates service time',async()=>{let clock=100;const r=new Replanner({getContext:()=>({confirmedAt:95}),clock:()=>clock,request:async()=>{clock=700;return {};},commit:()=>{clock=705;}});await r.run();assert.ok(r.metrics[0].dispatchMs<1000);assert.equal(r.metrics[0].serviceMs,600);assert.equal(r.metrics[0].totalMs,605);});
test('network failure retries with latest preferences and cancellation clears resources',async()=>{const queue=new Map();let calls=0;let context={prefs:{highways:true,tolls:true,hills:true,rough:true},avoids:[{lon:27,lat:38}],stops:[{name:'Benzin'}]};const seen=[];const r=new Replanner({getContext:()=>context,request:async c=>{seen.push(structuredClone(c));if(++calls===1)throw new Error('offline');return {};},commit:()=>true,schedule:(f,ms)=>{queue.set(1,{f,ms});return 1;},unschedule:id=>queue.delete(id)});await r.run();assert.equal(queue.get(1).ms,2000);context={...context,prefs:{...context.prefs,tolls:false}};await queue.get(1).f();assert.equal(seen[1].prefs.tolls,false);assert.deepEqual(seen[1].avoids,context.avoids);r.cancel();assert.equal(r.controller,null);assert.equal(r.retry,null);});
test('equivalent comfort and time choose the shorter distance',()=>{const stats={total:10000,motorway:0,main:8000,small:0,steep:0,rough:0,steps:0};const a={...route(),time:600,lengthM:10000,maneuvers:[],stats},b={...route(),time:615,lengthM:8000,maneuvers:[],stats};assert.equal(rankRoutes([a,b],{maxExtraMinutes:5,highways:true})[0],b);});
test('traffic behind the driver and opposite-direction lines are excluded',()=>{const r=route(),north={id:'n',coords:[[27,38.002],[27,38.003]],delay:480},south={id:'s',coords:[[27,38.003],[27,38.002]],delay:480};const list=onRoute([north,south],r);assert.equal(list.length,1);assert.ok(list[0].endAlong>list[0].along);assert.equal(list.filter(x=>x.endAlong>500).length,0);});
test('stop detours use complete origin-stop-destination times and preserve avoids',async()=>{const r=route(),places=[{name:'A',lon:27,lat:38.002},{name:'B',lon:27,lat:38.003}],avoids=[{lon:27.1,lat:38.1}];const calls=[];const planner=async(from,to,prefs,ex,signal,mode,traffic,preferred,stops)=>{calls.push({ex,stops});return [{...r,time:stops.length?(stops.at(-1).name==='A'?260:240):200}];};const options=await stopOptions({route:r,along:0,from:fix({lon:27,lat:38}),to:{lon:27.005,lat:38.01},prefs:{highways:true},avoids,stops:[],traffic:null},async()=>places,new AbortController().signal,planner);assert.equal(options[0].place.name,'B');assert.equal(options[0].extraSeconds,40);assert.ok(calls.every(c=>c.ex===avoids));});
test('diagnostic samples remain bounded during long use',()=>{const d=new Diagnostics();for(let i=0;i<10000;i++){d.record(d.frames,16.7);d.record(d.processing,.2);}assert.equal(d.frames.length,600);assert.equal(d.processing.length,600);assert.equal(d.snapshot().frameP95Ms,16.7);});

test('ambiguous bridge and ground overlap waits for evidence instead of choosing a level',()=>{
 const r=route([[27,38],[27,38.0002],[27.0002,38.0002],[27,38],[27,38.0002]]);r.stats.edges=[{b:0,e:1,bridge:true,tunnel:false},{b:3,e:4,bridge:false,tunnel:false}];
 const st=new Navigator(r).update(fix({lon:27,lat:38.0001}));assert.equal(st.verticalAmbiguous,true);assert.equal(st.matched,false);assert.equal(st.arrived,false);
});

test('slope percentages are not confused with energy factors or missing sentinels',async()=>{
 const original=global.fetch;global.fetch=async()=>({ok:true,json:async()=>({edges:[{length:.1,weighted_grade:12,max_upward_grade:2,max_downward_grade:-3},{length:.1,weighted_grade:1,max_upward_grade:9,max_downward_grade:-2},{length:.1,weighted_grade:15,max_upward_grade:32768,max_downward_grade:32768}]})});
 try{const r=route();r.raw={legs:[{shape:'test'}]};const a=await analyze(r);assert.equal(a.gradeKnown,200);assert.equal(a.steep,100);assert.equal(a.edges[2].grade,null);}finally{global.fetch=original;}
});
test('closed remembered routes are checked again and cannot be selected',async()=>{
 const fs=await import('node:fs');const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/izmir-routes.json',import.meta.url)))[0];const original=global.fetch;let checks=0;
 global.fetch=async(url)=>({ok:true,json:async()=>String(url).endsWith('/route')?{trip:fixture.raw}:{edges:[]}});
 const provider=async()=>null;provider.checkClosures=async routes=>{checks++;routes.forEach(r=>r.closed=true);};
 try{await assert.rejects(()=>planRoutes({lon:27.1045,lat:38.3695},{lon:27.2215,lat:38.4599},{maxExtraMinutes:5},[],undefined,'auto',provider,fixture.coords),/kapalı/);assert.equal(checks,1);}finally{global.fetch=original;}
});
test('GPS loss freezes accepted position and fresh recovery resumes without prediction',()=>{
 const s=new FixStream();const a=s.accept(fix({lon:27,lat:38,speed:10}),base);assert.equal(s.status(base+6000),'Konum sinyali bekleniyor');assert.equal(s.last,a);
 const b=s.accept(fix({lon:27,lat:38.0008,speed:10,heading:null},7000),base+7000);assert.ok(b);assert.equal(b.lat,38.0008);assert.equal(s.status(base+7000),'');
});
test('roundabout and consecutive turns keep progress and upcoming maneuvers ordered',()=>{
 const coords=[[27,38],[27,38.001],[27.0003,38.0013],[27.0006,38.001],[27.0003,38.0007],[27,38.001],[26.999,38.001],[26.999,38.002]],r=route(coords);
 r.maneuvers=[{along:0,lengthM:r.cum[1],time:20,type:1},{along:r.cum[1],lengthM:r.cum[5]-r.cum[1],time:20,type:26,rbExit:3},{along:r.cum[5],lengthM:r.cum[6]-r.cum[5],time:15,type:27,silent:true},{along:r.cum[6],lengthM:r.cum[7]-r.cum[6],time:15,type:10},{along:r.lengthM,lengthM:0,time:0,type:4}];
 const n=new Navigator(r);let previous=0,t=0,seenRoundabout=false,seenTurn=false;
 for(let d=0;d<r.lengthM-10;d+=8){const p=pointAt(r.coords,r.cum,d),q=pointAt(r.coords,r.cum,d+2);const st=n.update(fix({...p,heading:bearing(p.lon,p.lat,q.lon,q.lat),speed:4},t+=2000));assert.equal(st.reroute,false);assert.ok(st.along>=previous-1);assert.ok(Math.abs(st.along-d)<2);previous=st.along;seenRoundabout ||= st.up?.type===26;seenTurn ||= st.up?.type===10;}
 assert.ok(seenRoundabout&&seenTurn);
});

test('sustained slow frames reduce visual density and stop cancels the only RAF',()=>{
 const oldRAF=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame,queue=new Map();let id=0;global.requestAnimationFrame=cb=>{queue.set(++id,cb);return id;};global.cancelAnimationFrame=i=>queue.delete(i);
 try{const d=new Diagnostics(),levels=[];d.start(n=>levels.push(n));d.start();assert.equal(queue.size,1);for(let t=40;t<=60000;t+=40){const [i,cb]=queue.entries().next().value;queue.delete(i);cb(t);assert.equal(queue.size,1);}assert.deepEqual(levels,[1,2]);d.stop();assert.equal(queue.size,0);}finally{global.requestAnimationFrame=oldRAF;global.cancelAnimationFrame=oldCancel;}
});
test('very slow rendering adapts before collecting 120 frames',()=>{
 const oldRAF=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame,queue=new Map();let id=0;global.requestAnimationFrame=cb=>{queue.set(++id,cb);return id;};global.cancelAnimationFrame=i=>queue.delete(i);
 try{const d=new Diagnostics(),levels=[];d.start(n=>levels.push(n));for(let t=150;t<=10000;t+=150){const [i,cb]=queue.entries().next().value;queue.delete(i);cb(t);}assert.ok(d.frames.length<120);assert.deepEqual(levels,[1]);d.stop();assert.equal(queue.size,0);}finally{global.requestAnimationFrame=oldRAF;global.cancelAnimationFrame=oldCancel;}
});
