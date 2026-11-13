// OpenFreeMap "liberty" stilini alıp Apple Haritalar benzeri renklere boyar
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const PALETTES = {
  light: {
    land: '#F3F1EC', residential: '#EEEBE4', park: '#CDE7C0', water: '#A3D3F5', sand: '#F2E8CF', ice: '#FFFFFF',
    building: '#E6E2DA', building3d: '#E3DFD6', hospital: '#F7E1E1', school: '#F0E9D8', aeroway: '#E6E2DA',
    motorway: '#FFCB5C', motorwayCase: '#E9A93A', primary: '#FFFFFF', primaryCase: '#D6D0C6',
    secondary: '#FFFFFF', secondaryCase: '#DDD8CF', minor: '#FFFFFF', minorCase: '#E2DDD5', path: '#E3DED4', rail: '#CFCAC0',
    label: '#1D1D1F', roadLabel: '#48484D', waterLabel: '#3B7DB4', poiLabel: '#55555A', halo: '#FFFFFF', boundary: '#B9B2C9',
    route: '#0A84FF', routeCase: '#0060DF', alt: '#9EC5F5', altCase: '#6E9FD8', arrow: '#FFFFFF', arrowCase: '#1C1C1E'
  },
  dark: {
    land: '#202124', residential: '#242528', park: '#1D3022', water: '#18293F', sand: '#2E2B24', ice: '#3A3A3C',
    building: '#2D2F33', building3d: '#34363B', hospital: '#36282A', school: '#2D2B25', aeroway: '#2A2B2F',
    motorway: '#A27C3A', motorwayCase: '#5E4826', primary: '#4B4D53', primaryCase: '#2B2C30',
    secondary: '#45474C', secondaryCase: '#2B2C30', minor: '#3A3C41', minorCase: '#28292D', path: '#34363A', rail: '#3D3E43',
    label: '#F2F2F7', roadLabel: '#C7C7CC', waterLabel: '#6FA3D6', poiLabel: '#AEAEB2', halo: '#1C1C1E', boundary: '#5A556A',
    route: '#3B9BFF', routeCase: '#0A5BC4', alt: '#3F5F86', altCase: '#2A4565', arrow: '#FFFFFF', arrowCase: '#000000'
  }
};

const REMOVE = new Set(['natural_earth', 'road_area_pattern', 'highway-shield-us-interstate', 'road_shield_us']);

export async function loadStyle() {
  const style = await fetch(STYLE_URL).then(r => r.json());
  style.layers = style.layers.filter(l => !REMOVE.has(l.id));
  // Türkçe etiketleri tercih et
  for (const l of style.layers) {
    if (l.type === 'symbol' && l.layout && /name/.test(JSON.stringify(l.layout['text-field'] || ''))) {
      l.layout['text-field'] = ['coalesce', ['get', 'name:tr'], ['get', 'name'], ['get', 'name:latin']];
    }
  }
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

export function applyPalette(map, P) {
  const set = (id, prop, v) => { try { map.setPaintProperty(id, prop, v); } catch { /* yok say */ } };
  for (const l of map.getStyle().layers) {
    const id = l.id, sl = l['source-layer'] || '';
    if (id.startsWith('yolcu-')) continue;
    if (l.type === 'background') { set(id, 'background-color', P.land); continue; }
    if (l.type === 'fill') {
      if (sl === 'water') set(id, 'fill-color', P.water);
      else if (sl === 'park' || /wood|grass|wetland|pitch|cemetery/.test(id)) set(id, 'fill-color', P.park);
      else if (/residential/.test(id)) set(id, 'fill-color', P.residential);
      else if (/hospital/.test(id)) set(id, 'fill-color', P.hospital);
      else if (/school/.test(id)) set(id, 'fill-color', P.school);
      else if (/sand|track/.test(id)) set(id, 'fill-color', P.sand);
      else if (/ice/.test(id)) set(id, 'fill-color', P.ice);
      else if (sl === 'building') set(id, 'fill-color', P.building);
      else if (sl === 'aeroway') set(id, 'fill-color', P.aeroway);
      continue;
    }
    if (l.type === 'fill-extrusion') { set(id, 'fill-extrusion-color', P.building3d); set(id, 'fill-extrusion-opacity', 0.75); continue; }
    if (l.type === 'line') {
      if (sl === 'waterway') set(id, 'line-color', P.water);
      else if (sl === 'park') set(id, 'line-color', P.park);
      else if (sl === 'boundary') set(id, 'line-color', P.boundary);
      else if (sl === 'aeroway') set(id, 'line-color', P.aeroway);
      else if (sl === 'transportation') {
        if (/hatching/.test(id)) { set(id, 'line-color', P.rail); continue; }
        const k = roadKind(id);
        const casing = /casing/.test(id);
        const color = k === 'rail' ? P.rail : k === 'path' ? P.path : casing ? P[k + 'Case'] : P[k];
        set(id, 'line-color', color);
      }
      continue;
    }
    if (l.type === 'symbol') {
      let c = P.label;
      if (sl === 'transportation_name') c = P.roadLabel;
      else if (sl === 'water_name' || sl === 'waterway') c = P.waterLabel;
      else if (sl === 'poi' || sl === 'aerodrome_label') c = P.poiLabel;
      if (id === 'highway-shield-non-us' || /one_way/.test(id)) continue;
      set(id, 'text-color', c);
      set(id, 'text-halo-color', P.halo);
      set(id, 'text-halo-width', 1.4);
    }
  }
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
