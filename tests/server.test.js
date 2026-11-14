import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {handle} from '../server/dev.mjs';
async function localServer(fn){const server=http.createServer(handle);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
const headers={Host:'127.0.0.1:4173'};
function request(url,init={}){return new Promise((resolve,reject)=>{const req=http.request(url,{method:init.method||'GET',headers:init.headers||{}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve(new Response(text,{status:res.statusCode})));});req.on('error',reject);req.end(init.body);});}

test('backend refuses other hosts and origins and cannot serve private or development paths',()=>localServer(async base=>{for(const name of ['/server/dev.mjs','/artifacts/umber-reference.js','/.config/yolcu/ai.json','/node_modules/@playwright/test/package.json']){const r=await request(base+name,{headers});assert.equal(r.status,404);}assert.equal((await request(base+'/api/ai/status',{headers:{Host:'other.example'}})).status,403);assert.equal((await request(base+'/api/ai/interpret',{method:'POST',headers:{...headers,Origin:'https://other.example'}})).status,403);}));
test('backend sends only text to a model and returns an allowlisted intent without credentials',()=>localServer(async base=>{
 const before={key:process.env.AI_API_KEY,model:process.env.AI_MODEL,base:process.env.AI_BASE_URL},realFetch=global.fetch;process.env.AI_API_KEY='test-server-only-credential';process.env.AI_MODEL='test-model';process.env.AI_BASE_URL='https://provider.invalid/v1';let payload;
 global.fetch=async(url,opts)=>{if(String(url).startsWith('https://provider.invalid')){payload=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({needs:['market'],place:'invented'})}}],usage:{prompt_tokens:2,completion_tokens:2}})};}return realFetch(url,opts);};
 try{const r=await request(base+'/api/ai/interpret',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({text:'Açık market bul',position:{lon:27,lat:38},key:'never-send'})});const text=await r.text(),j=JSON.parse(text);assert.equal(r.status,200);assert.deepEqual(j.intent.needs,['market']);assert.equal(j.intent.place,undefined);assert.ok(!text.includes('test-server-only-credential'));assert.ok(!JSON.stringify(payload).includes('never-send'));assert.ok(!JSON.stringify(payload).includes('position'));}finally{global.fetch=realFetch;for(const [name,value] of [['AI_API_KEY',before.key],['AI_MODEL',before.model],['AI_BASE_URL',before.base]])if(value===undefined)delete process.env[name];else process.env[name]=value;}
}));

test('server catalog accepts dynamic account models, persists only preference and explains a locked model',()=>localServer(async base=>{
 const names=['AI_API_KEY','AI_BASE_URL','AI_MODEL','AI_PREFERENCES_PATH'],before=Object.fromEntries(names.map(n=>[n,process.env[n]])),realFetch=global.fetch;
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yolcu-models-'));
 process.env.AI_API_KEY='only-test-server-key';process.env.AI_BASE_URL='https://provider.invalid/v1';delete process.env.AI_MODEL;process.env.AI_PREFERENCES_PATH=path.join(dir,'preferences.json');
 let requests=0;global.fetch=async(url,options)=>{requests++;assert.equal(options.headers.Authorization,'Bearer only-test-server-key');return new Response(JSON.stringify({data:[{id:'account-model-a'},{id:'account-model-c',name:'Hesabımdaki model',modality:['text','image']}]}));};
 try{
  const catalog=await (await request(base+'/api/ai/models',{headers})).json();assert.deepEqual(catalog.models.map(m=>m.id),['account-model-a','account-model-c']);assert.equal(catalog.model,null);assert.ok(!JSON.stringify(catalog).includes(process.env.AI_API_KEY));
  const choice=await request(base+'/api/ai/model',{method:'POST',headers,body:JSON.stringify({model:'account-model-c'})});assert.equal(choice.status,200);const saved=await fs.readFile(process.env.AI_PREFERENCES_PATH,'utf8');assert.deepEqual(JSON.parse(saved),{model:'account-model-c'});assert.ok(!saved.includes('key'));
  assert.equal((await (await request(base+'/api/ai/status',{headers})).json()).model,'account-model-c');
  assert.equal((await request(base+'/api/ai/model',{method:'POST',headers,body:'{"model":"invented"}'})).status,400);
  process.env.AI_MODEL='account-model-a';const prior=requests;const locked=await request(base+'/api/ai/model',{method:'POST',headers,body:'{"model":"account-model-c"}'});assert.equal(locked.status,409);assert.equal((await locked.json()).code,'model_locked');assert.equal(requests,prior);
 }finally{global.fetch=realFetch;for(const n of names)if(before[n]===undefined)delete process.env[n];else process.env[n]=before[n];await fs.rm(dir,{recursive:true,force:true});}
}));
test('traffic gateway injects the server credential and refuses client keys and arbitrary destinations',()=>localServer(async base=>{
 const before=process.env.TOMTOM_API_KEY,realFetch=global.fetch;process.env.TOMTOM_API_KEY='only-server-traffic-key';let calls=0;
 global.fetch=async(url,options)=>{calls++;const target=new URL(url);assert.equal(target.origin,'https://api.tomtom.com');assert.equal(target.searchParams.get('key'),'only-server-traffic-key');assert.equal(options.redirect,'error');return new Response('{"results":[]}',{headers:{'Content-Type':'application/json'}});};
 try{const r=await request(base+'/api/traffic/search/2/search/Konak.json?limit=1',{headers});assert.equal(r.status,200);assert.equal(await r.text(),'{"results":[]}');
 for(const p of ['/api/traffic/https://evil.invalid/','/api/traffic/search/2/search/Konak.json?key=client-secret','/api/traffic/not-allowed'])assert.equal((await request(base+p,{headers})).status,400);assert.equal(calls,1);
 }finally{global.fetch=realFetch;if(before===undefined)delete process.env.TOMTOM_API_KEY;else process.env.TOMTOM_API_KEY=before;}
}));
