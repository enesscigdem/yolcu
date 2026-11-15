// Each rate bucket has its own Durable Object. Model preferences use another ID.
export class GatewayState {
 constructor(state){this.state=state;}
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/model'){
   if(request.method==='GET')return Response.json({model:await this.state.storage.get('model')||null});
   if(request.method==='POST'){const {model}=await request.json();await this.state.storage.put('model',model);return Response.json({model});}
  }
  if(path==='/limit'&&request.method==='POST'){
   const {limit}=await request.json(),now=Date.now();
   const allowed=await this.state.storage.transaction(async txn=>{const times=(await txn.get('times')||[]).filter(t=>now-t<60000);if(times.length>=limit)return false;times.push(now);await txn.put('times',times);return true;});
   await this.state.storage.setAlarm(now+120000);return Response.json({allowed});
  }
  return new Response(null,{status:404});
 }
 async alarm(){await this.state.storage.deleteAll();}
}
