import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {setup,routes} from './browser-helpers.js';
const stops=JSON.parse(readFileSync(new URL('./fixtures/izmir-multiple-stops.json',import.meta.url)))[0].stops;

test('one-tap dwell and favorite toggles preserve the selected business until an explicit stop addition',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('yolcu.v1',JSON.stringify({work:{name:'Bornova',lat:38.4599,lon:27.2215,kind:'work'},prefs:{theme:'light',tilt:false}})));
 const errors=await setup(page);await page.route('**/*overpass*/**',r=>r.fulfill({json:{elements:stops.map(p=>({lat:p.lat,lon:p.lon,tags:{name:p.name,amenity:'fuel'}}))}}));
 const requests=[];page.on('request',r=>{if(r.url().endsWith('/route'))requests.push(r.url());});await routes(page);await page.locator('[data-act=preview]').click();await page.waitForFunction(()=>__yolcu.S.sim);
 await page.evaluate(()=>{const {S}=__yolcu;S.sim.pause();setInterval(()=>__yolcu.onPos({...S.pos,speed:0,t:Date.now()}),500);});
 await page.locator('#nav-bottom [data-act=openRoadside]').click();await page.locator('[data-rs=category][data-id=fuel]').click();await page.waitForFunction(()=>!__yolcu.roadside.busy);await page.locator('[data-rs=detail]').first().click();
 const base=parseInt(await page.locator('#rs-impact b').innerText(),10),beforeRequests=requests.length;await page.evaluate(()=>window.routeBeforeComfort=__yolcu.S.navRoute);
 const ten=page.getByRole('button',{name:'10 dk duraklama',exact:true});await ten.click();await expect(page.locator('#stop-dwell')).toHaveValue('10');await expect(ten).toHaveAttribute('aria-pressed','true');await expect(page.locator('#rs-impact b')).toHaveText(`${base+10} dk`);
 await page.setViewportSize({width:320,height:568});expect(await ten.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#stop-dwell').fill('7');await expect(page.locator('[data-rs=setDwell][aria-pressed=true]')).toHaveCount(0);await expect(page.locator('#rs-impact b')).toHaveText(`${base+7} dk`);await ten.click();
 const star=page.locator('[data-rs=savePlace]');await star.click();await expect(star).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>__yolcu.store.places.length)).toBe(1);await star.click();await expect(star).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>__yolcu.store.places.length)).toBe(0);await star.click();
 await page.locator('[data-rs=back]').click();await page.locator('[data-rs=detail]').first().click();await expect(page.locator('#stop-dwell')).toHaveValue('10');await expect(page.locator('[data-rs=setDwell][data-minutes="10"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-rs=savePlace]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.rs-map-pin.selected')).toHaveCount(1);
 expect(await page.evaluate(()=>__yolcu.S.navRoute===window.routeBeforeComfort)).toBe(true);expect(requests.length).toBe(beforeRequests);
 await page.locator('[data-rs=add]').click();await page.waitForFunction(()=>__yolcu.S.stops.length===1);expect(await page.evaluate(()=>__yolcu.S.stops[0].dwellMinutes)).toBe(10);await page.locator('#nav-bottom [data-act=openRoadside]').click();await page.locator('[data-rs=stops]').click();await expect(page.locator('.rs-stop-list')).toContainText('10 dk duraklama');expect(errors).toEqual([]);
});
