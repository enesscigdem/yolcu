// Ücretsiz servisler: Valhalla (rota), Photon + Nominatim (arama / adres)
import { decode6, cumulative, sameRoute, pointAt } from './geo.js';
import { story } from './guide.js';

const VALHALLA = 'https://valhalla1.openstreetmap.de';
const PHOTON = 'https://photon.komoot.io';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const TR_BBOX = '25.5,35.7,45.0,42.2';

async function vpost(path, body, signal) {
  // text/plain => tarayıcı ön kontrol (preflight) isteği yapmaz, daha hızlı
  const r = await fetch(VALHALLA + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('Rota servisi hatası ' + r.status));
  return j;
}

/* ---------------- Arama ---------------- */

const KIND = [
  [/fuel/, 'fuel'], [/restaurant|cafe|fast_food|bar|pub|food|bakery|ice_cream/, 'food'],
  [/hospital|pharmacy|clinic|doctors|dentist/, 'health'], [/^shop|mall|supermarket|marketplace/, 'shop'],
  [/university|school|college|kindergarten/, 'school'], [/^highway/, 'road'], [/parking/, 'parking']
];
function kindOf(key, value) {
  const s = `${key}:${value}`;
  for (const [re, k] of KIND) if (re.test(s) || re.test(value || '')) return k;
  if (key === 'shop') return 'shop';
  if (key === 'highway') return 'road';
  return 'pin';
}

function photonToPlace(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;
  const streetLine = [p.street, p.housenumber].filter(Boolean).join(' No:');
  const name = p.name || streetLine || p.district || p.city || 'Konum';
  const parts = [];
  if (p.name && streetLine && streetLine !== p.name) parts.push(streetLine);
  if (p.district && p.district !== name) parts.push(p.district);
  if (p.city && p.city !== name) parts.push(p.city);
  else if (p.county && p.county !== name) parts.push(p.county);
  if (p.state && p.state !== p.city && p.state !== name) parts.push(p.state);
  return { name, sub: parts.join(', '), lat, lon, kind: kindOf(p.osm_key, p.osm_value) };
}

export async function search(q, near, signal) {
  const params = new URLSearchParams({ q, limit: '12', bbox: TR_BBOX });
  if (near) { params.set('lat', near.lat.toFixed(5)); params.set('lon', near.lon.toFixed(5)); params.set('location_bias_scale', '0.3'); }
  let list = [];
  try {
    const j = await fetch(`${PHOTON}/api/?${params}`, { signal }).then(r => r.json());
    list = (j.features || []).map(photonToPlace);
  } catch (e) { if (e.name === 'AbortError') throw e; }
  // Ayıklama: aynı isim + adres tekrarlarını at
  const seen = new Set();
  list = list.filter(p => { const k = p.name + '|' + p.sub; if (seen.has(k)) return false; seen.add(k); return true; });
  return list.slice(0, 10);
}

// Photon bulamazsa (ör. "2996 Sokak") Nominatim ile tek seferlik dene
export async function searchFallback(q, signal) {
  const params = new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'tr', limit: '8', addressdetails: '1', 'accept-language': 'tr' });
  const j = await fetch(`${NOMINATIM}/search?${params}`, { signal }).then(r => r.json());
  return j.map(x => {
    const a = x.address || {};
    const name = x.name || [a.road, a.house_number].filter(Boolean).join(' No:') || x.display_name.split(',')[0];
    const sub = [a.road !== name ? a.road : null, a.suburb || a.quarter || a.neighbourhood, a.town || a.city_district || a.county, a.province || a.city]
      .filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
    return { name, sub, lat: +x.lat, lon: +x.lon, kind: kindOf(x.category, x.type) };
  });
}

// "Neredeyim" için ters adres: cadde + mahalle + ilçe
export async function reverse(lat, lon, signal) {
  const params = new URLSearchParams({ lat, lon, format: 'jsonv2', zoom: '17', addressdetails: '1', 'accept-language': 'tr' });
  const j = await fetch(`${NOMINATIM}/reverse?${params}`, { signal }).then(r => r.json());
  const a = j.address || {};
  return {
    road: a.road || a.pedestrian || a.highway || null,
    hood: a.suburb || a.quarter || a.neighbourhood || a.village || null,
    district: a.town || a.city_district || a.county || null,
    city: a.province || a.city || a.state || null,
    name: j.name || null
  };
}

