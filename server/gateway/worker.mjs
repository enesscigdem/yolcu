import {modelCatalog,fetchTraffic,trafficKind,boundedJSON,providerError} from '../providers.mjs';
import {systemPrompt} from '../ai-prompt.mjs';
import {validateIntent} from '../../js/needs.js';
export {GatewayState} from './state.mjs';
const text=new TextEncoder(),decode=new TextDecoder(),ttl=12*3600;
const bytes64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const signingKey=env=>crypto.subtle.importKey('raw',text.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
async function session(env){const now=Math.floor(Date.now()/1000),header=bytes64(text.encode(JSON.stringify({alg:'HS256',typ:'JWT'}))),payload=bytes64(text.encode(JSON.stringify({iss:'yolcu-gateway',aud:env.FRONTEND_ORIGIN,iat:now,exp:now+ttl}))),input=header+'.'+payload;return {token:input+'.'+bytes64(await crypto.subtle.sign('HMAC',await signingKey(env),text.encode(input))),expiresAt:(now+ttl)*1000};}
async function authorized(request,env){
 const value=request.headers.get('Authorization')||'';if(!value.startsWith('Bearer ')||value.length>4096)return false;
 try{const token=value.slice(7).split('.');if(token.length!==3)return false;const header=JSON.parse(decode.decode(from64(token[0]))),payload=JSON.parse(decode.decode(from64(token[1]))),now=Math.floor(Date.now()/1000);return header.alg==='HS256'&&header.typ==='JWT'&&payload.iss==='yolcu-gateway'&&payload.aud===env.FRONTEND_ORIGIN&&payload.iat<=now+30&&payload.exp>now&&payload.exp-payload.iat<=ttl&&await crypto.subtle.verify('HMAC',await signingKey(env),from64(token[2]),text.encode(token[0]+'.'+token[1]));}catch{return false;}
}
async function equalPassword(a,b){if(typeof a!=='string'||a.length>256)return false;const x=new Uint8Array(await crypto.subtle.digest('SHA-256',text.encode(a))),y=new Uint8Array(await crypto.subtle.digest('SHA-256',text.encode(b)));let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;}
async function body(request){let length=0;const chunks=[],reader=request.body?.getReader();if(!reader)return {};try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();throw providerError('İstek çok uzun.',413,'request_too_large');}chunks.push(value);}}finally{reader.releaseLock();}const data=new Uint8Array(length);let at=0;for(const b of chunks){data.set(b,at);at+=b.length;}try{return JSON.parse(decode.decode(data));}catch{throw providerError('Geçersiz JSON.',400,'invalid_request');}}
function state(env,id){return env.STATE.get(env.STATE.idFromName(id));}
async function model(env){return env.AI_MODEL||(await(await state(env,'owner-preferences').fetch('https://state/model')).json()).model||null;}
async function rate(env,client,kind,limit){const hash=bytes64(await crypto.subtle.digest('SHA-256',text.encode(client))),r=await state(env,'rate:'+kind+':'+hash).fetch('https://state/limit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit})});if(!(await r.json()).allowed)throw providerError('İstek sınırına ulaşıldı. Biraz sonra tekrar dene.',429,'rate_limit');}
function ready(env){try{const u=new URL(env.FRONTEND_ORIGIN);return (u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))&&u.origin===env.FRONTEND_ORIGIN&&env.APP_PASSWORD?.length>=20&&env.APP_PASSWORD.length<=256&&env.SESSION_SECRET?.length>=32&&!!env.STATE;}catch{return false;}}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin'),cors=origin===env.FRONTEND_ORIGIN?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{},headers={...cors,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},json=(status,data)=>Response.json(data,{status,headers});
 if(origin&&origin!==env.FRONTEND_ORIGIN)return json(403,{error:'Bu uygulama kaynağına izin verilmiyor.',code:'origin_denied'});
 if(request.method==='OPTIONS')return origin===env.FRONTEND_ORIGIN?new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'600'}}):json(403,{error:'Kaynak gerekli.'});
 const url=new URL(request.url),client=request.headers.get('CF-Connecting-IP')||'unknown',signal=AbortSignal.any([request.signal,AbortSignal.timeout(15000)]);
 try{
  if(url.pathname==='/api/health'&&request.method==='GET')return json(200,{service:'yolcu-gateway',apiVersion:1,ready:ready(env)});
  if(!ready(env))return json(503,{error:'Gateway kurulumu henüz tamamlanmadı.',code:'gateway_unconfigured'});
  if(url.pathname==='/api/session'&&request.method==='POST'){await rate(env,client,'login',5);const input=await body(request);if(!await equalPassword(input.password,env.APP_PASSWORD))return json(401,{error:'Bağlantı parolası doğrulanamadı.',code:'invalid_password'});return json(200,await session(env));}
  if(!await authorized(request,env))return json(401,{error:'Bağlantı oturumu gerekli veya süresi doldu. Ayarlardan yeniden bağlan.',code:'session_required'});
  if(url.pathname.startsWith('/api/traffic/')){const kind=trafficKind(url,request.method);await rate(env,client,kind.tile?'tiles':'traffic',kind.tile?600:120);const result=await fetchTraffic(url,request.method,env.TOMTOM_API_KEY,signal,()=>body(request));return new Response(result.data,{headers:{...headers,'Content-Type':result.type}});}
  if(url.pathname==='/api/services'&&request.method==='GET')return json(200,{traffic:!!env.TOMTOM_API_KEY,ai:!!env.AI_API_KEY,gateway:true});
  if(url.pathname==='/api/duty'&&request.method==='GET'){await rate(env,client,'duty',20);const r=await fetch('https://openapi.izmir.bel.tr/api/ibb/nobetcieczaneler',{signal,redirect:'manual'});if(!r.ok)throw providerError('Resmî nöbet verisi alınamadı.');const rows=await boundedJSON(r);if(!Array.isArray(rows))throw providerError('Nöbet verisi geçersiz.');return json(200,{fetchedAt:Date.now(),source:'https://openapi.izmir.bel.tr/api/ibb/nobetcieczaneler',rows});}
  if(!url.pathname.startsWith('/api/ai/'))return json(404,{error:'İşlem bulunamadı.'});
  await rate(env,client,'ai',20);const selected=await model(env),config={key:env.AI_API_KEY,baseURL:'https://yapayzekalab.org/v1',model:selected},status={providerConfigured:!!env.AI_API_KEY,configured:!!(env.AI_API_KEY&&selected),model:selected,modelLocked:!!env.AI_MODEL};
  if(url.pathname==='/api/ai/status'&&request.method==='GET')return json(200,status);
  if((url.pathname==='/api/ai/models'&&request.method==='GET')||(url.pathname==='/api/ai/test'&&request.method==='POST')){const began=performance.now(),models=await modelCatalog(config,signal);return json(200,{...status,models,available:models.some(m=>m.id===selected),latencyMs:performance.now()-began});}
  if(url.pathname==='/api/ai/model'&&request.method==='POST'){
   if(env.AI_MODEL)return json(409,{error:'Model sunucunun AI_MODEL ayarıyla sabitlenmiş.',code:'model_locked'});const input=await body(request),models=await modelCatalog(config,signal);if(!models.some(m=>m.id===input.model))return json(400,{error:'Bu model hesap kataloğunda yok.',code:'model_unavailable'});await state(env,'owner-preferences').fetch('https://state/model',{method:'POST',body:JSON.stringify({model:input.model})});return json(200,{model:input.model});
  }
  if(url.pathname==='/api/ai/interpret'&&request.method==='POST'){
   if(!status.configured)return json(503,{error:'Sunucu bağlantısını ve model seçimini tamamla.',code:'missing_configuration'});const input=await body(request);if(typeof input.text!=='string'||!input.text.trim()||input.text.length>1200)return json(400,{error:'İsteğini 1–1200 karakterle yaz.'});const began=performance.now();
   const r=await fetch(config.baseURL+'/chat/completions',{method:'POST',redirect:'manual',signal,headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:selected,messages:[{role:'system',content:systemPrompt},{role:'user',content:input.text}],temperature:0,max_tokens:250,response_format:{type:'json_object'}})});
   if(!r.ok)throw providerError('Model isteği şu anda tamamlanamadı.',r.status===429?429:502,'model_unavailable');const raw=await boundedJSON(r,config.key),content=raw.choices?.[0]?.message?.content||'';if(content.length>4096)throw providerError('Model yanıtı geçersiz.');let intent;try{intent=validateIntent(JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g,'')));}catch{throw providerError('Model isteği güvenle çözümlenemedi.');}return json(200,{intent,latencyMs:performance.now()-began});
  }
  return json(404,{error:'İşlem bulunamadı.'});
 }catch(error){return json(error.status||502,{error:error.code?error.message:error.name==='TimeoutError'?'Servis zaman aşımına uğradı.':'Servis şu anda yanıt vermedi.',code:error.code||'service_unavailable'});}
}};
