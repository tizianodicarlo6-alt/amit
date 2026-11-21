// Effetti voce per il provino: livello automatico, pulizia, EQ, compressore, riverbero e delay a tempo.
// Funziona sia in tempo reale (AudioContext) sia nell'export (OfflineAudioContext).

export const FX_PRESETS = {
  pulita: {
    label: 'Pulita',
    hint: 'Voce naturale, solo livello e pulizia dei bassi',
    hp: 80,
    eq: [],
    comp: null,
    reverb: null,
    delay: null,
  },
  provino: {
    label: 'Provino',
    hint: 'Compressa, presente, un filo di riverbero',
    hp: 100,
    eq: [
      { type: 'peaking', f: 300, q: 1, g: -2.5 },
      { type: 'peaking', f: 3500, q: 0.9, g: 3 },
      { type: 'highshelf', f: 10000, g: 2 },
    ],
    comp: { threshold: -22, ratio: 3.5, attack: 0.006, release: 0.18, makeup: 1.6 },
    reverb: { wet: 0.14, seconds: 1.4 },
    delay: { wet: 0.06, beats: 0.5, feedback: 0.2 },
  },
  trap: {
    label: 'Trap',
    hint: 'Molto compressa e brillante, delay a tempo',
    hp: 120,
    eq: [
      { type: 'peaking', f: 250, q: 1, g: -3 },
      { type: 'peaking', f: 4500, q: 0.8, g: 4 },
      { type: 'highshelf', f: 11000, g: 3 },
    ],
    comp: { threshold: -28, ratio: 6, attack: 0.003, release: 0.12, makeup: 2.2 },
    reverb: { wet: 0.12, seconds: 1.0 },
    delay: { wet: 0.13, beats: 0.5, feedback: 0.3 },
  },
  spazio: {
    label: 'Spazio',
    hint: 'Riverbero ampio e delay lungo, per ritornelli e melodie',
    hp: 100,
    eq: [
      { type: 'peaking', f: 300, q: 1, g: -2 },
      { type: 'peaking', f: 3000, q: 0.9, g: 2.5 },
      { type: 'highshelf', f: 10000, g: 2.5 },
    ],
    comp: { threshold: -20, ratio: 3, attack: 0.008, release: 0.2, makeup: 1.5 },
    reverb: { wet: 0.3, seconds: 2.6 },
    delay: { wet: 0.12, beats: 0.75, feedback: 0.35 },
  },
};

export const FX_ORDER = ['pulita', 'provino', 'trap', 'spazio'];

/** Volume medio (RMS) delle parti "attive" di un audio, ignorando i silenzi. */
export function activeRms(buffer) {
  const d = buffer.getChannelData(0);
  let sum = 0;
  let n = 0;
  // RMS solo sulle parti "cantate" (ignoro i silenzi)
  const block = 1024;
  for (let i = 0; i < d.length; i += block) {
    let s = 0;
    const end = Math.min(d.length, i + block);
    for (let j = i; j < end; j++) s += d[j] * d[j];
    const rms = Math.sqrt(s / (end - i));
    if (rms > 0.01) {
      sum += rms * rms;
      n++;
    }
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/** Guadagno che porta la voce al volume `target` (RMS), con limiti di sicurezza. */
export function levelGainFor(buffer, target = 0.1) {
  const rms = activeRms(buffer);
  if (!rms) return 1;
  return Math.max(0.5, Math.min(12, target / rms));
}

export const dbToGain = (db) => Math.pow(10, db / 20);

/** Il beat "fa spazio" alla voce: piccolo taglio sulle frequenze della voce. */
export function buildBeatCarve(ctx) {
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 2800;
  mid.Q.value = 0.9;
  mid.gain.value = -3;
  const lowmid = ctx.createBiquadFilter();
  lowmid.type = 'peaking';
  lowmid.frequency.value = 450;
  lowmid.Q.value = 1;
  lowmid.gain.value = -1.5;
  mid.connect(lowmid);
  return { input: mid, output: lowmid };
}

const irCache = new WeakMap();
function impulse(ctx, seconds) {
  let byLen = irCache.get(ctx);
  if (!byLen) irCache.set(ctx, (byLen = new Map()));
  if (byLen.has(seconds)) return byLen.get(seconds);
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.015);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let last = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      const noise = Math.random() * 2 - 1;
      last = last * 0.55 + noise * 0.45; // leggermente "scuro"
      d[i] = last * Math.pow(1 - t, 3.2);
    }
  }
  byLen.set(seconds, buf);
  return buf;
}

/**
 * Crea la catena effetti nel contesto dato.
 * Ritorna { input, output } da collegare: sorgente → input … output → destinazione.
 */
export function buildVoiceChain(ctx, presetId = 'provino', { bpm = 0, level = 1 } = {}) {
  const p = FX_PRESETS[presetId] || FX_PRESETS.provino;
  const input = ctx.createGain();
  input.gain.value = level;
  const output = ctx.createGain();

  let node = input;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = p.hp;
  hp.Q.value = 0.7;
  node.connect(hp);
  node = hp;

  for (const b of p.eq) {
    const f = ctx.createBiquadFilter();
    f.type = b.type;
    f.frequency.value = b.f;
    if (b.q) f.Q.value = b.q;
    f.gain.value = b.g;
    node.connect(f);
    node = f;
  }

  if (p.comp) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = p.comp.threshold;
    c.ratio.value = p.comp.ratio;
    c.attack.value = p.comp.attack;
    c.release.value = p.comp.release;
    c.knee.value = 6;
    const makeup = ctx.createGain();
    makeup.gain.value = p.comp.makeup;
    node.connect(c);
    c.connect(makeup);
    node = makeup;
  }

  node.connect(output); // segnale "asciutto"

  if (p.reverb) {
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, p.reverb.seconds);
    const wet = ctx.createGain();
    wet.gain.value = p.reverb.wet;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7000;
    node.connect(conv);
    conv.connect(tone);
    tone.connect(wet);
    wet.connect(output);
  }

  if (p.delay) {
    const beat = bpm ? 60 / bpm : 0.5;
    const time = Math.min(1.9, beat * p.delay.beats);
    const d = ctx.createDelay(2);
    d.delayTime.value = time;
    const fb = ctx.createGain();
    fb.gain.value = p.delay.feedback;
    const tone = ctx.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = 1800;
    tone.Q.value = 0.6;
    const wet = ctx.createGain();
    wet.gain.value = p.delay.wet;
    node.connect(d);
    d.connect(tone);
    tone.connect(fb);
    fb.connect(d);
    tone.connect(wet);
    wet.connect(output);
  }

  return { input, output };
}

/** Bus finale: leggera compressione "colla" (voce e beat suonano insieme) + limitatore. */
export function buildMaster(ctx) {
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 10;
  glue.ratio.value = 2;
  glue.attack.value = 0.02;
  glue.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -1.5;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.002;
  lim.release.value = 0.08;
  glue.connect(lim);
  lim.connect(ctx.destination);
  return glue;
}
