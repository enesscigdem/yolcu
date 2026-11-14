import test from 'node:test';import assert from 'node:assert/strict';
import {navigationTiming,stopImpact,routeSeconds} from '../js/timing.js';
import {stopOptions} from '../js/stops.js';import {cumulative} from '../js/geo.js';
const route={time:1800,lengthM:19000,maneuvers:[{time:900},{time:900}]};
test('remaining ETA uses a single service clock; stale traffic expires and delay is not added twice',()=>{
 const now=1000000,r={...route,trafficTime:2400,trafficDelay:600,trafficCheckedAt:now-100};
 assert.equal(navigationTiming(r,{remS:900,remM:9500},300,null,now).totalSeconds,1500);
 assert.equal(navigationTiming(r,{remS:900,remM:9500},300,null,now+400000).totalSeconds,1200);
 assert.equal(routeSeconds(r,now+400000),1800);
});
test('mismatched maneuver totals cannot inflate a 30 minute service summary into hours',()=>{
 const r={...route,maneuvers:[{time:6500},{time:6500}]};
 const t=navigationTiming(r,{remS:13000,remM:19000});assert.equal(t.totalSeconds,1800);assert.equal(t.evidence.mismatch,true);
});
test('remaining-route traffic has its own anchor without replacing the whole-route time',()=>{
 const sample={baseSeconds:900,seconds:1200,at:1000000};const t=navigationTiming(route,{remS:450,remM:4750},0,sample,1000100);
 assert.equal(t.totalSeconds,600);assert.equal(route.time,1800);
});
test('stop impact counts existing and proposed dwell exactly once, including parking walking time',()=>{
 const c={stops:[{dwellMinutes:5}],activeDwellSeconds:60};
 assert.deepEqual(stopImpact({totalSeconds:1800,extraSeconds:120},c,10,0),{totalSeconds:2760,extraSeconds:720,arrivalAt:2760000,dwellSeconds:600});
 assert.equal(stopImpact({totalSeconds:2160,extraSeconds:120,walkRoute:{time:100}},c,10,0).totalSeconds,2760);
});
test('a wider candidate pool is compared by full route time before taking the first page',async()=>{
 const coords=[[27,38],[27,38.1]],cum=cumulative(coords),r={...route,coords,cum,lengthM:cum.at(-1),mode:'auto'};
 const places=Array.from({length:10},(_,i)=>({name:'place-'+i,lon:27,lat:38.005+i*.004}));let active=0,peak=0;
 const planner=async(a,b,p,ex,s,mode,traffic,preferred,stops)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return [{...r,time:stops.length?1800+(10-Number(stops[0].name.split('-')[1]))*60:1800,legTimes:[300]}];};
 const options=await stopOptions({route:r,along:0,from:{lon:27,lat:38},to:{lon:27,lat:38.1},prefs:{},avoids:[],stops:[]},async()=>places,new AbortController().signal,planner);
 assert.equal(options[0].place.name,'place-9');assert.equal(options.length,3);assert.ok(peak<=3);
});
