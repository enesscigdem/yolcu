// TomTom (ücretsiz katman): canlı trafik, kazalar/yol çalışmaları, trafikli süre ve işletme arama.
// Anahtar sadece telefonda saklanır (Ayarlar › Trafik).
import { projectOnSegment, cumulative, sameRoute, bearing } from './geo.js';

const API = 'https://api.tomtom.com';
async function request(url, options = {}) {
  const timeout = AbortSignal.timeout(15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const r = await fetch(url, { ...options, signal, referrerPolicy: 'no-referrer' });
  if (!r.ok) {
    const message = r.status === 401 || r.status === 403 ? 'TomTom anahtarı veya servis yetkisi geçersiz' : r.status === 429 ? 'TomTom istek sınırına ulaşıldı; biraz sonra tekrar dene' : 'TomTom servisine ulaşılamadı';
    const error = new Error(`${message} (${r.status})`); error.status = r.status; throw error;
  }
  return r;
}

// Vektör trafik verisi: her yol parçasında traffic_level (0 = durmuş, 1 = akıcı) ve road_closure var.
// Kendimiz çiziyoruz: akıcı yollar boyanmaz, sadece yavaş/sıkışık/kapalı olanlar (Apple gibi).
export const flowTiles = key => `${API}/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.pbf?key=${encodeURIComponent(key)}`;

export const CATS = {
  0: ['Olay', '⚠️'], 1: ['Kaza', '💥'], 2: ['Sis', '🌫️'], 3: ['Tehlikeli yol', '⚠️'], 4: ['Yağmur', '🌧️'],
  5: ['Buzlanma', '❄️'], 6: ['Trafik sıkışıklığı', '🚗'], 7: ['Şerit kapalı', '🚧'], 8: ['Yol kapalı', '⛔'],
  9: ['Yol çalışması', '🚧'], 10: ['Kuvvetli rüzgar', '💨'], 11: ['Su baskını', '🌊'], 14: ['Arızalı araç', '🚙']
};

export async function testKey(key) {
  const r = await request(`${API}/search/2/search/${encodeURIComponent('Konak')}.json?key=${encodeURIComponent(key)}&countrySet=TR&limit=1`);
  return r.ok;
}

const FIELDS = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},startTime,from,to,length,delay,roadNumbers}}}';

// bbox: [minLon, minLat, maxLon, maxLat]
export async function incidents(key, bbox, signal) {
  const params = new URLSearchParams({
    key, bbox: bbox.map(v => v.toFixed(5)).join(','), fields: FIELDS, language: 'tr-TR', timeValidityFilter: 'present'
  });
  const r = await request(`${API}/traffic/services/5/incidentDetails?${params}`, { signal });
  if (!r.ok) throw new Error('Trafik servisi ' + r.status);
  const j = await r.json();
  return (j.incidents || []).map(i => {
    const p = i.properties || {};
    const g = i.geometry || {};
    const coords = g.type === 'Point' ? [g.coordinates] : g.coordinates || [];
    const [label, emoji] = CATS[p.iconCategory] || CATS[0];
    return {
      id: p.id, cat: p.iconCategory, label, emoji,
      desc: p.events?.[0]?.description || label,
      mag: p.magnitudeOfDelay || 0,
      delay: p.delay || 0,
      from: p.from || '', to: p.to || '',
      road: (p.roadNumbers || [])[0] || '',
      start: p.startTime || null,
      coords,
      point: coords[Math.floor(coords.length / 2)] || coords[0]
    };
  }).filter(i => i.point);
}

