// OpenFreeMap "liberty" stilini Apple Haritalar benzeri renklere boyar,
// üstüne arazi gölgesi, 3B bina ışığı, gökyüzü, uydu ve trafik katmanı ekler.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEM_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const PALETTES = {
  light: {
    land: '#F3F1EC', residential: '#EFECE6', park: '#C9E6BB', water: '#9FD0F5', sand: '#F2E8CF', ice: '#FFFFFF',
    building: '#E5E1D9', building3d: '#ECE8E1', building3dTall: '#D9D4CB', hospital: '#F7E1E1', school: '#F0E9D8', aeroway: '#E6E2DA',
    motorway: '#FFC95A', motorwayCase: '#E3A23A', primary: '#FFFFFF', primaryCase: '#D3CDC2',
    secondary: '#FFFFFF', secondaryCase: '#DBD6CD', minor: '#FFFFFF', minorCase: '#E0DBD3', path: '#E3DED4', rail: '#CFCAC0',
    label: '#1D1D1F', roadLabel: '#48484D', waterLabel: '#3B7DB4', poiLabel: '#55555A', halo: '#FFFFFF', boundary: '#B9B2C9',
    route: '#0A84FF', routeCase: '#0060DF', alt: '#9EC5F5', altCase: '#6E9FD8', arrow: '#FFFFFF', arrowCase: '#1C1C1E',
    shade: '#5C5246', highlight: '#FFFFFF', shadeK: 0.5,
    sky: '#9CCBF5', horizon: '#E8F2FC', fog: '#F3F1EC', light: 0.35
  },
  dark: {
    land: '#1F2023', residential: '#232427', park: '#1C3021', water: '#16283D', sand: '#2E2B24', ice: '#3A3A3C',
    building: '#2C2E32', building3d: '#383A40', building3dTall: '#45484F', hospital: '#36282A', school: '#2D2B25', aeroway: '#2A2B2F',
    motorway: '#A27C3A', motorwayCase: '#5E4826', primary: '#4B4D53', primaryCase: '#2B2C30',
    secondary: '#45474C', secondaryCase: '#2B2C30', minor: '#3A3C41', minorCase: '#28292D', path: '#34363A', rail: '#3D3E43',
    label: '#F2F2F7', roadLabel: '#C7C7CC', waterLabel: '#6FA3D6', poiLabel: '#AEAEB2', halo: '#1C1C1E', boundary: '#5A556A',
    route: '#3B9BFF', routeCase: '#0A5BC4', alt: '#3F5F86', altCase: '#2A4565', arrow: '#FFFFFF', arrowCase: '#000000',
    shade: '#000000', highlight: '#4A4A4E', shadeK: 0.55,
    sky: '#0B1426', horizon: '#1E2B45', fog: '#1F2023', light: 0.2
  }
};

const REMOVE = new Set(['natural_earth', 'road_area_pattern', 'highway-shield-us-interstate', 'road_shield_us']);

