import test from 'node:test';
import assert from 'node:assert/strict';
import {TripAssistant,hasServerAPI} from '../js/assistant.js';

test('Pages release keeps local commands usable without requesting an absent backend',async()=>{
 const originalLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),originalFetch=globalThis.fetch;
 Object.defineProperty(globalThis,'location',{value:{hostname:'enesscigdem.github.io'},configurable:true});
 let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected request');};
 try{
  assert.equal(hasServerAPI(),false);assert.equal(hasServerAPI('localhost'),true);
  assert.equal(hasServerAPI('yolcu.example.com'),true);
  const assistant=new TripAssistant();
  assert.equal((await assistant.status(true)).hosted,false);
  assert.deepEqual((await assistant.interpret('Motorin',false)).needs,['fuel']);
  await assert.rejects(()=>assistant.interpret('Motorin',true),/sunucusu henüz bağlı değil/);
  assert.equal(calls,0);
 }finally{
  globalThis.fetch=originalFetch;
  if(originalLocation)Object.defineProperty(globalThis,'location',originalLocation);else delete globalThis.location;
 }
});

test('Pages preview has isolated storage and does not alter the owner journey or preferences',async()=>{
 const originalLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),originalStorage=globalThis.localStorage;
 const real=JSON.stringify({work:{name:'My work',lon:27,lat:38},activeNav:{dest:{name:'Real journey'},t:123},prefs:{soundMode:'guidance'}}),values=new Map([['yolcu.v1',real],['yolcu.tomtom.v1','legacy-owner-value']]);
 Object.defineProperty(globalThis,'location',{value:{hostname:'enesscigdem.github.io',search:'?preview=1'},configurable:true});globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try{const {store,save}=await import('../js/store.js?pages-preview-isolation');assert.equal(store.work,null);store.work={name:'Demo',lon:27,lat:38};save();assert.equal(values.get('yolcu.v1'),real);assert.equal(values.get('yolcu.tomtom.v1'),'legacy-owner-value');assert.equal(JSON.parse(values.get('yolcu.preview.v1')).work.name,'Demo');}
 finally{globalThis.localStorage=originalStorage;if(originalLocation)Object.defineProperty(globalThis,'location',originalLocation);else delete globalThis.location;}
});
