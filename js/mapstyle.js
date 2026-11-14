import { pointAt } from './geo.js';
// Harita görünümü: OpenFreeMap "liberty" stilini doğal, sakin renklere boyar;
// arazi gölgesi, 3B arazi, ışıklı 3B binalar, gökyüzü, uydu katmanı ekler.
// Not: MapLibre bina dokusu (cephe/pencere) ve gerçek gölge düşürmeyi desteklemez;
// binalar OpenStreetMap'teki gerçek taban şekli ve yükseklikleriyle, yönlü ışıkla çizilir.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEM_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const ACCENT = '#C95D36';

export const PALETTES = {
  light: {
    land: '#EEECE4', residential: '#E9E6DD', park: '#C5D0B2', wood: '#B5C3A2', water: '#BCD0D3', sand: '#EDE5CF', ice: '#FFFFFF',
    building: '#D5D0C4', building3d: '#DDD7CB', building3dTall: '#BFB8AB', hospital: '#F0E1DF', school: '#ECE6D8', aeroway: '#E6E3DC',
    // Binalar arasında çok hafif ton farkı (hepsi aynı kutu gibi durmasın)
    bTones: ['#DED8CC', '#D3CDBF', '#DAD2C4'], poiBg: '#FFFFFF', poiFg: '#4A4A4F',
    motorway: '#F6E2B8', motorwayCase: '#D7B87A', primary: '#FFFFFF', primaryCase: '#CFC9BE',
    secondary: '#FFFFFF', secondaryCase: '#D7D2C9', minor: '#FFFFFF', minorCase: '#DFDAD2', path: '#E3DED4', rail: '#CFCAC0',
    navRoad: '#FFFFFF', navRoadCase: '#D6D0C6', navMotorway: '#F4DFB5',
    label: '#2E2E31', district: '#86868B', roadLabel: '#505A52', waterLabel: '#4A7FA8', poiLabel: '#6C6C71', halo: '#FFFFFF', boundary: '#C5C0CF',
    route: '#CE653C', routeCase: '#A44B2B', alt: '#AAA8A5', altCase: '#878580', arrow: '#FFFFFF', arrowCase: '#1C1D20',
    shade: '#47523F', highlight: '#FFFFFF', shadeK: 0.45,
    sky: '#D8E1DF', horizon: '#F2F1EC', fog: '#EFEDE8', light: 0.42
  },
  dark: {
    land: '#252729', residential: '#292B2D', park: '#1B2820', wood: '#19261E', water: '#142B2D', sand: '#2B2A25', ice: '#34363B',
    building: '#25272B', building3d: '#3E4144', building3dTall: '#505356', hospital: '#2D2427', school: '#2A2925', aeroway: '#24252A',
    bTones: ['#34383B', '#303437', '#3B3F42'], poiBg: '#26282D', poiFg: '#C9C9CE',
    motorway: '#4A4436', motorwayCase: '#2E2A21', primary: '#3A3C42', primaryCase: '#242529',
    secondary: '#34363B', secondaryCase: '#222326', minor: '#2E3035', minorCase: '#1F2023', path: '#2A2B2F', rail: '#2E3034',
    navRoad: '#535659', navRoadCase: '#303235', navMotorway: '#676B6E',
    label: '#E6E6E8', district: '#8E8E93', roadLabel: '#A3A3A8', waterLabel: '#6E93B5', poiLabel: '#9A9A9F', halo: '#141517', boundary: '#4C4A55',
    route: '#DF7748', routeCase: '#9C472A', alt: '#777A7D', altCase: '#45484B', arrow: '#FFFFFF', arrowCase: '#000000',
    shade: '#050608', highlight: '#3C4048', shadeK: 0.5,
    sky: '#121418', horizon: '#26282D', fog: '#1A1B1E', light: 0.4
  }
};

const REMOVE = new Set(['natural_earth', 'road_area_pattern', 'highway-shield-us-interstate', 'road_shield_us', 'park_outline', 'landuse_track']);

