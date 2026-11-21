// Pitch shift della voce SENZA cambiare la velocità (come il Pitch Shifter di Logic).
// Metodo: allungo il suono nel tempo (WSOLA: pezzetti sovrapposti allineati per somiglianza)
// e poi lo ricampiono alla durata originale → stessa durata, nota più alta o più bassa.

function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Allunga (factor > 1) o accorcia (factor < 1) il suono senza cambiarne l'altezza. */
export function timeStretch(input, sr, factor) {
  const N = Math.max(256, Math.round(sr * 0.04)) & ~1; // finestre da 40 ms
  const Hs = N / 2; // passo in uscita
  const Ha = Hs / factor; // passo in ingresso
  // quanto posso spostarmi per trovare il punto più simile: al massimo metà del passo in ingresso,
  // altrimenti con allungamenti forti (pitch molto in su) ritrova sempre il pezzo "naturale" e non allunga
  const tol = Math.max(8, Math.min(Math.round(N / 4), Math.round(Ha * 0.5)));
  const step = 4; // calcolo la somiglianza su un campione ogni 4 (più veloce)
  const win = hann(N);
  const outLen = Math.ceil(input.length * factor) + N;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  let prevAna = 0;
  for (let k = 0; ; k++) {
    const syn = k * Hs;
    const nominal = Math.round(k * Ha);
    if (nominal + N >= input.length || syn + N >= outLen) break;
    let ana = nominal;
    if (k > 0) {
      // cerco l'inizio che "continua" meglio il pezzo precedente
      const target = prevAna + Hs;
      let best = -Infinity;
      for (let d = -tol; d <= tol; d += step) {
        const a = nominal + d;
        if (a < 0 || a + N >= input.length || target + N >= input.length) continue;
        let c = 0;
        for (let i = 0; i < N; i += step * 2) c += input[a + i] * input[target + i];
        if (c > best) {
          best = c;
          ana = a;
        }
      }
    }
    for (let i = 0; i < N; i++) {
      out[syn + i] += input[ana + i] * win[i];
      norm[syn + i] += win[i];
    }
    prevAna = ana;
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
  return out;
}

/** Sposta l'altezza di `semitones` (es. +12 = un'ottava sopra), stessa durata. */
export function pitchShift(input, sr, semitones) {
  if (!semitones) return input;
  const ratio = Math.pow(2, semitones / 12);
  const stretched = timeStretch(input, sr, ratio);
  const out = new Float32Array(input.length);
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (stretched[j] || 0) * (1 - f) + (stretched[j + 1] || 0) * f;
  }
  return out;
}
