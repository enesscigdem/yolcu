import {webkit} from '@playwright/test';import fs from 'node:fs';import {setup,routes,start} from '../tests/browser-helpers.js';
const browser=await webkit.launch(),context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{longitude:27.1045,latitude:38.3695,accuracy:8},serviceWorkers:'block',colorScheme:'light'}),page=await context.newPage();
try{
 await setup(page);await routes(page);await start(page,context);await page.evaluate(()=>{navigator.geolocation.clearWatch(__yolcu.S.geoWatch);__yolcu.S.geoWatch=null;});
 await page.route('**/api/ai/interpret',async r=>{await new Promise(resolve=>setTimeout(resolve,14000));try{await r.fulfill({status:503,json:{error:'Profil için yavaş servis'}});}catch{}});
 const phases=[];
 for(const name of ['Sadece sürüş','Yol üstü paneli + yavaş model']){
  if(phases.length){await page.locator('#nav-bottom [data-act=openRoadside]').click();await page.locator('#trip-command').fill('Eve giderken motorin ve Migros');await page.locator('#use-trip-model').check();await page.locator('[data-rs=interpret]').click();}
  await page.evaluate(async()=>{const {S,fixes,diagnostics}=__yolcu;S.nav.setRoute(S.navRoute);fixes.reset();const {pointAt,bearing}=await import('./js/geo.js');window.profileEpoch=performance.now();const feed=()=>{const d=(performance.now()-window.profileEpoch)*.008,p=pointAt(S.navRoute.coords,S.navRoute.cum,d),q=pointAt(S.navRoute.coords,S.navRoute.cum,d+3);__yolcu.onPos({...p,acc:5,speed:8,heading:bearing(p.lon,p.lat,q.lon,q.lat),t:Date.now()});};feed();diagnostics.frames.length=0;diagnostics.processing.length=0;diagnostics.render.length=0;window.profileTimer=setInterval(feed,125);});
  await page.waitForTimeout(11000);
  phases.push({name,wallSeconds:11,inputHz:8,metrics:await page.evaluate(()=>{clearInterval(window.profileTimer);return __yolcu.diagnostics.snapshot();})});
 }
 const report={environment:'Mac arm64 · headless WebKit · 390×844 · aynı ilk 88 m yol, 8 Hz sentetik GPS · gerçek RAF/işlem/harita render zamanı',note:'iPhone veya GPU sunum ölçümü değil; ağdan harita karoları ve masaüstü yükü sonucu etkiler',phases};fs.writeFileSync('artifacts/controlled-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
