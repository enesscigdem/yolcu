// Türkçe yönlendirme metinleri ve dönüş okları

const ORD = ['', 'birinci', 'ikinci', 'üçüncü', 'dördüncü', 'beşinci', 'altıncı', 'yedinci', 'sekizinci'];

// Ekranda görünen kısa eylem
export function action(m) {
  switch (m.type) {
    case 1: case 2: case 3: return 'Yola çıkın';
    case 4: return 'Hedefinize vardınız';
    case 5: return 'Hedef sağda';
    case 6: return 'Hedef solda';
    case 7: case 8: return 'Düz devam edin';
    case 9: return 'Hafif sağa dönün';
    case 10: return 'Sağa dönün';
    case 11: return 'Keskin sağa dönün';
    case 12: case 13: return 'U dönüşü yapın';
    case 14: return 'Keskin sola dönün';
    case 15: return 'Sola dönün';
    case 16: return 'Hafif sola dönün';
    case 17: return 'Bağlantı yoluna girin';
    case 18: return 'Sağdaki bağlantı yoluna girin';
    case 19: return 'Soldaki bağlantı yoluna girin';
    case 20: return 'Sağdan çıkın';
    case 21: return 'Soldan çıkın';
    case 22: return 'Ayrımda düz devam edin';
    case 23: return 'Ayrımda sağdan devam edin';
    case 24: return 'Ayrımda soldan devam edin';
    case 25: return 'Yola katılın';
    case 26: return m.rbExit ? `Döner kavşakta ${m.rbExit}. çıkış` : 'Döner kavşağa girin';
    case 27: return 'Döner kavşaktan çıkın';
    case 28: return 'Feribota binin';
    case 29: return 'Feribottan inin';
    case 37: return 'Sağdaki yola katılın';
    case 38: return 'Soldaki yola katılın';
    case 39: return 'Asansörü kullanın';
    case 40: return 'Merdivenleri kullanın';
    case 41: return 'Yürüyen merdiveni kullanın';
    case 42: return 'Binaya girin';
    case 43: return 'Binadan çıkın';
    default: return 'Devam edin';
  }
}

const RIGHTISH = new Set([18, 20, 23, 37]);
const LEFTISH = new Set([19, 21, 24, 38]);
const HIGHWAYISH = new Set([17, 18, 19, 20, 21, 22, 23, 24]);

/* ---------- Türkçe ad ekleri ----------
   kind: 'dat' (-e: Caddesi'ne), 'loc' (-de: Caddesi'nde), 'abl' (-den: Caddesi'nden) */
const VOW = /[aeıioöuüâîû]/gi;
const isBack = w => { const v = (w.match(VOW) || []).pop(); return v ? /[aıouâû]/i.test(v) : false; };
const SUF = {
  dat: { y: ['ya', 'ye'], n: ['na', 'ne'], c: ['a', 'e'] },
  loc: { y: ['da', 'de'], n: ['nda', 'nde'], c: ['da', 'de'], h: ['ta', 'te'] },
  abl: { y: ['dan', 'den'], n: ['ndan', 'nden'], c: ['dan', 'den'], h: ['tan', 'ten'] }
};
export function suffix(name, kind = 'dat') {
  if (!name) return '';
  const s = SUF[kind];
  if (name === 'Ev') return { dat: 'eve', loc: 'evde', abl: 'evden' }[kind];
  if (name === 'İş') return { dat: 'işe', loc: 'işte', abl: 'işten' }[kind];
  // Yol numaraları (D300, O-30, E87): "D300 yoluna"
  if (/^[A-ZÇŞĞÜÖİ]{1,3}[- ]?\d+[A-Z]?$/.test(name)) return `${name} yolu${s.n[0]}`;
  if (/ Sokak$/i.test(name)) return name.replace(/Sokak$/i, { dat: 'Sokağa', loc: 'Sokakta', abl: 'Sokaktan' }[kind]);
  const words = name.trim().split(/\s+/);
  const last = words[words.length - 1];
  // Kısaltmalar harf harf okunur: AVM -> "a-ve-me" -> AVM'ye
  if (/^[A-ZÇŞĞÜÖİ]{2,}$/.test(last)) {
    const l = last.slice(-1);
    const v = /[AEIİOÖUÜ]/.test(l) ? l.toLocaleLowerCase('tr') : 'e';
    const bb = /[aıou]/.test(v) ? 0 : 1;
    return `${name}'${s.y[bb]}`;
  }
  const b = isBack(last) ? 0 : 1;
  const endsVowel = /[aeıioöuü]$/i.test(last);
  // Çok kelimeli ve ı/i/u/ü ile biten adlar tamlamadır: Caddesi'ne, Parkı'na, Üniversitesi'ne
  if (endsVowel && (words.length > 1 && /[ıiuü]$/i.test(last))) return `${name}'${s.n[b]}`;
  if (endsVowel) return `${name}'${s.y[b]}`;
  if (s.h && /[fsthçşkp]$/i.test(last)) return `${name}'${s.h[b]}`;
  return `${name}'${s.c[b]}`;
}
const dative = name => (name ? suffix(name, 'dat') : null);

