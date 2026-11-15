import test from 'node:test';import assert from 'node:assert/strict';
import gateway from '../server/gateway/worker.mjs';import {gatewayEnv} from './gateway-harness.js';
const call=(env,path,options={})=>gateway.fetch(new Request('https://gateway.invalid'+path,{...options,headers:{Origin:env.FRONTEND_ORIGIN,'CF-Connecting-IP':'192.0.2.1',...options.headers}}),env);
async function login(env){const r=await call(env,'/api/session',{method:'POST',body:JSON.stringify({password:env.APP_PASSWORD})});assert.equal(r.status,200);return (await r.json()).token;}
test('gateway requires owner auth, supports Safari CORS without cookies and exposes no provider credentials',async()=>{
 const env=gatewayEnv();assert.equal((await call(env,'/api/health')).status,200);assert.equal((await call(env,'/api/services')).status,401);
 const preflight=await call(env,'/api/traffic/search/2/search/Konak.json',{method:'OPTIONS'});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),env.FRONTEND_ORIGIN);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
 assert.equal((await call(env,'/api/services',{headers:{Origin:'https://other.invalid'}})).status,403);
 const token=await login(env),r=await call(env,'/api/services',{headers:{Authorization:'Bearer '+token}}),text=await r.text();assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');for(const secret of [env.TOMTOM_API_KEY,env.AI_API_KEY,env.APP_PASSWORD,env.SESSION_SECRET])assert.ok(!text.includes(secret));
 assert.equal((await call(env,'/api/services',{headers:{Authorization:'Bearer '+token.slice(0,-2)+'xx'}})).status,401);
});
test('gateway has no open relay and only injects the traffic credential at the fixed provider host',async()=>{
 const env=gatewayEnv(),token=await login(env),original=globalThis.fetch;let requests=0;
 globalThis.fetch=async(url,options)=>{requests++;const u=new URL(url);assert.equal(u.origin,'https://api.tomtom.com');assert.equal(u.searchParams.get('key'),env.TOMTOM_API_KEY);assert.equal(options.redirect,'manual');return Response.json({results:[{poi:{name:'Public business'},position:{lat:38,lon:27}}]});};
 try{const headers={Authorization:'Bearer '+token};const r=await call(env,'/api/traffic/search/2/search/Konak.json?limit=1',{headers});assert.equal(r.status,200);assert.ok(!(await r.text()).includes(env.TOMTOM_API_KEY));for(const path of ['/api/traffic/https://other.invalid/','/api/traffic/search/2/search/Konak.json?key=client-key'])assert.equal((await call(env,path,{headers})).status,400);assert.equal(requests,1);}finally{globalThis.fetch=original;}
});
test('dynamic real catalog shape and durable model selection work without persisting a provider key',async()=>{
 const env=gatewayEnv(),token=await login(env),headers={Authorization:'Bearer '+token},original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://yapayzekalab.org/v1/models');assert.equal(options.headers.Authorization,'Bearer '+env.AI_API_KEY);return Response.json({data:[{id:'account-a'},{id:'account-b',name:'Account B'}]});};
 try{const catalog=await(await call(env,'/api/ai/models',{headers})).json();assert.deepEqual(catalog.models.map(x=>x.id),['account-a','account-b']);assert.equal(catalog.model,null);const r=await call(env,'/api/ai/model',{method:'POST',headers,body:'{"model":"account-b"}'});assert.equal(r.status,200);assert.equal((await(await call(env,'/api/ai/status',{headers})).json()).model,'account-b');assert.equal((await call(env,'/api/ai/model',{method:'POST',headers,body:'{"model":"invented"}'})).status,400);env.AI_MODEL='account-a';assert.equal((await call(env,'/api/ai/model',{method:'POST',headers,body:'{"model":"account-b"}'})).status,409);}finally{globalThis.fetch=original;}
});
test('missing gateway secrets cannot be presented as a ready public backend',async()=>{const env=gatewayEnv({SESSION_SECRET:''});assert.equal((await(await call(env,'/api/health')).json()).ready,false);assert.equal((await call(env,'/api/session',{method:'POST',body:'{}'})).status,503);});
test('shared persistent limiter bounds repeated login attempts across requests',async()=>{const env=gatewayEnv();for(let i=0;i<5;i++)assert.equal((await call(env,'/api/session',{method:'POST',body:'{"password":"wrong"}'})).status,401);assert.equal((await call(env,'/api/session',{method:'POST',body:'{"password":"wrong"}'})).status,429);});
