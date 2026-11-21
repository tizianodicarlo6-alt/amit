// Sample (loop audio) e voce/cori della bozza: messi a tempo, intonati, "corizzati".
// Logica pura sui campioni (Float32Array), testabile senza browser.
import { detectBpm } from '../../lib/analysis.js';
import { pitchShift, timeStretch } from '../../lib/pitch.js';

export const LOOP_BARS = [1, 2, 4, 8, 16];

/** Toglie il silenzio iniziale (molti file hanno un attimo di vuoto prima del suono). */
export function trimStart(x, sr) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const thr = Math.max(0.003, peak * 0.03);
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < thr) i++;
  const from = Math.max(0, i - Math.round(sr * 0.005));
  return from > sr * 0.003 ? x.subarray(from) : x;
}

/**
 * Quante battute è lungo un loop (1, 2, 4, 8 o 16) e a che BPM era.
 * Uso il BPM del sample se si riconosce, altrimenti quello della bozza.
 */
export function guessLoopBars(x, sr, sketchBpm) {
  const dur = x.length / sr;
  let srcBpm = null;
  if (dur >= 3) {
    const r = detectBpm(x, sr);
    if (r.bpm) {
      // tra BPM, metà e doppio scelgo quello che dà un numero di battute "tondo"
      let best = null;
      for (const b of [r.bpm, r.bpm / 2, r.bpm * 2]) {
        const bars = (dur * b) / 240;
        const near = LOOP_BARS.reduce((a, c) => (Math.abs(Math.log2(c / bars)) < Math.abs(Math.log2(a / bars)) ? c : a));
        const err = Math.abs(Math.log2(near / bars));
        if (!best || err < best.err - 0.02) best = { err, bars: near, bpm: b };
      }
      if (best.err < 0.12) srcBpm = Math.round(best.bpm);
    }
  }
  const bars = (dur * (srcBpm || sketchBpm)) / 240;
  const near = LOOP_BARS.reduce((a, c) => (Math.abs(Math.log2(c / bars)) < Math.abs(Math.log2(a / bars)) ? c : a));
  return { bars: near, srcBpm };
}

/**
 * Mette il loop a tempo: lungo esattamente `bars` battute al BPM della bozza,
 * spostato di `semis` semitoni. Ritorna un Float32Array.
 */
export function fitLoop(x, sr, { bpm, bars, semis = 0 }) {
  const target = Math.round(((bars * 240) / bpm) * sr);
  const factor = target / x.length;
  let y = Math.abs(factor - 1) > 0.004 ? timeStretch(x, sr, factor) : x;
  if (semis) y = pitchShift(y, sr, semis);
  const out = new Float32Array(target);
  out.set(y.subarray(0, Math.min(target, y.length)));
  // micro-dissolvenze: niente "clic" quando il loop riparte
  const f = Math.min(Math.round(sr * 0.004), target >> 2);
  for (let i = 0; i < f; i++) {
    out[i] *= i / f;
    out[target - 1 - i] *= i / f;
  }
  return out;
}

// Copia leggermente ritardata e "ondeggiante" (come un'altra persona che canta la stessa cosa)
function doubleVoice(x, sr, { base, depth, rate, phase }) {
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const d = sr * (base + depth * Math.sin((2 * Math.PI * rate * i) / sr + phase));
    const p = i - d;
    const j = Math.floor(p);
    if (j < 0) continue;
    const f = p - j;
    y[i] = x[j] * (1 - f) + (x[j + 1] || 0) * f;
  }
  return y;
}

export const VOICE_FX = [
  { id: 'secca', label: 'Normale', hint: 'La tua voce così com\'è' },
  { id: 'coro', label: 'Coro', hint: 'Sembrano più voci insieme, larghe' },
  { id: 'armonie', label: 'Coro + armonie', hint: 'Più voci con una nota sopra e una sotto' },
];

/** Voce → stereo { L, R } con l'effetto scelto. */
export function makeChoir(x, sr, effect = 'coro') {
  if (effect === 'secca') return { L: x, R: x };
  const L = new Float32Array(x.length);
  const R = new Float32Array(x.length);
  const add = (y, gl, gr) => {
    for (let i = 0; i < x.length; i++) {
      L[i] += y[i] * gl;
      R[i] += y[i] * gr;
    }
  };
  add(x, 0.7, 0.7);
  add(doubleVoice(x, sr, { base: 0.024, depth: 0.004, rate: 0.6, phase: 0 }), 0.6, 0.15);
  add(doubleVoice(x, sr, { base: 0.035, depth: 0.005, rate: 0.45, phase: 2 }), 0.15, 0.6);
  add(pitchShift(x, sr, 12), 0.18, 0.18); // un filo di ottava sopra: "aria"
  if (effect === 'armonie') {
    add(doubleVoice(pitchShift(x, sr, 7), sr, { base: 0.02, depth: 0.003, rate: 0.5, phase: 1 }), 0.4, 0.25); // quinta sopra
    add(doubleVoice(pitchShift(x, sr, -5), sr, { base: 0.028, depth: 0.003, rate: 0.55, phase: 3 }), 0.25, 0.4); // quarta sotto
  }
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  let px = 0;
  for (let i = 0; i < x.length; i++) px = Math.max(px, Math.abs(x[i]));
  const g = peak ? Math.min(1, (px || 1) / peak) : 1; // stesso volume della voce originale
  for (let i = 0; i < x.length; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  return { L, R };
}

/**
 * Pezzi di audio da suonare per una parte "a loop" (sample o voce) lungo il brano.
 * bars: [{ on, loopBar }] battuta per battuta; loopLen = battute del loop audio.
 * Ritorna [{ bar (inizio, in battute), offsetBars, lenBars }] unendo le battute consecutive.
 */
export function audioRuns(bars, loopLen) {
  const runs = [];
  let cur = null;
  bars.forEach((b, i) => {
    if (!b.on) {
      cur = null;
      return;
    }
    const off = b.loopBar % loopLen;
    if (cur && off === cur.offsetBars + cur.lenBars) cur.lenBars++;
    else {
      cur = { bar: i, offsetBars: off, lenBars: 1 };
      runs.push(cur);
    }
  });
  return runs;
}
