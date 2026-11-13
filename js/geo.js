// Küçük coğrafya yardımcıları. Koordinatlar [lon, lat] dizisi olarak tutulur.
const R = 6371008.8;
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

export function dist(lon1, lat1, lon2, lat2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearing(lon1, lat1, lon2, lat2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// Valhalla polyline6 çözücü
export function decode6(str) {
  const out = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (k === 0) lat += d; else lon += d;
    }
    out.push([lon / 1e6, lat / 1e6]);
  }
  return out;
}

export function cumulative(coords) {
  const cum = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) {
    cum[i] = cum[i - 1] + dist(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return cum;
}

// Bir noktanın [a,b] doğru parçasına izdüşümü (metre cinsinden yerel düzlem)
export function projectOnSegment(lon, lat, a, b) {
  const kx = Math.cos(rad(lat)) * 111320, ky = 110540;
  const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky;
  const bx = (b[0] - lon) * kx, by = (b[1] - lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx, py = ay + t * dy;
  return { d: Math.hypot(px, py), t, lon: a[0] + t * (b[0] - a[0]), lat: a[1] + t * (b[1] - a[1]) };
}

// Rota üzerinde d metredeki nokta
export function pointAt(coords, cum, d) {
  if (d <= 0) return { lon: coords[0][0], lat: coords[0][1], i: 0 };
  const n = coords.length;
  if (d >= cum[n - 1]) return { lon: coords[n - 1][0], lat: coords[n - 1][1], i: n - 2 };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (d - cum[lo]) / seg : 0;
  return { lon: coords[lo][0] + t * (coords[hi][0] - coords[lo][0]), lat: coords[lo][1] + t * (coords[hi][1] - coords[lo][1]), i: lo };
}

// d1..d2 metre arasını kesip yeni koordinat dizisi döndürür
export function sliceAlong(coords, cum, d1, d2) {
  const a = pointAt(coords, cum, d1), b = pointAt(coords, cum, d2);
  const out = [[a.lon, a.lat]];
  for (let i = a.i + 1; i <= b.i; i++) out.push(coords[i]);
  out.push([b.lon, b.lat]);
  return out;
}

// İki rotanın neredeyse aynı olup olmadığı
export function sameRoute(A, B) {
  if (Math.abs(A.lengthM - B.lengthM) / Math.max(A.lengthM, 1) > 0.04) return false;
  const samples = 24;
  let close = 0;
  for (let s = 1; s < samples; s++) {
    const p = pointAt(A.coords, A.cum, A.lengthM * s / samples);
    let best = Infinity;
    for (let i = 0; i < B.coords.length - 1; i++) {
      const r = projectOnSegment(p.lon, p.lat, B.coords[i], B.coords[i + 1]);
      if (r.d < best) best = r.d;
      if (best < 25) break;
    }
    if (best < 25) close++;
  }
  return close / (samples - 1) > 0.9;
}

export function compass(b) {
  const names = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu', 'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı'];
  return names[Math.round(((b % 360) + 360) % 360 / 45) % 8];
}
