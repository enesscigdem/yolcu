import {localIntent,validateIntent} from './needs.js';
export const RELEASE = '2026.11.14.1';
export const SERVER_UNAVAILABLE = 'Bu yayında yapay zekâ sunucusu henüz bağlı değil. Cihazda komut çözümleme ve normal kategori aramaları kullanılabilir.';
export function hasServerAPI(hostname=globalThis.location?.hostname||''){return !hostname.toLowerCase().endsWith('.github.io');}
export class TripAssistant {
 constructor(){this.cache=new Map();this.controller=null;this.version=0;}
 cancel(){this.version++;this.controller?.abort();this.controller=null;}
 async status(test=false){if(!hasServerAPI())return {hosted:false,configured:false,available:false,model:null,message:SERVER_UNAVAILABLE};const r=await fetch(`/api/ai/${test?'test':'status'}`,{method:test?'POST':'GET',headers:test?{'Content-Type':'application/json'}:undefined,body:test?'{}':undefined,signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Sunucu bağlantısı yok');return r.json();}
 async interpret(text,useModel=false){
  this.cancel();const version=this.version,key=text.trim().slice(0,1200);if(!key)return localIntent('');
  if(!useModel)return {...localIntent(key),source:'Cihazda çözümlendi'};
  if(!hasServerAPI())throw new Error(SERVER_UNAVAILABLE);
  const cached=this.cache.get(key);if(cached&&Date.now()-cached.t<120000)return {...cached.value,source:'Önbellekten · model sonucu',latencyMs:0};
  const ac=this.controller=new AbortController();
  try{const r=await fetch('/api/ai/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:key}),signal:AbortSignal.any([ac.signal,AbortSignal.timeout(12000)])});const data=await r.json();if(!r.ok)throw new Error(data.error||'Model yanıt vermedi');if(version!==this.version)throw new DOMException('Eski istek','AbortError');const value={...validateIntent(data.intent),source:'Model ile çözümlendi',latencyMs:data.latencyMs};this.cache.set(key,{t:Date.now(),value});if(this.cache.size>20)this.cache.delete(this.cache.keys().next().value);return value;}
  finally{if(version===this.version)this.controller=null;}
 }
}
