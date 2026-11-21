// Riconoscimento automatico di BPM e tonalità (funziona offline, senza librerie).
// Lavora su audio mono a bassa frequenza di campionamento (es. 11025 Hz).

/** FFT radix-2 in place (re, im: Float64Array di lunghezza potenza di 2). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Spettri di ampiezza a finestre: chiama onFrame(mag) per ogni finestra. */
function stft(samples, size, hop, onFrame) {
  const win = hann(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const mag = new Float64Array(size / 2);
  for (let start = 0; start + size <= samples.length; start += hop) {
    for (let i = 0; i < size; i++) {
      re[i] = samples[start + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    onFrame(mag);
  }
}

// ---------------- BPM ----------------

/** Curva degli "attacchi" (spectral flux) a ~sr/hop campioni al secondo. */
function onsetEnvelope(samples, sr) {
  const size = 1024;
  const hop = 110; // ≈ 100 punti al secondo a 11025 Hz
  const maxBin = Math.floor((8000 / sr) * size);
  let prev = null;
  const env = [];
  stft(samples, size, hop, (mag) => {
    let flux = 0;
    const cur = new Float64Array(maxBin);
    for (let k = 1; k < maxBin; k++) {
      cur[k] = Math.log1p(100 * mag[k]);
      if (prev) {
        const d = cur[k] - prev[k];
        if (d > 0) flux += d;
      }
    }
    prev = cur;
    env.push(flux);
  });
  // tolgo la media locale (≈0.5 s) e tengo solo i picchi
  const fps = sr / hop;
  const half = Math.round(fps * 0.25);
  const out = new Float64Array(env.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < env.length + half; i++) {
    if (i < env.length) {
      sum += env[i];
      count++;
    }
    if (i - 2 * half - 1 >= 0) {
      sum -= env[i - 2 * half - 1];
      count--;
    }
    const c = i - half;
    if (c >= 0 && c < env.length) out[c] = Math.max(0, env[c] - sum / count);
  }
  return { env: out, fps };
}

function autocorr(x, maxLag) {
  const ac = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    ac[lag] = s / (x.length - lag);
  }
  return ac;
}

const interp = (arr, x) => {
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < arr.length ? arr[i] * (1 - f) + arr[i + 1] * f : 0;
};

/**
 * Stima il BPM. Ritorna { bpm, confidence, alternatives: [metà, doppio] }.
 * Cerca tra 70 e 180 BPM (intervallo tipico del rap; la trap a 140 resta 140).
 */
export function detectBpm(samples, sr) {
  const { env, fps } = onsetEnvelope(samples, sr);
  if (env.length < fps * 4) return { bpm: null, confidence: 0, alternatives: [] };
  const maxLag = Math.ceil((60 * fps) / 35);
  const ac = autocorr(env, Math.min(maxLag, env.length - 1));
  const score = (bpm) => {
    const lag = (60 * fps) / bpm;
    // "pettine": il tempo vero ha picchi anche a 2, 3, 4 battiti
    // (pesi uguali, così i sotto-battiti come gli hi-hat non "raddoppiano" il tempo)
    let s = 0;
    let n = 0;
    for (let m = 1; m <= 4; m++) {
      if (lag * m >= ac.length - 1) break;
      s += interp(ac, lag * m);
      n++;
    }
    return n ? s / n : 0;
  };
  let best = null;
  let bestScore = -Infinity;
  const scores = [];
  for (let b = 70; b <= 180; b += 0.25) {
    // leggera preferenza per i tempi medi
    const prior = Math.exp(-0.5 * (Math.log2(b / 120) / 0.9) ** 2);
    const s = score(b) * (0.75 + 0.25 * prior);
    scores.push(s);
    if (s > bestScore) {
      bestScore = s;
      best = b;
    }
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const confidence = bestScore > 0 ? Math.max(0, Math.min(1, (bestScore - mean) / bestScore)) : 0;
  // Sotto 80 è quasi sempre trap in "half-time": i producer la scrivono doppia (70 → 140).
  if (best < 80) {
    const target = best * 2;
    let refined = target;
    let rs = -Infinity;
    for (let b = target - 3; b <= target + 3; b += 0.25) {
      const s = score(b);
      if (s > rs) {
        rs = s;
        refined = b;
      }
    }
    best = refined;
  }
  const bpm = Math.round(best);
  const alternatives = [bpm / 2, bpm * 2].filter((b) => b >= 50 && b <= 220).map((b) => Math.round(b));
  return { bpm, confidence: Math.round(confidence * 100) / 100, alternatives };
}

// ---------------- Tonalità ----------------

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const PITCH = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Profilo cromatico (12 note) di tutto il brano. */
export function chromagram(samples, sr) {
  const size = 4096;
  const chroma = new Float64Array(12);
  const binPc = [];
  for (let k = 1; k < size / 2; k++) {
    const f = (k * sr) / size;
    binPc.push(f >= 60 && f <= 2000 ? (((Math.round(12 * Math.log2(f / 440)) + 9) % 12) + 12) % 12 : -1);
  }
  stft(samples, size, size / 2, (mag) => {
    const frame = new Float64Array(12);
    let total = 0;
    for (let k = 1; k < size / 2; k++) {
      const pc = binPc[k - 1];
      if (pc < 0) continue;
      const v = mag[k] * mag[k];
      frame[pc] += v;
      total += v;
    }
    if (total > 0) for (let i = 0; i < 12; i++) chroma[i] += frame[i] / total;
  });
  return [...chroma];
}

/** Info su una tonalità a partire da nota (0-11) e modo. */
export function keyInfo(pc, minor) {
  const name = PITCH[pc];
  return {
    id: `${name}${minor ? 'm' : ''}`,
    label: `${name} ${minor ? 'Minor' : 'Major'}`,
    camelot: `${minor ? CAMELOT_MINOR[pc] : CAMELOT_MAJOR[pc]}${minor ? 'A' : 'B'}`,
  };
}

/** Stima la tonalità. Ritorna { id: "Am", label: "A Minor", camelot: "8A", confidence }. */
export function detectKey(samples, sr) {
  const chroma = chromagram(samples, sr);
  if (chroma.every((v) => v === 0)) return null;
  let best = null;
  for (let pc = 0; pc < 12; pc++) {
    for (const minor of [false, true]) {
      const prof = minor ? MINOR : MAJOR;
      const rotated = chroma.map((_, i) => prof[(i - pc + 12) % 12]);
      const r = pearson(chroma, rotated);
      if (!best || r > best.r) best = { pc, minor, r };
    }
  }
  return { ...keyInfo(best.pc, best.minor), confidence: Math.round(Math.max(0, best.r) * 100) / 100 };
}

/** Converte un id salvato ("Am", "F#", "Ebm") nelle info complete. */
export function parseKeyId(id) {
  if (!id) return null;
  const m = String(id).match(/^([A-G][#b]?)(m?)$/);
  if (!m) return null;
  const pc = PITCH.indexOf(m[1]);
  return pc < 0 ? null : keyInfo(pc, m[2] === 'm');
}

/** Analisi completa (usata dal worker). */
export function analyzeSamples(samples, sr) {
  return { bpm: detectBpm(samples, sr), key: detectKey(samples, sr) };
}
