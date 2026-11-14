// Credentials stay outside the checkout. No request URL or credential is printed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import * as traffic from '../js/traffic.js';
import { planRoutes } from '../js/api.js';
const key = process.env.TOMTOM_API_KEY || JSON.parse(readFileSync(`${homedir()}/.config/yolcu/tomtom.json`, 'utf8')).key;
const origin = { lon: 27.1045, lat: 38.3695 }, destination = { lon: 27.2215, lat: 38.4599 };
const prefs = { highways: true, hills: true, rough: true, tolls: false, maxExtraMinutes: 5 };
const report = { checkedAt: new Date().toISOString(), services: {}, routes: [] };
const capture = process.argv.includes('--update-fixture');
const fetchActual = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const result = await fetchActual(...args);
  if (capture && String(args[0]).includes('/routing/') && args[1]?.method === 'POST' && result.ok) {
    const body = await result.clone().json();
    // Only response data; it contains no request URL or API credential.
    if (!report.captured) { writeFileSync('tests/fixtures/tomtom-route.json', JSON.stringify(body)); report.captured = true; }
  }
  return result;
};
async function check(name, run, summarize) {
  try { const value = await run(); report.services[name] = { ok: true, ...summarize(value) }; }
  catch (error) { report.services[name] = { ok: false, error: String(error.message).replaceAll(key, '[redacted]') }; }
}
await Promise.all([
  check('businessSearch', () => traffic.search(key, 'kahve', {lat:38.423,lon:27.142}), x => ({ results: x.length, example: x[0]?.name })),
  check('nearbySearch', () => traffic.nearby(key, '7311', origin, 5000), x => ({ results: x.length, example: x[0]?.name })),
  check('incidents', () => traffic.incidents(key, [27.05,38.33,27.3,38.5]), x => ({ results:x.length, categories:[...new Set(x.map(i=>i.label))] })),
  check('flowTiles', async () => {const r=await fetchActual(traffic.flowTiles(key).replace('{z}','12').replace('{x}','2356').replace('{y}','1573'));if(!r.ok)throw new Error(`HTTP ${r.status}`);return (await r.arrayBuffer()).byteLength;}, x=>({bytes:x})),
  check('quickEta', () => traffic.quickEta(key, origin, destination), x => x),
]);
try {
  const routes = await planRoutes(origin, destination, prefs, [], undefined, 'auto', (r,s) => traffic.routeTraffic(key, r, s));
  report.routes = routes.map(r => ({ best:!!r.best, fastest:!!r.fastest, live:!!r.trafficCheckedAt, seconds:r.trafficTime||r.time, delaySeconds:r.trafficDelay, extraSeconds:r.extraSeconds, distanceM:Math.round(r.lengthM), trafficDistanceM:r.trafficLengthM, reasons:r.reasons, trafficSections:r.jams?.length||0 }));
  report.services.routeTraffic = {ok:routes.every(r=>r.trafficCheckedAt>0),alternatives:routes.length};
} catch (error) { report.services.routeTraffic={ok:false,error:String(error.message).replaceAll(key,'[redacted]')}; }
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/tomtom-live-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(Object.values(report.services).some(x=>!x.ok))process.exitCode=1;
