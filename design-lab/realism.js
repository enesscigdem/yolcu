// Açık veriyle harita gerçekçiliği: bina yüksekliğine göre düşen gölgeler,
// bina diplerinde temas gölgesi ve yeşil alanlarda 3B ağaçlar.
// Veri: OpenStreetMap bina tabanları + render_height, park/orman/çim alanları.
// Ağaçlar temsilîdir (OSM’de tek tek ağaç konumu yok); yalnız gerçek yeşil alanların içine yerleştirilir.

const SUN_AZ = 135;       // gölge yönü güneydoğu — ışık kuzeybatıdan (haritacılık geleneği), gölge kameraya görünür tarafa düşer
const SHADOW_K = 0.62;    // 1 m yükseklik → 0,62 m gölge (güneş ~58°)
const MAX_TREES = 2600;

function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); const h = lo.concat(up); h.push(h[0]); return h;
}
function inside(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function polygons(g) { return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; }

export function attachRealism(map, { theme = 'light', enabled = true } = {}) {
  const FC = f => ({ type: 'FeatureCollection', features: f });
  const dark = theme === 'dark';
  let lastKey = '', timer = 0;
  const before = map.getLayer('building') ? 'building' : map.getLayer('building-3d') ? 'building-3d' : undefined;
  map.addSource('lab-shadow', { type: 'geojson', data: FC([]), buffer: 16, tolerance: .2 });
  map.addSource('lab-trees', { type: 'geojson', data: FC([]), buffer: 16, tolerance: .1 });
  // Bina gölgesi: yüksekliğe orantılı, güneşin tersine
  map.addLayer({ id: 'lab-shadow', type: 'fill', source: 'lab-shadow', minzoom: 14.5, paint: { 'fill-color': dark ? '#000000' : '#5B4A36', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.5, dark ? .38 : .2], 'fill-antialias': true } }, before);
  // Temas gölgesi: bina tabanı çevresinde yumuşak koyulaşma (ortam kapatma etkisi)
  map.addLayer({ id: 'lab-contact', type: 'line', source: 'openmaptiles', 'source-layer': 'building', minzoom: 15, paint: { 'line-color': dark ? '#000000' : '#4D3D2C', 'line-opacity': dark ? .45 : .22, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 7], 'line-blur': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 7] } }, before);
  // Ağaçlar: iki katmanlı, düşük poligonlu taç
  map.addLayer({ id: 'lab-trees', type: 'fill-extrusion', source: 'lab-trees', minzoom: 15, paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, ['get', 'h']], 'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, ['get', 'b']], 'fill-extrusion-vertical-gradient': true, 'fill-extrusion-opacity': 1 } });

  function tileKey() { try { const t = map.style.sourceCaches.openmaptiles._tiles; return Object.keys(t).filter(k => t[k].state === 'loaded').sort().join() + '|' + map.getZoom().toFixed(0); } catch { return String(Math.random()); } }
  function compute() {
    if (!enabled || !map.getSource('lab-shadow') || map.getZoom() < 14.4) return;
    const key = tileKey(); if (key === lastKey) return; lastKey = key;
    const lat0 = map.getCenter().lat, mx = 111320 * Math.cos(lat0 * Math.PI / 180), my = 110540;
    const sx = Math.sin(SUN_AZ * Math.PI / 180) / mx, sy = Math.cos(SUN_AZ * Math.PI / 180) / my;
    const shadows = [], seen = new Set();
    for (const f of map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' })) {
      const h = Math.max(0, Number(f.properties.render_height) || 0); if (h < 2.5) continue;
      const L = Math.min(h, 60) * SHADOW_K;
      for (const poly of polygons(f.geometry)) {
        const ring = poly[0]; if (!ring || ring.length < 4) continue;
        const k = ring[0][0].toFixed(6) + ring[0][1].toFixed(6) + ring.length; if (seen.has(k)) continue; seen.add(k);
        const shifted = ring.map(([x, y]) => [x + sx * L, y + sy * L]);
        shadows.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [hull(ring.concat(shifted))] } });
      }
    }
    // Ağaçlar: yalnız gerçek yeşil alanların içinde, sabit tohumla
    const trees = [], b = map.getBounds(), pad = .004;
    const tones = dark ? ['#2C4632', '#284030', '#32503A', '#2F4A2F'] : ['#88A86A', '#7A9E62', '#93B173', '#82A35E'];
    const areas = [];
    for (const f of map.querySourceFeatures('openmaptiles', { sourceLayer: 'park' })) areas.push([f, 15]);
    for (const f of map.querySourceFeatures('openmaptiles', { sourceLayer: 'landcover' })) { const c = f.properties.class, s = f.properties.subclass; if (c === 'wood') areas.push([f, 9]); else if (c === 'grass' && s !== 'golf_course') areas.push([f, 24]); }
    const used = new Set();
    outer: for (const [f, spacing] of areas) for (const poly of polygons(f.geometry)) {
      const ring = poly[0]; if (!ring) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (x1 < b.getWest() - pad || x0 > b.getEast() + pad || y1 < b.getSouth() - pad || y0 > b.getNorth() + pad) continue;
      const gx = spacing / mx, gy = spacing / my;
      for (let i = Math.floor(x0 / gx); i <= Math.ceil(x1 / gx); i++) for (let j = Math.floor(y0 / gy); j <= Math.ceil(y1 / gy); j++) {
        const id = i + ':' + j + ':' + spacing; if (used.has(id)) continue;
        const r1 = hash(i, j), r2 = hash(j + 7, i - 3), r3 = hash(i * 3, j * 5);
        if (r3 < .18) continue; // doğal boşluklar
        const p = [(i + .15 + r1 * .7) * gx, (j + .15 + r2 * .7) * gy];
        if (!inside(p, ring) || poly.slice(1).some(hole => inside(p, hole))) continue;
        used.add(id);
        const size = .75 + r1 * .55, c = tones[Math.floor(r2 * tones.length)], R = 3.1 * size;
        const oct = (r, ox = 0, oy = 0) => { const pts = []; for (let k = 0; k <= 8; k++) { const a = (k % 8) / 8 * Math.PI * 2 + r1; pts.push([p[0] + (Math.cos(a) * r + ox) / mx, p[1] + (Math.sin(a) * r + oy) / my]); } return [pts]; };
        trees.push({ type: 'Feature', properties: { b: 1.6 * size, h: 6.2 * size, c }, geometry: { type: 'Polygon', coordinates: oct(R) } });
        trees.push({ type: 'Feature', properties: { b: 6.2 * size, h: 8.8 * size, c }, geometry: { type: 'Polygon', coordinates: oct(R * .62) } });
        const sl = 7.5 * size * SHADOW_K; shadows.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: oct(R * .95, Math.sin(SUN_AZ * Math.PI / 180) * sl, Math.cos(SUN_AZ * Math.PI / 180) * sl) } });
        if (trees.length >= MAX_TREES * 2) break outer;
      }
    }
    if (!shadows.length && !trees.length) lastKey = '';
    map.__labCounts = { shadows: shadows.length, trees: trees.length };
    map.getSource('lab-shadow')?.setData(FC(shadows));
    map.getSource('lab-trees')?.setData(FC(trees));
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(compute, 250); };
  const onData = e => { if (e.sourceId === 'openmaptiles' && e.isSourceLoaded) schedule(); };
  map.on('sourcedata', onData); map.on('idle', schedule);
  const iv = setInterval(compute, 1500); // sürüşte harita hiç “idle” olmaz
  schedule();
  return { compute, stop() { clearInterval(iv); clearTimeout(timer); map.off('sourcedata', onData); map.off('idle', schedule); } };
}
