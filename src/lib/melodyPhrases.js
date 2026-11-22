// Dal "nanana" registrato alle frasi della melodia e alle loro sillabe.
// Una frase finisce quando smetti di cantare per almeno ~0,2 s; le sillabe sono i "colpi" di voce.

/** Inviluppo (volume) ogni 10 ms. */
export function envelope(x, sr, hopSec = 0.01, winSec = 0.025) {
  const hop = Math.max(1, Math.round(sr * hopSec));
  const win = Math.max(hop, Math.round(sr * winSec));
  const out = [];
  for (let i = 0; i + win <= x.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += x[j] * x[j];
    out.push(Math.sqrt(s / win));
  }
  // leggera media mobile per togliere il tremolio
  return out.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = i - 2; k <= i + 2; k++)
      if (k >= 0 && k < out.length) {
        s += out[k];
        n++;
      }
    return s / n;
  });
}

/**
 * Frasi della melodia: [{ start, end, syllables }] (secondi dall'inizio della registrazione).
 */
export function melodyPhrases(x, sr, { gap = 0.2, minPhrase = 0.12, minSyl = 0.09 } = {}) {
  const hop = 0.01;
  const env = envelope(x, sr, hop);
  if (!env.length) return [];
  const sorted = [...env].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const floor = sorted[Math.floor(sorted.length * 0.2)];
  const thr = Math.max(0.006, floor * 2, p95 * 0.12);

  // pezzi con la voce
  const segs = [];
  let cur = null;
  env.forEach((v, i) => {
    if (v > thr) {
      if (cur && i - cur.e <= gap / hop) cur.e = i;
      else {
        cur = { s: i, e: i };
        segs.push(cur);
      }
    }
  });
  const phrases = [];
  for (const sg of segs) {
    if ((sg.e - sg.s) * hop < minPhrase) continue;
    const part = env.slice(sg.s, sg.e + 1);
    const max = Math.max(...part);
    // picchi: massimi locali abbastanza alti e separati da una "valle" vera
    const peaks = [];
    for (let i = 1; i < part.length - 1; i++) {
      if (part[i] < part[i - 1] || part[i] < part[i + 1] || part[i] < Math.max(thr, max * 0.25)) continue;
      const last = peaks[peaks.length - 1];
      if (last != null) {
        let valley = Infinity;
        for (let k = last; k <= i; k++) valley = Math.min(valley, part[k]);
        const deep = valley < 0.72 * Math.min(part[last], part[i]);
        if (!deep || (i - last) * hop < minSyl) {
          if (part[i] > part[last]) peaks[peaks.length - 1] = i; // tengo il più alto
          continue;
        }
      }
      peaks.push(i);
    }
    // ogni sillaba: quando parte, quanto dura, se è "forte" (accento) — serve per far stare le parole nella melodia
    const pk = peaks.length ? peaks : [0];
    const durs = pk.map((p, k) => ((k + 1 < pk.length ? pk[k + 1] : part.length) - p) * hop);
    const medDur = [...durs].sort((x, y) => x - y)[Math.floor(durs.length / 2)] || 0.2;
    const syl = pk.map((p, k) => ({
      t: +((sg.s + p) * hop).toFixed(2),
      dur: +durs[k].toFixed(2),
      accent: part[p] >= max * 0.85 || durs[k] >= medDur * 1.6,
    }));
    phrases.push({ start: +(sg.s * hop).toFixed(2), end: +((sg.e + 1) * hop).toFixed(2), syllables: Math.max(1, peaks.length), syl });
  }
  return phrases;
}
