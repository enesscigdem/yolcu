import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../js/audio.js';
import { rankRoutes, planRoutes } from '../js/api.js';
import { Navigator } from '../js/nav.js';
import { cumulative, fixTimestamp } from '../js/geo.js';

function audioHarness(mode) {
  const log = []; let oscillator;
  const prefs = { soundMode: mode, radar: true };
  const session = { set type(t) { log.push(['session', t]); } };
  const env = { navigator: { audioSession: session }, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, speechSynthesis: { getVoices: () => [], addEventListener() {}, speak(u) { log.push(['speech', u]); }, cancel() { log.push(['cancel']); } }, AudioContext: class { constructor() { log.push(['context']); this.currentTime = 0; this.destination = {}; } async resume() { log.push(['resume']); } async close() { log.push(['close']); } createOscillator() { oscillator = { frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; return oscillator; } createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } } };
  return { audio: createAudio(prefs, env), prefs, log, ended: () => oscillator.onended() };
}
test('silent launch, navigation and foreground paths make zero audio/session calls', async () => {
  const {audio,log}=audioHarness('silent');audio.init();audio.say('Başladı');await audio.beep();audio.stop();audio.stop();
  assert.deepEqual(log, []);
});
test('alerts mode rejects speech and releases the alert context after the beep', async () => {
  const {audio,log,ended,prefs}=audioHarness('alerts');prefs.radar=false;audio.say('Anons');await audio.beep(1);ended();
  assert.equal(log.some(x=>x[0]==='speech'),false);assert.equal(log.filter(x=>x[0]==='close').length,1);assert.deepEqual(log.at(-1),['session','auto']);
});
test('switching to silence cancels pending speech and leaves no delayed announcement', () => {
  const {audio,log,prefs}=audioHarness('guidance');audio.say('Sağa dönün');const u=log.find(x=>x[0]==='speech')[1];audio.setMode('silent');u.onend();audio.say('Yeni rota');
  assert.equal(prefs.soundMode,'silent');assert.equal(log.filter(x=>x[0]==='speech').length,1);assert.equal(log.filter(x=>x[0]==='cancel').length,1);assert.deepEqual(log.at(-1),['session','auto']);
});
function route(time, small, turns = 0) {
  return {time,mode:'auto',maneuvers:Array.from({length:turns},()=>({type:10})),stats:{total:10000,motorway:0,main:10000-small,small,steep:0,rough:0,steps:0,gradeKnown:10000,surfaceKnown:10000}};
}
test('comfort preference has a hard extra-time limit, including traffic and reranking',()=>{
  const fast=route(600,7000,8),comfort=route(899,0,1),tooSlow=route(910,0,0);
  let ranked=rankRoutes([fast,comfort,tooSlow],{highways:true,maxExtraMinutes:5});assert.equal(ranked[0],comfort);assert.equal(comfort.extraSeconds,299);assert.ok(comfort.reasons.includes('Daha az dönüş'));
  ranked=rankRoutes(ranked,{highways:true,maxExtraMinutes:0});assert.equal(ranked[0],fast);assert.equal(comfort.best,undefined);
  for(const r of ranked){r.trafficTime=r.time;r.trafficCheckedAt=Date.now();}comfort.trafficTime=1100;ranked=rankRoutes(ranked,{highways:true,maxExtraMinutes:5});assert.equal(ranked[0],fast);
});
test('missing road analysis does not generate positive main-road or hill claims',()=>{
  const r={time:600,mode:'auto',maneuvers:[]};rankRoutes([r],{maxExtraMinutes:5});assert.deepEqual(r.reasons,[]);
});
function navRoute() {
  const coords=[[27,38],[27,38.005],[27,38.01],[27.005,38.01]];const cum=cumulative(coords);
  return {coords,cum,lengthM:cum.at(-1),time:180,mode:'auto',maneuvers:[{along:0,lengthM:cum[2],time:130,type:1,street:'Test yolu'},{along:cum[2],lengthM:cum[3]-cum[2],time:50,type:10,street:'Dönüş'},{along:cum[3],lengthM:0,time:0,type:4,street:'Hedef'}]};
}
test('matched vehicle coordinate and progress agree; stopped heading remains stable',()=>{
  const nav=new Navigator(navRoute());let st=nav.update({lon:27.00003,lat:38.002,acc:8,speed:10,heading:0,t:1000});assert.equal(st.matched,true);assert.equal(st.position.lon,27);assert.ok(st.along>200);
  st=nav.update({lon:27.00003,lat:38.002,acc:8,speed:0,heading:190,t:2000});assert.equal(st.position.heading,0);
});
test('off-route fix stays at real coordinate and cannot finish or advance a distant route',()=>{
  const nav=new Navigator(navRoute());const before=nav.update({lon:27,lat:38.002,acc:8,speed:10,heading:0,t:1000});nav.lastReroute=0;
  const p={lon:27.003,lat:38.006,acc:8,speed:10,heading:90,t:2000};let st=nav.update(p);assert.equal(st.matched,false);assert.equal(st.position.lon,p.lon);assert.equal(st.along,before.along);assert.equal(st.arrived,false);
  nav.update({...p,t:3000});st=nav.update({...p,t:4000});assert.equal(st.reroute,true);
});
test('poor GPS and repeated UI updates cannot trigger off-route recalculation',()=>{
  const nav=new Navigator(navRoute());nav.lastReroute=0;
  for(let i=0;i<5;i++) assert.equal(nav.update({lon:27.003,lat:38.006,acc:120,speed:10,heading:90,t:1000+i*1000}).reroute,false);
  const p={lon:27.003,lat:38.006,acc:8,speed:10,heading:90,t:7000};for(let i=0;i<5;i++) assert.equal(nav.update(p).reroute,false);
});
test('existing installs migrate to silence; trip, favorite, avoids and settings survive backup',async()=>{
  const memory=new Map([['yolcu.v1',JSON.stringify({prefs:{voice:true,radarSound:true}})]]);globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  const {store,save,addTrip,toggleRouteSaved,exportBackup,importBackup,packForLink}=await import('../js/store.js?storage-test');
  store.tomtomKey='local-test-credential-1234567890';save();
  assert.equal(memory.has('yolcu.tomtom.v1'),false);assert.ok(!memory.get('yolcu.v1').includes(store.tomtomKey));
  assert.ok(!exportBackup().includes(store.tomtomKey));assert.ok(!Buffer.from(packForLink().replace(/-/g,'+').replace(/_/g,'/'),'base64').toString().includes(store.tomtomKey));
  assert.equal(store.prefs.soundMode,'silent');const prefsRef=store.prefs;
  const trip={id:'completed',dest:{name:'İş',lon:27,lat:38},origin:{name:'Ev',lon:27,lat:38},duration:600,distance:2000,endedAt:Date.now(),coords:[[27,38],[27.01,38]],segments:[]};
  addTrip(trip);toggleRouteSaved(trip);store.avoids=[{lon:27,lat:38,name:'Dar yol'}];store.prefs.maxExtraMinutes=3;save();const backup=exportBackup();store.trips=[];store.savedRoutes=[];store.avoids=[];importBackup(backup);
  assert.equal(store.prefs,prefsRef);assert.equal(store.trips[0].id,'completed');assert.equal(store.savedRoutes[0].id,'completed');assert.equal(store.avoids.length,1);assert.equal(JSON.parse(memory.get('yolcu.v1')).prefs.maxExtraMinutes,3);
  const previousLocation=globalThis.location;
  try {
    globalThis.location={hostname:'localhost',search:'?preview=1'};
    const preview=await import('../js/store.js?preview-shared-credential');
    assert.equal(preview.store.tomtomKey,null);assert.equal(preview.store.prefs.maxExtraMinutes,5);assert.equal(preview.store.trips.length,0);
  } finally { if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation; }
});

test('GPS microsecond timestamps normalize before staleness and ordering checks',()=>{
  const now=1794665974952;assert.equal(fixTimestamp(now*1000,now),now);assert.equal(fixTimestamp(now,now),now);assert.equal(fixTimestamp(null,now),now);
});

test('partial traffic failures fall back to one comparable timing basis for all alternatives',()=>{
  const a=route(600,7000,8),b=route(899,0,1);a.trafficTime=1200;a.trafficCheckedAt=Date.now();b.trafficUnavailable=true;
  const ranked=rankRoutes([a,b],{highways:true,maxExtraMinutes:5});assert.equal(ranked[0],b);assert.equal(a.trafficTime,undefined);assert.equal(a.trafficCheckedAt,undefined);assert.ok(ranked.every(r=>r.trafficUnavailable));
});
