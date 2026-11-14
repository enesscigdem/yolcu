import {modelCatalog,trafficProxy,budget} from './services.mjs';
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {timingSafeEqual,randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';import {validateIntent} from '../js/needs.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),port=Number(process.env.PORT||4173);
const publicOrigin=process.env.APP_ORIGIN||null;const gatewayToken=process.env.YOLCU_GATEWAY_TOKEN||'';if(publicOrigin&&(!publicOrigin.startsWith('https://')||gatewayToken.length<32))throw new Error('HTTPS APP_ORIGIN ve en az 32 karakter YOLCU_GATEWAY_TOKEN gerekli');
const preferencePath=()=>process.env.AI_PREFERENCES_PATH||path.join(os.homedir(),'.config/yolcu/ai-preferences.json');
export async function aiConfig(){let file={},preferences={};try{file=JSON.parse(await fs.readFile(path.join(os.homedir(),'.config/yolcu/ai.json'),'utf8'));}catch{}try{preferences=JSON.parse(await fs.readFile(preferencePath(),'utf8'));}catch{}return {baseURL:process.env.AI_BASE_URL||file.baseURL||'https://yapayzekalab.org/v1',model:process.env.AI_MODEL||preferences.model||file.model||null,key:process.env.AI_API_KEY||file.key,modelLocked:!!process.env.AI_MODEL};}
export const systemPrompt='Türkçe yolculuk isteğini yalnız JSON olarak çözümle. needs yalnız fuel,market,migros,pharmacy,duty,break,food,cafe,alcohol,atm,parking,toilet,tire,battery; en fazla 3. destination home/work/null, maxExtraMinutes 0..30/null, openOnly boolean, fuel diesel/null, avoidTurn boolean, question belirsizlik varsa tek kısa soru. nöbetçi eczane her zaman duty, normal eczane pharmacy; duty talebi tek başına openOnly değildir. Motorin/mazot fuel ve fuel:diesel; Migros migros; eve destination:home. Örnek: Yakındaki nöbetçi eczaneyi durağa ekle => {"needs":["duty"],"destination":null,"openOnly":false}. Mekan, saat, trafik, fiyat, koordinat veya süre icat etme. Bu verileri uygulama gerçek servislerden alır. İstek rotayı otomatik değiştirmez.';
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
let dutyCache=null;const limits=new Map();
async function body(req){let data='';for await(const part of req){data+=part;if(data.length>8192)throw new Error('İstek çok uzun');}return JSON.parse(data||'{}');}
export async function handle(req,res){
 const url=new URL(req.url,'http://localhost'),host=req.headers.host;
 const isPublic=publicOrigin&&host===new URL(publicOrigin).host;
 if(isPublic){const supplied=Buffer.from(String(req.headers['x-yolcu-gateway']||'')),expected=Buffer.from(gatewayToken);if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return json(res,403,{error:'Kimliği doğrulanmış ağ geçidi gerekli'});}
 if(!isPublic&&![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return json(res,403,{error:'Yalnız yerel bağlantı kabul edilir'});
 if(req.headers.origin&&![isPublic?publicOrigin:'http://'+host].includes(req.headers.origin))return json(res,403,{error:'Farklı kaynak reddedildi'});
 if(url.pathname.startsWith('/api/')){
  const ac=new AbortController();res.on('close',()=>{if(!res.writableEnded)ac.abort();});
  try{
   if(url.pathname==='/api/duty'&&req.method==='GET'){
    if(!dutyCache||Date.now()-dutyCache.t>300000){const r=await fetch('https://openapi.izmir.bel.tr/api/ibb/nobetcieczaneler',{signal:AbortSignal.any([ac.signal,AbortSignal.timeout(15000)])});if(!r.ok)throw new Error('Resmî nöbet verisi alınamadı');const rows=await r.json();if(!Array.isArray(rows))throw new Error('Resmî nöbet verisi geçersiz');dutyCache={t:Date.now(),rows};}
    return json(res,200,{fetchedAt:dutyCache.t,source:'https://openapi.izmir.bel.tr/api/ibb/nobetcieczaneler',rows:dutyCache.rows});
   }
   if(url.pathname.startsWith('/api/traffic/')){
    const result=await trafficProxy(url,req,AbortSignal.any([ac.signal,AbortSignal.timeout(15000)]),body);
    res.writeHead(200,{'Content-Type':result.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(result.data);
   }
   const config=await aiConfig(),providerConfigured=!!(config.key&&config.baseURL),configured=!!(providerConfigured&&config.model);
   if(url.pathname==='/api/services'&&req.method==='GET')return json(res,200,{traffic:!!process.env.TOMTOM_API_KEY,ai:providerConfigured});
   const status={configured,providerConfigured,model:config.model,modelLocked:config.modelLocked,message:configured?'Sunucuda model seçili':providerConfigured?'Hesabından bir model seç':'Sunucu sağlayıcı bağlantısı bekleniyor'};
   if(url.pathname==='/api/ai/status'&&req.method==='GET')return json(res,200,status);
   if(!url.pathname.startsWith('/api/ai/'))return json(res,404,{error:'İşlem bulunamadı'});
   budget(req.socket.remoteAddress,'ai',20);
   const began=performance.now(),signal=AbortSignal.any([ac.signal,AbortSignal.timeout(12000)]);
   if((url.pathname==='/api/ai/models'&&req.method==='GET')||(url.pathname==='/api/ai/test'&&req.method==='POST')){
    if(req.method==='POST')await body(req);
    const models=await modelCatalog(config,signal);return json(res,200,{...status,models,available:models.some(m=>m.id===config.model),latencyMs:performance.now()-began});
   }
   if(url.pathname==='/api/ai/model'&&req.method==='POST'){
    if(config.modelLocked)return json(res,409,{error:'Model sunucunun AI_MODEL ayarıyla sabitlenmiş. Sunucu yöneticisi bu ayarı kaldırınca uygulamadan seçim yapılabilir.',code:'model_locked'});
    const input=await body(req);if(typeof input.model!=='string'||input.model.length>120)return json(res,400,{error:'Geçersiz model'});
    const models=await modelCatalog(config,signal);if(!models.some(m=>m.id===input.model))return json(res,400,{error:'Model hesabın güncel listesinde yok'});
    const filename=preferencePath();await fs.mkdir(path.dirname(filename),{recursive:true});const temporary=filename+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify({model:input.model}),{mode:0o600});await fs.rename(temporary,filename);
    return json(res,200,{model:input.model,message:'Model seçimi kaydedildi'});
   }
   if(!configured)return json(res,503,{error:providerConfigured?'Önce hesabından bir model seç.':'Yapay zekâ sunucu bağlantısı henüz hazır değil.',code:'missing_configuration'});
   const base=new URL(config.baseURL);if(base.protocol!=='https:'||base.username||base.password)throw new Error('Sağlayıcı adresi HTTPS olmalı');
   const headers={Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'};
   if(url.pathname==='/api/ai/interpret'&&req.method==='POST'){
    const input=await body(req);if(typeof input.text!=='string'||!input.text.trim()||input.text.length>1200)return json(res,400,{error:'İsteğini 1–1200 karakterle yaz'});
    const r=await fetch(base.href.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers,signal,body:JSON.stringify({model:config.model,messages:[{role:'system',content:systemPrompt},{role:'user',content:input.text}],temperature:0,max_tokens:250,response_format:{type:'json_object'}})});
    if(!r.ok)return json(res,502,{error:`Model isteği tamamlanamadı (${r.status})`});const raw=await r.json(),text=raw.choices?.[0]?.message?.content||'';if(text.length>4096)throw new Error('Model yanıtı geçersiz');const intent=validateIntent(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,'')));return json(res,200,{intent,latencyMs:performance.now()-began,usage:raw.usage?{input:raw.usage.prompt_tokens,output:raw.usage.completion_tokens}:null});
   }
   return json(res,404,{error:'İşlem bulunamadı'});
  }catch(e){if(!res.destroyed)json(res,e.status||502,{error:e.code?e.message:e.name==='TimeoutError'?'Servis zaman aşımı; normal arama kullanılabilir':'Servis yanıtı alınamadı; normal arama kullanılabilir',code:e.code||'service_unavailable'});return;}
 }
 if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Yöntem desteklenmiyor'});
 let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'Geçersiz adres'});}
 const rel=pathname==='/'?'index.html':pathname.replace(/^\//,'');
 if(rel.split('/').some(s=>s.startsWith('.')||['server','node_modules','artifacts','tests','tools'].includes(s))||!/^([\w-]+\/)*[\w .-]+$/.test(rel))return json(res,404,{error:'Bulunamadı'});
 const full=path.resolve(root,rel);if(!full.startsWith(root+path.sep))return json(res,404,{error:'Bulunamadı'});
 try{const data=await fs.readFile(full),ext=path.extname(full),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{json(res,404,{error:'Bulunamadı'});}
}
if(process.argv[1]===fileURLToPath(import.meta.url))http.createServer(handle).listen(port,'127.0.0.1',()=>console.log(`Yolcu http://127.0.0.1:${port} · anahtarlar sunucu dışında yerel yapılandırmada`));
