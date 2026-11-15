import {serviceFetch} from './backend.js';
import {I,KIND_ICON} from './icons.js';
import {stopImpact,hasFreshTraffic} from './timing.js';
import {NEEDS,needById,openingAt,normalizeDuty,optimizeStops} from './needs.js';
import {stopOptions,remainingDwellSeconds} from './stops.js';import {TripAssistant,hasServerAPI,SERVER_UNAVAILABLE} from './assistant.js';import {dist} from './geo.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mins=s=>`${Math.max(0,Math.round(s/60))} dk`;
const btn=(action,text,extra='')=>`<button type="button" data-rs="${action}" ${extra}>${text}</button>`;
export class Roadside {
 constructor(deps){Object.assign(this,deps);this.assistant=new TripAssistant();this.version=0;this.cache=new Map();this.options=[];this.root=document.getElementById('roadside');this.root.addEventListener('click',e=>{const b=e.target.closest('[data-rs]');if(!b)return;e.preventDefault();this.action(b.dataset.rs,b).catch(error=>{if(error.name!=='AbortError'&&!this.root.hidden)this.message('İşlem tamamlanamadı. Tekrar deneyebilirsin.');});});this.root.addEventListener('submit',e=>e.preventDefault());this.root.addEventListener('input',e=>{if(e.target.id==='stop-dwell'){this.dwell=Math.max(0,Math.min(180,Number(e.target.value)||0));this.updateImpact();}});
  // Keep the tapped element alive through pointerup/click when timing finishes.
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#roadside,.rs-map-pin'))return;this.releaseInteraction?.();this.interaction=new Promise(resolve=>this.releaseInteraction=resolve);});
  const release=()=>{const resolve=this.releaseInteraction;setTimeout(()=>{resolve?.();if(this.releaseInteraction===resolve){this.interaction=null;this.releaseInteraction=null;}},0);};
  document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);window.addEventListener('blur',release);
 }
 body(html,title=this.hasTrip?.()?'Yol üstü':'Yakında bul',{replace=false,view=''}={}){
  if(title===this.title&&view===this.view)replace=true;
  if(!replace&&!this.root.hidden){this.history ||= [];this.history.push({content:this.root.querySelector('.roadside-content'),title:this.title,view:this.view,scroll:this.root.querySelector('.roadside-content')?.scrollTop||0});}
  this.title=title;this.view=view;this.root.hidden=false;document.body.classList.add('roadside-open');
  this.root.innerHTML=`<div class="roadside-head">${btn('back','‹','aria-label="Geri"')}<h2>${esc(title)}</h2>${btn('close','×','aria-label="Yol üstünü kapat"')}</div><div class="roadside-content">${html}</div>`;
  this.syncPins();this.onPanel?.();
 }
 syncPins(){this.onResults?.(['results','detail'].includes(this.view)?this.options:[],this.view==='detail'?this.selectedIndex:null);}
 async finishGesture(signal){
  if(!this.interaction)return;
  signal.throwIfAborted();let abort;
  try{await Promise.race([this.interaction,new Promise(resolve=>{abort=resolve;signal.addEventListener('abort',abort,{once:true});})]);}
  finally{signal.removeEventListener('abort',abort);}
 }
 back(){
  const previous=this.history?.pop();if(!previous)return this.close(true);
  const keepCalculation=this.view==='detail'&&previous.view==='results';
  if(!keepCalculation){this.controller?.abort();this.assistant.cancel();this.version++;this.busy=false;}
  if(previous.view==='results'&&this.evaluated){this.showOptions(true);return;}
  this.body('',previous.title,{replace:true,view:previous.view});
  this.root.querySelector('.roadside-content').replaceWith(previous.content);previous.content.scrollTop=previous.scroll;this.syncPins();this.onPanel?.();
 }
 close(returnToParent=false){this.controller?.abort();this.assistant.cancel();this.version++;this.busy=false;this.root.hidden=true;this.history=[];this.onResults?.([]);document.body.classList.remove('roadside-open');this.onPanel?.();this.onDismiss?.(returnToParent);}
 invalidate(){this.history=[];const hadResults=this.options.length,hadModel=!!this.assistant.controller;this.assistant.cancel();this.controller?.abort();this.version++;this.options=[];this.evaluated=null;if(!this.root.hidden&&(this.busy||hadResults||hadModel))this.message('Rota değişti. Güncel güzergâhta tekrar ara.');this.history=[];this.busy=false;}
 message(text){this.body(`<p class="rs-note" role="status">${esc(text)}</p>${btn('home','Kategorilere dön','class="btn"')}`);}
 home(){
  this.evaluated=null;
  this.assistant.cancel();this.history=[];this.root.hidden=true;
  this.controller?.abort();this.version++;this.busy=false;const ids=this.store.roadside.shortcuts||['fuel','market','duty','break','help'];
  this.body(`${this.reminderText?`<p class="rs-note">${esc(this.reminderText)}</p>`:''}${this.pending?.needs?.length?`<p class="rs-note">Planın: ${this.pending.needs.map(id=>esc(needById(id)?.label)).join(' → ')}</p><div class="rs-tags">${this.pending.needs.map(id=>btn('category',esc(needById(id).label),`data-id="${id}"`)).join('')}</div>`:''}<div class="rs-grid">${ids.map(id=>this.categoryButton(id)).join('')}${btn('more','<b>＋</b> Diğer')}</div><div class="rs-links">${btn('stops','Duraklarım'+((this.getStops?.()||[]).length?' · '+this.getStops().length:''))}${btn('places','Benim yerlerim')}${btn('park','Park & araç')}${btn('preferences','Kısayollar & tercihler')}</div><details class="rs-command-disclosure"><summary>Yolculuk isteğini yaz</summary><form class="rs-command"><label for="trip-command">Yolculuk isteğini yaz</label><div class="rs-command-row"><input id="trip-command" maxlength="1200" placeholder="Eve giderken motorin ve Migros" autocomplete="off">${btn('interpret','Anla')}</div><label class="rs-check"><input id="use-trip-model" type="checkbox" ${hasServerAPI()?'':'disabled'}> Yapay zekâ ile çözümle</label>${hasServerAPI()?'':`<p class="rs-note">${SERVER_UNAVAILABLE}</p>`}<p class="rs-note">Seçmeden rota değişmez. Normal kategori aramaları model beklemez.</p></form></details>`);
 }
 categoryButton(id){const c=needById(id);return c?btn('category',`<b aria-hidden="true">${I[KIND_ICON[c.kind]?.[0]||'pin']}</b><span>${esc(c.label)}</span>`,`data-id="${id}"`):'';}
 listCategories(ids,title){this.body(`<div class="rs-grid">${ids.map(id=>this.categoryButton(id)).join('')}</div>`,title);}
 async search(id,more=false){
  const cat=needById(id);if(!cat)return;
  if(id==='duty'&&!hasServerAPI())return this.body(`<p class="rs-note" role="status">Bu yayında resmî nöbetçi eczane bağlantısı henüz bağlı değil. Normal eczane araması kullanılabilir; sonuçlar nöbetçi listesi değildir.</p>${this.categoryButton('pharmacy')}`,'Nöbetçi eczane');
  if(id==='break')return this.listCategories(['food','cafe','toilet','parking'],'Mola lazım');
  if(id==='help')return this.help();
  const context=this.context();
  if(more&&this.evaluated&&context?.route===this.optionsContext?.route&&Date.now()-this.evaluated.at<30000&&(!context||dist(context.from.lon,context.from.lat,this.optionsContext.from.lon,this.optionsContext.from.lat)<30)){this.offset+=6;this.options=this.evaluated.options.slice(this.offset,this.offset+6);this.showOptions(true);return;}
  if(!context&&this.hasTrip?.())return this.message('Yol üstünde arama için güncel konum bekleniyor. Tekrar dene.');
  this.assistant.cancel();this.controller?.abort();const ac=this.controller=new AbortController(),version=++this.version;this.busy=true;this.evaluated=null;this.kind=id;this.offset=more?(this.offset||0)+6:0;this.dwell=0;
  this.body('<div class="rs-loading" role="status">İşletmeler aranıyor…</div>',cat.label,{replace:more});
  try{
   let find;
   if(id==='duty'){
    const r=await serviceFetch('/api/duty',{signal:ac.signal});if(!r.ok)throw new Error('Resmî nöbet listesi alınamadı');const j=await r.json();const places=normalizeDuty(j.rows);if(!places.length)throw new Error('Güncel nöbet kaydı bulunamadı');find=async()=>places;
   }else find=(point,signal)=>this.findNearby(cat,point,signal);
   if(!context){
    const from=await this.position();ac.signal.throwIfAborted();
    if(!from)throw new Error('Yakındaki yerler için güncel konum gerekiyor.');
    this.nearbyAccuracy=from.approximate?Math.round(from.acc):null;const list=await find(from,ac.signal);ac.signal.throwIfAborted();if(version!==this.version)return;
    const options=list.filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)&&(!this.pending?.openOnly||openingAt(p).state==='open')).map(place=>({place,nearby:true,distanceM:dist(from.lon,from.lat,place.lon,place.lat)})).sort((a,b)=>a.distanceM-b.distanceM);this.evaluated={at:Date.now(),options};this.options=options.slice(this.offset,this.offset+6);
    this.optionsContext=null;this.busy=false;this.showOptions(true);return;
   }
   // Cache candidates only; times are recalculated for the current position and current route.
   const cacheKey=id+':'+Math.round(context.from.lon*500)+':'+Math.round(context.from.lat*500),cached=this.cache.get(cacheKey);
   const finder=(p,s)=>{if(cached&&Date.now()-cached.t<90000)return Promise.resolve(cached.list);return find(p,s);};
   const lists=[];const observed=async(p,s)=>{const list=await finder(p,s);lists.push(...list);return list;};
   let options;
   if(id==='parking')options=await this.parkingOptions(context,cat,ac.signal,places=>{if(ac.signal.aborted||version!==this.version)return;this.options=places.map(place=>({place,calculating:true}));this.optionsContext=context;this.showOptions(true);});
   else options=await stopOptions({...context,offset:0,allResults:true,onCandidates:places=>{if(ac.signal.aborted||version!==this.version)return;this.options=places.slice(this.offset,this.offset+6).map(place=>({place,calculating:true}));this.optionsContext=context;this.showOptions(true);},onProgress:(done,total)=>{if(ac.signal.aborted||version!==this.version)return;const progress=this.root.querySelector('#rs-search-progress');if(progress)progress.textContent=`Karşılaştırılıyor · ${done}/${total}`;},openOnly:!!this.pending?.openOnly,brands:this.store.roadside.brands||[],fuel:this.store.roadside.fuel},observed,ac.signal,this.planner);
   await this.finishGesture(ac.signal);
   ac.signal.throwIfAborted();if(version!==this.version||this.context()?.route!==context.route)return;
   if(lists.length){this.cache.set(cacheKey,{t:Date.now(),list:lists});if(this.cache.size>12)this.cache.delete(this.cache.keys().next().value);}
   const cap=this.pending?.maxExtraMinutes;if(cap!=null)options=options.filter(x=>x.extraSeconds<=cap*60);
   const selected=this.view==='detail'?this.options[this.selectedIndex]?.place:null;
   this.evaluated={at:Date.now(),options};this.options=options.slice(this.offset,this.offset+6);this.busy=false;this.optionsContext=context;
   if(selected){const choice=options.find(o=>dist(o.place.lon,o.place.lat,selected.lon,selected.lat)<40);if(choice){let index=this.options.indexOf(choice);if(index<0){if(this.options.length>=6)this.options.pop();this.options.push(choice);index=this.options.length-1;}this.detail(index);return;}this.showOptions(true);this.toast('Bu yer için uygun rota alınamadı; diğer seçenekler hazır.');return;}
   this.showOptions(true);
  }catch(error){if(!ac.signal.aborted&&version===this.version){this.busy=false;this.message(error.message||'Arama tamamlanamadı');}}
 }
 timing(o,detail=false){
  if(o.calculating)return '<span>Süre hesaplanıyor</span>';
  if(o.nearby)return `<span>${o.distanceM>=1000?(o.distanceM/1000).toFixed(1).replace('.',',')+' km':Math.round(o.distanceM/10)*10+' m'} · kuş uçuşu</span>`;
  const rounded=Math.round((detail?(o.extraDriveSeconds??o.extraSeconds):o.extraSeconds)/60),delta=rounded===0?'1 dk’dan az fark':`${rounded>0?'+':'−'}${Math.abs(rounded)} dk`;
  return `<span>İşletmeye ~${mins(o.reachSeconds)}</span><strong>${detail?'Ek sürüş':'Yolculuğa'} ${delta}</strong>`;
 }
 showOptions(replace=false){
  this.body(`<p class="rs-note" id="rs-search-progress" role="status">${this.busy?'Yolculuk etkisi hesaplanıyor…':this.optionsContext?`${this.evaluated?.options.length||this.options.length} yer karşılaştırıldı · en az ek süre`:`Konumuna en yakın yerler${this.nearbyAccuracy?` · ±${this.nearbyAccuracy} m`:''}`}</p>${this.options.map((o,i)=>`<article class="rs-result rs-summary">${btn('detail',`<span class="rs-number">${i+1}</span><span><h3>${esc(o.place.name)}</h3><p>${esc(o.place.sub||'Adres bilgisi yok')}</p><span class="rs-tags">${this.timing(o)}</span></span><span aria-hidden="true">›</span>`,`data-index="${i}" aria-label="${esc(o.place.name)} detayları"`)}</article>`).join('')||'<p class="rs-note">Koşullara uyan sonuç bulunamadı.</p>'}${!this.busy&&(!this.evaluated||this.offset+6<this.evaluated.options.length)?btn('moreResults','Daha fazla yer','class="btn rs-more"'):''}`,needById(this.kind)?.label||'Yakında bul',{replace,view:'results'});
 }
 detail(index){
  if(this.view==='detail')this.back();
  const o=this.options[index];if(!o)return;this.selectedIndex=index;
  const cat=needById(this.kind),phone=o.place.phone?.replace(/[^+\d]/g,'');
  this.body(`<article class="rs-place"><div class="rs-place-heading"><span class="rs-business-icon">${I[KIND_ICON[cat?.kind]?.[0]||'pin']}</span><div><p class="rs-eyebrow">${esc(cat?.label)}</p><h3>${esc(o.place.name)}</h3></div>${btn('savePlace',I.star,`data-index="${index}" aria-label="${this.isSaved?.(o.place)?'Kayıtlı yer':'Benim yerlerime kaydet'}" aria-pressed="${!!this.isSaved?.(o.place)}"`)}</div><p class="rs-address">${esc(o.place.sub||'Adres bilgisi paylaşılmamış')}</p><div class="rs-tags">${this.timing(o,true)}</div>${o.nearby?'':`<div id="rs-impact" class="rs-impact"></div><div class="rs-dwell"><label for="stop-dwell">Durakta</label>${btn('dwellStep','−','data-step="-5" aria-label="Duraklamayı beş dakika azalt"')}<input id="stop-dwell" aria-label="Duraklama süresi" type="number" min="0" max="180" value="${this.dwell||0}" inputmode="numeric"><span>dk</span>${btn('dwellStep','+','data-step="5" aria-label="Duraklamayı beş dakika artır"')}</div>`}<div class="rs-links rs-place-links">${btn('focus',I.pin+'Haritada',`data-index="${index}"`)}${phone?`<a class="pill-btn" href="tel:${esc(phone)}">${I.phone||I.speaker} Ara</a>`:''}</div><details class="rs-facts"><summary>İşletme ve süre bilgileri</summary><p class="rs-availability ${o.availability?.state||'unknown'}">${esc(o.availability?.label||openingAt(o.place).label)}</p>${o.calculating?'<p>Yolculuk ve trafik bilgisi henüz hesaplanmadı.</p>':o.nearby?'<p>Mesafe kuş uçuşudur. Sürüş süresi yol tarifiyle hesaplanır.</p>':`<p>${o.live?'Canlı trafik ile':'Canlı trafik olmadan tahmini'} hesaplandı. İşletmeye ulaşma ve rotaya dönüş ek sürüşe dahildir; ulaşım ayrıca eklenmez. Duraklama toplam süreye bir kez eklenir.</p>`}${o.walkRoute?`<p>Park sonrası yürüyüş ${mins(o.walkRoute.time)}; toplam varışa dahildir.</p>`:''}${this.kind==='parking'?'<p>Canlı doluluk bilinmiyor; yer garantisi yok.</p>':''}${this.kind==='fuel'?'<p>Yakıt stoğu doğrulanmış değil. Yakıt ve marka seçimi kişisel tercihindir.</p>':''}</details><div class="rs-result-actions">${btn(o.nearby?'directions':'add',o.calculating?'Durak rotası hazırlanıyor…':o.nearby?'Yol tarifi':o.walkRoute?'Otoparka git':'Durak ekle',`class="btn primary stop-choice" data-index="${index}" ${o.calculating?'disabled':''}`)}</div></article>`,cat?.label||'İşletme',{view:'detail'});
  this.updateImpact();
 }
 updateImpact(){
  const o=this.options[this.selectedIndex],el=this.root.querySelector('#rs-impact');if(!o||o.nearby||!el)return;if(o.calculating){el.innerHTML='<p id="rs-search-progress" role="status">Yolculuk etkisi hesaplanıyor…</p>';return;}
  const impact=stopImpact(o,this.optionsContext,this.dwell),clock=new Date(impact.arrivalAt).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}),extra=Math.round(impact.extraSeconds/60);
  el.innerHTML=`<div><small>Yeni tahmini varış</small><strong>${clock}</strong></div><div><small>Toplam yolculuk</small><b>${mins(impact.totalSeconds)}</b><span>${extra===0?'1 dk’dan az fark':`${extra>0?'+':'−'}${Math.abs(extra)} dk`} · duraklama dahil</span></div>`;
 }
 async parkingOptions(c,cat,signal,onCandidates){
  const [list,baseline]=await Promise.all([this.findNearby(cat,c.to,signal).then(list=>{onCandidates?.(list.filter(p=>dist(p.lon,p.lat,c.to.lon,c.to.lat)<2500).slice(0,6));return list;}),this.planner(c.from,c.to,c.prefs,c.avoids,signal,'auto',c.traffic,null,c.stops)]),near=list.filter(p=>dist(p.lon,p.lat,c.to.lon,c.to.lat)<2500).sort((a,b)=>dist(a.lon,a.lat,c.to.lon,c.to.lat)-dist(b.lon,b.lat,c.to.lon,c.to.lat)).slice(this.offset,this.offset+6);
  const found=await Promise.allSettled(near.map(async place=>{const [car,walk]=await Promise.all([this.planner(c.from,place,c.prefs,c.avoids,signal,'auto',c.traffic,null,c.stops),this.planner(place,c.to,c.prefs,[],signal,'pedestrian')]);return {place,route:car[0],walkRoute:walk[0],finalDest:c.to,stops:c.stops,from:c.from};}));
  const candidates=found.filter(x=>x.status==='fulfilled').map(x=>x.value),live=hasFreshTraffic(baseline[0])&&candidates.every(x=>hasFreshTraffic(x.route)),seconds=r=>live?r.trafficTime:r.time,wait=remainingDwellSeconds(c.stops,null)+(c.activeDwellSeconds||0);
  return candidates.map(x=>{const reachSeconds=seconds(x.route)+wait;return {...x,reachSeconds,extraDriveSeconds:seconds(x.route)-seconds(baseline[0]),extraSeconds:seconds(x.route)+x.walkRoute.time-seconds(baseline[0]),totalSeconds:reachSeconds+x.walkRoute.time,live,availability:openingAt(x.place,Date.now()+reachSeconds*1000)};}).filter(x=>x.availability.state!=='closed').sort((a,b)=>a.extraSeconds-b.extraSeconds);
 }
 renderStops(){const c=this.context(),stops=this.getStops?.()||c?.stops||[];this.body(`<ol class="rs-stop-list">${stops.map((p,i)=>`<li><span class="rs-number">${i+1}</span><div><h3>${esc(p.name)}</h3><p>${p.dwellMinutes?`${p.dwellMinutes} dk duraklama`:'Bekleme yok'}</p><div class="rs-stop-actions">${i?btn('move',I.back,`data-index="${i}" data-step="-1" aria-label="Durağı yukarı taşı"`):''}${i<stops.length-1?btn('move',I.chevron,`data-index="${i}" data-step="1" aria-label="Durağı aşağı taşı"`):''}${btn('remove',i===0?'Durağı atla':'Kaldır',`data-index="${i}"`)}</div></div></li>`).join('')}</ol>${!stops.length?'<div class="rs-empty"><b>Yolda bir durak?</b><p>Bir işletme seçip yolculuğuna ekleyebilirsin.</p></div>':''}${stops.length>1?btn('optimize','En kısa süreli sırayı bul','class="btn secondary"'):''}`,'Duraklarım');}
 preferences(){const p=this.store.roadside;this.body(`<label class="rs-field">Yakıt türüm<select id="fuel-kind"><option value="diesel" ${p.fuel==='diesel'?'selected':''}>Motorin</option><option value="petrol" ${p.fuel==='petrol'?'selected':''}>Benzin</option></select></label><p class="rs-note">Araçtan yakıt seviyesi okunmaz. Arama yalnız sen istediğinde başlar.</p><label class="rs-field">Tercih ettiğim markalar<input id="fuel-brands" value="${esc((p.brands||[]).join(', '))}" placeholder="Shell, Opet, Petrol Ofisi"></label><p class="rs-note">Yakın süreli seçeneklerde marka tercihin değerlendirilir.</p><fieldset><legend>İlk ekrandaki kısayollar (en fazla 5)</legend><div class="rs-shortcuts">${NEEDS.map(c=>`<label><input type="checkbox" name="rs-shortcut" value="${c.id}" ${(p.shortcuts||[]).includes(c.id)?'checked':''}> ${esc(c.label)}</label>`).join('')}</div></fieldset><label class="rs-field">Sigorta asistans adı<input id="assistance-name" value="${esc(p.assistance?.name)}" maxlength="80"></label><label class="rs-field">Asistans telefonu<input id="assistance-phone" type="tel" value="${esc(p.assistance?.phone)}" maxlength="25"></label>${btn('savePreferences','Tercihleri kaydet','class="btn primary"')}`,'Yol üstü tercihleri');}
 help(){const a=this.store.roadside.assistance;this.body(`<div class="rs-grid">${['tire','battery'].map(id=>this.categoryButton(id)).join('')}</div>${a?.phone?`<a class="btn" href="tel:${esc(a.phone.replace(/[^+\d]/g,''))}">${esc(a.name||'Sigorta asistans')} · Ara</a>`:'<p class="rs-note">Sigorta asistans numaran henüz kayıtlı değil.</p>'}${btn('preferences','Asistans bilgisini düzenle','class="btn"')}`,'Yardım');}
 places(){const pins=[['home','Ev',I.home],['work','İş',I.work]];this.body(`<div class="rs-personal-pins">${pins.map(([id,label,icon])=>{const p=this.store[id];return btn(p?'goPinned':'editPinned',`${icon}<span><b>${label}</b><small>${p?esc(p.name):'Yerini ekle'}</small></span>`,`data-id="${id}"`);}).join('')}</div><div class="rs-personal-title"><h3>Kayıtlı yerler</h3><span>${this.store.places.length}</span></div>${this.store.places.map((p,i)=>`<article class="rs-saved-place"><h3>${esc(p.name)}</h3>${p.sub?`<p>${esc(p.sub)}</p>`:''}<div class="rs-links">${btn('goPlace',I.route+'Yol tarifi',`data-index="${i}"`)}${this.hasTrip?.()?btn('placeStop','Durak ekle',`data-index="${i}" ${(this.getStops?.()||[]).length>=3?'disabled':''}`):''}</div><details class="rs-place-options"><summary data-place-options>Yer seçenekleri</summary><div class="rs-links">${btn('entrance','Araç girişi kaydet',`data-index="${i}"`)}${this.store.entrances.some(e=>dist(e.goal.lon,e.goal.lat,p.lon,p.lat)<80)?btn('removeEntrance','Girişi kaldır',`data-index="${i}"`):''}${btn('multinet',p.multinet?'Multinet işaretini kaldır':'Multinet işaretle',`data-index="${i}"`)}${btn('deletePlace','Yerlerimden kaldır',`data-index="${i}"`)}</div><p class="rs-note">${p.multinet?'Multinet kişisel işaretindir; sağlayıcı doğrulaması yok.':'Ödeme bilgisi paylaşılmamış.'}</p></details></article>`).join('')||'<div class="rs-empty"><b>Sevdiğin duraklar burada.</b><p>İşletme kartındaki yıldızla bir yeri kaydet.</p></div>'}${btn('reminders',I.clock+' Yolculuk hatırlatmaları','class="btn secondary"')}`,'Benim yerlerim');}
 reminders(){this.body(`<p class="rs-note">Bu cihazda, ilgili hedef için rota açtığında hatırlatılır.</p>${this.store.reminders.map((r,i)=>`<p>${r.destination==='home'?'Eve':'İşe'} giderken ${esc(needById(r.need)?.label)} ${btn('deleteReminder','Kaldır',`data-index="${i}"`)}</p>`).join('')}<label class="rs-field">Yolculuk<select id="reminder-dest"><option value="home">Eve giderken</option><option value="work">İşe giderken</option></select></label><label class="rs-field">İhtiyaç<select id="reminder-need">${NEEDS.filter(c=>c.query||c.id==='duty').map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></label>${btn('addReminder','Hatırlatma ekle','class="btn primary"')}`,'Hatırlatmalar');}
 checkReminders(dest){const found=this.store.reminders.filter(r=>{const d=this.store[r.destination];return d&&dist(dest.lon,dest.lat,d.lon,d.lat)<150;});this.reminderText=found.length?`Bu yolculukta: ${found.map(r=>needById(r.need)?.label).join(', ')}`:'';if(this.reminderText)this.toast(this.reminderText);}
 park(){const p=this.store.parkedCar;this.body(`<p class="rs-note">${this.context()?.route?.mode==='auto'?'Hedef yakınında otoparka araçla, ardından hedefe yaya devam edebilirsin.':''} Canlı doluluk yok; müsait yer garantisi verilmez.</p>${this.categoryButton('parking')}<div class="rs-park-fields"><label class="rs-field">Kat<input id="park-floor" maxlength="30" value="${esc(p?.floor||'')}"></label><label class="rs-field">Bölüm<input id="park-section" maxlength="40" value="${esc(p?.section||'')}"></label><label class="rs-field">Kısa not<input id="park-note" maxlength="160" value="${esc(p?.note||'')}"></label></div>${btn('parkHere','Park ettim · konumu kaydet','class="btn primary"')}${p?`<p class="rs-note">Son kayıt: ${new Date(p.t).toLocaleString('tr-TR')} · ${esc([p.floor,p.section,p.note].filter(Boolean).join(' · '))}</p>${btn('returnCar','Arabaya dön · yürüyüş','class="btn"')}`:''}`,'Park & araç');}
 async interpret(){const text=this.root.querySelector('#trip-command')?.value||'',useModel=this.root.querySelector('#use-trip-model')?.checked;const output=this.root.querySelector('.rs-command');let status=document.createElement('p');status.className='rs-note';status.setAttribute('role','status');status.textContent='İsteğin anlaşılıyor…';output?.append(status);const version=this.version;
  try{const intent=await this.assistant.interpret(text,useModel);if(version!==this.version)return;this.pending=intent;this.body(`<p class="rs-note">${esc(intent.source)}${intent.latencyMs?` · ${Math.round(intent.latencyMs)} ms`:''}</p>${intent.question?`<p>${esc(intent.question)}</p>${btn('home','İsteği yeniden yaz','class="btn"')}`:`<p>${intent.needs.map(id=>esc(needById(id).label)).join(' → ')||'Alternatif güzergâh'}${intent.openOnly?' · varışta açık':''}${intent.maxExtraMinutes!=null?` · en fazla +${intent.maxExtraMinutes} dk`:''}</p>${intent.destination?btn('intentDestination',`${intent.destination==='home'?'Eve':'İşe'} rota aç`,`class="btn"`):''}<div class="rs-grid">${intent.needs.map(id=>this.categoryButton(id)).join('')}</div>${intent.avoidTurn?btn('avoid','Bu dönüşü kullanmadan alternatif bul','class="btn"'):''}<p class="rs-note">Süreler ve işletmeler gerçek servislerle aranır; seçimin olmadan rota değiştirilmez.</p>`}`,'Anladığım istek');}
  catch(e){if(version===this.version&&e.name!=='AbortError'){status.textContent='Model kullanılamadı. Normal kategoriler ve cihazda çözümleme kullanılabilir.';}}
 }
 async saveParking(button){
  if(this.canPark&&!this.canPark())return this.toast('Gerçek park kaydı için sürüş önizlemesini bitir');
  const version=this.version,value=id=>this.root.querySelector('#'+id)?.value||'',notes={floor:value('park-floor').slice(0,30),section:value('park-section').slice(0,40),note:value('park-note').slice(0,160)};button.disabled=true;button.textContent='Konum alınıyor…';
  try{const pos=await this.position();if(version!==this.version||this.root.hidden)return;if(!pos||Date.now()-pos.t>5000)return this.toast('Park konumu için güncel konum bekleniyor');this.store.parkedCar={lon:pos.lon,lat:pos.lat,t:Date.now(),...notes};this.save();this.close();this.toast('Park konumu kaydedildi');return this.onParked();}finally{button.disabled=false;button.textContent='Park ettim · konumu kaydet';}
 }
 async action(action,b){const value=id=>this.root.querySelector('#'+id)?.value||'';
  switch(action){
   case 'goPinned':{const p=this.store[b.dataset.id];if(!p)return;this.close();return this.onGo(p,'auto');}
   case 'editPinned':return this.onEditPinned?.(b.dataset.id);
   case 'deletePlace':this.store.places.splice(+b.dataset.index,1);this.save();return this.places();
   case 'dwellStep':{const input=this.root.querySelector('#stop-dwell');if(!input)return;input.value=String(Math.max(0,Math.min(180,(Number(input.value)||0)+Number(b.dataset.step))));input.dispatchEvent(new Event('input',{bubbles:true}));return;}
   case 'back':return this.back();case 'detail':return this.detail(+b.dataset.index);case 'focus':return this.onFocus?.(this.options[+b.dataset.index]?.place);case 'directions':{const p=this.options[+b.dataset.index]?.place;if(!p)return;this.close();return this.onGo(p,'auto');}case 'close':return this.close(true);case 'home':return this.home();case 'category':return this.search(b.dataset.id);case 'more':return this.listCategories(NEEDS.map(c=>c.id),'Diğer ihtiyaçlar');case 'moreResults':return this.search(this.kind,true);
   case 'stops':return this.renderStops();case 'preferences':return this.preferences();case 'places':return this.places();case 'park':return this.park();case 'reminders':return this.reminders();case 'interpret':return this.interpret();
   case 'savePreferences':{const shortcuts=[...this.root.querySelectorAll('[name=rs-shortcut]:checked')].map(x=>x.value);if(!shortcuts.length||shortcuts.length>5)return this.toast('1–5 kısayol seç');this.store.roadside={...this.store.roadside,fuel:value('fuel-kind'),brands:value('fuel-brands').split(',').map(x=>x.trim()).filter(Boolean).slice(0,10),shortcuts,assistance:{name:value('assistance-name').slice(0,80),phone:value('assistance-phone').replace(/[^+\d]/g,'')}};this.save();this.home();return this.toast('Tercihler kaydedildi');}
   case 'savePlace':{const p=this.options[+b.dataset.index]?.place;if(!p)return;this.savePlace(p);b.innerHTML=I.star;b.setAttribute('aria-pressed','true');b.setAttribute('aria-label','Kayıtlı yer');return;}
   case 'entrance':return this.onPickEntrance(this.store.places[+b.dataset.index]);
   case 'removeEntrance':{const p=this.store.places[+b.dataset.index];this.store.entrances=this.store.entrances.filter(e=>dist(e.goal.lon,e.goal.lat,p.lon,p.lat)>80);this.save();return this.places();}
   case 'multinet':{const p=this.store.places[+b.dataset.index];p.multinet=!p.multinet;this.save();return this.places();}
   case 'goPlace':{const p=this.store.places[+b.dataset.index];this.close();return this.onGo(p,'auto');}
   case 'placeStop':{const c=this.context(),place=this.store.places[+b.dataset.index];if(!c)return this.message('Durak eklemek için etkin sürüş ve güncel konum gerekiyor');this.controller?.abort();const ac=this.controller=new AbortController();this.message('Kayıtlı durağa rota hesaplanıyor…');const route=(await this.planner(c.from,c.to,c.prefs,c.avoids,ac.signal,c.route.mode||'auto',c.traffic,null,[...c.stops,place]))[0];if(ac.signal.aborted||this.context()?.route!==c.route)return;this.close();return this.onAdd({place,stops:route.stops,route,from:c.from});}
   case 'add':{const o=this.options[+b.dataset.index];if(!o||o.calculating||this.context()?.route!==this.optionsContext?.route)return this.message('Rota değişti; sonuçları yenile');const dwell=Math.max(0,Math.min(180,Number(value('stop-dwell'))||0));o.place.dwellMinutes=dwell;for(const s of o.route.stops||[])if(dist(s.lon,s.lat,o.place.lon,o.place.lat)<40)s.dwellMinutes=dwell;this.pending&&(this.pending.needs=this.pending.needs.filter(id=>id!==this.kind));this.close();return o.walkRoute?this.onPark(o):this.onAdd(o);}
   case 'remove':{const c=this.context();if(!c)return this.toast('Durakları düzenlemek için güncel konum bekleniyor');const stops=[...c.stops];stops.splice(+b.dataset.index,1);this.close();return this.onStops(stops);}
   case 'move':{const c=this.context();if(!c)return this.toast('Durakları düzenlemek için güncel konum bekleniyor');const stops=[...c.stops],i=+b.dataset.index,j=i+Number(b.dataset.step);if(j<0||j>=stops.length)return;[stops[i],stops[j]]=[stops[j],stops[i]];this.close();return this.onStops(stops);}
   case 'optimize':{const c=this.context();if(!c)return;this.controller?.abort();const ac=this.controller=new AbortController();this.message('Durak sıraları gerçek yol ağıyla karşılaştırılıyor…');const choice=await optimizeStops(c,this.planner,ac.signal);if(ac.signal.aborted||this.context()?.route!==c.route)return;this.close();return this.onStops(choice.stops,choice.route,c.from);}
   case 'intentDestination':{const dest=this.store[this.pending?.destination];if(!dest)return this.message('Bu hedef henüz kayıtlı değil. Önce Ev / İş konumunu kaydet.');this.close();this.onGo(dest,'auto');return;}
   case 'avoid':this.close();return this.onAvoid();
   case 'addReminder':this.store.reminders.push({id:crypto.randomUUID(),destination:value('reminder-dest'),need:value('reminder-need')});this.store.reminders=this.store.reminders.slice(-20);this.save();return this.reminders();
   case 'deleteReminder':this.store.reminders.splice(+b.dataset.index,1);this.save();return this.reminders();
   case 'parkHere':return this.saveParking(b);
   case 'returnCar':{const car=this.store.parkedCar;if(!car)return;this.close();return this.onGo({...car,name:'Park ettiğin araç',kind:'parking'},'pedestrian');}
  }
 }
}