/* ---------------- Rota ---------------- */

function costing(prefs, mode) {
  const base = {
    exclude_unpaved: true,              // toprak / stabilize yola asla
    use_tolls: prefs.tolls ? 0 : 0.5,
    use_tracks: 0,
    use_living_streets: 0.1
  };
  if (mode === 'comfort') {
    Object.assign(base, {
      use_highways: prefs.highways ? 1 : 0.5,
      use_living_streets: 0,
      maneuver_penalty: 25,              // gereksiz dönüş yaptırma
      service_penalty: 80,               // servis/site içi yollara sokma
      gate_cost: 120
    });
  }
  return base;
}

// Ulaşım türüne göre maliyet ayarları
function costingFor(prefs, travel, variant) {
  if (travel === 'pedestrian') {
    return { name: 'pedestrian', opts: { use_hills: variant === 'alt' ? 0.5 : (prefs.hills ? 0.05 : 0.5), walkway_factor: 0.9, alley_factor: 2, use_lit: 0.3, use_tracks: 0.1, step_penalty: prefs.hills ? 30 : 0 } };
  }
  if (travel === 'bicycle') {
    return { name: 'bicycle', opts: { bicycle_type: 'Hybrid', use_hills: variant === 'alt' ? 0.5 : (prefs.hills ? 0.05 : 0.5), avoid_bad_surfaces: prefs.rough ? 0.8 : 0.3, use_roads: 0.3, use_living_streets: 0.6 } };
  }
  return { name: 'auto', opts: costing(prefs, variant) };
}

function loc(p, extra = {}) {
  const o = { lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), ...extra };
  if (p.heading != null && p.speed > 3) { o.heading = Math.round(p.heading); o.heading_tolerance = 50; }
  return o;
}

function buildRequest(locations, prefs, avoids, mode, alternates, travel = 'auto') {
  const c = costingFor(prefs, travel, mode);
  const body = {
    locations,
    costing: c.name,
    costing_options: { [c.name]: c.opts },
    directions_options: { units: 'kilometers', language: 'tr-TR' },
    alternates
  };
  if (avoids && avoids.length) body.exclude_locations = avoids.map(a => ({ lat: a.lat, lon: a.lon }));
  return body;
}

const SILENT = new Set([27]); // döner kavşaktan çıkış: girişte zaten söyleniyor

function tripToRoute(trip, travel = 'auto') {
  const coords = [];
  const maneuvers = [];
  let offset = 0;
  for (const leg of trip.legs) {
    const shape = decode6(leg.shape);
    if (coords.length) shape.shift();
    const base = coords.length ? coords.length - 1 : 0;
    coords.push(...shape);
    for (const m of leg.maneuvers) {
      // ara noktalardaki "hedefe vardınız" adımlarını atla
      if ((m.type === 4 || m.type === 5 || m.type === 6) && leg !== trip.legs.at(-1)) continue;
      if ((m.type === 1 || m.type === 2 || m.type === 3) && leg !== trip.legs[0]) continue;
      const s = m.sign || {};
      maneuvers.push({
        type: m.type,
        begin: m.begin_shape_index + base,
        lengthM: (m.length || 0) * 1000,
        time: m.time || 0,
        street: (m.street_names || [])[0] || (m.begin_street_names || [])[0] || '',
        toward: (s.exit_toward_elements || []).map(e => e.text),
        branch: (s.exit_branch_elements || []).map(e => e.text),
        exitNo: (s.exit_number_elements || []).map(e => e.text)[0] || '',
        exitName: (s.exit_name_elements || []).map(e => e.text)[0] || '',
        rbExit: m.roundabout_exit_count || 0,
        text: m.instruction || '',
        silent: SILENT.has(m.type)
      });
    }
    offset += leg.shape.length;
  }
  const cum = cumulative(coords);
  for (const m of maneuvers) m.along = cum[Math.min(m.begin, cum.length - 1)];
  return {
    mode: travel,
    coords, cum, maneuvers,
    lengthM: cum[cum.length - 1],
    time: trip.summary.time,
    hasToll: trip.summary.has_toll,
    raw: trip
  };
}

const ABBR = [[/ Caddesi$/, ' Cd.'], [/ Sokağı$| Sokak$/, ' Sk.'], [/ Bulvarı$/, ' Blv.'], [/ Mahallesi$/, ' Mah.']];
export const abbr = s => ABBR.reduce((acc, [re, r]) => acc.replace(re, r), s);

