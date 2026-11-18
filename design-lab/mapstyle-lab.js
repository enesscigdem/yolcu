// Tasarım laboratuvarı harita stili. OpenFreeMap "liberty" stilini her tasarım yönü
// ve gündüz/gece için yeniden kurar: yol hiyerarşisi, bina tonları, etiket seyreltme.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
let base = null;
export async function baseStyle() { return base ||= await fetch(STYLE_URL).then(r => r.json()); }

// Her yön için palet. Yol, bina ve etiket kontrastı burada ayarlanır.
export const PAL = {
  a: {
    light: { land: '#F0ECE5', resi: '#ECE7DF', park: '#D9E0C8', wood: '#CCD7BA', water: '#BFD3D9', sand: '#EEE6D2',
      b: ['#E4DED4', '#DFD8CC', '#E8E2D8'], bTall: '#D2CABD', bFlat: '#E2DCD2', bOp: .96,
      mw: '#F6E4BE', mwC: '#D8BC86', pri: '#FFFFFF', priC: '#D3CBBE', sec: '#FFFFFF', secC: '#DAD3C8', min: '#FFFFFF', minC: '#E2DCD2', path: '#E6E0D6', rail: '#D4CEC4',
      label: '#2F2F31', road: '#56565B', place: '#77777D', water_l: '#5B86A6', halo: '#FFFFFF', sky: '#DCE4E2', fog: '#F2EFEA', light: .38 },
    dark: { land: '#1A1C1E', resi: '#1D1F21', park: '#1D2922', wood: '#1A261E', water: '#13262B', sand: '#2A2925',
      b: ['#2D3034', '#2A2D31', '#313438'], bTall: '#3A3E43', bFlat: '#26292C', bOp: .9,
      mw: '#6A604F', mwC: '#2C2822', pri: '#5A5D62', priC: '#222427', sec: '#505358', secC: '#202225', min: '#46494E', minC: '#1D1F21', path: '#2E3034', rail: '#34363A',
      label: '#DCDCDE', road: '#A9A9AE', place: '#8E8E93', water_l: '#6F95B3', halo: '#151618', sky: '#131518', fog: '#1A1B1E', light: .32 }
  },
  b: {
    light: { land: '#F3F1EC', resi: '#EFEDE7', park: '#D3E2C4', wood: '#C3D8B3', water: '#B6D4E3', sand: '#F0E9D6',
      b: ['#FBFAF7', '#F6F4EF', '#FDFCFA'], bTall: '#E9E5DD', bFlat: '#E6E2DA', bOp: .98,
      mw: '#F9D990', mwC: '#E0B65F', pri: '#FFFFFF', priC: '#D9D4CB', sec: '#FFFFFF', secC: '#DFDAD1', min: '#FFFFFF', minC: '#E6E2DA', path: '#E9E5DD', rail: '#D7D2C9',
      label: '#1F2023', road: '#4F5055', place: '#808086', water_l: '#4C86B0', halo: '#FFFFFF', sky: '#D6E6EF', fog: '#F3F2EE', light: .45 },
    dark: { land: '#1A1C20', resi: '#1D2024', park: '#1A2A22', wood: '#18261F', water: '#11283A', sand: '#29282A',
      b: ['#2E3238', '#2B2F35', '#32363C'], bTall: '#3B4047', bFlat: '#272A2F', bOp: .92,
      mw: '#6B5A3A', mwC: '#2E2719', pri: '#4D5158', priC: '#25272C', sec: '#464A51', secC: '#222429', min: '#3B3F45', minC: '#1F2125', path: '#2C2F34', rail: '#33363B',
      label: '#E4E4E7', road: '#ADADB3', place: '#8E8E95', water_l: '#6E9CC2', halo: '#141619', sky: '#12151A', fog: '#191B1F', light: .3 }
  },
  c: {
    light: { land: '#EEEBE4', resi: '#EAE6DE', park: '#D3DCC1', wood: '#C6D2B2', water: '#B9CFD8', sand: '#ECE4CE',
      b: ['#DEDAD2', '#DAD5CC', '#E2DED6'], bTall: '#CFC9BE', bFlat: '#DCD7CE', bOp: .82,
      mw: '#F2D79F', mwC: '#C9A15A', pri: '#FFFFFF', priC: '#BDB5A8', sec: '#FFFFFF', secC: '#CCC5B9', min: '#FFFFFF', minC: '#D9D3C9', path: '#E1DCD3', rail: '#CDC7BC',
      label: '#1C1C1E', road: '#3E3E43', place: '#6E6E73', water_l: '#4C7FA3', halo: '#FFFFFF', sky: '#DDE3E2', fog: '#EFEDE8', light: .35 },
    dark: { land: '#141516', resi: '#17181A', park: '#16211A', wood: '#142019', water: '#0F2026', sand: '#232220',
      b: ['#25272A', '#232528', '#282A2E'], bTall: '#2E3134', bFlat: '#202225', bOp: .72,
      mw: '#7A6A4C', mwC: '#2A241A', pri: '#5D6167', priC: '#1D1E21', sec: '#52565C', secC: '#1B1C1F', min: '#45484D', minC: '#1A1B1D', path: '#2C2E31', rail: '#2E3033',
      label: '#F2F2F4', road: '#C4C4C9', place: '#8F8F96', water_l: '#6C93AE', halo: '#0E0F10', sky: '#0F1012', fog: '#141516', light: .28 }
  }
};

