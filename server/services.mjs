import {modelCatalog,trafficKind,fetchTraffic,providerError} from './providers.mjs';
export {modelCatalog};
const limits=new Map();
export function budget(client,kind,limit){const key=client+':'+kind,now=Date.now(),list=(limits.get(key)||[]).filter(t=>now-t<60000);if(list.length>=limit)throw providerError('İstek sınırına ulaşıldı. Biraz sonra tekrar dene.',429,'rate_limit');list.push(now);limits.set(key,list);if(limits.size>2048)for(const [k,v] of limits)if(v.at(-1)<now-60000)limits.delete(k);}
export async function trafficProxy(url,req,signal,readBody){const kind=trafficKind(url,req.method);budget(req.socket.remoteAddress,kind.tile?'traffic-tiles':'traffic-api',kind.tile?600:120);return fetchTraffic(url,req.method,process.env.TOMTOM_API_KEY,signal,()=>readBody(req));}