// Kendi rotamızın trafikli süresini ve sıkışık bölümlerini TomTom'a sorar
export async function routeTraffic(key, route, signal) {
  const c = route.coords;
  const step = Math.max(1, Math.ceil(c.length / 140));
  const pts = [];
  for (let i = 0; i < c.length; i += step) pts.push({ latitude: c[i][1], longitude: c[i][0] });
  const last = c[c.length - 1];
  pts.push({ latitude: last[1], longitude: last[0] });
  const a = c[0];
  const url = `${API}/routing/1/calculateRoute/${a[1]},${a[0]}:${last[1]},${last[0]}/json?key=${encodeURIComponent(key)}`
    + '&traffic=true&sectionType=traffic&computeTravelTimeFor=all&routeType=fastest&travelMode=car&reconstructionMode=normal';
  const r = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supportingPoints: pts }), signal });
  if (!r.ok) throw new Error('Trafik rotası ' + r.status);
  const j = await r.json();
  const rt = j.routes?.[0];
  if (!rt) throw new Error('Trafik rotası boş');
  const points = rt.legs.flatMap(l => l.points.map(p => [p.longitude, p.latitude]));
  if (!Number.isFinite(rt.summary?.travelTimeInSeconds) || rt.summary.travelTimeInSeconds <= 0) throw new Error('Trafik süresi alınamadı');
  const cum = cumulative(points);
  const original = { ...route, cum: route.cum || cumulative(c), lengthM: route.lengthM || cumulative(c).at(-1) };
  if (points.length < 2 || !sameRoute(original, { coords: points, cum, lengthM: cum.at(-1) })) throw new Error('Trafik hesabı seçili güzergâhla eşleşmedi');
  const jams = (rt.sections || []).filter(s => s.sectionType === 'TRAFFIC').map(s => ({
    coords: points.slice(s.startPointIndex, s.endPointIndex + 1),
    mag: s.magnitudeOfDelay ?? 1,
    delay: s.delayInSeconds || 0,
    kind: s.simpleCategory || 'JAM'
  })).filter(s => s.coords.length > 1);
  const sum = rt.summary;
  // Aynı yol için TomTom'un canlı trafikli süresi (Apple/Google'a en yakın tahmin).
  // trafficRatio: navigasyonda kendi kalan süremizi bu tahmine uydurmak için kullanılır.
  return {
    trafficTime: Math.round(sum.travelTimeInSeconds),
    trafficCheckedAt: Date.now(),
    trafficLengthM: sum.lengthInMeters,
    trafficDelay: Math.max(0, sum.trafficDelayInSeconds || 0),
    trafficRatio: route.time > 0 ? sum.travelTimeInSeconds / route.time : 1,
    jams
  };
}

// Tek istekte canlı trafikli süre (karşılama kartı ve favoriler için)
export async function quickEta(key, from, to, signal) {
  const url = `${API}/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?key=${encodeURIComponent(key)}`
    + '&traffic=true&routeType=fastest&travelMode=car&routeRepresentation=summaryOnly';
  const r = await request(url, { signal });
  if (!r.ok) throw new Error('Süre ' + r.status);
  const s = (await r.json()).routes?.[0]?.summary;
  if (!s) throw new Error('Süre boş');
  return { time: s.travelTimeInSeconds, delay: s.trafficDelayInSeconds || 0, lengthM: s.lengthInMeters };
}

// Kategoriye göre yakındaki mekanlar (benzinlik, otopark, kafe, market)
export async function nearby(key, categorySet, near, radius, signal) {
  const params = new URLSearchParams({ key, lat: near.lat.toFixed(5), lon: near.lon.toFixed(5), radius: String(radius), categorySet, limit: '25', language: 'tr-TR' });
  const r = await request(`${API}/search/2/nearbySearch/.json?${params}`, { signal });
  if (!r.ok) throw new Error('Yakındakiler ' + r.status);
  const j = await r.json();
  return (j.results || []).map(x => {
    const a = x.address || {};
    return { name: x.poi?.name || 'Mekan', sub: [[a.streetName, a.streetNumber].filter(Boolean).join(' No:'), a.municipalitySubdivision].filter(Boolean).join(', '), lat: x.position.lat, lon: x.position.lon };
  });
}

