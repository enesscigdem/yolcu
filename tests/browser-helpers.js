import {expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/izmir-routes.json',import.meta.url),'utf8'));
export async function setup(page) {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.audioCalls=[];
    try { Object.defineProperty(navigator, 'audioSession', { configurable: true, value: { set type(v) { window.audioCalls.push('session:' + v); } } }); } catch {}
    for(const name of ['AudioContext','webkitAudioContext']) if(window[name]){ const C=window[name];window[name]=class extends C{constructor(...args){super(...args);window.audioCalls.push('context');}}; }
    if(window.speechSynthesis) { window.speechSynthesis.speak=()=>window.audioCalls.push('speak');window.speechSynthesis.cancel=()=>window.audioCalls.push('cancel'); }
    const saved=localStorage.getItem('yolcu.v1');if(!saved)localStorage.setItem('yolcu.v1',JSON.stringify({work:{name:'Bornova',lat:38.4599,lon:27.2215,kind:'work'},prefs:{theme:'light'}}));
  });
  await page.route('**/valhalla1.openstreetmap.de/**',async route=>{
    const b=route.request().postDataJSON();
    const parking=JSON.parse(readFileSync(new URL('./fixtures/izmir-parking-route.json',import.meta.url),'utf8'));
    if(route.request().url().endsWith('/route')&&b.costing==='pedestrian')return route.fulfill({json:{trip:parking.walk.raw}});
    if(route.request().url().endsWith('/route')&&Math.abs(b.locations.at(-1).lat-parking.parking.lat)<.00001&&Math.abs(b.locations.at(-1).lon-parking.parking.lon)<.00001)return route.fulfill({json:{trip:parking.car.raw}});
    if(route.request().url().endsWith('/route')&&b.locations.length>3){const multi=JSON.parse(readFileSync(new URL('./fixtures/izmir-multiple-stops.json',import.meta.url),'utf8'));const index=Math.abs(b.locations[1].lat-multi[0].stops[0].lat)<.0001?0:1;return route.fulfill({json:{trip:multi[index].route.raw}});}
    if(route.request().url().endsWith('/route')&&b.locations.length>2)return route.fulfill({json:{trip:JSON.parse(readFileSync(new URL('./fixtures/izmir-stop-route.json',import.meta.url),'utf8')).route.raw}});
    if(route.request().url().endsWith('/route'))return route.fulfill({json:{trip:fixture[0].raw,alternates:fixture.slice(1).map(r=>({trip:r.raw}))}});
    const r=fixture.find(r=>r.raw.legs[0].shape===b.encoded_polyline);
    return route.fulfill({json:{edges:r?r.stats.edges.map(e=>({begin_shape_index:e.b,end_shape_index:e.e,length:(r.cum[e.e]-r.cum[e.b])/1000,road_class:e.cls,names:e.names,surface:e.surface,weighted_grade:e.grade,speed_limit:e.limit})):[]}});
  });
  // Weather is outside these navigation/UI tests; aborting causes WebKit access-control page errors.
  await page.route('**/api.open-meteo.com/**',r=>r.fulfill({json:{current:{temperature_2m:20,weather_code:3,is_day:1},daily:{sunrise:[],sunset:[]}}}));
  await page.route('**/nominatim.openstreetmap.org/**',r=>r.fulfill({json:{address:{road:'Eski İzmir Caddesi',suburb:'Karabağlar'}}}));
  await page.route('**/*overpass*/**',r=>r.fulfill({json:{elements:[]}}));
  const stationaryGPS=setInterval(()=>page.evaluate(()=>{if(window.__yolcu&&!__yolcu.S.nav)__yolcu.onPos({lon:27.1045,lat:38.3695,acc:8,speed:0,heading:null,t:Date.now()});}).catch(()=>{}),750);page.once('close',()=>clearInterval(stationaryGPS));
  await page.route('**/api/services',r=>r.fulfill({json:{traffic:false,ai:false}}));
  await page.goto('/');
  await page.waitForFunction(()=>window.__yolcu?.S.mapReady);
  return errors;
}
export async function publishGPS(page){await page.evaluate(()=>__yolcu.onPos({lon:27.1045,lat:38.3695,acc:8,speed:0,heading:null,t:Date.now()}));}
export async function freshGPS(page,context=page.context()){await context.setGeolocation({longitude:27.1045,latitude:38.3695,accuracy:8});await publishGPS(page);await page.waitForFunction(()=>__yolcu.S.pos&&Date.now()-__yolcu.S.pos.t<1500,null,{timeout:5000});}
export async function routes(page) { await freshGPS(page);const keepFresh=setInterval(()=>publishGPS(page).catch(()=>{}),500);try{await page.locator('[data-act=fav][data-k=work]').click();await expect(page.locator('.start-route')).toBeVisible({timeout:15000});}finally{clearInterval(keepFresh);} }
export async function start(page,context) {
  await freshGPS(page,context);await page.locator('.start-route').click();await expect(page.locator('#nav')).toBeVisible({timeout:15000});
}
