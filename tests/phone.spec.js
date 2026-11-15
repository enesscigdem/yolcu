import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {setup,routes,start,freshGPS,publishGPS} from './browser-helpers.js';
test('home, route choice and settings fit phone sizes and preserve silent preference',async({page,context},testInfo)=>{
  const errors=await setup(page);
  for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932}]) {
    await page.setViewportSize(size);await page.locator('[data-act=openSettings]').click();await expect(page.getByRole('button',{name:'Tamamen sessiz'})).toHaveAttribute('aria-pressed','true');await page.locator('[data-act=closeSettings]').click();
    await routes(page);await page.waitForTimeout(500);
    const bounds=await page.locator('.start-route').boundingBox();expect(bounds.y+bounds.height).toBeLessThanOrEqual(size.height);expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(await page.locator('.route-compare').innerText()).toMatch(/En hızlı rotadan|Bulunan en hızlı rota/);
    await page.screenshot({path:`test-results/${testInfo.project.name}-routes-${size.width}.png`});
    await page.locator('[data-act=closeRoutes]').click();
  }
  await page.reload();await page.waitForFunction(()=>window.__yolcu?.S.mapReady);await expect(page.locator('[data-act=routePrefs]')).toBeVisible();expect(await page.evaluate(()=>audioCalls)).toEqual([]);expect(errors).toEqual([]);
});
test('vehicle stays at the shared GPS position during camera motion; drag releases follow',async({page,context},testInfo)=>{
  const errors=await setup(page);await routes(page);await start(page,context);
  const result=await page.evaluate(async()=>{
    const {S,replayPos:onPos}=__yolcu;const {pointAt,bearing}=await import('./js/geo.js');const r=S.navRoute,p=pointAt(r.coords,r.cum,350),q=pointAt(r.coords,r.cum,360);
    onPos({...p,acc:8,speed:8,heading:bearing(p.lon,p.lat,q.lon,q.lat),t:Date.now()+40000});
    if(Math.abs(S.pos.lon-p.lon)>.0001||Math.abs(S.pos.lat-p.lat)>.0001)throw new Error('GPS replay was not accepted');
    const displayed={...S.displayPosition};S.map.jumpTo({center:[27.4,38.5]});const puck=S.puck.getLngLat();
    S.map.fire('dragstart');return {displayed,puck,follow:S.follow};
  });
  expect(result.puck.lng).toBeCloseTo(result.displayed.lon,6);expect(result.puck.lat).toBeCloseTo(result.displayed.lat,6);expect(result.follow).toBe(false);await expect(page.locator('#nav-recenter')).toBeVisible();
  await page.locator('#nav-recenter').click();expect(await page.evaluate(()=>__yolcu.S.follow)).toBe(true);
  await page.locator('[data-act=toggleNavMenu]').click();await page.locator('#nav-menu [data-act=overview]').click();expect(await page.evaluate(()=>__yolcu.S.overview)).toBe(true);expect(await page.locator('.puck.nav').count()).toBe(0);await page.locator('#nav-recenter').click();
  await page.locator('[data-act=toggleNavMenu]').click();await page.locator('[data-act=navTilt]').click();expect(await page.evaluate(()=>__yolcu.store.prefs.tilt)).toBe(false);
  await page.locator('[data-act=toggleNavMenu]').click();await page.locator('[data-act=navTilt]').click();expect(await page.evaluate(()=>__yolcu.store.prefs.tilt)).toBe(true);
  await page.evaluate(()=>{navigator.share=async data=>window.shareTest=data;});await page.locator('[data-act=toggleNavMenu]').click();await page.locator('#nav-menu [data-act=shareEta]').click();expect(await page.evaluate(()=>window.shareTest.text)).toContain(await page.locator('#nav-eta').innerText());await page.locator('[data-act=toggleNavMenu]').click();
  await page.screenshot({path:`test-results/${testInfo.project.name}-navigation.png`});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));expect(await page.evaluate(()=>audioCalls)).toEqual([]);expect(errors).toEqual([]);
});
test('completed journeys, favorite geometry and avoided segments persist through reload',async({page,context})=>{
  const errors=await setup(page);await routes(page);await start(page,context);
  await page.evaluate(async()=>{
    const {S,replayPos:onPos}=__yolcu;const {pointAt,bearing}=await import('./js/geo.js');const r=S.navRoute;S.trip.t0=Date.now()-r.time*1000;
    let t=Date.now()+1000;
    for(let d=0;d<r.lengthM;d+=100){const p=pointAt(r.coords,r.cum,d),q=pointAt(r.coords,r.cum,d+5);onPos({...p,acc:5,speed:12,heading:bearing(p.lon,p.lat,q.lon,q.lat),t:t+=10000});}
    const p=pointAt(r.coords,r.cum,r.lengthM-1);onPos({...p,acc:5,speed:0,heading:null,t:t+1000});
  });
  await expect(page.locator('#arrive')).toBeVisible();await page.locator('[data-act=likeCompleted]').click();await page.locator('#arrive [data-act=endNav]').click();
  await page.locator('[data-act=openTrip]').first().click();await page.locator('[data-act=avoidTripSeg]').first().click();
  const before=await page.evaluate(()=>({trips:__yolcu.store.trips,saved:__yolcu.store.savedRoutes,avoids:__yolcu.store.avoids}));
  expect(before.trips).toHaveLength(1);expect(before.trips[0].coords.length).toBeGreaterThan(5);expect(before.trips[0].distance).toBeGreaterThan(1000);expect(before.saved).toHaveLength(1);expect(before.avoids).toHaveLength(1);
  await page.reload();await page.waitForFunction(()=>window.__yolcu?.S.mapReady);const after=await page.evaluate(()=>({trips:__yolcu.store.trips,saved:__yolcu.store.savedRoutes,avoids:__yolcu.store.avoids}));expect(after).toEqual(before);
  await page.locator('[data-act=openSavedRoute]').first().click();await freshGPS(page);const liveFixes=setInterval(()=>publishGPS(page).catch(()=>{}),500);try{await page.locator('[data-act=tripGo]').click();await expect(page.locator('.start-route')).toBeVisible({timeout:15000});}finally{clearInterval(liveFixes);}expect(errors).toEqual([]);
});
test('preview arrival never creates a completed real journey',async({page})=>{
  await setup(page);await routes(page);await page.locator('[data-act=preview]').click();
  await page.evaluate(async()=>{const {S,replayPos:onPos}=__yolcu;S.sim.stop();const r=S.navRoute;S.nav.along=r.lengthM-10;S.nav.seg=r.coords.length-2;const c=r.coords.at(-1);onPos({lon:c[0],lat:c[1],acc:5,speed:0,heading:null,t:Date.now()+1000});});
  await expect(page.locator('#arrive')).toBeVisible();expect(await page.evaluate(()=>__yolcu.store.trips)).toHaveLength(0);
});
test('local phone preview switches all three screens and keeps the outer app fixed',async({page})=>{
  await setup(page);await page.goto('/preview.html');const phone=page.frameLocator('iframe');
  await phone.getByRole('button',{name:'Nereye?',exact:true}).waitFor({state:'visible'});
  await page.getByRole('button',{name:'Rota seçimi',exact:true}).click();await expect(phone.getByRole('button',{name:'Başlat',exact:true})).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'Sürüş ekranı',exact:true}).click();await expect(phone.locator('#nav')).toBeVisible({timeout:20000});await expect(phone.locator('#sim-badge')).toContainText('Önizleme');
  await page.getByRole('button',{name:'Ana ekran',exact:true}).click();await expect(phone.getByRole('button',{name:'Nereye?',exact:true})).toBeVisible();
  await phone.getByRole('button',{name:'Ayarlar',exact:true}).click();await phone.getByRole('button',{name:'Kapat',exact:true}).click();
  const appRect=await phone.locator('#app').evaluate(el=>({scrollTop:el.scrollTop,y:el.getBoundingClientRect().y}));expect(appRect).toEqual({scrollTop:0,y:0});
});