export async function loadStyle() {
  const style = await fetch(STYLE_URL).then(r => r.json());
  style.layers = style.layers.filter(l => !REMOVE.has(l.id));
  for (const l of style.layers) {
    // Türkçe etiketleri tercih et
    if (l.type === 'symbol' && l.layout && /name/.test(JSON.stringify(l.layout['text-field'] || ''))) {
      l.layout['text-field'] = ['coalesce', ['get', 'name:tr'], ['get', 'name'], ['get', 'name:latin']];
    }
    // 3B binalar biraz daha erken görünsün, gerçek yüksekliklerle
    if (l.id === 'building-3d') l.minzoom = 14.5;
    // Daha çok mekan (eczane, kafe, market) göster
    if (l.id === 'poi_r20') l.minzoom = Math.min(l.minzoom || 17, 16);
    if (l.id === 'poi_r7') l.minzoom = Math.min(l.minzoom || 16, 15);
  }
  // Arazi (yükseklik) ve uydu kaynakları
  style.sources.dem = { type: 'raster-dem', tiles: [DEM_URL], tileSize: 512, maxzoom: 12, encoding: 'terrarium', attribution: '© Mapterhorn' };
  style.sources.sat = { type: 'raster', tiles: [SAT_URL], tileSize: 256, maxzoom: 19, attribution: 'Uydu © Esri, Maxar' };
  const waterIdx = style.layers.findIndex(l => l.id === 'water' || l['source-layer'] === 'water');
  style.layers.splice(waterIdx, 0, {
    id: 'yolcu-hillshade', type: 'hillshade', source: 'dem', maxzoom: 16,
    paint: { 'hillshade-exaggeration': 0.32, 'hillshade-shadow-color': '#5C5246', 'hillshade-highlight-color': '#FFFFFF', 'hillshade-illumination-direction': 315 }
  });
  style.layers.splice(1, 0, { id: 'yolcu-sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150 } });
  return style;
}

function roadKind(id) {
  if (/rail/.test(id)) return 'rail';
  if (/path|pedestrian/.test(id)) return 'path';
  if (/motorway/.test(id)) return 'motorway';
  if (/trunk|primary/.test(id)) return 'primary';
  if (/secondary|tertiary/.test(id)) return 'secondary';
  return 'minor';
}

// type: 'standard' | 'satellite'
export function applyPalette(map, P, type = 'standard') {
  const sat = type === 'satellite';
  const set = (id, prop, v) => { try { map.setPaintProperty(id, prop, v); } catch { /* yok say */ } };
  const vis = (id, on) => { try { map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); } catch { } };
  for (const l of map.getStyle().layers) {
    const id = l.id, sl = l['source-layer'] || '';
    if (id.startsWith('yolcu-')) continue;
    if (l.type === 'background') { set(id, 'background-color', P.land); continue; }
    if (l.type === 'fill') {
      vis(id, !sat);
      if (sl === 'water') set(id, 'fill-color', P.water);
      else if (sl === 'park' || /wood|grass|wetland|pitch|cemetery/.test(id)) set(id, 'fill-color', P.park);
      else if (/residential/.test(id)) set(id, 'fill-color', P.residential);
      else if (/hospital/.test(id)) set(id, 'fill-color', P.hospital);
      else if (/school/.test(id)) set(id, 'fill-color', P.school);
      else if (/sand|track/.test(id)) set(id, 'fill-color', P.sand);
      else if (/ice/.test(id)) set(id, 'fill-color', P.ice);
      else if (sl === 'building') { set(id, 'fill-color', P.building); set(id, 'fill-outline-color', P.primaryCase); }
      else if (sl === 'aeroway') set(id, 'fill-color', P.aeroway);
      continue;
    }
    if (l.type === 'fill-extrusion') {
      vis(id, !sat);
      set(id, 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, P.building3d, 40, P.building3dTall]);
      set(id, 'fill-extrusion-opacity', 0.92);
      set(id, 'fill-extrusion-vertical-gradient', true);
      continue;
    }
    if (l.type === 'line') {
      if (sl === 'waterway') { vis(id, !sat); set(id, 'line-color', P.water); }
      else if (sl === 'park') { vis(id, !sat); set(id, 'line-color', P.park); }
      else if (sl === 'boundary') set(id, 'line-color', P.boundary);
      else if (sl === 'aeroway') { vis(id, !sat); set(id, 'line-color', P.aeroway); }
      else if (sl === 'transportation') {
        if (/hatching/.test(id)) { set(id, 'line-color', P.rail); continue; }
        const k = roadKind(id);
        const casing = /casing/.test(id);
        const color = k === 'rail' ? P.rail : k === 'path' ? P.path : casing ? P[k + 'Case'] : P[k];
        set(id, 'line-color', color);
        set(id, 'line-opacity', sat ? (casing || k === 'minor' || k === 'path' ? 0 : 0.55) : 1);
      }
      continue;
    }
    if (l.type === 'symbol') {
      if (id === 'highway-shield-non-us' || /one_way/.test(id)) continue;
      let c = P.label;
      if (sl === 'transportation_name') c = P.roadLabel;
      else if (sl === 'water_name' || sl === 'waterway') c = P.waterLabel;
      else if (sl === 'poi' || sl === 'aerodrome_label') c = P.poiLabel;
      set(id, 'text-color', sat ? '#FFFFFF' : c);
      set(id, 'text-halo-color', sat ? 'rgba(0,0,0,.75)' : P.halo);
      set(id, 'text-halo-width', sat ? 1.6 : 1.4);
    }
  }
  vis('yolcu-sat', sat);
  vis('yolcu-hillshade', !sat);
  set('yolcu-hillshade', 'hillshade-shadow-color', P.shade);
  set('yolcu-hillshade', 'hillshade-highlight-color', P.highlight);
  set('yolcu-hillshade', 'hillshade-exaggeration', P.shadeK);
  try { map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: P.light, position: [1.4, 210, 35] }); } catch { }
  try {
    map.setSky({
      'sky-color': sat ? '#7FB5E8' : P.sky, 'horizon-color': P.horizon, 'fog-color': sat ? '#C9D8E6' : P.fog,
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85, 'atmosphere-blend': 0.6
    });
  } catch { }
  // Rota katmanları
  set('yolcu-alt-case', 'line-color', P.altCase);
  set('yolcu-alt', 'line-color', P.alt);
  set('yolcu-route-case', 'line-color', P.routeCase);
  set('yolcu-route', 'line-color', P.route);
  set('yolcu-arrow-case', 'line-color', P.arrowCase);
  set('yolcu-arrow', 'line-color', P.arrow);
}

export function firstLabelLayer(map) {
  const ids = map.getStyle().layers.map(l => l.id);
  return ['poi_r20', 'highway-name-path', 'label_other'].find(id => ids.includes(id));
}