const lower = s => s.charAt(0).toLocaleLowerCase('tr') + s.slice(1);

function towardText(m) {
  const t = (m.toward.length ? m.toward : m.branch).slice(0, 2);
  if (!t.length) return '';
  return t.length === 2 ? `${t[0]} ve ${t[1]} yönüne` : `${t[0]} yönüne`;
}

export function distSpeech(d) {
  if (d >= 950) {
    const km = Math.round(d / 100) / 10;
    const s = Number.isInteger(km) ? String(km) : km.toFixed(1).replace('.', ' virgül ');
    return `${s} kilometre sonra`;
  }
  const r = d > 200 ? Math.round(d / 50) * 50 : Math.max(10, Math.round(d / 10) * 10);
  return `${r} metre sonra`;
}

// Bir dönüşün sesli cümlesi (zaman/mesafe öneki hariç)
function phrase(m, short = false) {
  const t = m.type;
  if (t === 26) return m.rbExit ? `döner kavşakta ${ORD[m.rbExit] || m.rbExit + '.'} çıkıştan çıkın` : 'döner kavşağa girin';
  if (t >= 4 && t <= 6) return lower(action(m));
  const base = lower(action(m));
  if (short) return base;
  if (HIGHWAYISH.has(t)) {
    const tw = towardText(m);
    if (tw) return `${base}, ${tw}`;
    const d = dative(m.street);
    return d ? `${base}, ${d}` : base;
  }
  if ([9, 10, 11, 14, 15, 16, 25, 37, 38].includes(t)) {
    const d = dative(m.street);
    if (d) return `${base} ve ${d} girin`;
  }
  return base;
}

const cap = s => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);

// stage: 'far' | 'near' | 'now'
export function speech(m, stage, dist, then, gap) {
  let s;
  if (stage === 'now') s = `Şimdi ${phrase(m, true)}`;
  else s = `${distSpeech(dist)} ${phrase(m)}`;
  if (stage === 'far' && RIGHTISH.has(m.type)) s = `Sağ şeride geçin. ${cap(s)}`;
  if (stage === 'far' && LEFTISH.has(m.type)) s = `Sol şeride geçin. ${cap(s)}`;
  if (then && gap < 160 && !(then.type >= 4 && then.type <= 6)) s += `. Ardından hemen ${phrase(then, true)}`;
  return cap(s) + '.';
}

export function continueSpeech(street, dist) {
  const km = Math.round(dist / 1000);
  if (km < 2) return null;
  return street ? `${street} üzerinde ${km} kilometre düz devam edin.` : `${km} kilometre düz devam edin.`;
}

/* ---------------- Biçimlendirme ---------------- */

export function fmtDist(d) {
  if (d >= 10000) return `${Math.round(d / 1000)} km`;
  if (d >= 950) return `${(Math.round(d / 100) / 10).toFixed(1).replace('.', ',')} km`;
  if (d > 200) return `${Math.round(d / 50) * 50} m`;
  return `${Math.max(0, Math.round(d / 10) * 10)} m`;
}

export function fmtDur(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60), mm = min % 60;
  return mm ? `${h} sa ${mm} dk` : `${h} sa`;
}