const kindOf = id => /rail/.test(id) ? 'rail' : /path|pedestrian/.test(id) ? 'path' : /motorway_link|_link/.test(id) ? 'sec' : /motorway/.test(id) ? 'mw' : /trunk|primary/.test(id) ? 'pri' : /secondary|tertiary/.test(id) ? 'sec' : 'min';
// Yol genişlikleri: ana yollar belirgin, ara sokaklar ince ama okunur.
const W = {
  mw:  [[8, .8], [12, 2.4], [14, 5], [16, 11], [18, 30]],
  pri: [[9, .5], [12, 1.6], [14, 4.2], [16, 9.5], [18, 26]],
  sec: [[11, .4], [13, 1.4], [14, 2.8], [16, 7], [18, 19]],
  min: [[13, .3], [14, 1.1], [15, 2.2], [16, 4.2], [18, 13]],
  path: [[15, .5], [18, 2.2]], rail: [[12, .6], [18, 2]]
};
const widthExpr = (k, extra = 0) => ['interpolate', ['exponential', 1.5], ['zoom'], ...W[k].flatMap(([z, w]) => [z, w + (extra && z >= 13 ? extra * (z >= 16 ? 1.6 : 1) : extra * .4)])];

// opts: { dir, theme, sat, mode: 'home'|'routes'|'drive' }
export function buildStyle(src, opts) {
  const P = PAL[opts.dir][opts.theme];
  const s = structuredClone(src);
  const drive = opts.mode === 'drive';
  s.layers = s.layers.filter(l => !['natural_earth', 'road_area_pattern', 'highway-shield-us-interstate', 'road_shield_us', 'park_outline', 'landuse_track', 'poi_r20', 'poi_r7', 'poi_transit', 'label_state', 'label_country_1', 'label_country_2', 'label_country_3'].includes(l.id));
  for (const l of s.layers) {
    const id = l.id, sl = l['source-layer'] || '';
    const p = l.paint ||= {}, lay = l.layout ||= {};
    if (l.type === 'background') p['background-color'] = P.land;
    else if (l.type === 'fill') {
      if (sl === 'water') p['fill-color'] = P.water;
      else if (/wood|wetland/.test(id)) p['fill-color'] = P.wood;
      else if (sl === 'park' || /grass|pitch|cemetery/.test(id)) p['fill-color'] = P.park;
      else if (/residential/.test(id)) { p['fill-color'] = P.resi; p['fill-opacity'] = 1; }
      else if (/hospital|school/.test(id)) p['fill-color'] = P.resi;
      else if (/sand/.test(id)) p['fill-color'] = P.sand;
      else if (sl === 'building') { p['fill-color'] = P.bFlat; p['fill-outline-color'] = P.bFlat; p['fill-opacity'] = ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1]; }
      else if (sl === 'aeroway') p['fill-color'] = P.resi;
    } else if (l.type === 'fill-extrusion') {
      const h = ['coalesce', ['get', 'render_height'], 0];
      const tone = ['match', ['%', ['round', h], 3], 0, P.b[0], 1, P.b[1], P.b[2]];
      p['fill-extrusion-color'] = ['interpolate', ['linear'], h, 0, tone, 18, tone, 60, P.bTall];
      p['fill-extrusion-opacity'] = P.bOp * (drive && opts.dir === 'c' ? .9 : 1);
      p['fill-extrusion-vertical-gradient'] = true;
      // Sürüşte çok yüksek binalar yolu kapatmasın: yükseklik hafifçe sınırlanır.
      const hh = drive ? ['min', 42, ['max', 0, ['to-number', ['get', 'render_height'], 0]]] : ['max', 0, ['to-number', ['get', 'render_height'], 0]];
      p['fill-extrusion-height'] = ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, hh];
      p['fill-extrusion-base'] = ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['coalesce', ['get', 'render_min_height'], 0]];
      l.minzoom = 14;
      if (opts.flat) lay.visibility = 'none';
    } else if (l.type === 'line') {
      if (sl === 'waterway') p['line-color'] = P.water;
      else if (sl === 'boundary') { p['line-color'] = P.place; p['line-opacity'] = .25; }
      else if (sl === 'aeroway') p['line-color'] = P.resi;
      else if (sl === 'transportation') {
        if (/hatching/.test(id)) { p['line-color'] = P.rail; continue; }
        const k = kindOf(id), casing = /casing/.test(id);
        if (k === 'rail' || k === 'path') { p['line-color'] = P[k]; p['line-width'] = widthExpr(k); if (k === 'path') { l.minzoom = 15.5; } continue; }
        p['line-color'] = casing ? P[k + 'C'] : P[k];
        p['line-width'] = widthExpr(k, casing ? 1.6 : 0);
        if (casing) p['line-gap-width'] = 0;
        // Uyduda yalnız ana yollar ince çizgi olarak kalsın
        if (opts.sat) p['line-opacity'] = casing || k === 'min' ? 0 : .35;
        if (k === 'min' && drive) p['line-opacity'] = 1;
      }
    } else if (l.type === 'symbol') {
      const tf = JSON.stringify(lay['text-field'] || '');
      if (/name/.test(tf)) lay['text-field'] = ['coalesce', ['get', 'name:tr'], ['get', 'name'], ['get', 'name:latin']];
      p['text-halo-color'] = opts.sat ? 'rgba(0,0,0,.65)' : P.halo; p['text-halo-width'] = 1.5; p['text-halo-blur'] = .3;
      if (sl === 'place') {
        lay['text-font'] = ['Noto Sans Bold']; p['text-color'] = opts.sat ? '#fff' : (id === 'label_other' || id === 'label_village' ? P.place : P.label);
        if (id === 'label_other' || id === 'label_village') { lay['text-transform'] = 'none'; lay['text-size'] = ['interpolate', ['linear'], ['zoom'], 11, 11, 15, 13]; l.minzoom = 12.5; }
        if (drive) lay.visibility = 'none';
      } else if (sl === 'transportation_name') {
        p['text-color'] = opts.sat ? '#fff' : P.road;
        if (id === 'highway-shield-non-us') { if (drive) l.minzoom = 11; continue; }
        lay['text-font'] = [opts.dir === 'c' ? 'Noto Sans Bold' : 'Noto Sans Regular'];
        lay['text-padding'] = 12; lay['symbol-spacing'] = 320;
        const big = opts.dir === 'c' ? 1.15 : 1;
        if (id === 'highway-name-major') { lay['text-size'] = ['interpolate', ['linear'], ['zoom'], 13, 10.5 * big, 16, 12.5 * big, 18, 15 * big]; l.minzoom = 13.2; }
        else if (id === 'highway-name-minor') { lay['text-size'] = ['interpolate', ['linear'], ['zoom'], 15, 10 * big, 18, 13 * big]; l.minzoom = drive ? 15.6 : 15.3; }
        else if (id === 'highway-name-path') { l.minzoom = 17; }
      } else if (sl === 'water_name' || sl === 'waterway') { p['text-color'] = P.water_l; if (drive) lay.visibility = 'none'; }
      else if (sl === 'poi') { // POI: yalnız eczane, yakıt, hastane, otopark — ve yalnız yakın zoomda metin
        l.filter = ['all', ['match', ['get', 'class'], ['pharmacy', 'fuel', 'hospital', 'parking'], true, false], ['has', 'name']];
        l.minzoom = 16.4; lay['text-size'] = 10.5; lay['icon-size'] = .8; p['text-color'] = P.place; lay['text-font'] = ['Noto Sans Regular'];
        if (drive) lay.visibility = 'none';
      } else if (id === 'airport') { p['text-color'] = P.place; }
      else if (/one_way/.test(id)) { p['icon-opacity'] = drive ? 0 : .5; }
    }
  }
  // Uydu katmanı
  s.sources.sat = { type: 'raster', tiles: [SAT_URL], tileSize: 256, maxzoom: 19, attribution: 'Uydu © Esri, Maxar' };
  const firstLine = s.layers.findIndex(l => l.id.startsWith('tunnel_'));
  s.layers.splice(firstLine, 0, { id: 'lab-sat', type: 'raster', source: 'sat', layout: { visibility: opts.sat ? 'visible' : 'none' }, paint: { 'raster-fade-duration': 120, 'raster-saturation': -.05 } });
  if (opts.sat) for (const l of s.layers) if (l.type === 'fill' || l.type === 'fill-extrusion') (l.layout ||= {}).visibility = 'none';
  s.light = { anchor: 'map', color: '#fff8ee', intensity: P.light, position: [1.15, 210, 38] };
  s.sky = { 'sky-color': opts.sat ? '#9CC0E0' : P.sky, 'horizon-color': P.fog, 'fog-color': P.fog, 'sky-horizon-blend': .6, 'horizon-fog-blend': .8, 'fog-ground-blend': .85, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 12, .6, 17, .2] };
  return s;
}
