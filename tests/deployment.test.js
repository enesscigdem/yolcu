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
