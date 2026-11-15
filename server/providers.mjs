// Web-standard provider transport shared by Node and the deployable edge gateway.
export const providerError=(message,status=502,code='provider_unavailable')=>Object.assign(new Error(message),{status,code});
const encoder=new TextEncoder();
export async function boundedBytes(response,max=4*1024*1024){
 if(Number(response.headers?.get('content-length')||0)>max)throw providerError('Servis yanıtı sınırı aşıldı.');
 if(!response.body){const text=JSON.stringify(await response.json());const data=encoder.encode(text);if(data.length>max)throw providerError('Servis yanıtı sınırı aşıldı.');return data;}
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw providerError('Servis yanıtı sınırı aşıldı.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const data=new Uint8Array(size);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}return data;
}
export async function boundedJSON(response,key,max=1024*1024){const text=new TextDecoder().decode(await boundedBytes(response,max));if(key&&text.includes(key))throw providerError('Servis yanıtı güvenle iletilemedi.');try{return JSON.parse(text);}catch{throw providerError('Servis yanıtı beklenen biçimde değil.');}}
export async function modelCatalog(config,signal){
 if(!config.key||!config.baseURL)throw providerError('Yapay zekâ sunucu bağlantısı hazırlanıyor.',503,'missing_provider');
 const base=new URL(config.baseURL);if(base.protocol!=='https:'||base.username||base.password)throw providerError('Sağlayıcı adresi HTTPS olmalı.',503,'invalid_provider');
 const r=await fetch(base.href.replace(/\/$/,'')+'/models',{headers:{Authorization:`Bearer ${config.key}`},signal,redirect:'manual'});
 if(!r.ok)throw providerError(r.status===401||r.status===403?'Sağlayıcı sunucu anahtarını veya hesap yetkisini kabul etmedi.':r.status===429?'Sağlayıcının istek sınırına ulaşıldı.':'Model listesi şu anda alınamıyor.',r.status===429?429:502,r.status===401||r.status===403?'provider_authorization':'provider_unavailable');
 const j=await boundedJSON(r,config.key);if(!Array.isArray(j.data))throw providerError('Model kataloğu beklenen biçimde değil.');
 const seen=new Set();return j.data.filter(m=>typeof m.id==='string'&&m.id.length>0&&m.id.length<=120&&!/[\u0000-\u001f]/.test(m.id)&&!seen.has(m.id)&&seen.add(m.id)).slice(0,200).map(m=>({id:m.id,label:typeof m.name==='string'?m.name.slice(0,120):m.id}));
}
export function trafficKind(url,method){
 const path=url.pathname.slice('/api/traffic'.length),search=/^\/search\/2\/(?:search|poiSearch)\/[^/]{1,240}\.json$/.test(path)||path==='/search/2/nearbySearch/.json',route=/^\/routing\/1\/calculateRoute\/[\d.,:;-]+\/json$/.test(path),incident=path==='/traffic/services/5/incidentDetails',tile=/^\/traffic\/map\/4\/tile\/flow\/relative\/\d{1,2}\/\d{1,7}\/\d{1,7}\.pbf$/.test(path);
 if(!(search||route||incident||tile)||url.search.length>5000||url.searchParams.has('key'))throw providerError('Desteklenmeyen trafik isteği.',400,'invalid_request');
 if(method!=='GET'&&!(route&&method==='POST'))throw providerError('Yöntem desteklenmiyor.',405,'invalid_request');
 const allowed=new Set(search?['countrySet','language','limit','typeahead','lat','lon','radius','categorySet','brandSet','openingHours','timeZone']:route?['traffic','sectionType','computeTravelTimeFor','routeType','travelMode','reconstructionMode','routeRepresentation']:incident?['bbox','fields','language','timeValidityFilter']:[]);if([...url.searchParams.keys()].some(k=>!allowed.has(k)))throw providerError('Desteklenmeyen trafik parametresi.',400,'invalid_request');
 return {path,search,route,incident,tile};
}
export async function fetchTraffic(url,method,key,signal,readBody){
 if(!key)throw providerError('Trafik sunucusu henüz yapılandırılmadı.',503,'missing_traffic');
 const kind=trafficKind(url,method),target=new URL('https://api.tomtom.com'+kind.path);for(const [k,v] of url.searchParams)target.searchParams.set(k,v);target.searchParams.set('key',key);
 if(kind.search){target.searchParams.set('limit',String(Math.max(1,Math.min(25,Number(target.searchParams.get('limit'))||15))));if(target.searchParams.has('radius'))target.searchParams.set('radius',String(Math.max(1,Math.min(10000,Number(target.searchParams.get('radius'))||3500))));}
 const options={method,signal,redirect:'manual'};
 if(method==='POST'){const input=await readBody(),points=input.supportingPoints;if(!Array.isArray(points)||points.length<2||points.length>160||points.some(p=>!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180))throw providerError('Rota noktaları geçersiz.',400,'invalid_request');options.headers={'Content-Type':'application/json'};options.body=JSON.stringify({supportingPoints:points});}
 const r=await fetch(target,options);if(!r.ok)throw providerError(r.status===401||r.status===403?'Trafik sağlayıcısının sunucu yetkisi doğrulanamadı.':'Trafik servisi yanıt vermedi.',r.status===429?429:502,'traffic_unavailable');
 const data=await boundedBytes(r);if(new TextDecoder().decode(data).includes(key))throw providerError('Servis yanıtı güvenle iletilemedi.');return {data,type:kind.tile?'application/x-protobuf':'application/json; charset=utf-8'};
}
