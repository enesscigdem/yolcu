import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as traffic from '../js/traffic.js';
import { cumulative, sameRoute } from '../js/geo.js';
const response=JSON.parse(fs.readFileSync(new URL('./fixtures/tomtom-route.json',import.meta.url)));
const candidates=JSON.parse(fs.readFileSync(new URL('./fixtures/izmir-routes.json',import.meta.url)));
const ttCoords=response.routes[0].legs.flatMap(l=>l.points.map(p=>[p.longitude,p.latitude]));
const ttRoute={coords:ttCoords,cum:cumulative(ttCoords),lengthM:cumulative(ttCoords).at(-1)};
const original=candidates.find(r=>sameRoute({...r,cum:cumulative(r.coords)},ttRoute));
const fakeKey='test-local-credential-1234567890';
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
test('live traffic attaches only to the matching route and records its freshness',async()=>{
  assert.ok(original);const actual=fetch;let captured;
  try {globalThis.fetch=async(url,options)=>{captured={url,options};return json(response);};
    const r=await traffic.routeTraffic(fakeKey,original);
    assert.equal(r.trafficTime,response.routes[0].summary.travelTimeInSeconds);assert.equal(r.trafficDelay,response.routes[0].summary.trafficDelayInSeconds);assert.ok(r.trafficCheckedAt>0);assert.ok(r.jams.length>0);
    assert.ok(JSON.parse(captured.options.body).supportingPoints.length>2);assert.ok(captured.url.includes('reconstructionMode=normal'));assert.equal(captured.options.referrerPolicy,'no-referrer');
  } finally {globalThis.fetch=actual;}
});
test('a different TomTom geometry cannot provide the selected route ETA',async()=>{
  const actual=fetch;const different=structuredClone(response);different.routes[0].legs.forEach(l=>l.points.forEach(p=>p.longitude+=.3));
  try {globalThis.fetch=async()=>json(different);await assert.rejects(traffic.routeTraffic(fakeKey,original),/güzergâhla eşleşmedi/);}finally{globalThis.fetch=actual;}
});
test('authorization and quota failures are actionable and never include the credential',async()=>{
  const actual=fetch;
  try { for(const status of [403,429]) {globalThis.fetch=async()=>new Response('{}',{status});await assert.rejects(traffic.search(fakeKey,'kahve',{lon:27.142,lat:38.423}),e=>e.status===status&&!e.message.includes(fakeKey));} }finally{globalThis.fetch=actual;}
});