// İşletme / adres arama (OpenStreetMap'te olmayan dükkan ve ofisleri de bulur)
export async function search(key, q, near, signal) {
  const params = new URLSearchParams({ key, countrySet: 'TR', language: 'tr-TR', limit: '10', typeahead: 'true' });
  if (near) { params.set('lat', near.lat.toFixed(5)); params.set('lon', near.lon.toFixed(5)); }
  const r = await request(`${API}/search/2/search/${encodeURIComponent(q)}.json?${params}`, { signal });
  if (!r.ok) throw new Error('Arama ' + r.status);
  const j = await r.json();
  return (j.results || []).map(x => {
    const a = x.address || {};
    const isPoi = x.type === 'POI';
    const name = isPoi ? x.poi.name : (a.streetName ? [a.streetName, a.streetNumber].filter(Boolean).join(' No:') : (a.municipalitySubdivision || a.municipality || a.freeformAddress));
    const sub = [isPoi ? [a.streetName, a.streetNumber].filter(Boolean).join(' No:') : null, a.municipalitySubdivision, a.municipality, a.countrySubdivision]
      .filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i && v !== name).join(', ');
    const cats = (x.poi?.categories || []).join(' ');
    let kind = 'pin';
    if (/petrol|fuel|gas/i.test(cats)) kind = 'fuel';
    else if (/restaurant|café|cafe|coffee|kahve|food|bakery/i.test(cats)) kind = 'food';
    else if (/hospital|pharmacy|doctor|clinic/i.test(cats)) kind = 'health';
    else if (/shop|market|mall|store/i.test(cats)) kind = 'shop';
    else if (/school|university|college/i.test(cats)) kind = 'school';
    else if (/parking/i.test(cats)) kind = 'parking';
    else if (!isPoi && a.streetName) kind = 'road';
    return { name, sub, lat: x.position.lat, lon: x.position.lon, kind, src: 'tt' };
  });
}

// Olayları rotaya oturt: rotanın 40 m yakınındaysa rota üzerindeki mesafesini bul
export function onRoute(list, route) {
  const out=[],{coords,cum}=route;
  for(const inc of list){
    const samples=inc.coords.length>8?Array.from({length:8},(_,i)=>inc.coords[Math.round(i*(inc.coords.length-1)/7)]):inc.coords;
    const matches=[];
    for(const pt of samples){
      let best={d:Infinity};
      for(let i=0;i<coords.length-1;i++){
        const a=coords[i],b=coords[i+1];if(pt[0]<Math.min(a[0],b[0])-.0004||pt[0]>Math.max(a[0],b[0])+.0004||pt[1]<Math.min(a[1],b[1])-.0003||pt[1]>Math.max(a[1],b[1])+.0003)continue;
        const p=projectOnSegment(pt[0],pt[1],a,b);
        if(p.d<best.d)best={d:p.d,along:cum[i]+p.t*(cum[i+1]-cum[i]),i};
      }
      if(best.d<25)matches.push(best);
    }
    if(!matches.length)continue;
    // Direction is considered only when a non-degenerate incident line is available.
    let directionKnown=false;
    if(inc.coords.length>1){
      const a=inc.coords[0],b=inc.coords.at(-1);
      if(Math.hypot(a[0]-b[0],a[1]-b[1])>.0001){
        directionKnown=true;const m=matches[Math.floor(matches.length/2)],i=m.i;
        const delta=Math.abs(((bearing(...a,...b)-bearing(...coords[i],...coords[i+1])+540)%360)-180);
        if(delta>85)continue;
      }
    }
    const start=Math.min(...matches.map(m=>m.along)),end=Math.max(...matches.map(m=>m.along));
    if(directionKnown&&(matches.length<2||end-start<25))continue;
    out.push({...inc,along:start,endAlong:Math.max(start+20,end),directionKnown});
  }
  return out.sort((a,b)=>a.along-b.along);
}

export function bboxOf(coords, pad = 0.01) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of coords) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a - pad, b - pad, c + pad, d + pad];
}

// Explicit user searches only; no calls from the GPS/camera loop.
export async function poiSearch(key,category,near,signal){
 const params=new URLSearchParams({key,countrySet:'TR',language:'tr-TR',limit:'15',lat:near.lat.toFixed(5),lon:near.lon.toFixed(5),radius:'3500',openingHours:'nextSevenDays',timeZone:'iana'});
 if(category.tt)params.set('categorySet',category.tt);if(category.brand)params.set('brandSet',category.brand);
 const r=await request(`${API}/search/2/poiSearch/${encodeURIComponent(category.query||category.label)}.json?${params}`,{signal});if(!r.ok)throw new Error('İşletme araması '+r.status);
 return ((await r.json()).results||[]).map(x=>({id:x.id,name:x.poi?.name||category.label,sub:x.address?.freeformAddress||'',lat:x.position.lat,lon:x.position.lon,kind:category.kind,phone:x.poi?.phone||'',brand:x.poi?.brands?.map(b=>b.name).join(', ')||'',openingHours:x.poi?.openingHours||null,timezone:x.poi?.timeZone?.ianaId||'Europe/Istanbul',diesel:null,src:'tt'}));
}
