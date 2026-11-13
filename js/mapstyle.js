// OpenFreeMap "liberty" stilini Apple Haritalar (iOS 26) görünümüne yaklaştırır:
// sade açık zemin, yeşil araziler, gece lacivert, yumuşak binalar, navigasyonda gri yollar.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEM_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const PALETTES = {
  light: {
    land: '#F5F4F0', residential: '#F1EFEA', park: '#CDE6BF', wood: '#BFDFAE', water: '#86CDF5', sand: '#F2EAD3', ice: '#FFFFFF',
    building: '#E9E7E2', building3d: '#F6F5F2', building3dTall: '#ECEAE5', hospital: '#F9E3E3', school: '#F1EBDD', aeroway: '#E9E7E1',
    motorway: '#FFFFFF', motorwayCase: '#BCB7AE', primary: '#FFFFFF', primaryCase: '#CDC8BF',
    secondary: '#FFFFFF', secondaryCase: '#D6D2CA', minor: '#FFFFFF', minorCase: '#DEDAD3', path: '#E4E0D8', rail: '#D2CEC6',
    navRoad: '#A2A2A7', navRoadCase: '#E4E4E8', navMotorway: '#B5B5BA',
    label: '#3A3A3C', district: '#8A8A8E', roadLabel: '#5C5C61', waterLabel: '#2F78B5', poiLabel: '#6B6B70', halo: '#FFFFFF', boundary: '#C3BFD0',
    route: '#0A84FF', routeCase: '#0057D2', alt: '#8DBDF7', altCase: '#5E92D2', arrow: '#FFFFFF', arrowCase: '#1C1C1E',
    shade: '#43523C', highlight: '#FFFFFF', shadeK: 0.45,
    sky: '#B9DBF7', horizon: '#F1F6FB', fog: '#F5F4F0', light: 0.3
  },
  dark: {
    land: '#252C38', residential: '#28303D', park: '#24493B', wood: '#21443A', water: '#1C3B8C', sand: '#38382F', ice: '#3E4656',
    building: '#2F3747', building3d: '#3A4356', building3dTall: '#465068', hospital: '#3A2F3B', school: '#33333E', aeroway: '#2C3442',
    motorway: '#A3ACBD', motorwayCase: '#5E687B', primary: '#87909F', primaryCase: '#4A5366',
    secondary: '#757E8E', secondaryCase: '#424B5C', minor: '#626B7B', minorCase: '#3A4253', path: '#4C5466', rail: '#4C5466',
    navRoad: '#6E788B', navRoadCase: '#3F4859', navMotorway: '#8892A4',
    label: '#F2F2F7', district: '#AEB4C2', roadLabel: '#C9CED8', waterLabel: '#8FB4F2', poiLabel: '#B8BDC8', halo: '#1F2631', boundary: '#6A6F86',
    route: '#3D9BFF', routeCase: '#0A5BC4', alt: '#4E73A3', altCase: '#304D75', arrow: '#FFFFFF', arrowCase: '#000000',
    shade: '#0A0F18', highlight: '#4C5A75', shadeK: 0.5,
    sky: '#0E1628', horizon: '#2A3550', fog: '#252C38', light: 0.25
  }
};

const REMOVE = new Set(['natural_earth', 'road_area_pattern', 'highway-shield-us-interstate', 'road_shield_us', 'park_outline', 'landuse_track']);

