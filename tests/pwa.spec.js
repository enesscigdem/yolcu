import {test,expect} from '@playwright/test';
import {setup} from './browser-helpers.js';

test('installed shell and MapLibre can launch offline without caching private API responses',async({browser})=>{
 test.setTimeout(90000);
 const context=await browser.newContext({baseURL:'http://localhost:4173',viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow',permissions:['geolocation'],geolocation:{longitude:27.1045,latitude:38.3695,accuracy:8}});
 try{
  const page=await context.newPage();await setup(page);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const cache=await page.evaluate(async()=>{await fetch('/api/services');const names=await caches.keys();const entries=(await Promise.all(names.map(async n=>(await(await caches.open(n)).keys()).map(r=>r.url)))).flat();return {entries,manifest:await(await fetch('manifest.webmanifest')).json(),viewport:document.querySelector('meta[name=viewport]').content};});
  expect(cache.entries.some(url=>url.endsWith('/js/timing.js'))).toBe(true);expect(cache.entries.some(url=>url.endsWith('/experience.css'))).toBe(true);expect(cache.entries.filter(url=>new URL(url).pathname.startsWith('/api/'))).toEqual([]);
  expect(cache.manifest.display).toBe('standalone');expect(cache.manifest.scope).toBe('./');expect(cache.viewport).toContain('viewport-fit=cover');expect(cache.viewport).not.toContain('user-scalable=no');
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.home-discover')).toBeVisible({timeout:20000});
  expect(await page.evaluate(()=>typeof maplibregl.Map)).toBe('function');await page.locator('[data-act=openSettings]').click();await expect(page.locator('#settings')).toBeVisible();
 }finally{await context.close();}
});

test('keyboard-sized visual viewport leaves editable panels and controls reachable with safe areas',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('yolcu.v1',JSON.stringify({prefs:{tilt:false,theme:'light'}})));await setup(page);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-t','59px');document.documentElement.style.setProperty('--safe-b','34px');});
 await page.locator('[data-act=openRoadside]').first().click();await page.locator('[data-rs=park]').click();
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight-320});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:0});visualViewport.dispatchEvent(new Event('resize'));});
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kb'))).toBe('320px');
 await page.locator('#park-note').fill('Klavye kontrolü');const input=await page.locator('#park-note').boundingBox(),panel=await page.locator('#roadside').boundingBox();expect(input.y).toBeGreaterThanOrEqual(panel.y);expect(input.y+input.height).toBeLessThanOrEqual(524);expect(panel.y+panel.height).toBeLessThanOrEqual(524-34);
 await page.locator('[data-rs=back]').click();await page.locator('[data-rs=close]').click();await page.locator('[data-act=openSettings]').click();await page.locator('[data-act=openModels]').click();const bounds=await page.locator('#settings').boundingBox();expect(bounds.y+bounds.height).toBeLessThanOrEqual(524);
 await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kb'))).toBe('0px');
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:400});Object.defineProperty(visualViewport,'scale',{configurable:true,value:2});visualViewport.dispatchEvent(new Event('resize'));});await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kb'))).toBe('0px');
});
