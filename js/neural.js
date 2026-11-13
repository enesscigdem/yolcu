// Telefonun içinde çalışan yapay zeka sesi (Piper, açık kaynak).
// Ses modeli bir kez indirilir (~63 MB), sonra önbellekten ve internetsiz çalışır.
const ORT_JS = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.wasm.min.js';
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
const PHON_JS = 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-o91UDS6e.js';
const PHON_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/tr/tr_TR';
const CACHE = 'yolcu-voices';

export const VOICES = {
  fahrettin: { name: 'Fahrettin', desc: 'Erkek, sakin' },
  fettah: { name: 'Fettah', desc: 'Erkek, net' },
  dfki: { name: 'Deniz', desc: 'Erkek, tok' }
};
const urls = id => ({
  model: `${HF}/${id}/medium/tr_TR-${id}-medium.onnx`,
  config: `${HF}/${id}/medium/tr_TR-${id}-medium.onnx.json`
});

let ortP = null, phonP = null;
let session = null, config = null, loadedId = null, loadingP = null;
let ctx = null, current = null;
const audioCache = new Map();
let chain = Promise.resolve();

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => rej(new Error('Yüklenemedi: ' + src));
    document.head.appendChild(s);
  });
}
function ort() {
  if (!ortP) ortP = loadScript(ORT_JS).then(() => {
    const o = window.ort;
    o.env.wasm.numThreads = 1; // GitHub Pages çok iş parçacığına izin vermiyor
    o.env.wasm.wasmPaths = ORT_BASE;
    return o;
  });
  return ortP;
}
function phon() {
  if (!phonP) phonP = import(PHON_JS).then(m => m.createPiperPhonemize);
  return phonP;
}

export async function isDownloaded(id) {
  try { const c = await caches.open(CACHE); return !!(await c.match(urls(id).model)); } catch { return false; }
}

export async function remove(id) {
  try { const c = await caches.open(CACHE); await c.delete(urls(id).model); await c.delete(urls(id).config); } catch { }
  if (loadedId === id) { session = null; loadedId = null; }
}

// İndirme (ilerleme 0..1)
export async function download(id, onProgress) {
  const c = await caches.open(CACHE);
  const u = urls(id);
  if (!(await c.match(u.config))) {
    const r = await fetch(u.config);
    if (!r.ok) throw new Error('Ses ayarı indirilemedi');
    await c.put(u.config, r);
  }
  if (await c.match(u.model)) { onProgress?.(1); return; }
  const r = await fetch(u.model);
  if (!r.ok || !r.body) throw new Error('Ses modeli indirilemedi');
  const total = +(r.headers.get('Content-Length') || 63201294);
  const reader = r.body.getReader();
  const chunks = [];
  let got = 0;
  for (; ;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress?.(Math.min(0.99, got / total));
  }
  await c.put(u.model, new Response(new Blob(chunks), { headers: { 'Content-Type': 'application/octet-stream' } }));
  onProgress?.(1);
}

export async function load(id) {
  if (loadedId === id && session) return;
  if (loadingP && loadingP.id === id) return loadingP.p;
  const p = (async () => {
    const c = await caches.open(CACHE);
    const u = urls(id);
    const mr = await c.match(u.model), cr = await c.match(u.config);
    if (!mr || !cr) throw new Error('Ses indirilmemiş');
    const o = await ort();
    config = await cr.json();
    session = await o.InferenceSession.create(await mr.arrayBuffer(), { executionProviders: ['wasm'] });
    loadedId = id;
    audioCache.clear();
    phon();
  })();
  loadingP = { id, p };
  try { await p; } finally { loadingP = null; }
}

export const ready = () => !!session;
export const loadedVoice = () => (session ? loadedId : null);

async function phonemes(text) {
  const create = await phon();
  return new Promise((resolve, reject) => {
    create({
      print: d => { try { resolve(JSON.parse(d).phoneme_ids); } catch (e) { reject(e); } },
      printErr: m => reject(new Error(m)),
      locateFile: f => (f.endsWith('.wasm') ? `${PHON_BASE}.wasm` : f.endsWith('.data') ? `${PHON_BASE}.data` : f)
    }).then(mod => mod.callMain(['-l', config.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']))
      .catch(reject);
  });
}

async function synth(text) {
  if (audioCache.has(text)) return audioCache.get(text);
  const o = await ort();
  const ids = await phonemes(text);
  const inf = config.inference || {};
  const feeds = {
    input: new o.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new o.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
    scales: new o.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) * 0.96, inf.noise_w ?? 0.8]))
  };
  if (config.speaker_id_map && Object.keys(config.speaker_id_map).length) feeds.sid = new o.Tensor('int64', BigInt64Array.from([0n]));
  const out = await session.run(feeds);
  const pcm = out.output.data;
  const res = { pcm, rate: config.audio.sample_rate };
  audioCache.set(text, res);
  if (audioCache.size > 80) audioCache.delete(audioCache.keys().next().value);
  return res;
}

// Sıralı çalıştır (aynı anda tek çıkarım)
function queued(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => { });
  return p;
}

export function prefetch(text) {
  if (!session || !text || audioCache.has(text)) return;
  queued(() => synth(text)).catch(() => { });
}

// iOS: ses ancak kullanıcı dokunuşundan sonra açılabilir
export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch { }
}

export function stop() { try { current?.stop(); } catch { } current = null; }

// Konuş. Hazır değilse veya 2,5 sn'de üretemezse false döner (sistem sesi devreye girer)
export async function speak(text) {
  if (!session) return false;
  if (!ctx) unlock();
  const job = queued(() => synth(text));
  const res = await Promise.race([job, new Promise(r => setTimeout(() => r(null), 2500))]);
  if (!res) return false;
  if (ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => { }), new Promise(r => setTimeout(r, 400))]);
  stop();
  const buf = ctx.createBuffer(1, res.pcm.length, res.rate);
  buf.copyToChannel(res.pcm instanceof Float32Array ? res.pcm : Float32Array.from(res.pcm), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain(); gain.gain.value = 1.15;
  src.connect(gain); gain.connect(ctx.destination);
  src.start();
  current = src;
  return true;
}

// test ve önizleme için
export const synthesize = t => queued(() => synth(t));
