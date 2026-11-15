// Test-only adapter: workerd's local outbound network cannot use this managed
// environment's proxy itself. Forward via Node's inherited proxy and CA trust.
// This does not alter the deployable Worker or bypass destination restrictions.
import {Miniflare,convertV4MiniflareOptions,Response as WorkerResponse} from 'miniflare';import fs from 'node:fs';import {randomUUID} from 'node:crypto';
const password=JSON.parse(fs.readFileSync('/tmp/yolcu-gateway-check-credentials.json','utf8')).password;
const runtime=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:8788,workers:[{name:'gateway',modules:true,scriptPath:new URL('../artifacts/recovery/worker-bundle/worker.js',import.meta.url).pathname,compatibilityDate:'2025-06-01',bindings:{FRONTEND_ORIGIN:'http://127.0.0.1:4173',APP_PASSWORD:password,SESSION_SECRET:randomUUID()+randomUUID(),TOMTOM_API_KEY:process.env.TOMTOM_API_KEY,AI_API_KEY:process.env.AI_API_KEY},durableObjects:{STATE:{className:'GatewayState',useSQLite:true}},outboundService:async request=>{
 const options={method:request.method,headers:Object.fromEntries(request.headers),redirect:'manual',signal:request.signal};if(!['GET','HEAD'].includes(request.method)){options.body=request.body;options.duplex='half';}
 const r=await fetch(request.url,options),headers=new Headers(r.headers);headers.delete('content-encoding');headers.delete('content-length');return new WorkerResponse(r.body,{status:r.status,headers});
}}]}));
await runtime.ready;console.log('Workers test runtime ready on 127.0.0.1:8788; inherited proxy and TLS trust retained.');
for(const name of ['SIGINT','SIGTERM'])process.once(name,async()=>{await runtime.dispose();process.exit(0);});