const SMALL = new Set(['residential', 'service_other', 'unclassified']);
const GOOD_SURFACE = new Set(['paved_smooth', 'paved']);

// Rotanın her yol parçasını inceler: yol sınıfı, yüzey, eğim, hız limiti
export async function analyze(route, signal) {
  const j = await vpost('/trace_attributes', {
    encoded_polyline: route.raw.legs.length === 1 ? route.raw.legs[0].shape : undefined,
    shape: route.raw.legs.length === 1 ? undefined : route.coords.map(c => ({ lat: c[1], lon: c[0] })),
    shape_match: 'edge_walk',
    costing: route.mode || 'auto',
    filters: {
      attributes: ['edge.speed_limit', 'edge.names', 'edge.road_class', 'edge.begin_shape_index', 'edge.end_shape_index',
        'edge.surface', 'edge.length', 'edge.max_upward_grade', 'edge.max_downward_grade', 'edge.weighted_grade', 'edge.use'],
      action: 'include'
    }
  }, signal);
  const st = { total: 0, motorway: 0, main: 0, small: 0, rough: 0, steep: 0, steps: 0, names: {}, edges: [] };
  for (const e of j.edges || []) {
    const m = (e.length || 0) * 1000;
    st.total += m;
    if (e.road_class === 'motorway' || e.road_class === 'trunk') st.motorway += m;
    else if (e.road_class === 'primary' || e.road_class === 'secondary') st.main += m;
    else if (SMALL.has(e.road_class)) st.small += m;
    if (e.surface && !GOOD_SURFACE.has(e.surface)) st.rough += m;
    // weighted_grade: parçanın ortalama eğimi (%). Uç değerler gürültülü olduğundan sadece bunu kullan
    const g = Math.abs(e.weighted_grade || 0);
    if (g >= 7 && m > 15) st.steep += g >= 10 ? m * 1.5 : m;
    if (e.use === 'steps') st.steps++;
    const nm = (e.names || [])[0];
    if (nm) st.names[nm] = (st.names[nm] || 0) + m;
    st.edges.push({ b: e.begin_shape_index, e: e.end_shape_index, limit: e.speed_limit || 0, name: nm || '', names: e.names || [], cls: e.road_class });
  }
  return st;
}

const TURN_TYPES = new Set([9, 10, 11, 12, 13, 14, 15, 16, 26]);

function scoreRoute(r, prefs) {
  const a = r.stats;
  r.turns = r.maneuvers.filter(m => TURN_TYPES.has(m.type)).length;
  if (r.mode !== 'auto') {
    let s = r.time + r.turns * 3;
    if (a) s += a.steep * (prefs.hills ? 1.2 : 0.1) + a.rough * (prefs.rough ? 0.3 : 0.02) + a.steps * (prefs.hills ? 20 : 2);
    r.score = s;
    return;
  }
  let s = (r.trafficTime || r.time) + r.turns * 10;
  if (a) {
    s += a.small * 0.05;
    s += a.rough * (prefs.rough ? 0.4 : 0.05);
    s += a.steep * (prefs.hills ? 0.35 : 0.02);
    if (prefs.highways) s -= (a.motorway + a.main * 0.5) * 0.006;
  }
  r.score = s;
}

function describe(r) {
  const a = r.stats;
  const tags = [];
  if (a) {
    const top = Object.entries(a.names).filter(([, m]) => m > 600).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([n]) => abbr(n));
    r.via = top.length ? top.join(' · ') + ' üzerinden' : '';
    if (a.steep < 150) tags.push({ t: 'Yokuş yok', c: 'good' });
    else tags.push({ t: `${Math.round(a.steep / 50) * 50} m dik yokuş`, c: a.steep > 600 ? 'bad' : 'warn' });
    if (a.rough < 80) tags.push({ t: 'Yol düzgün', c: 'good' });
    else tags.push({ t: `${Math.round(a.rough / 50) * 50} m bozuk yol`, c: a.rough > 400 ? 'bad' : 'warn' });
    if (r.mode === 'pedestrian' && a.steps) tags.push({ t: 'Merdiven var', c: 'warn' });
    if (r.mode === 'auto' && a.total > 0 && (a.motorway + a.main) / a.total > 0.6) tags.push({ t: 'Ana yol ağırlıklı', c: 'good' });
    if (r.mode === 'auto' && a.small > 1500) tags.push({ t: `${(a.small / 1000).toFixed(1).replace('.', ',')} km ara sokak`, c: 'warn' });
  } else {
    r.via = '';
  }
  if (r.trafficDelay != null) {
    const d = Math.round(r.trafficDelay / 60);
    tags.unshift(d >= 2 ? { t: `Trafik +${d} dk`, c: d >= 6 ? 'bad' : 'warn' } : { t: 'Trafik akıcı', c: 'good' });
  }
  tags.push({ t: `${r.turns} dönüş`, c: r.turns > 14 ? 'warn' : 'plain' });
  if (r.hasToll) tags.push({ t: 'Ücretli', c: 'warn' });
  r.tags = tags;
}

