// Only this server knows provider credentials. Never return upstream URLs/errors verbatim.
const host='https://api.tomtom.com';
const limits=new Map();
function fail(message,status=502,code='provider_unavailable'){return Object.assign(new Error(message),{status,code});}
export function budget(client,kind,limit){const key=client+':'+kind,now=Date.now(),list=(limits.get(key)||[]).filter(t=>now-t<60000);if(list.length>=limit)throw fail('İstek sınırına ulaşıldı. Biraz sonra tekrar dene.',429,'rate_limit');list.push(now);limits.set(key,list);if(limits.size>2048)for(const [k,v] of limits)if(v.at(-1)<now-60000)limits.delete(k);}
export async function modelCatalog(config,signal){
 if(!config.key||!config.baseURL)throw fail('Yapay zekâ sunucu bağlantısı hazırlanıyor.',503,'missing_provider');
 const base=new URL(config.baseURL);if(base.protocol!=='https:'||base.username||base.password)throw fail('Sağlayıcı adresi HTTPS olmalı.',503,'invalid_provider');
 const r=await fetch(base.href.replace(/\/$/,'')+'/models',{headers:{Authorization:`Bearer ${config.key}`},signal,redirect:'error'});
 if(!r.ok)throw fail(r.status===401||r.status===403?'Sağlayıcı sunucu anahtarını veya hesap yetkisini kabul etmedi.':r.status===429?'Sağlayıcının istek sınırına ulaşıldı.':'Model listesi şu anda alınamıyor.',r.status===429?429:502,r.status===401||r.status===403?'provider_authorization':'provider_unavailable');
 const j=await r.json();if(!Array.isArray(j.data))throw fail('Model kataloğu beklenen biçimde değil.');
 const seen=new Set();return j.data.filter(m=>typeof m.id==='string'&&m.id.length>0&&m.id.length<=120&&!/[\u0000-\u001f]/.test(m.id)&&!seen.has(m.id)&&seen.add(m.id)).slice(0,200).map(m=>({id:m.id,label:typeof m.name==='string'?m.name.slice(0,120):m.id}));
}
export async function trafficProxy(url,req,signal,readBody){
 const key=process.env.TOMTOM_API_KEY;if(!key)throw fail('Trafik sunucusu henüz yapılandırılmadı.',503,'missing_traffic');
 const path=url.pathname.slice('/api/traffic'.length);
 const search=/^\/search\/2\/(?:search|poiSearch)\/[^/]{1,240}\.json$/.test(path)||path==='/search/2/nearbySearch/.json';
 const route=/^\/routing\/1\/calculateRoute\/[\d.,:;-]+\/json$/.test(path);
 const incident=path==='/traffic/services/5/incidentDetails';
 const tile=/^\/traffic\/map\/4\/tile\/flow\/relative\/\d{1,2}\/\d{1,7}\/\d{1,7}\.pbf$/.test(path);
 if(!(search||route||incident||tile)||url.search.length>5000||url.searchParams.has('key'))throw fail('Desteklenmeyen trafik isteği.',400,'invalid_request');
 if(req.method!=='GET'&&!(route&&req.method==='POST'))throw fail('Yöntem desteklenmiyor.',405,'invalid_request');
 budget(req.socket.remoteAddress,tile?'traffic-tiles':'traffic-api',tile?600:120);
 const allowed=new Set(search?['countrySet','language','limit','typeahead','lat','lon','radius','categorySet','brandSet','openingHours','timeZone']:route?['traffic','sectionType','computeTravelTimeFor','routeType','travelMode','reconstructionMode','routeRepresentation']:incident?['bbox','fields','language','timeValidityFilter']:[]);if([...url.searchParams.keys()].some(k=>!allowed.has(k)))throw fail('Desteklenmeyen trafik parametresi.',400,'invalid_request');
 const target=new URL(host+path);for(const [k,v] of url.searchParams)target.searchParams.set(k,v);target.searchParams.set('key',key);
 if(search){target.searchParams.set('limit',String(Math.max(1,Math.min(25,Number(target.searchParams.get('limit'))||15))));if(target.searchParams.has('radius'))target.searchParams.set('radius',String(Math.max(1,Math.min(10000,Number(target.searchParams.get('radius'))||3500))));}
 const options={method:req.method,signal,redirect:'error'};
 if(req.method==='POST'){
  const input=await readBody(req),points=input.supportingPoints;
  if(!Array.isArray(points)||points.length<2||points.length>160||points.some(p=>!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180))throw fail('Rota noktaları geçersiz.',400,'invalid_request');
  options.headers={'Content-Type':'application/json'};options.body=JSON.stringify({supportingPoints:points});
 }
 const r=await fetch(target,options);if(!r.ok)throw fail(r.status===401||r.status===403?'Trafik sağlayıcısının sunucu yetkisi doğrulanamadı.':'Trafik servisi yanıt vermedi.',r.status===429?429:502,'traffic_unavailable');
 if(Number(r.headers.get('content-length')||0)>4*1024*1024)throw fail('Trafik yanıtı sınırı aşıldı.');
 const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>4*1024*1024)throw fail('Trafik yanıtı sınırı aşıldı.');chunks.push(Buffer.from(chunk));}const data=Buffer.concat(chunks);if(data.includes(Buffer.from(key)))throw fail('Servis yanıtı güvenle iletilemedi.');if(data.length>4*1024*1024)throw fail('Trafik yanıtı sınırı aşıldı.');
 return {data,type:tile?'application/x-protobuf':'application/json; charset=utf-8'};
}
