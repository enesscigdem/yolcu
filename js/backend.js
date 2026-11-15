// Only a gateway URL persists. Short-lived app sessions stay in sessionStorage;
// provider keys never enter this module, personal backups, URLs or map requests.
const ORIGIN='yolcu.gateway.origin',SESSION='yolcu.gateway.session';let memoryOrigin=null,memorySession=null;
const read=(storage,key)=>{try{return globalThis[storage]?.getItem(key)||null;}catch{return null;}};
const write=(storage,key,value)=>{try{if(value===null)globalThis[storage]?.removeItem(key);else globalThis[storage]?.setItem(key,value);}catch{}};
function notice(){queueMicrotask(()=>globalThis.dispatchEvent?.(new Event('yolcu-backend-session')));}
export function normalizeBackend(value){
 const u=new URL(String(value).trim()),local=['localhost','127.0.0.1'].includes(u.hostname)&&!globalThis.location?.hostname?.endsWith('.github.io');
 if((u.protocol!=='https:'&&!(local&&u.protocol==='http:'))||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Sunucunun yalnız HTTPS adresini gir. API anahtarı veya /api yolu ekleme.');
 return u.origin;
}
export function backendOrigin(){const value=memoryOrigin??read('localStorage',ORIGIN);if(!value)return '';try{return normalizeBackend(value);}catch{return '';}}
function currentSession(){
 const origin=backendOrigin();let session=memorySession;try{session ||= JSON.parse(read('sessionStorage',SESSION)||'null');}catch{}
 if(session?.origin===origin&&typeof session.token==='string'&&session.expiresAt>Date.now())return session;
 if(session){memorySession=null;write('sessionStorage',SESSION,null);notice();}return null;
}
export function backendConnected(){return !!(backendOrigin()&&currentSession());}
export function hasBackend(hostname=globalThis.location?.hostname||''){return !!backendOrigin()||!hostname.toLowerCase().endsWith('.github.io');}
export function apiURL(path){if(!path.startsWith('/api/')||path.includes('://'))throw new Error('Sunucu yolu geçersiz.');return backendOrigin()+path;}
export function backendHeaders(url){
 const origin=backendOrigin();if(!origin)return {};
 try{const target=new URL(url,globalThis.location?.href);if(target.origin!==origin||!target.pathname.startsWith('/api/'))return {};const session=currentSession();return session?{Authorization:`Bearer ${session.token}`}:{ };}catch{return {};}
}
export async function serviceFetch(path,options={}){
 const origin=backendOrigin(),headers=new Headers(options.headers),timeout=AbortSignal.timeout(15000);
 if(!hasBackend())throw new Error('Bu yayında sunucu bağlantısı henüz kurulmadı. Ayarlar → Trafik ve sunucu bağlantısı bölümünden bağlan.');
 if(origin){const session=currentSession();if(!session)throw new Error('Bağlantı oturumu gerekli. Sunucu parolasıyla yeniden bağlan.');headers.set('Authorization',`Bearer ${session.token}`);}
 const r=await fetch(apiURL(path),{...options,headers,credentials:origin?'omit':'same-origin',redirect:'error',signal:options.signal?AbortSignal.any([options.signal,timeout]):timeout});
 if(origin&&r.status===401){memorySession=null;write('sessionStorage',SESSION,null);notice();}return r;
}
export async function connectBackend(value,password){
 const origin=normalizeBackend(value),request=(path,options={})=>fetch(origin+path,{...options,mode:'cors',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
 const health=await request('/api/health');if(!health.ok||!health.headers.get('content-type')?.includes('application/json'))throw new Error('Bu adreste çalışan bir Yolcu gateway bulunamadı.');const status=await health.json();if(status.service!=='yolcu-gateway'||status.apiVersion!==1||!status.ready)throw new Error('Sunucu kurulumu henüz tamamlanmadı.');
 const r=await request('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Sunucu bağlantısı doğrulanamadı.');
 if(typeof data.token!=='string'||data.token.length>4096||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now())throw new Error('Sunucu oturumu geçersiz.');
 memoryOrigin=origin;memorySession={origin,token:data.token,expiresAt:data.expiresAt};write('localStorage',ORIGIN,origin);write('sessionStorage',SESSION,JSON.stringify(memorySession));notice();return origin;
}
export function disconnectBackend(){memoryOrigin='';memorySession=null;write('localStorage',ORIGIN,null);write('sessionStorage',SESSION,null);notice();}
