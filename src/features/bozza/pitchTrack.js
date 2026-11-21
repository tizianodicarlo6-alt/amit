// Dalla voce (canticchiata o fischiata) alle note. Logica pura, testabile senza browser.
import { scaleOf, snapToScale } from './music.js';

/** Frequenza di un pezzetto di audio col metodo YIN. Ritorna { freq, clarity } (clarity 0–1). */
export function yin(frame, sr, { fmin = 70, fmax = 1100, threshold = 0.15 } = {}) {
  const maxLag = Math.min(Math.floor(sr / fmin), Math.floor(frame.length / 2));
  const minLag = Math.max(2, Math.floor(sr / fmax));
  const W = frame.length - maxLag;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = frame[i] - frame[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // differenza normalizzata cumulativa
  let run = 0;
  const cm = new Float32Array(maxLag + 1);
  cm[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    cm[tau] = run ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cm[t] < threshold) {
      while (t + 1 <= maxLag && cm[t + 1] < cm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return { freq: 0, clarity: 0 };
  // interpolazione parabolica per più precisione
  const a = cm[tau - 1] ?? cm[tau];
  const b = cm[tau];
  const c = cm[tau + 1] ?? cm[tau];
  const den = a + c - 2 * b;
  const shift = den ? (a - c) / (2 * den) : 0;
  return { freq: sr / (tau + shift), clarity: 1 - b };
}

/** Riduce la frequenza di campionamento (media su blocchi), per lavorare più veloce. */
export function downsample(samples, sr, target = 11025) {
  const r = sr / target;
  if (r <= 1) return { x: samples, sr };
  const n = Math.floor(samples.length / r);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * r);
    const b = Math.min(samples.length, Math.floor((i + 1) * r));
    let s = 0;
    for (let j = a; j < b; j++) s += samples[j];
    x[i] = s / Math.max(1, b - a);
  }
  return { x, sr: sr / r };
}

/** Altezza (MIDI con decimali, o null nel silenzio) ogni 10 ms. */
export function pitchTrack(samples, sr) {
  const { x, sr: s2 } = downsample(samples, sr);
  const hop = Math.round(s2 * 0.01);
  const win = Math.round(s2 * 0.045);
  const rms = [];
  for (let i = 0; i + win < x.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += x[j] * x[j];
    rms.push(Math.sqrt(s / win));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const thr = Math.max(0.008, p90 * 0.12);
  const out = [];
  for (let k = 0, i = 0; i + win < x.length; i += hop, k++) {
    let midi = null;
    if (rms[k] > thr) {
      const { freq, clarity } = yin(x.subarray(i, i + win), s2);
      if (freq > 0 && clarity > 0.75) midi = 69 + 12 * Math.log2(freq / 440);
    }
    out.push({ t: (i + win / 2) / s2, midi });
  }
  // filtro mediano su 5 punti: toglie i "salti" di un attimo
  return out.map((f, i) => {
    if (f.midi == null) return f;
    const win5 = out.slice(Math.max(0, i - 2), i + 3).map((g) => g.midi).filter((m) => m != null).sort((a, b) => a - b);
    return { t: f.t, midi: win5[Math.floor(win5.length / 2)] };
  });
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Divide l'andamento dell'altezza in note: { pitch (decimale), start, end } in secondi. */
export function segmentNotes(track, { minDur = 0.07, jump = 0.8 } = {}) {
  const notes = [];
  let cur = null;
  let pending = 0;
  const close = () => {
    if (cur && cur.end - cur.start >= minDur) notes.push({ pitch: median(cur.values), start: cur.start, end: cur.end });
    cur = null;
  };
  for (const f of track) {
    if (f.midi == null) {
      close();
      pending = 0;
      continue;
    }
    if (!cur) {
      cur = { start: f.t, end: f.t + 0.01, values: [f.midi] };
      continue;
    }
    const ref = median(cur.values.slice(-8));
    if (Math.abs(f.midi - ref) > jump) {
      // nota nuova solo se il cambio dura almeno 3 punti (30 ms): così il vibrato non spezza le note
      pending++;
      if (pending >= 3) {
        const keep = cur.values.splice(cur.values.length - (pending - 1));
        cur.end = f.t - 0.03;
        const start = cur.end;
        close();
        cur = { start, end: f.t + 0.01, values: [...keep, f.midi] };
        pending = 0;
        continue;
      }
    } else pending = 0;
    cur.values.push(f.midi);
    cur.end = f.t + 0.01;
  }
  close();
  return notes;
}

/** Tonalità che "suona meglio" con le note cantate (peso = durata). */
export function guessKey(notes) {
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const h = Array(12).fill(0);
  for (const n of notes) h[((Math.round(n.pitch) % 12) + 12) % 12] += n.len ?? n.end - n.start;
  if (!h.some((v) => v)) return null;
  const corr = (a, b) => {
    const ma = a.reduce((s, v) => s + v, 0) / 12;
    const mb = b.reduce((s, v) => s + v, 0) / 12;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < 12; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : 0;
  };
  let best = null;
  for (let pc = 0; pc < 12; pc++)
    for (const minor of [false, true]) {
      const prof = (minor ? MIN : MAJ).map((_, i) => (minor ? MIN : MAJ)[(i - pc + 12) % 12]);
      const r = corr(h, prof);
      if (!best || r > best.r) best = { r, id: `${NAMES[pc]}${minor ? 'm' : ''}` };
    }
  return best.id;
}

/**
 * Note cantate → note della bozza: a tempo (sedicesimi), nella tonalità e nell'ottava della melodia.
 * beatStart = secondo della registrazione in cui cade l'inizio della battuta 1.
 */
export function quantizeNotes(segs, { bpm, key, bars, beatStart = 0, grid = 1 }) {
  const stepDur = 60 / bpm / 4;
  const total = bars * 16;
  if (!segs.length) return [];
  // ottava: porto la mediana delle note intorno a La4 (centro del piano roll della melodia)
  const med = median(segs.map((s) => s.pitch));
  const shift = 12 * Math.round((69 - med) / 12);
  scaleOf(key); // valida la tonalità
  const out = [];
  for (const s of segs) {
    let start = Math.round((s.start - beatStart) / stepDur / grid) * grid;
    const end = Math.round((s.end - beatStart) / stepDur / grid) * grid;
    if (start < 0 || start >= total) continue;
    const len = Math.max(grid, Math.min(end - start, total - start));
    const pitch = snapToScale(s.pitch + shift, key);
    const prev = out[out.length - 1];
    if (prev && start < prev.start + prev.len) {
      if (start === prev.start) continue; // due note sullo stesso passo: tengo la prima
      prev.len = start - prev.start; // accorcio la precedente
    }
    out.push({ pitch, start, len, vel: 1 });
  }
  return out;
}
