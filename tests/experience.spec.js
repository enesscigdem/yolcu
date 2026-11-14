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
 await setup(page);await page.locator('[data-act=openSettings]').click();await page.locator('#settings [data-act=personalPlaces]').click();await page.locator('[data-rs=back]').click();await expect(page.locator('#settings')).toBeVisible();
 await page.locator('[data-act=setFav][data-k=work]').click();await page.locator('[data-act=cancelSearch]').click();await expect(page.locator('#settings')).toBeVisible();await page.locator('[data-act=closeSettings]').click();await page.locator('[data-act=openSearch]').click();expect(await page.evaluate(()=>__yolcu.S.pickFor)).toBeNull();
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
