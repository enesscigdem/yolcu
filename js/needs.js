import {hasFreshTraffic} from './timing.js';
// Only facts from search/routing/duty services become place cards. Intent output has no factual fields.
export const NEEDS = [
 {id:'fuel',label:'Yakıt',icon:'⛽',query:'akaryakıt',tt:'7311',tag:'"amenity"="fuel"',kind:'fuel'},
 {id:'market',label:'Market',icon:'▣',query:'market',tt:'7332',tag:'"shop"="supermarket"',kind:'shop'},
 {id:'migros',label:'Migros',icon:'M',query:'Migros',brand:'Migros',tag:'"shop"="supermarket"',kind:'shop'},
 {id:'pharmacy',label:'Eczane',icon:'＋',query:'eczane',tag:'"amenity"="pharmacy"',kind:'health'},
 {id:'duty',label:'Nöbetçi eczane',icon:'E',kind:'health'},
 {id:'break',label:'Mola',icon:'☕',query:'dinlenme tesisi',tag:'"highway"="services"',kind:'food'},
 {id:'help',label:'Yardım',icon:'⌁'},
 {id:'food',label:'Yemek',icon:'♧',query:'restoran',tt:'7315',tag:'"amenity"="restaurant"',kind:'food'},
 {id:'cafe',label:'Kahve',icon:'☕',query:'kahve',tt:'9376',tag:'"amenity"="cafe"',kind:'food'},
 {id:'alcohol',label:'Tekel',icon:'◇',query:'tekel',tag:'"shop"="alcohol"',kind:'shop'},
 {id:'atm',label:'ATM',icon:'₺',query:'ATM',tag:'"amenity"="atm"',kind:'pin'},
 {id:'parking',label:'Otopark',icon:'P',query:'otopark',tt:'7369,7313',tag:'"amenity"="parking"',kind:'parking'},
 {id:'toilet',label:'Tuvalet',icon:'WC',query:'tuvalet',tag:'"amenity"="toilets"',kind:'pin'},
 {id:'tire',label:'Lastikçi',icon:'◉',query:'lastikçi',tag:'"shop"="tyres"',kind:'pin'},
 {id:'battery',label:'Akücü',icon:'▤',query:'akü',tag:'"shop"="car_parts"',kind:'pin'}
];
export const needById=id=>NEEDS.find(n=>n.id===id);
const tr=s=>String(s||'').toLocaleLowerCase('tr-TR');
export function validateIntent(value){
 if(!value||typeof value!=='object')throw new Error('İstek anlaşılamadı');
 const needs=[...new Set((Array.isArray(value.needs)?value.needs:[]).filter(id=>needById(id)))].slice(0,3);
 return {needs,destination:['home','work'].includes(value.destination)?value.destination:null,maxExtraMinutes:Number.isFinite(value.maxExtraMinutes)?Math.max(0,Math.min(30,value.maxExtraMinutes)):null,openOnly:value.openOnly===true,fuel:value.fuel==='diesel'?'diesel':null,avoidTurn:value.avoidTurn===true,question:needs.length||value.avoidTurn===true?'':String(value.question||'Hangi ihtiyacını arayayım?').slice(0,160)};
}
export function localIntent(text){
 const s=tr(text),needs=[];
 for(const [id,re] of [['fuel',/motorin|mazot|yakıt|benzin/],['migros',/migros/],['market',/market/],['duty',/nöbetçi/],['pharmacy',/eczane/],['parking',/otopark|park yeri/],['cafe',/kahve|kafe/],['food',/yemek/],['break',/mola/],['alcohol',/tekel/],['atm',/atm|bankamatik/],['tire',/lastik/],['battery',/akü/]])if(re.test(s))needs.push(id);
 if(needs.includes('duty'))needs.splice(needs.indexOf('pharmacy'),needs.includes('pharmacy')?1:0);
 if(needs.includes('migros')&&needs.includes('market'))needs.splice(needs.indexOf('market'),1);
 const match=s.match(/(\d+|beş|üç|on)\s*dakika/),num=match?({'beş':5,'üç':3,'on':10}[match[1]]??Number(match[1])):null;
 return validateIntent({needs,destination:/eve|evime/.test(s)?'home':/işe|işime/.test(s)?'work':null,maxExtraMinutes:num,openOnly:/açık/.test(s),fuel:/motorin|mazot/.test(s)?'diesel':null,avoidTurn:/istemiyorum|bu dönüş|bu sokak/.test(s)});
}
export function openingAt(place,arrival=Date.now()){
 if(place.duty){const d=place.duty;if(arrival<d.validFrom||arrival>=d.validUntil)return {state:'closed',label:'Bu saat için nöbet kaydı geçerli değil'};return {state:'unknown',label:d.onCall?'İcap nöbeti · önce ara':'Resmî nöbet listesinde · saatini telefonla teyit et'};}
 if(place.openingText?.trim()==='24/7')return {state:'open',label:'24 saat açık · yayımlanan saatlere göre'};
 const ranges=place.openingHours?.timeRanges;
 if(!Array.isArray(ranges)||!ranges.length)return {state:'unknown',label:'Çalışma saatleri bilinmiyor'};
 const stamp=t=>t?.date?Date.parse(`${t.date}T${String(t.hour).padStart(2,'0')}:${String(t.minute).padStart(2,'0')}:00+03:00`):NaN;
 const valid=ranges.map(x=>({a:stamp(x.startTime),b:stamp(x.endTime)})).filter(x=>Number.isFinite(x.a)&&Number.isFinite(x.b));
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(arrival));
 if(!valid.length||!ranges.some(x=>x.startTime.date===day||x.endTime.date===day))return {state:'unknown',label:'Varış saati için saat bilgisi yok'};
 const open=valid.some(x=>arrival>=x.a&&arrival<x.b);return {state:open?'open':'closed',label:open?'Varışta açık · yayımlanan saatlere göre':'Varışta kapalı · yayımlanan saatlere göre'};
}
export function normalizeDuty(rows,now=Date.now()){
 if(!Array.isArray(rows))return [];
 return rows.flatMap(row=>{
  const date=String(row.Tarih||'').slice(0,10),start=Date.parse(`${date}T08:00:00+03:00`),end=start+86400000,lat=Number(row.LokasyonX),lon=Number(row.LokasyonY);
  if(!Number.isFinite(start)||now<start||now>=end||!Number.isFinite(lat)||!Number.isFinite(lon))return [];
  const note=String(row.BolgeAciklama||''),m=note.match(/(\d{1,2}):([0-5]\d)/),hour=m?Number(m[1]):null;
  let validFrom=start,validUntil=end;
  if(hour!=null){let boundary=Date.parse(`${date}T00:00:00+03:00`)+(hour<8?24+hour:hour)*3600000+Number(m[2])*60000;if(/SONRA/i.test(note))validFrom=boundary;if(/KADAR/i.test(note))validUntil=boundary;}
  if(now>=validUntil)return [];
  return [{name:row.Adi,sub:[row.Adres,row.Bolge,note].filter(Boolean).join(' · '),phone:String(row.Telefon||'').replace(/[^+\d]/g,''),lat,lon,kind:'health',duty:{date,validFrom,validUntil,onCall:/İCAP|ICAP/i.test(note),note,source:'İzmir Büyükşehir Belediyesi',recordStart:start}}];
 });
}
export function routeCharacter(route){
 const edges=route.stats?.edges;if(!edges?.length)return 'Yol sınıfı verisi yok';
 const parts=[];for(const e of edges){const m=(route.cum[e.e]||0)-(route.cum[e.b]||0);if(m<=0)continue;const label=['motorway','trunk','primary','secondary','tertiary'].includes(e.cls)?'ana yol':['residential','service_other','unclassified'].includes(e.cls)?'mahalle içi':'diğer yol';if(parts.at(-1)?.label===label)parts.at(-1).m+=m;else parts.push({label,m});}
 const fmt=m=>m<1000?`${Math.round(m/50)*50} metre`:`${(m/1000).toFixed(1).replace('.',',')} kilometre`;
 return parts.slice(0,3).map((p,i)=>`${i?'ardından':'İlk'} ${fmt(p.m)} ${p.label}`).join(', ');
}
export async function optimizeStops(context,planner,signal){
 const list=context.stops;if(list.length<2)return {stops:list,route:null};
 const perms=a=>a.length<2?[a]:a.flatMap((p,i)=>perms(a.filter((_,j)=>j!==i)).map(b=>[p,...b]));
 const results=[];for(const stops of perms(list).slice(0,6)){signal?.throwIfAborted();const routes=await planner(context.from,context.to,context.prefs,context.avoids,signal,context.route.mode||'auto',context.traffic,null,stops);results.push({stops,route:routes[0]});}
 const live=results.every(x=>hasFreshTraffic(x.route));results.sort((a,b)=>(live?a.route.trafficTime-b.route.trafficTime:a.route.time-b.route.time)||a.route.lengthM-b.route.lengthM);return results[0];
}