test('navigation resources remain bounded across repeated start and end',async({page})=>{
  test.setTimeout(90000);
  const errors=await setup(page);const initial=await page.evaluate(()=>__yolcu.S.map.getStyle().layers.length);
  for(let i=0;i<4;i++){await routes(page);await page.locator('[data-act=preview]').click();await expect(page.locator('#nav')).toBeVisible();await page.evaluate(async()=>{const {S,diagnostics}=__yolcu;diagnostics.quality=2;const {setRouteBuildings}=await import('./js/mapstyle.js');setRouteBuildings(S.map,S.navRoute,0,2);__yolcu.endNav();});expect(await page.evaluate(()=>__yolcu.S.map.getStyle().layers.filter(l=>l.type==='fill-extrusion').every(l=>__yolcu.S.map.getLayoutProperty(l.id,'visibility')==='visible'))).toBe(true);}
  const state=await page.evaluate(()=>({timers:__yolcu.S.timers.length,sim:__yolcu.S.sim,raf:__yolcu.diagnostics.running,request:!!__yolcu.replanner.controller,retry:!!__yolcu.replanner.retry,layers:__yolcu.S.map.getStyle().layers.length}));
  expect(state).toEqual({timers:0,sim:null,raf:false,request:false,retry:false,layers:initial});expect(errors).toEqual([]);
});
test('fuel stop adds and removes a real multi-leg route while preserving avoids',async({page})=>{
  const errors=await setup(page);const stop=JSON.parse(readFileSync(new URL('./fixtures/izmir-stop-route.json',import.meta.url),'utf8')).stop;
  await page.route('**/*overpass*/**',r=>r.fulfill({json:{elements:[{lat:stop.lat,lon:stop.lon,tags:{name:stop.name,amenity:'fuel'}}]}}));
  const requests=[];page.on('request',r=>{if(r.url().includes('valhalla1')&&r.url().endsWith('/route'))requests.push(r.postDataJSON());});
  await page.evaluate(()=>__yolcu.store.avoids=[{lat:38.4,lon:27.4,name:'Test yolu'}]);
  await routes(page);await page.locator('[data-act=preview]').click();await page.locator('#nav-dist').waitFor({state:'visible'});await page.locator('#nav-bottom [data-act=openRoadside]').click();await page.locator('[data-rs=category][data-id=fuel]').click();
  await page.locator('[data-rs=detail]').first().click();await expect(page.locator('.stop-choice')).toHaveCount(1);await page.locator('.stop-choice').click();
  await page.waitForFunction(()=>__yolcu.S.navRoute?.stops?.length===1);
  expect(await page.evaluate(()=>__yolcu.S.navRoute.legEnds.length)).toBe(2);
  await page.locator('[data-act=toggleNavMenu]').click();await page.locator('[data-act=removeStop]').click();await page.waitForFunction(()=>__yolcu.S.navRoute?.stops?.length===0);
  const stopRequests=requests.filter(r=>r.locations.length>2);expect(stopRequests.length).toBeGreaterThan(0);expect(stopRequests.every(r=>r.exclude_locations.length===1&&r.costing_options.auto.exclude_unpaved===true)).toBe(true);expect(errors).toEqual([]);
});

