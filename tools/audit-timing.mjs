import fs from 'node:fs';import assert from 'node:assert/strict';
import {Navigator} from '../js/nav.js';import {navigationTiming,timingEvidence} from '../js/timing.js';
const routes=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/izmir-routes.json',import.meta.url)));
const report=routes.map((route,index)=>{const now=Date.now(),[lon,lat]=route.coords[0],state=new Navigator(route).update({lon,lat,t:now,acc:5,speed:0,heading:null}),timing=navigationTiming(route,state,0,null,now);assert.ok(Math.abs(timing.totalSeconds-route.time)<3);return {route:index+1,lengthKm:+(route.lengthM/1000).toFixed(2),...timingEvidence(route),initialNavigationSeconds:timing.totalSeconds};});
console.log(JSON.stringify({source:'recorded public İzmir fixtures; not live iPhone data',routes:report,historical344Reproduced:false},null,2));
