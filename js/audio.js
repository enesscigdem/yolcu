export const SOUND_MODES = { silent: 'Tamamen sessiz', alerts: 'Yalnız uyarılar', guidance: 'Yönlendirme + uyarılar' };
export function createAudio(prefs, env = globalThis) {
  let ctx = null, speech = null, generation = 0, releaseTimer = null, initialized = false;
  const session = type => { try { if (env.navigator?.audioSession) env.navigator.audioSession.type = type; } catch { } };
  const release = () => { if (!ctx && !speech) { clearTimeout(releaseTimer); session('auto'); } };
  const audio = {
    v: null,
    init() {
      if (initialized || prefs.soundMode !== 'guidance' || !env.speechSynthesis) return;
      initialized = true;
      const pick = () => { const vs = env.speechSynthesis.getVoices().filter(v => /^tr/i.test(v.lang)); this.v = vs.find(v => /enhanced|premium|yelda/i.test(v.name)) || vs[0] || null; };
      pick(); env.speechSynthesis.addEventListener?.('voiceschanged', pick);
    },
    setMode(mode) { this.stop(); prefs.soundMode = SOUND_MODES[mode] ? mode : 'silent'; this.init(); },
    say(text) {
      if (prefs.soundMode !== 'guidance' || !text || !env.speechSynthesis) return;
      this.init();
      const token = ++generation;
      if (speech) env.speechSynthesis.cancel();
      session('ambient');
      const u = new env.SpeechSynthesisUtterance(text); speech = u;
      u.lang = 'tr-TR'; u.rate = 1; if (this.v) u.voice = this.v;
      const done = () => { if (token !== generation) return; speech = null; release(); };
      u.onend = done; u.onerror = done;
      clearTimeout(releaseTimer);
      // Release even on Safari versions which omit an end event after an interruption.
      releaseTimer = setTimeout(() => { if (token === generation) { env.speechSynthesis.cancel(); done(); } }, Math.min(45000, Math.max(8000, text.length * 150)));
      try { env.speechSynthesis.speak(u); } catch { done(); }
    },
    async beep(times = 2) {
      if (prefs.soundMode === 'silent') return;
      const token = generation;
      try {
        if (ctx) return;
        session('ambient');
        const C = env.AudioContext || env.webkitAudioContext;
        if (!C) { release(); return; }
        const current = ctx = new C();
        await current.resume();
        if (token !== generation || prefs.soundMode === 'silent') { await current.close(); if (ctx === current) ctx = null; release(); return; }
        const t0 = current.currentTime + 0.02;
        for (let i = 0; i < times; i++) {
          const o = current.createOscillator(), g = current.createGain(), t = t0 + i * .22;
          o.type = 'sine'; o.frequency.setValueAtTime(1046, t); o.frequency.setValueAtTime(1318, t + .08);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .18);
          o.connect(g); g.connect(current.destination); o.start(t); o.stop(t + .2);
          if (i === times - 1) o.onended = () => { current.close().catch(() => {}); if (ctx === current) ctx = null; release(); };
        }
      } catch { if (ctx) ctx.close().catch(() => {}); ctx = null; release(); }
    },
    stop() {
      generation++;
      const active = !!speech || !!ctx;
      if (speech) env.speechSynthesis?.cancel();
      speech = null;
      if (ctx) ctx.close().catch(() => {});
      ctx = null; clearTimeout(releaseTimer);
      // Opening a silent app must not touch the system audio session at all.
      if (active) session('auto');
    }
  };
  return audio;
}
