import { pointAt, projectOnSegment, dist } from './geo.js';
import { openingAt } from './needs.js';
import { planRoutes } from './api.js';
export function nearestAhead(place,route,along){
  let best={d:Infinity,along:0};
  for(let i=0;i<route.coords.length-1;i++){
    if(route.cum[i]<along-100||route.cum[i]>along+12000)continue;
    const p=projectOnSegment(place.lon,place.lat,route.coords[i],route.coords[i+1]);
    if(p.d<best.d)best={d:p.d,along:route.cum[i]+p.t*(route.cum[i+1]-route.cum[i])};
  }
  return best;
}
export async function stopOptions(context,findNearby,signal,planner=planRoutes){
  const {route,along,from,to,prefs,avoids,stops,traffic}=context;
  const points=[300,2000,6000].map(d=>pointAt(route.coords,route.cum,Math.min(route.lengthM,along+d)));
  const lists=await Promise.allSettled(points.map(p=>findNearby(p,signal)));
  signal?.throwIfAborted();
  const choices=[];
  for(const res of lists)if(res.status==='fulfilled')for(const place of res.value){
    if(context.openOnly&&!place.openingHours?.timeRanges?.length)continue;
    if(stops.some(p=>dist(p.lon,p.lat,place.lon,place.lat)<40)||choices.some(p=>dist(p.lon,p.lat,place.lon,place.lat)<40))continue;
    const projection=nearestAhead(place,route,along);
    if((context.fuel!=='diesel'||place.diesel!==false)&&projection.d<1500&&projection.along>=along-40)choices.push({...place,projection});
  }
  choices.sort((a,b)=>a.projection.d-b.projection.d||(a.projection.along-b.projection.along));
  const offset=context.offset||0;
  const picks=choices.slice(offset,offset+3);
  if(!picks.length)return [];
  const baseline=await planner(from,to,prefs,avoids,signal,route.mode||'auto',traffic,null,stops);
  const results=await Promise.allSettled(picks.map(async place=>{const ordered=context.manualOrder?[...stops,place]:[...stops,place].sort((a,b)=>(a.along??a.projection?.along??Infinity)-(b.along??b.projection?.along??Infinity));return {place,stops:ordered,route:(await planner(from,to,prefs,avoids,signal,route.mode||'auto',traffic,null,ordered))[0]};}));
  signal?.throwIfAborted();
  const found=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const live=!!baseline[0].trafficCheckedAt&&found.every(x=>x.route.trafficCheckedAt);
  const time=r=>live?r.trafficTime:r.time;
  return found.map(x=>{const index=x.stops.indexOf(x.place),reachSeconds=(x.route.legTimes?.[index]??time(x.route))* (live?(x.route.trafficRatio||1):1)+x.stops.slice(0,index).reduce((s,p)=>s+(p.dwellMinutes||0)*60,0)+(context.activeDwellSeconds||0),arrival=Date.now()+reachSeconds*1000,status=openingAt(x.place,arrival);return {...x,extraSeconds:time(x.route)-time(baseline[0]),reachSeconds,totalSeconds:time(x.route),live,from,availability:status};}).filter(x=>x.availability.state!=='closed'&&(!context.openOnly||x.availability.state==='open')).sort((a,b)=>Math.abs(a.extraSeconds-b.extraSeconds)>45?a.extraSeconds-b.extraSeconds:Number(!!context.brands?.includes(b.place.brand))-Number(!!context.brands?.includes(a.place.brand))||a.extraSeconds-b.extraSeconds);
}

export function remainingDwellSeconds(stops,active,now=Date.now()){
  return (stops||[]).reduce((sum,p)=>sum+Math.max(0,p.dwellMinutes||0)*60,0)+Math.max(0,((active?.until??now)-now)/1000);
}
