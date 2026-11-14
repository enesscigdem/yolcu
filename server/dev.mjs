import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {timingSafeEqual} from 'node:crypto';import {fileURLToPath} from 'node:url';import {validateIntent} from '../js/needs.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),port=Number(process.env.PORT||4173);
const publicOrigin=process.env.APP_ORIGIN||null;const gatewayToken=process.env.YOLCU_GATEWAY_TOKEN||'';if(publicOrigin&&(!publicOrigin.startsWith('https://')||gatewayToken.length<32))throw new Error('HTTPS APP_ORIGIN ve en az 32 karakter YOLCU_GATEWAY_TOKEN gerekli');
export async function aiConfig(){let file={};try{file=JSON.parse(await fs.readFile(path.join(os.homedir(),'.config/yolcu/ai.json'),'utf8'));}catch{}return {baseURL:process.env.AI_BASE_URL||file.baseURL,model:process.env.AI_MODEL||file.model,key:process.env.AI_API_KEY||file.key};}
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
   const config=await aiConfig(),configured=!!(config.key&&config.model&&config.baseURL);
   if(url.pathname==='/api/ai/status'&&req.method==='GET')return json(res,200,{configured,model:config.model||null,message:configured?'Sunucuda yapılandırıldı · henüz test edilmedi':'Sağlayıcı, model ve sunucu anahtarı bekleniyor'});
   if(!configured)return json(res,503,{error:'Yapay zekâ bağlantısı yapılandırılmadı; kategori aramaları kullanılabilir'});
   const base=new URL(config.baseURL);if(base.protocol!=='https:'||base.username||base.password)throw new Error('Sağlayıcı adresi HTTPS olmalı');
   const client=req.socket.remoteAddress,now=Date.now(),recent=(limits.get(client)||[]).filter(t=>now-t<60000);if(recent.length>=10)return json(res,429,{error:'Bir dakika içinde tekrar dene'});recent.push(now);limits.set(client,recent);
   const headers={Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},began=performance.now(),signal=AbortSignal.any([ac.signal,AbortSignal.timeout(12000)]);
   if(url.pathname==='/api/ai/model'&&req.method==='POST'){
    const input=await body(req);if(typeof input.model!=='string'||input.model.length>120)return json(res,400,{error:'Geçersiz model'});
    const r=await fetch(base.href.replace(/\/$/,'')+'/models',{headers,signal});if(!r.ok)return json(res,502,{error:'Hesap model listesi alınamadı'});const j=await r.json();if(!(j.data||[]).some(m=>m.id===input.model))return json(res,400,{error:'Model hesap listesinde yok'});
    if(process.env.AI_MODEL)return json(res,409,{error:'Model sunucunun AI_MODEL ortam ayarıyla yönetiliyor'});
    const filename=path.join(os.homedir(),'.config/yolcu/ai.json');await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,JSON.stringify({baseURL:config.baseURL,key:config.key,model:input.model},null,2),{mode:0o600});return json(res,200,{message:'Sunucu modeli kaydedildi: '+input.model});
   }
   if(url.pathname==='/api/ai/test'&&req.method==='POST'){
    await body(req);const r=await fetch(base.href.replace(/\/$/,'')+'/models',{headers,signal});if(!r.ok)return json(res,502,{error:`Sağlayıcı bağlantısı reddedildi (${r.status})`});const j=await r.json(),models=(j.data||[]).filter(x=>!x.modality||/metin|text/i.test(x.modality)).map(x=>({id:String(x.id),pricing:x.pricing||null})).slice(0,200);return json(res,200,{configured:true,model:config.model,available:models.some(m=>m.id===config.model),models,latencyMs:performance.now()-began,message:'Model listesi alındı; Türkçe doğruluk ve maliyet henüz ölçülmedi'});
   }
   if(url.pathname==='/api/ai/interpret'&&req.method==='POST'){
    const input=await body(req);if(typeof input.text!=='string'||!input.text.trim()||input.text.length>1200)return json(res,400,{error:'İsteğini 1–1200 karakterle yaz'});
    const r=await fetch(base.href.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers,signal,body:JSON.stringify({model:config.model,messages:[{role:'system',content:systemPrompt},{role:'user',content:input.text}],temperature:0,max_tokens:250,response_format:{type:'json_object'}})});
    if(!r.ok)return json(res,502,{error:`Model isteği tamamlanamadı (${r.status})`});const raw=await r.json(),text=raw.choices?.[0]?.message?.content||'';if(text.length>4096)throw new Error('Model yanıtı geçersiz');const intent=validateIntent(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,'')));return json(res,200,{intent,latencyMs:performance.now()-began,usage:raw.usage?{input:raw.usage.prompt_tokens,output:raw.usage.completion_tokens}:null});
   }
   return json(res,404,{error:'İşlem bulunamadı'});
  }catch(e){if(!res.destroyed)json(res,502,{error:e.name==='TimeoutError'?'Servis zaman aşımı; normal arama kullanılabilir':'Servis yanıtı alınamadı; normal arama kullanılabilir'});return;}
 }
 if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Yöntem desteklenmiyor'});
 let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'Geçersiz adres'});}
 const rel=pathname==='/'?'index.html':pathname.replace(/^\//,'');
 if(rel.split('/').some(s=>s.startsWith('.')||['server','node_modules','artifacts','tests','tools'].includes(s))||!/^([\w-]+\/)*[\w .-]+$/.test(rel))return json(res,404,{error:'Bulunamadı'});
 const full=path.resolve(root,rel);if(!full.startsWith(root+path.sep))return json(res,404,{error:'Bulunamadı'});
 try{const data=await fs.readFile(full),ext=path.extname(full),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{json(res,404,{error:'Bulunamadı'});}
}
if(process.argv[1]===fileURLToPath(import.meta.url))http.createServer(handle).listen(port,'127.0.0.1',()=>console.log(`Yolcu http://127.0.0.1:${port} · anahtarlar sunucu dışında yerel yapılandırmada`));