export async function loadStyle() {
  const style = await fetch(STYLE_URL).then(r => r.json());
  style.layers = style.layers.filter(l => !REMOVE.has(l.id));
  for (const l of style.layers) {
    const lay = l.layout || (l.layout = {});
    if (l.type === 'symbol' && /name/.test(JSON.stringify(lay['text-field'] || ''))) {
      lay['text-field'] = ['coalesce', ['get', 'name:tr'], ['get', 'name'], ['get', 'name:latin']];
      const isWater = (l['source-layer'] || '').startsWith('water');
      if (l['source-layer'] === 'place') {
        lay['text-font'] = ['Noto Sans Bold'];
        if (l.id === 'label_other' || l.id === 'label_village') {
          lay['text-transform'] = 'uppercase';
          lay['text-letter-spacing'] = 0.14;
          lay['text-size'] = ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 12];
        }
      } else if (!isWater) {
        lay['text-font'] = ['Noto Sans Regular'];
      }
    }
    if(l['source-layer']==='transportation_name'&&l.type==='symbol'){lay['text-padding']=4;lay['text-size']=['interpolate',['linear'],['zoom'],13,10,16,12,18,14];}
    if (l.id === 'building') l.minzoom = 14;
    if (l.id === 'building-3d') l.minzoom = 14;
    if(l.type==='symbol') { l.paint ||= {}; l.paint['text-opacity-transition']={duration:450}; }
    if (l['source-layer'] === 'transportation_name' && /path/.test(l.id)) l.minzoom = 16;
    if (l['source-layer'] === 'place' && /other|village/.test(l.id)) l.minzoom = 13;
  }
  // Hazır renkli mekan ikonlarını kaldır; yerine sade, tek renkli kendi katmanımız (işe yarayan türler)
  style.layers = style.layers.filter(l => l['source-layer'] !== 'poi');
  const labelIdx = style.layers.findIndex(l => l.id === 'highway-name-path');
  style.layers.splice(labelIdx < 0 ? style.layers.length : labelIdx, 0, {
    id: 'yolcu-poi', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 15,
    filter: ['match', ['get', 'class'], ['pharmacy', 'fuel', 'hospital', 'parking', 'railway'], true, false],
    layout: {
      'icon-image': ['concat', 'poi-', ['get', 'class']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.8, 18, 1],
      'icon-allow-overlap': false,
      'text-field': ['step', ['zoom'], '', 16.5, ['coalesce', ['get', 'name:tr'], ['get', 'name']]],
      'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.35], 'text-anchor': 'top',
      'text-max-width': 8, 'text-optional': true, 'symbol-sort-key': ['match', ['get', 'class'], 'hospital', 0, 'pharmacy', 1, 'fuel', 2, 3]
    },
    paint: { 'text-color': '#6C6C71', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.3 }
  });
  style.sources.dem = { type: 'raster-dem', tiles: [DEM_URL], tileSize: 512, maxzoom: 12, encoding: 'terrarium', attribution: '© Mapterhorn' };
  // 3B arazi için ayrı kaynak (MapLibre önerisi: gölge ve arazi aynı kaynağı paylaşmasın)
  style.sources.dem3d = { type: 'raster-dem', tiles: [DEM_URL], tileSize: 512, maxzoom: 12, encoding: 'terrarium' };
  style.sources.sat = { type: 'raster', tiles: [SAT_URL], tileSize: 256, maxzoom: 19, attribution: 'Uydu © Esri, Maxar' };
  const waterIdx = style.layers.findIndex(l => l.id === 'water' || l['source-layer'] === 'water');
  style.layers.splice(waterIdx, 0, {
    id: 'yolcu-hillshade', type: 'hillshade', source: 'dem', maxzoom: 16, layout:{visibility:'none'},
    paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#47523F', 'hillshade-highlight-color': '#FFFFFF', 'hillshade-illumination-direction': 315 }
  });
  style.layers.splice(1, 0, { id: 'yolcu-sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150, 'raster-contrast': 0.1, 'raster-saturation': 0.05, 'raster-resampling': 'linear' } });
  return style;
}

// 3B arazi: eğik bakışta tepeler gerçekten yükselir
export function setTerrain(map, on) {
  try {
    const cur = map.getTerrain && map.getTerrain();
    if (on && !cur) map.setTerrain({ source: 'dem3d', exaggeration: 1.0 });
    else if (!on && cur) map.setTerrain(null);
  } catch { }
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
      // Gerçek yükseklikler (OSM kat bilgisi). Renk: binalar arasında hafif ton farkı + yükseldikçe bir ton koyulaşma
      const h = ['coalesce', ['get', 'render_height'], 0];
      const tone = ['match', ['%', ['round', h], 3], 0, P.bTones[0], 1, P.bTones[1], P.bTones[2]];
      set(id, 'fill-extrusion-color', ['interpolate', ['linear'], h, 0, tone, 20, tone, 60, P.building3dTall]);
      set(id, 'fill-extrusion-opacity', nav ? .86 : .94);
      set(id, 'fill-extrusion-height-transition', {duration:650});
      set(id, 'fill-extrusion-vertical-gradient', true);
      set(id, 'fill-extrusion-height', ['interpolate', ['linear'], ['zoom'], 14, 0, 16.2, ['max',0,['to-number',['get','render_height'],0]]]);
      set(id, 'fill-extrusion-base', ['interpolate', ['linear'], ['zoom'], 14, 0, 16.2, ['coalesce', ['get', 'render_min_height'], 0]]);
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
        set(id, 'line-opacity', sat ? (casing || k === 'minor' || k === 'path' ? 0 : 0.5) : 1);
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
      set(id, 'text-halo-color', sat ? 'rgba(0,0,0,.7)' : P.halo);
      set(id, 'text-halo-width', sat ? 1.5 : 1.4);
      set(id, 'text-halo-blur', 0.4);
      if (sl === 'poi') { set(id, 'icon-opacity', nav ? 0 : 0.85); set(id, 'text-opacity', nav ? 0 : 1); }
    }
  }
  vis('yolcu-sat', sat);
  vis('yolcu-hillshade', !sat && !!opts.relief && !nav);
  vis('yolcu-poi', !nav);
  set('yolcu-poi', 'text-color', sat ? '#FFFFFF' : P.poiLabel);
  set('yolcu-poi', 'text-halo-color', sat ? 'rgba(0,0,0,.7)' : P.halo);
  // Uyduda eğik bakışta ufuk bulanıklaşmasın: eğimi sınırla
  try { map.setMaxPitch(sat ? 55 : 75); } catch { }
  set('yolcu-hillshade', 'hillshade-shadow-color', P.shade);
  set('yolcu-hillshade', 'hillshade-highlight-color', P.highlight);
  set('yolcu-hillshade', 'hillshade-exaggeration', P.shadeK);
  // Işık: güneybatıdan, yüksek açıyla → binaların bir yüzü aydınlık, diğeri gölgeli
  try { map.setLight({ anchor: 'map', color: '#fff9ef', intensity: P.light, position: [1.15, 215, 40] }); } catch { }
  try {
    map.setSky({
      'sky-color': sat ? '#8DB7DE' : P.sky, 'horizon-color': P.horizon, 'fog-color': sat ? '#C9D6E2' : P.fog,
      'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.8, 'fog-ground-blend': 0.9, 'atmosphere-blend': 0.5
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

// Flatten only the nearby navigation corridor, leaving the rest of the real city in 3D.
export function setRouteBuildings(map,route,along=0,quality=0) {
  const polygons=[];
  if(route)for(let d=Math.max(0,along-100);d<Math.min(route.lengthM,along+850);d+=60){
    const a=pointAt(route.coords,route.cum,d),b=pointAt(route.coords,route.cum,Math.min(route.lengthM,d+85));
    const kx=111320*Math.cos(a.lat*Math.PI/180),ky=110540,dx=(b.lon-a.lon)*kx,dy=(b.lat-a.lat)*ky,n=Math.hypot(dx,dy)||1;
    const ox=-dy/n*75/kx,oy=dx/n*75/ky;
    const ring=[[a.lon+ox,a.lat+oy],[b.lon+ox,b.lat+oy],[b.lon-ox,b.lat-oy],[a.lon-ox,a.lat-oy],[a.lon+ox,a.lat+oy]];
    polygons.push([ring]);
  }
  for(const layer of map.getStyle().layers){
    if(layer.type==='fill-extrusion'){
      const h=['max',0,['to-number',['get','render_height'],0]];
      const target=polygons.length?['case',['within',{type:'MultiPolygon',coordinates:polygons}],0,h]:h;
      const value=quality>=1?0:['interpolate',['linear'],['zoom'],quality?15:14,0,16.2,target];
      if((map.getLayoutProperty(layer.id,'visibility')||'visible')!==(quality>=1?'none':'visible'))map.setLayoutProperty(layer.id,'visibility',quality>=1?'none':'visible');map.setPaintProperty(layer.id,'fill-extrusion-height',value);map.setPaintProperty(layer.id,'fill-extrusion-base',quality>=1?0:['interpolate',['linear'],['zoom'],14,0,16.2,['coalesce',['get','render_min_height'],0]]);
    }
    if(layer.type==='symbol'&&layer['source-layer']==='place'){if((map.getLayoutProperty(layer.id,'visibility')||'visible')!==(route&&quality>=2?'none':'visible'))map.setLayoutProperty(layer.id,'visibility',route&&quality>=2?'none':'visible');map.setPaintProperty(layer.id,'text-opacity',route? .45 : 1);}
    if(layer.type==='symbol'&&layer['source-layer']==='transportation_name'&&/minor|path/.test(layer.id))map.setPaintProperty(layer.id,'text-opacity',quality? .6:1);
  }
}
