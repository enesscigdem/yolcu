// Bağımlılıksız PNG simge üretici: mavi gradyan üzerinde beyaz yön oku
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const inPoly = (x, y, P) => { let o = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o; } return o; };
// ok (normalize 0..1): hafif sağa eğik navigasyon oku
const rot = (p, a) => { const c = Math.cos(a), s = Math.sin(a); const x = p[0] - .5, y = p[1] - .52; return [.5 + x * c - y * s, .52 + x * s + y * c]; };
const ARROW = [[.5, .17], [.745, .8], [.5, .665], [.255, .8]].map(p => rot(p, 0.42));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function render(size, maskable) {
  const px = Buffer.alloc(size * size * 4), SS = 4;
  const top = [64, 166, 255], bot = [0, 92, 230];
  const scale = maskable ? 0.78 : 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cov = 0, sh = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = ((x + (sx + .5) / SS) / size - .5) / scale + .5, v = ((y + (sy + .5) / SS) / size - .5) / scale + .5;
      if (inPoly(u, v, ARROW)) cov++;
      if (inPoly(u - .012, v - .03, ARROW)) sh++;
    }
    cov /= SS * SS; sh /= SS * SS;
    const t = y / size;
    let c = mix(top, bot, t);
    // hafif cam parlaması
    const g = Math.max(0, 1 - Math.hypot(x / size - .3, y / size - .1) * 1.6) * 0.18;
    c = mix(c, [255, 255, 255], g);
    c = mix(c, [0, 40, 120], sh * 0.28 * (1 - cov));
    c = mix(c, [255, 255, 255], cov);
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return png(size, px);
}
for (const s of [180, 192, 512]) writeFileSync(`icons/icon-${s}.png`, render(s, false));
writeFileSync('icons/maskable-512.png', render(512, true));
console.log('ok');
