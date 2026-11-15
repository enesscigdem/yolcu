import {GatewayState} from '../server/gateway/state.mjs';
export function gatewayEnv(overrides={}){
 const objects=new Map();
 return {FRONTEND_ORIGIN:'https://enesscigdem.github.io',APP_PASSWORD:'owner-test-passphrase-not-a-provider-key',SESSION_SECRET:'test-session-signing-secret-1234567890123456',TOMTOM_API_KEY:'server-only-test-traffic-key',AI_API_KEY:'server-only-test-ai-key',STATE:{idFromName:name=>name,get:id=>{if(!objects.has(id)){const values=new Map();let tail=Promise.resolve();const storage={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),setAlarm:async()=>{},deleteAll:async()=>values.clear(),transaction:fn=>{const next=tail.then(()=>fn(storage));tail=next.catch(()=>{});return next;}};const object=new GatewayState({storage});objects.set(id,{fetch:(input,init)=>object.fetch(input instanceof Request?input:new Request(input,init))});}return objects.get(id);}},...overrides};
}