// Ana fonksiyon: birkaç farklı rota iste, hepsini incele, en rahatını öner
export async function planRoutes(from, to, prefs, avoids, signal, travel = 'auto', traffic = null) {
  const locations = [loc(from), loc(to)];
  const ex = travel === 'auto' ? avoids : [];
  const reqs = travel === 'auto'
    ? [vpost('/route', buildRequest(locations, prefs, ex, 'comfort', 2), signal), vpost('/route', buildRequest(locations, prefs, ex, 'fast', 2), signal)]
    : [vpost('/route', buildRequest(locations, prefs, ex, 'main', 2, travel), signal), vpost('/route', buildRequest(locations, prefs, ex, 'alt', 1, travel), signal)];
  const results = await Promise.allSettled(reqs);
  const trips = [];
  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    trips.push(res.value.trip, ...(res.value.alternates || []).map(a => a.trip));
  }
  if (!trips.length) {
    const err = results.find(r => r.status === 'rejected');
    throw err ? err.reason : new Error('Rota bulunamadı');
  }
  const routes = [];
  for (const t of trips) {
    const r = tripToRoute(t, travel);
    if (!routes.some(x => sameRoute(x, r))) routes.push(r);
    if (routes.length >= 4) break;
  }
  await Promise.all(routes.map(async r => {
    try { r.stats = await analyze(r, signal); } catch (e) { if (e.name === 'AbortError') throw e; r.stats = null; }
    // Trafik (TomTom anahtarı varsa): gerçek süre, gecikme ve sıkışık bölümler
    if (traffic && travel === 'auto') {
      try { Object.assign(r, await traffic(r, signal)); } catch (e) { if (e.name === 'AbortError') throw e; }
    }
  }));
  routes.forEach(r => { scoreRoute(r, prefs); describe(r); r.story = story(r); });
  const tt = r => r.trafficTime || r.time;
  const fastest = routes.reduce((a, b) => (tt(b) < tt(a) ? b : a));
  routes.sort((a, b) => a.score - b.score);
  routes[0].best = true;
  fastest.fastest = true;
  return routes;
}

// Rotadan çıkınca: önce eski rotaya geri bağlanmayı dene, çok uzarsa yeni rota
export async function reroute(from, to, oldRoute, along, prefs, avoids) {
  const travel = oldRoute.mode || 'auto';
  const v = travel === 'auto' ? 'comfort' : 'main';
  if (travel !== 'auto') avoids = [];
  const fresh = vpost('/route', buildRequest([loc(from), loc(to)], prefs, avoids, v, 0, travel));
  let rejoin = null;
  const target = along + 700;
  if (target < oldRoute.lengthM - 300) {
    const p = pointAt(oldRoute.coords, oldRoute.cum, target);
    rejoin = vpost('/route', buildRequest([loc(from), { lat: p.lat, lon: p.lon, type: 'through' }, loc(to)], prefs, avoids, v, 0, travel));
  }
  const [f, r] = await Promise.allSettled([fresh, rejoin || Promise.reject(new Error('yok'))]);
  const F = f.status === 'fulfilled' ? tripToRoute(f.value.trip, travel) : null;
  const J = r.status === 'fulfilled' ? tripToRoute(r.value.trip, travel) : null;
  let pick = F;
  if (J && (!F || J.time <= F.time + 180)) pick = J;
  if (!pick) throw (f.reason || new Error('Rota bulunamadı'));
  try { pick.stats = await analyze(pick); } catch { pick.stats = null; }
  pick.story = story(pick);
  return pick;
}