export function fmtClock(date) {
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/* ---------------- Dönüş okları (48x48) ---------------- */

const head = (x, y, ang) => {
  // ang: derece, ok başının baktığı yön (0 = yukarı)
  const r = a => (a * Math.PI) / 180;
  const L = 11;
  const p1 = [x + L * Math.sin(r(ang + 140)), y - L * Math.cos(r(ang + 140))];
  const p2 = [x + L * Math.sin(r(ang - 140)), y - L * Math.cos(r(ang - 140))];
  return `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${x} ${y} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
};

const RIGHT_SHAPES = {
  straight: { d: 'M24 44 V8', h: head(24, 7, 0) },
  slight: { d: 'M18 44 V28 Q18 22 22.5 17.5 L33 7', h: head(34, 6, 45) },
  turn: { d: 'M15 44 V27 Q15 18 24 18 H39', h: head(40, 18, 90) },
  sharp: { d: 'M15 44 V14 Q15 6 22 11 L36 30', h: head(37, 31, 145) },
  uturn: { d: 'M32 44 V19 Q32 9 23.5 9 Q15 9 15 19 V33', h: head(15, 34, 180), mirror: true },
  ramp: { d: 'M17 44 V30 Q17 22 24 18 L34 10', h: head(35, 9, 52), ghost: 'M17 30 V6' },
  fork: { d: 'M24 44 V30 L34 12', h: head(35, 10, 30), ghost: 'M24 30 L14 10' },
  merge: { d: 'M14 44 Q14 30 24 22 V7', h: head(24, 6, 0), ghost: 'M34 44 Q34 30 24 22' }
};

function shapeFor(t) {
  switch (t) {
    case 9: case 16: return ['slight', t === 16];
    case 10: case 15: return ['turn', t === 15];
    case 11: case 14: return ['sharp', t === 14];
    case 12: return ['uturn', true];
    case 13: return ['uturn', false];
    case 17: case 22: return ['straight', false];
    case 18: case 20: return ['ramp', false];
    case 19: case 21: return ['ramp', true];
    case 23: return ['fork', false];
    case 24: return ['fork', true];
    case 25: return ['merge', false];
    case 37: return ['merge', true];
    case 38: return ['merge', false];
    default: return ['straight', false];
  }
}

export function arrowSvg(m) {
  const t = m.type;
  const sw = 'stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  if (t >= 4 && t <= 6) {
    return `<svg viewBox="0 0 48 48"><path fill="currentColor" d="M24 45s-13-13.3-13-23a13 13 0 0 1 26 0c0 9.7-13 23-13 23z"/><circle cx="24" cy="21.5" r="5" fill="var(--nav-bg, #1c1c1e)"/></svg>`;
  }
  if (t === 26 || t === 27) {
    const n = Math.min(m.rbExit || 1, 3);
    // Sağdan trafikte göbek saat yönünün tersine dönülür: 1. çıkış sağ, 2. düz, 3. sol
    const ang = (90 - (n - 1) * 90 + 360) % 360;
    const span = (180 - ang + 360) % 360;
    const a = (ang * Math.PI) / 180;
    const cx = 24, cy = 22, r = 9;
    const ex = cx + r * Math.sin(a), ey = cy - r * Math.cos(a);
    const ox = cx + (r + 10) * Math.sin(a), oy = cy - (r + 10) * Math.cos(a);
    return `<svg viewBox="0 0 48 48"><circle cx="${cx}" cy="${cy}" r="${r}" ${sw} opacity=".35"/>`
      + `<path ${sw} d="M24 46 V${cy + r} A${r} ${r} 0 ${span > 180 ? 1 : 0} 0 ${ex.toFixed(1)} ${ey.toFixed(1)} L${ox.toFixed(1)} ${oy.toFixed(1)}"/>`
      + `<path ${sw} d="${head(+ox.toFixed(1), +oy.toFixed(1), ang)}"/></svg>`;
  }
  const [k, left] = shapeFor(t);
  const s = RIGHT_SHAPES[k];
  const g = `${s.ghost ? `<path ${sw} opacity=".35" d="${s.ghost}"/>` : ''}<path ${sw} d="${s.d}"/><path ${sw} d="${s.h}"/>`;
  return `<svg viewBox="0 0 48 48">${left ? `<g transform="translate(48 0) scale(-1 1)">${g}</g>` : g}</svg>`;
}

/* ---------------- Güzergah özeti ----------------
   Rotayı "hangi yoldan gidiyorum" sorusunun cevabına çevirir:
   [ara sokaklar 900 m] → [Yeşildere Caddesi 7 km] → [D300 5 km] → ... */
const RANK = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, unclassified: 1, residential: 1, service_other: 0 };

export function story(route) {
  const E = route.stats?.edges;
  if (!E || !E.length) return null;
  const cum = route.cum, n = cum.length - 1;
  const at = i => cum[Math.min(Math.max(i, 0), n)];
  // Bir yolun birden çok adı olabilir: "Yeşildere Caddesi" ve numarası "D300" aynı yoldur
  const isRef = n => /^[A-ZÇŞĞÜÖİ]{1,3}[- ]?\d+[A-Z]?$/.test(n);
  const share = (a, b) => a.some(x => b.includes(x));
  // 1) adları ortak olan ardışık parçaları birleştir
  const raw = [];
  for (const e of E) {
    const m = at(e.e) - at(e.b);
    const names = (e.names && e.names.length ? e.names : (e.name ? [e.name] : []));
    const last = raw[raw.length - 1];
    if (last && ((names.length && share(last.allNames, names)) || (!names.length && !last.allNames.length))) {
      last.m += m; last.e = e.e;
      for (const nm of names) { if (!last.allNames.includes(nm)) last.allNames.push(nm); last.len[nm] = (last.len[nm] || 0) + m; }
      if ((RANK[e.cls] || 0) > (RANK[last.cls] || 0)) last.cls = e.cls;
    } else {
      const len = {}; for (const nm of names) len[nm] = m;
      raw.push({ allNames: [...names], len, m, b: e.b, e: e.e, cls: e.cls });
    }
  }
  // Görünen ad: en uzun süren gerçek ad (numara değil); yanına numara: "Yeşildere Caddesi (D300)"
  for (const s of raw) {
    const real = s.allNames.filter(n => !isRef(n)).sort((a, b) => s.len[b] - s.len[a]);
    const refs = s.allNames.filter(isRef).sort((a, b) => s.len[b] - s.len[a]);
    s.name = real[0] || refs[0] || '';
    s.ref = real[0] && refs[0] ? refs[0] : '';
  }
  // 2) önemli yollar: adı olan ve yeterince uzun (ana yollarda eşik daha düşük)
  const major = s => s.name && (s.m >= 500 || ((RANK[s.cls] || 0) >= 4 && s.m >= 250));
  const out = [];
  let local = null;
  for (const s of raw) {
    if (major(s)) {
      const prev = out[out.length - 1];
      // araya kısa bir bağlantı girdiyse aynı yolu tek parça say
      if (prev && prev.kind === 'road' && (prev.name === s.name || share(prev.allNames, s.allNames)) && (!local || local.m < 300)) {
        prev.m += s.m + (local ? local.m : 0); prev.e = s.e; local = null;
        for (const nm of s.allNames) if (!prev.allNames.includes(nm)) prev.allNames.push(nm);
        if (!prev.ref && s.ref) prev.ref = s.ref;
        continue;
      }
      if (local) {
        // çok kısa bağlantıları bir önceki yola kat
        if (local.m < 150 && out.length && out[out.length - 1].kind === 'road') { out[out.length - 1].m += local.m; out[out.length - 1].e = local.e; }
        else out.push(local);
        local = null;
      }
      out.push({ kind: 'road', name: s.name, ref: s.ref, allNames: [...s.allNames], m: s.m, cls: s.cls, b: s.b, e: s.e });
    } else {
      if (!local) local = { kind: 'local', m: 0, b: s.b, e: s.e };
      local.m += s.m; local.e = s.e;
    }
  }
  if (local) out.push(local);
  // 3) yön tabelalarını (Buca, Bornova) yolun başına iliştir
  for (const s of out) {
    if (s.kind !== 'road') continue;
    const m = route.maneuvers.find(x => x.begin >= s.b - 3 && x.begin <= s.b + 3 && (x.toward.length || x.branch.length));
    if (m) s.toward = (m.toward.length ? m.toward : m.branch).slice(0, 2);
  }
  return out.filter(s => s.m >= 30);
}

function spokenDist(m) {
  if (m >= 950) { const km = Math.round(m / 1000); return `${km} kilometre`; }
  return `${Math.max(50, Math.round(m / 50) * 50)} metre`;
}

// "Önce ... Yeşildere Caddesi'ne çıkıyorsun. Yeşildere Caddesi'nde 7 kilometre gidiyorsun. Sonra D300 yoluna geçip..."
export function storySpeech(st, destName) {
  if (!st || !st.length) return '';
  const roads = st.filter(s => s.kind === 'road');
  if (!roads.length) return `Ara sokaklardan ${spokenDist(st.reduce((a, s) => a + s.m, 0))} gidip ${suffix(destName, 'dat')} varıyorsun.`;
  const parts = [];
  st.forEach((s, i) => {
    const next = st[i + 1];
    if (s.kind === 'local') {
      if (i === 0 && next) parts.push(`Önce ${spokenDist(s.m)} ara sokaklardan geçip ${suffix(next.name, 'dat')} çıkıyorsun.`);
      else if (!next) parts.push(`Son ${spokenDist(s.m)} ara sokaklardan ${suffix(destName, 'dat')} varıyorsun.`);
      return;
    }
    const tw = s.toward?.length ? `, ${s.toward.join(' ve ')} yönüne` : '';
    if (s === roads[0]) parts.push(`${cap(suffix(s.name, 'loc'))} ${spokenDist(s.m)} gidiyorsun${tw}.`);
    else parts.push(`Sonra ${suffix(s.name, 'dat')} geçip ${spokenDist(s.m)} devam ediyorsun${tw}.`);
    if (!next) parts.push(`Oradan ${suffix(destName, 'dat')} varıyorsun.`);
  });
  return parts.join(' ');
}

// Navigasyon başında kısa özet: "Yeşildere Caddesi ve D300 üzerinden gidiyoruz."
export function storyShort(st) {
  const roads = (st || []).filter(s => s.kind === 'road').sort((a, b) => b.m - a.m).slice(0, 2);
  if (!roads.length) return '';
  const ordered = st.filter(s => roads.includes(s)).map(s => s.name);
  return `${ordered.join(' ve ')} üzerinden gidiyoruz.`;
}
