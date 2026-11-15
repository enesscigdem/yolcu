import test from 'node:test';
import assert from 'node:assert/strict';

test('Pages remote session uses CORS authorization, persists only its URL and expires without touching personal data',async()=>{
 const saved={location:Object.getOwnPropertyDescriptor(globalThis,'location'),fetch:globalThis.fetch,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage};
 const personal='{"work":{"name":"Private place"}}',local=new Map([['yolcu.v1',personal]]),session=new Map(),storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 Object.defineProperty(globalThis,'location',{configurable:true,value:{hostname:'enesscigdem.github.io',href:'https://enesscigdem.github.io/yolcu/'}});globalThis.localStorage=storage(local);globalThis.sessionStorage=storage(session);
 const b=await import('../js/backend.js?remote-session-test');let expiresAt=Date.now()+60000,unauthorized=false;const requests=[];
 globalThis.fetch=async(url,options)=>{requests.push({url,options});if(url.endsWith('/api/health'))return Response.json({service:'yolcu-gateway',apiVersion:1,ready:true});if(url.endsWith('/api/session'))return Response.json({token:'temporary-owner-session',expiresAt});return Response.json({}, {status:unauthorized?401:200});};
 try{
  assert.equal(b.hasBackend(),false);for(const value of ['http://gateway.example','https://gateway.example/api/','https://key@gateway.example','https://gateway.example?key=secret','http://localhost:8787'])assert.throws(()=>b.normalizeBackend(value));
  await b.connectBackend('https://gateway.example','owner-password');assert.equal(b.backendConnected(),true);assert.equal(local.get('yolcu.gateway.origin'),'https://gateway.example');assert.equal([...local.values()].some(v=>v.includes('temporary-owner-session')||v.includes('owner-password')),false);
  await b.serviceFetch('/api/ai/models');const request=requests.at(-1);assert.equal(request.options.credentials,'omit');assert.equal(request.options.headers.get('Authorization'),'Bearer temporary-owner-session');assert.equal(request.url,'https://gateway.example/api/ai/models');
  assert.deepEqual(b.backendHeaders('https://tiles.example/api/vector.pbf'),{});assert.deepEqual(b.backendHeaders('https://gateway.example/unrelated'),{});assert.equal(b.backendHeaders('https://gateway.example/api/traffic/tile').Authorization,'Bearer temporary-owner-session');assert.throws(()=>b.apiURL('https://other.example/api/models'));
  unauthorized=true;await b.serviceFetch('/api/ai/models');assert.equal(b.backendConnected(),false);assert.equal(session.has('yolcu.gateway.session'),false);await assert.rejects(()=>b.serviceFetch('/api/services'),/oturumu gerekli/);
  b.disconnectBackend();assert.equal(b.hasBackend(),false);assert.equal(local.get('yolcu.v1'),personal);assert.equal(local.size,1);
 }finally{b.disconnectBackend();globalThis.fetch=saved.fetch;globalThis.localStorage=saved.localStorage;globalThis.sessionStorage=saved.sessionStorage;if(saved.location)Object.defineProperty(globalThis,'location',saved.location);else delete globalThis.location;}
});
