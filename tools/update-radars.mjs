// Emniyet Genel Müdürlüğü'nün (EGM) resmi EDS haritasındaki noktaları indirip data/radars-tr.json'a yazar.
// Kaynak: https://onlineislemler.egm.gov.tr/trafik/Sayfalar/EDSHarita.aspx
// GitHub Actions bu betiği haftada bir çalıştırır (.github/workflows/radars.yml).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = 'https://onlineislemler.egm.gov.tr/trafik/Sayfalar/EDSHarita.aspx';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = join(DIR, 'radars-tr.json');

const res = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0 (Yolcu radar guncelleyici)' } });
if (!res.ok) throw new Error('EGM sayfası alınamadı: ' + res.status);
const html = await res.text();

const re = /"Aciklama":\s*'([^']*)',\s*"lat":\s*'([^']*)',\s*"lng":\s*'([^']*)'/g;
const pts = [];
let m;
while ((m = re.exec(html))) {
  const lat = parseFloat(m[2]), lon = parseFloat(m[3]);
  // Türkiye sınırları dışındaki (hatalı girilmiş) koordinatları at
  if (!(lat > 35.5 && lat < 42.5 && lon > 25.5 && lon < 45)) continue;
  const desc = m[1].replace(/\s+/g, ' ').replace(/^\d+\s*\/\s*/, '').trim();
  // Aynı noktayı iki kez yazma
  if (pts.some(p => Math.abs(p[0] - lat) < 0.0002 && Math.abs(p[1] - lon) < 0.0002)) continue;
  pts.push([+lat.toFixed(5), +lon.toFixed(5), desc]);
}
if (pts.length < 500) throw new Error(`Beklenenden az nokta (${pts.length}), sayfa yapısı değişmiş olabilir`);

const data = { source: 'EGM EDS Haritası', url: SRC, updated: new Date().toISOString().slice(0, 10), count: pts.length, points: pts };
mkdirSync(DIR, { recursive: true });
// Nokta listesi değişmediyse dosyayı yeniden yazma (gereksiz commit olmasın)
if (existsSync(file)) {
  try {
    const old = JSON.parse(readFileSync(file, 'utf8'));
    if (JSON.stringify(old.points) === JSON.stringify(pts)) { console.log('Değişiklik yok', pts.length); process.exit(0); }
  } catch { }
}
writeFileSync(file, JSON.stringify(data));
console.log('Yazıldı', pts.length, 'nokta');
