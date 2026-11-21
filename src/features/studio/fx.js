// Effetti voce per il provino: livello automatico, pulizia, EQ, compressore, riverbero e delay a tempo.
// Funziona sia in tempo reale (AudioContext) sia nell'export (OfflineAudioContext).

// Catena effetti voce (come gli insert di Logic): ogni effetto ha ⏻ e i suoi controlli.
export const DEFAULT_STRIP = {
  eq: { on: true, lowcut: 100, mud: -2.5, presence: 3, air: 2 },
  comp: { on: true, threshold: -22, ratio: 3.5, attack: 6, release: 180, makeup: 4 },
  sat: { on: false, drive: 25 },
  delay: { on: true, div: 0.5, feedback: 20, mix: 6 },
  reverb: { on: true, size: 1.4, mix: 14 },
};

// Punti di partenza: poi si regola tutto a mano
export const FX_PRESETS = {
  pulita: {
    label: 'Pulita',
    hint: 'Voce naturale, solo pulizia dei bassi',
    strip: {
      eq: { on: true, lowcut: 80, mud: 0, presence: 0, air: 0 },
      comp: { on: false, threshold: -20, ratio: 2, attack: 10, release: 200, makeup: 0 },
      sat: { on: false, drive: 20 },
      delay: { on: false, div: 0.5, feedback: 20, mix: 6 },
      reverb: { on: false, size: 1.2, mix: 10 },
    },
  },
  provino: { label: 'Provino', hint: 'Compressa, presente, un filo di riverbero', strip: DEFAULT_STRIP },
  trap: {
    label: 'Trap',
    hint: 'Molto compressa e brillante, delay a tempo',
    strip: {
      eq: { on: true, lowcut: 120, mud: -3, presence: 4, air: 3 },
      comp: { on: true, threshold: -28, ratio: 6, attack: 3, release: 120, makeup: 7 },
      sat: { on: true, drive: 20 },
      delay: { on: true, div: 0.5, feedback: 30, mix: 13 },
      reverb: { on: true, size: 1.0, mix: 12 },
    },
  },
  spazio: {
    label: 'Spazio',
    hint: 'Riverbero ampio e delay lungo, per ritornelli e melodie',
    strip: {
      eq: { on: true, lowcut: 100, mud: -2, presence: 2.5, air: 2.5 },
      comp: { on: true, threshold: -20, ratio: 3, attack: 8, release: 200, makeup: 3.5 },
      sat: { on: false, drive: 20 },
      delay: { on: true, div: 0.75, feedback: 35, mix: 12 },
      reverb: { on: true, size: 2.6, mix: 30 },
    },
  },
};

/** Da preset (testo) o catena salvata a catena completa (con i valori mancanti di default). */
export function normalizeStrip(fx) {
  const base = typeof fx === 'string' || !fx ? FX_PRESETS[fx]?.strip || DEFAULT_STRIP : fx;
  const out = {};
  for (const k of Object.keys(DEFAULT_STRIP)) out[k] = { ...DEFAULT_STRIP[k], ...(base[k] || {}) };
  return out;
}

/** Quale preset corrisponde (se nessuno: "personalizzato"). */
export function presetOf(strip) {
  const s = JSON.stringify(normalizeStrip(strip));
  return FX_ORDER.find((k) => JSON.stringify(normalizeStrip(k)) === s) || null;
}

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

function satCurve(drive) {
  const k = 1 + drive / 8;
  const n = 2048;
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

/**
 * Crea la catena effetti nel contesto dato (fx = catena o nome di preset).
 * Ritorna { input, output } da collegare: sorgente → input … output → destinazione.
 */
export function buildVoiceChain(ctx, fx = 'provino', { bpm = 0, level = 1 } = {}) {
  const p = normalizeStrip(fx);
  const input = ctx.createGain();
  input.gain.value = level;
  const output = ctx.createGain();
  const add = (n) => {
    node.connect(n);
    node = n;
  };
  let node = input;

  // EQ (il taglio dei bassi c'è sempre, almeno a 40 Hz)
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = p.eq.on ? p.eq.lowcut : 40;
  hp.Q.value = 0.7;
  add(hp);
  if (p.eq.on) {
    for (const [type, f, g, q] of [
      ['peaking', 300, p.eq.mud, 1],
      ['peaking', 3500, p.eq.presence, 0.9],
      ['highshelf', 10000, p.eq.air, 0],
    ]) {
      if (!g) continue;
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      if (q) b.Q.value = q;
      b.gain.value = g;
      add(b);
    }
  }

  // Compressore
  if (p.comp.on) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = p.comp.threshold;
    c.ratio.value = p.comp.ratio;
    c.attack.value = p.comp.attack / 1000;
    c.release.value = p.comp.release / 1000;
    c.knee.value = 6;
    add(c);
    const mk = ctx.createGain();
    mk.gain.value = dbToGain(p.comp.makeup);
    add(mk);
  }

  // Saturazione
  if (p.sat.on && p.sat.drive > 0) {
    const ws = ctx.createWaveShaper();
    ws.curve = satCurve(p.sat.drive);
    ws.oversample = '2x';
    add(ws);
    const comp = ctx.createGain();
    comp.gain.value = 1 / (1 + p.sat.drive / 200); // compenso il volume
    add(comp);
  }

  node.connect(output); // segnale "asciutto"

  if (p.reverb.on && p.reverb.mix > 0) {
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, Math.round(p.reverb.size * 10) / 10);
    const wet = ctx.createGain();
    wet.gain.value = p.reverb.mix / 100;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7000;
    node.connect(conv);
    conv.connect(tone);
    tone.connect(wet);
    wet.connect(output);
  }

  if (p.delay.on && p.delay.mix > 0) {
    const beat = bpm ? 60 / bpm : 0.5;
    const time = Math.min(1.9, beat * p.delay.div);
    const d = ctx.createDelay(2);
    d.delayTime.value = time;
    const fb = ctx.createGain();
    fb.gain.value = Math.min(0.85, p.delay.feedback / 100);
    const tone = ctx.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = 1800;
    tone.Q.value = 0.6;
    const wet = ctx.createGain();
    wet.gain.value = p.delay.mix / 100;
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