test('live browser diagnostic sample and GPS loss recovery',async({page,context},testInfo)=>{
 const errors=await setup(page);await routes(page);await start(page,context);
 await page.evaluate(()=>{const {S,fixes}=__yolcu;navigator.geolocation.clearWatch(S.geoWatch);S.geoWatch=null;fixes.last.t=Date.now()-7000;});
 await expect(page.locator('#nav-status')).toContainText('Konum sinyali bekleniyor');
 const before=await page.evaluate(()=>({...__yolcu.S.displayPosition}));await page.waitForTimeout(1100);expect(await page.evaluate(()=>({...__yolcu.S.displayPosition}))).toEqual(before);
 await page.evaluate(()=>{const {S}=__yolcu;__yolcu.onPos({...S.pos,t:Date.now()});});await expect(page.locator('#nav-status')).toBeHidden();
 await page.evaluate(()=>{const {S,fixes}=__yolcu;fixes.reset();S.sim=null;});
 // Drive the shared GPS path at wall-clock 8 Hz; rendering uses real browser RAF.
 await page.evaluate(async()=>{const {pointAt,bearing}=await import('./js/geo.js');const {S}=__yolcu;window.profileTimer=setInterval(()=>{const d=(performance.now()-window.profileStart)*.008,p=pointAt(S.navRoute.coords,S.navRoute.cum,d),q=pointAt(S.navRoute.coords,S.navRoute.cum,d+3);__yolcu.onPos({...p,acc:5,speed:8,heading:bearing(p.lon,p.lat,q.lon,q.lat),t:Date.now()});},125);window.profileStart=performance.now();});
 await page.waitForTimeout(12000);
 const sample=await page.evaluate(()=>{clearInterval(window.profileTimer);return __yolcu.diagnostics.snapshot();});
 mkdirSync('artifacts',{recursive:true});writeFileSync(`artifacts/browser-profile-${testInfo.project.name}.json`,JSON.stringify({environment:testInfo.project.name,viewport:'390x844, headless desktop browser, map tiles over network',wallSampleSeconds:12,metrics:sample},null,2));
 expect(sample.frameSamples).toBeGreaterThan(100);expect(sample.processingP95Ms).toBeGreaterThan(0);expect(sample.renderP95Ms).toBeGreaterThan(0);
 await page.evaluate(()=>__yolcu.endNav());expect(await page.evaluate(()=>__yolcu.diagnostics.running)).toBe(false);expect(errors).toEqual([]);
});
