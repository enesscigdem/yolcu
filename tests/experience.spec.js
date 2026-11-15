import {test,expect} from '@playwright/test';
import {setup as setupApp,routes} from './browser-helpers.js';
import {readFileSync} from 'node:fs';
const multi=JSON.parse(readFileSync(new URL('./fixtures/izmir-multiple-stops.json',import.meta.url)));
async function setup(page){await page.addInitScript(()=>{if(!localStorage.getItem('yolcu.v1'))localStorage.setItem('yolcu.v1',JSON.stringify({work:{name:'Bornova',lat:38.4599,lon:27.2215,kind:'work'},prefs:{theme:'light',tilt:false}}));});return setupApp(page);}

test('search, business detail and route back keep the query and calling screen',async({page})=>{
 const errors=await setup(page),p=multi[0].stops[0];await page.route('**/photon.komoot.io/**',r=>r.fulfill({json:{features:[{geometry:{coordinates:[p.lon,p.lat]},properties:{name:p.name,osm_key:'amenity',osm_value:'fuel'}}]}}));
 await page.locator('[data-act=openSearch]').click();await page.locator('#q').fill(p.name);await page.locator('[data-act=pick]').first().click();await expect(page.locator('#sheet-body h2')).toHaveText(p.name);
 await page.locator('[data-act=directions]').click();await expect(page.locator('.start-route')).toBeVisible({timeout:20000});await page.locator('[data-act=closeRoutes]').click();await expect(page.locator('#sheet-body h2')).toHaveText(p.name);
 await page.locator('[data-act=backScreen]').click();await expect(page.locator('#q')).toHaveValue(p.name);await expect(page.locator('[data-act=pick]').first()).toBeVisible();await page.locator('[data-act=cancelSearch]').click();await expect(page.locator('.home-discover')).toBeVisible();expect(errors).toEqual([]);
});
test('settings subflows return to settings and canceling an address does not leak pick mode',async({page})=>{
 await setup(page);await page.locator('[data-act=openSettings]').click();await page.locator('[data-act=openSettingsSection][data-section=journey]').click();await page.locator('#settings [data-act=personalPlaces]').click();await page.locator('[data-rs=back]').click();await expect(page.locator('#settings')).toBeVisible();
 await page.locator('[data-act=setFav][data-k=work]').click();await page.locator('[data-act=cancelSearch]').click();await expect(page.locator('#settings')).toBeVisible();await page.locator('[data-act=closeSettings]').click();await page.locator('[data-act=closeSettings]').click();await page.locator('[data-act=openSearch]').click();expect(await page.evaluate(()=>__yolcu.S.pickFor)).toBeNull();
});
test('model selection uses a dynamic server catalog and handles a model lock without invented choices',async({page})=>{
 const errors=await setup(page);let chosen=null;const models=[{id:'account-a',label:'Hesap modeli A'},{id:'account-b',label:'Hesap modeli B'},{id:'account-c',label:'Hesap modeli C'}];
 await page.route('**/api/ai/models',r=>r.fulfill({json:{models,model:'account-a',modelLocked:false}}));await page.route('**/api/ai/model',r=>{chosen=r.request().postDataJSON().model;return r.fulfill({json:{model:chosen}});});
 await page.locator('[data-act=openSettings]').click();await page.locator('[data-act=openModels]').click();await expect(page.getByRole('radio')).toHaveCount(3);await page.locator('[data-model=account-c]').click();await expect(page.locator('[data-model=account-c]')).toHaveAttribute('aria-checked','true');expect(chosen).toBe('account-c');await expect(page.locator('#ai-model-select')).toHaveCount(0);
 await page.route('**/api/ai/models',r=>r.fulfill({json:{models,model:'account-c',modelLocked:true}}));await page.locator('[data-act=refreshModels]').click();await expect(page.locator('.model-notice')).toContainText('AI_MODEL');for(const model of models)await expect(page.locator(`[data-model=${model.id}]`)).toBeDisabled();expect(errors).toEqual([]);
});
test('browser traffic requests never send a provider credential and legacy credential storage is cleared',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('yolcu.tomtom.v1','legacy-test-credential'));await setup(page);const seen=[];
 await page.route('**/api/traffic/**',r=>{seen.push(r.request().url());return r.fulfill({json:{results:[]}});});
 const result=await page.evaluate(async()=>{const t=await import('./js/traffic.js');await t.search('never-send-test-key','kahve',{lon:27,lat:38});return {tile:t.flowTiles('never-send-test-key'),legacy:localStorage.getItem('yolcu.tomtom.v1')};});
 expect(result.legacy).toBeNull();expect(result.tile).toMatch(/^\/api\/traffic\//);expect(result.tile).not.toContain('key=');expect(seen.length).toBe(1);expect(seen[0]).not.toContain('key=');expect(seen[0]).not.toContain('never-send');
});
test('home favorites and primary controls fit narrow and large phones in both themes',async({page})=>{
 await setup(page);for(const size of [{width:320,height:568},{width:390,height:844},{width:440,height:956}]){
 await page.setViewportSize(size);for(const theme of ['dark','light']){await page.locator('[data-act=openSettings]').click();await page.locator(`[data-act=theme][data-v=${theme}]`).click();await page.locator('[data-act=closeSettings]').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('[data-act=openRoadside]').first()).toBeVisible();const time=page.locator('.fav[data-k=work] em');if(await time.count())expect(await time.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
 }
});
test('dwell updates total arrival impact once and result selection survives map/list changes',async({page})=>{
 await setup(page);await page.route('**/*overpass*/**',r=>r.fulfill({json:{elements:multi[0].stops.map(p=>({lat:p.lat,lon:p.lon,tags:{name:p.name,amenity:'fuel'}}))}}));await routes(page);await page.locator('[data-act=preview]').click();await page.waitForFunction(()=>__yolcu.S.sim);await page.evaluate(()=>{const {S}=__yolcu;S.sim.pause();setInterval(()=>__yolcu.onPos({...S.pos,speed:0,t:Date.now()}),500);});
 await page.locator('#nav-bottom [data-act=openRoadside]').click();await page.locator('[data-rs=category][data-id=fuel]').click();await page.locator('[data-rs=detail]').first().click();const old=await page.locator('#rs-impact b').innerText();await page.locator('#stop-dwell').fill('10');const expected=await page.evaluate(()=>Math.round((__yolcu.roadside.options[0].totalSeconds+600)/60)+' dk');await expect(page.locator('#rs-impact b')).toHaveText(expected);expect(expected).not.toBe(old);await expect(page.locator('#rs-impact')).toContainText('duraklama dahil');await expect(page.locator('#nav')).toBeVisible();
});

test('a static or failed model endpoint does not invent choices or prevent routing; leaving cancels stale catalog UI',async({page})=>{
 await setup(page);let requests=0,release;const gate=new Promise(r=>release=r);
 await page.route('**/api/ai/models',async r=>{if(++requests===1)return r.fulfill({status:200,contentType:'text/html',body:'<html>static host</html>'});await gate;try{await r.fulfill({json:{models:[{id:'late-account-model'}],model:null}});}catch{}});
 await page.locator('[data-act=openSettings]').click();await page.locator('[data-act=openModels]').click();await expect(page.locator('.model-status')).toContainText('Normal arama ve yol tarifi');await expect(page.getByRole('radio')).toHaveCount(0);
 await page.locator('[data-act=closeSettings]').click();await page.locator('[data-act=openModels]').click();await expect(page.locator('.model-status')).toContainText('yükleniyor');await page.locator('[data-act=closeSettings]').click();release();await expect(page.locator('.page-head h1')).toHaveText('Ayarlar');await expect(page.locator('.model-options')).toHaveCount(0);await page.locator('[data-act=closeSettings]').click();await routes(page);await expect(page.locator('.start-route')).toBeVisible();
});

test('canceling resume cannot carry old stops or dwell into another journey; dwell can be ended explicitly',async({page})=>{
 await setup(page);const p=multi[0].stops[0];await page.evaluate(p=>{__yolcu.store.activeNav={dest:{name:'Bornova',lat:38.4599,lon:27.2215},stops:[{...p,dwellMinutes:10}],activeDwell:{lon:p.lon,lat:p.lat,until:Date.now()+600000},t:Date.now()};},p);
 await page.locator('[data-act=openSettings]').click();await page.locator('[data-act=closeSettings]').click();let release;const gate=new Promise(r=>release=r);let hold=true;
 await page.route('**/valhalla1.openstreetmap.de/route',async r=>{if(hold)await gate;try{await r.fallback();}catch{}});
 await page.locator('[data-act=resumeNav]').click();await page.locator('[data-act=closeRoutes]').click();hold=false;release();await routes(page);await page.locator('[data-act=preview]').click();await page.waitForFunction(()=>__yolcu.S.sim);await page.evaluate(()=>__yolcu.S.sim.pause());
 expect(await page.evaluate(()=>({stops:__yolcu.S.stops.length,dwell:__yolcu.S.activeDwell}))).toEqual({stops:0,dwell:null});
 await page.evaluate(()=>{const {S}=__yolcu;S.activeDwell={lon:S.pos.lon,lat:S.pos.lat,until:Date.now()+600000};__yolcu.navTick(S.pos);});expect(await page.evaluate(()=>__yolcu.S.timing.dwellSeconds)).toBeGreaterThan(590);
 await page.locator('[data-act=toggleNavMenu]').click();await page.locator('[data-act=finishDwell]').click();expect(await page.evaluate(()=>__yolcu.S.activeDwell)).toBeNull();expect(await page.evaluate(()=>__yolcu.S.timing.dwellSeconds)).toBe(0);
});

test('adding a pinned place from personal places returns to its calling settings section',async({page})=>{
 await setup(page);const p=multi[0].stops[0];await page.route('**/photon.komoot.io/**',r=>r.fulfill({json:{features:[{geometry:{coordinates:[p.lon,p.lat]},properties:{name:p.name,osm_key:'amenity',osm_value:'fuel'}}]}}));
 await page.locator('[data-act=openSettings]').click();await page.locator('[data-act=openSettingsSection][data-section=journey]').click();await page.locator('#settings [data-act=personalPlaces]').click();await page.locator('[data-rs=editPinned][data-id=home]').click();await page.locator('#q').fill(p.name);await page.locator('[data-act=pick]').first().click();await expect(page.locator('#roadside')).toBeVisible();await expect(page.locator('[data-rs=goPinned][data-id=home]')).toContainText(p.name);await page.locator('[data-rs=back]').click();await expect(page.locator('#settings')).toBeVisible();await expect(page.locator('.page-head h1')).toHaveText('Yerlerim ve yolculuk');
});

test('terrain detail is optional and independent from 3D buildings',async({page})=>{
 const errors=await setup(page);expect(await page.evaluate(()=>__yolcu.S.map.getTerrain())).toBeNull();
 await page.locator('[data-act=openLayers]').click();await page.locator('[data-pref=relief]').check();expect(await page.evaluate(()=>__yolcu.store.prefs.relief)).toBe(true);expect(await page.evaluate(()=>__yolcu.S.map.getLayoutProperty('yolcu-hillshade','visibility'))).toBe('visible');
 await page.locator('[data-act=closeLayers]').click();await page.locator('[data-act=toggle3d]').click();expect(await page.evaluate(()=>__yolcu.S.map.getTerrain()?.source)).toBe('dem3d');await page.locator('[data-act=openLayers]').click();await page.locator('[data-pref=relief]').uncheck();expect(await page.evaluate(()=>__yolcu.S.map.getTerrain())).toBeNull();expect(await page.evaluate(()=>__yolcu.store.prefs.tilt)).toBe(true);expect(errors).toEqual([]);
});

test('real candidate pins appear before route timing and back preserves an ongoing calculation and dwell',async({page})=>{
 await setup(page);await page.route('**/*overpass*/**',r=>r.fulfill({json:{elements:multi[0].stops.map(p=>({lat:p.lat,lon:p.lon,tags:{name:p.name,amenity:'fuel'}}))}}));await routes(page);await page.locator('[data-act=preview]').click();await page.waitForFunction(()=>__yolcu.S.sim);await page.evaluate(()=>{const {S,roadside}=__yolcu;S.sim.pause();setInterval(()=>__yolcu.onPos({...S.pos,speed:0,t:Date.now()}),500);const original=roadside.planner;let release;const gate=new Promise(r=>release=r);window.releaseStopPlanning=release;roadside.planner=async(...args)=>{await gate;return original(...args);};});
 await page.locator('#nav-bottom [data-act=openRoadside]').click();await page.locator('[data-rs=category][data-id=fuel]').click();await expect(page.locator('.rs-map-pin').first()).toBeAttached();await expect(page.locator('.rs-summary')).not.toHaveCount(0);await page.locator('[data-rs=detail]').first().click();await expect(page.locator('.stop-choice')).toBeDisabled();await page.locator('#stop-dwell').fill('10');await page.locator('[data-rs=back]').click();await page.locator('[data-rs=detail]').first().click();await expect(page.locator('#stop-dwell')).toHaveValue('10');await page.evaluate(()=>window.releaseStopPlanning());await expect(page.locator('.stop-choice')).toBeEnabled({timeout:25000});await expect(page.locator('#stop-dwell')).toHaveValue('10');await expect(page.locator('#rs-impact')).not.toContainText('NaN');await expect(page.locator('#nav')).toBeVisible();
});

test('expired traffic returns every alternative to the same clock without changing the selected route',async({page})=>{
 await setup(page);await page.locator('[data-act=openRoadside]').first().click();await expect(page.locator('.roadside-head h2')).toHaveText('Yakında bul');await page.locator('[data-rs=close]').click();await routes(page);
 await page.evaluate(()=>{const {S}=__yolcu;S.routes.forEach((r,i)=>{r.trafficTime=r.time*1.5;r.trafficCheckedAt=Date.now()-(i===0?400000:1000);r.trafficDelay=300;});window.chosenRoute=S.routes[1];});
 await page.locator('[data-act=selRoute][data-i="1"]').click();expect(await page.evaluate(()=>__yolcu.S.routes[__yolcu.S.sel]===window.chosenRoute)).toBe(true);expect(await page.evaluate(()=>__yolcu.S.routes.every(r=>r.trafficTime==null))).toBe(true);await expect(page.locator('.traffic-caption')).not.toContainText('Canlı trafik ·');
});

for(const target of ['list','map'])test(`finishing stop timing during a pointer gesture preserves the intended business tap via ${target}`,async({page})=>{
 const errors=await setup(page);await page.route('**/*overpass*/**',r=>r.fulfill({json:{elements:multi[0].stops.map(p=>({lat:p.lat,lon:p.lon,tags:{name:p.name,amenity:'fuel'}}))}}));await routes(page);await page.locator('[data-act=preview]').click();await page.waitForFunction(()=>__yolcu.S.sim);
 await page.evaluate(()=>{const {S,roadside}=__yolcu;S.sim.pause();S.follow=false;setInterval(()=>__yolcu.onPos({...S.pos,speed:0,t:Date.now()}),500);const original=roadside.planner;let release;const gate=new Promise(r=>release=r);window.releaseTapPlanning=release;roadside.planner=async(...args)=>{await gate;return original(...args);};});
 await page.locator('#nav-bottom [data-act=openRoadside]').click();await page.locator('[data-rs=category][data-id=fuel]').click();await expect(page.locator('[data-rs=detail]').first()).toBeVisible();if(target==='map')await page.evaluate(()=>{const {S,roadside}=__yolcu,p=roadside.options[0].place;S.map.jumpTo({center:[p.lon,p.lat],pitch:0,padding:{top:120,bottom:460,left:0,right:0}});});const button=page.locator(target==='map'?'.rs-map-pin':'[data-rs=detail]').first();await expect(button).toBeVisible();const count=await page.locator('.rs-summary').count(),name=await button.getAttribute('aria-label'),bounds=await button.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.evaluate(()=>window.releaseTapPlanning());
 await expect(page.locator('#rs-search-progress')).toHaveText(`Karşılaştırılıyor · ${count}/${count}`,{timeout:20000});await expect(button).toHaveAttribute('aria-label',name);await page.mouse.up();await expect(page.locator('.stop-choice')).toBeEnabled({timeout:20000});await expect(page.locator('.rs-place h3')).toHaveText(name.replace(' detayları',''));expect(errors).toEqual([]);
});