export async function loadStyle() {
  const style = await fetch(STYLE_URL).then(r => r.json());
  style.layers = style.layers.filter(l => !REMOVE.has(l.id));
  for (const l of style.layers) {
    const lay = l.layout || (l.layout = {});
    if (l.type === 'symbol' && /name/.test(JSON.stringify(lay['text-field'] || ''))) {
      // Türkçe adlar, eğik yazı yok
      lay['text-field'] = ['coalesce', ['get', 'name:tr'], ['get', 'name'], ['get', 'name:latin']];
      const isWater = (l['source-layer'] || '').startsWith('water');
      if (l['source-layer'] === 'place') {
        lay['text-font'] = ['Noto Sans Bold'];
        if (l.id === 'label_other' || l.id === 'label_village') {
          // Mahalle ve semtler: Apple gibi büyük harf, aralıklı
          lay['text-transform'] = 'uppercase';
          lay['text-letter-spacing'] = 0.12;
          lay['text-size'] = ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 12.5];
        }
      } else if (!isWater) {
        lay['text-font'] = ['Noto Sans Regular'];
      }
    }
    // Binalar: düz zemin 14'ten, 3B kabartma 16'dan sonra yumuşakça belirsin
    if (l.id === 'building') l.minzoom = 14;
    if (l.id === 'building-3d') l.minzoom = 15.5;
    if (l.id === 'poi_r20') l.minzoom = Math.max(l.minzoom || 0, 16);
  }
  style.sources.dem = { type: 'raster-dem', tiles: [DEM_URL], tileSize: 512, maxzoom: 12, encoding: 'terrarium', attribution: '© Mapterhorn' };
  style.sources.sat = { type: 'raster', tiles: [SAT_URL], tileSize: 256, maxzoom: 19, attribution: 'Uydu © Esri, Maxar' };
  const waterIdx = style.layers.findIndex(l => l.id === 'water' || l['source-layer'] === 'water');
  style.layers.splice(waterIdx, 0, {
    id: 'yolcu-hillshade', type: 'hillshade', source: 'dem', maxzoom: 16,
    paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#43523C', 'hillshade-highlight-color': '#FFFFFF', 'hillshade-illumination-direction': 315 }
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

// opts: { type: 'standard' | 'satellite', nav: boolean }
export function applyPalette(map, P, opts = {}) {
  const sat = opts.type === 'satellite';
  const nav = !!opts.nav && !sat;
  const set = (id, prop, v) => { try { map.setPaintProperty(id, prop, v); } catch { /* yok say */ } };
  const vis = (id, on) => { try { map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); } catch { } };
  for (const l of map.getStyle().layers) {
    const id = l.id, sl = l['source-layer'] || '';
    if (id.startsWith('yolcu-')) continue;
    if (l.type === 'background') { set(id, 'background-color', P.land); continue; }
    if (l.type === 'fill') {
      vis(id, !sat);
      if (sl === 'water') set(id, 'fill-color', P.water);
      else if (/wood|wetland/.test(id)) set(id, 'fill-color', P.wood);
      else if (sl === 'park' || /grass|pitch|cemetery/.test(id)) set(id, 'fill-color', P.park);
      else if (/residential/.test(id)) set(id, 'fill-color', P.residential);
      else if (/hospital/.test(id)) set(id, 'fill-color', P.hospital);
      else if (/school/.test(id)) set(id, 'fill-color', P.school);
      else if (/sand/.test(id)) set(id, 'fill-color', P.sand);
      else if (/ice/.test(id)) set(id, 'fill-color', P.ice);
      else if (sl === 'building') {
        set(id, 'fill-color', P.building);
        set(id, 'fill-outline-color', P.building);
        set(id, 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1]);
      }
      else if (sl === 'aeroway') set(id, 'fill-color', P.aeroway);
      continue;
    }
    if (l.type === 'fill-extrusion') {
      vis(id, !sat);
      set(id, 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, P.building3d, 50, P.building3dTall]);
      set(id, 'fill-extrusion-opacity', 0.88);
      set(id, 'fill-extrusion-vertical-gradient', true);
      // Yükseklik zoomla yumuşakça büyüsün (aniden kutu çıkmasın)
      set(id, 'fill-extrusion-height', ['interpolate', ['linear'], ['zoom'], 15.5, 0, 16.5, ['*', 0.9, ['coalesce', ['get', 'render_height'], 6]]]);
      set(id, 'fill-extrusion-base', ['interpolate', ['linear'], ['zoom'], 15.5, 0, 16.5, ['coalesce', ['get', 'render_min_height'], 0]]);
      continue;
    }
    if (l.type === 'line') {
      if (sl === 'waterway') { vis(id, !sat); set(id, 'line-color', P.water); }
      else if (sl === 'park') { vis(id, !sat); }
      else if (sl === 'boundary') set(id, 'line-color', P.boundary);
      else if (sl === 'aeroway') { vis(id, !sat); set(id, 'line-color', P.aeroway); }
      else if (sl === 'transportation') {
        if (/hatching/.test(id)) { set(id, 'line-color', P.rail); continue; }
        const k = roadKind(id);
        const casing = /casing/.test(id);
        let color = k === 'rail' ? P.rail : k === 'path' ? P.path : casing ? P[k + 'Case'] : P[k];
        if (nav && k !== 'rail' && k !== 'path') color = casing ? P.navRoadCase : (k === 'motorway' ? P.navMotorway : P.navRoad);
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
      else if (id === 'label_other' || id === 'label_village') c = P.district;
      set(id, 'text-color', sat ? '#FFFFFF' : c);
      set(id, 'text-halo-color', sat ? 'rgba(0,0,0,.75)' : P.halo);
      set(id, 'text-halo-width', sat ? 1.6 : 1.5);
      set(id, 'text-halo-blur', 0.5);
      if (sl === 'poi') set(id, 'icon-opacity', nav ? 0 : 1), set(id, 'text-opacity', nav ? 0 : 1);
    }
  }
  vis('yolcu-sat', sat);
  vis('yolcu-hillshade', !sat);
  set('yolcu-hillshade', 'hillshade-shadow-color', P.shade);
  set('yolcu-hillshade', 'hillshade-highlight-color', P.highlight);
  set('yolcu-hillshade', 'hillshade-exaggeration', P.shadeK);
  try { map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: P.light, position: [1.3, 200, 40] }); } catch { }
  try {
    map.setSky({
      'sky-color': sat ? '#7FB5E8' : P.sky, 'horizon-color': P.horizon, 'fog-color': sat ? '#C9D8E6' : P.fog,
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85, 'atmosphere-blend': 0.6
    });
  } catch { }
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
