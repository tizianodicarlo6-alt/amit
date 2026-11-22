// 🗺 Mappa del beat: intro, strofe, ritornelli, stacchi e chiusura trovati dall'energia, battuta per battuta.
// Logica pura (campioni mono): cerca i cambi a blocchi di 4 battute, come sono fatti i beat rap.

/** Energia (RMS) di ogni battuta e quanta parte è "bassa" (cassa, 808). */
export function barEnergies(x, sr, { bpm, anchor = 0 }) {
  const barLen = Math.round(((4 * 60) / bpm) * sr);
  const first = Math.round(anchor * sr) % barLen;
  const out = [];
  let lp = 0;
  const a = Math.exp((-2 * Math.PI * 150) / sr); // passa-basso ~150 Hz
  for (let s = first; s + barLen <= x.length; s += barLen) {
    let e = 0;
    let lo = 0;
    for (let i = s; i < s + barLen; i += 2) {
      const v = x[i];
      lp = a * lp + (1 - a) * v;
      e += v * v;
      lo += lp * lp;
    }
    const n = barLen / 2;
    out.push({ t: s / sr, rms: Math.sqrt(e / n), low: Math.sqrt(lo / n) });
  }
  return { bars: out, barDur: barLen / sr, first: first / sr };
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/**
 * Sezioni del beat: [{ start, end (secondi), kind: 'intro'|'strofa'|'rit'|'break'|'outro', label }].
 * bpm obbligatorio; anchor = primo battito (secondi).
 */
export function beatMap(x, sr, { bpm, anchor = 0 }) {
  if (!bpm || !x?.length) return [];
  const { bars, barDur, first } = barEnergies(x, sr, { bpm, anchor });
  if (bars.length < 8) return [];
  // blocchi di 4 battute
  const blocks = [];
  for (let i = 0; i < bars.length; i += 4) {
    const bb = bars.slice(i, i + 4);
    blocks.push({ i, n: bb.length, rms: mean(bb.map((b) => b.rms)), low: mean(bb.map((b) => b.low)) });
  }
  const sorted = [...blocks].map((b) => b.rms).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 1e-9;
  const lowMed = [...blocks].map((b) => b.low).sort((a, b) => a - b)[Math.floor(blocks.length / 2)] || 1e-9;
  // livello di ogni blocco
  const max = sorted[sorted.length - 1];
  const lvl = blocks.map((b) => {
    if (b.rms < med * 0.62 || b.low < lowMed * 0.45) return 'quiet';
    // "pieno": più vicino al massimo che alla mediana
    if (b.rms >= med + 0.5 * (max - med) && b.rms > med * 1.1) return 'loud';
    return 'mid';
  });
  // un blocco da solo in mezzo a due uguali diversi da lui è quasi sempre un errore di misura
  for (let k = 1; k < lvl.length - 1; k++) if (lvl[k - 1] === lvl[k + 1] && lvl[k] !== lvl[k - 1] && lvl[k] !== 'quiet') lvl[k] = lvl[k - 1];
  // unisco i blocchi uguali vicini
  const segs = [];
  lvl.forEach((l, k) => {
    const last = segs[segs.length - 1];
    if (last && last.l === l) last.to = k;
    else segs.push({ l, from: k, to: k });
  });
  const out = segs.map((g, idx) => {
    const start = first + blocks[g.from].i * barDur;
    const end = first + (blocks[g.to].i + blocks[g.to].n) * barDur;
    let kind = g.l === 'loud' ? 'rit' : g.l === 'mid' ? 'strofa' : 'break';
    if (g.l === 'quiet' && idx === 0) kind = 'intro';
    if (g.l === 'quiet' && idx === segs.length - 1) kind = 'outro';
    return { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, kind, bars: (blocks[g.to].i + blocks[g.to].n - blocks[g.from].i) };
  });
  // se non c'è nessun "loud" ma ci sono strofe lunghe, nessun ritornello: va bene così
  const names = { intro: 'Intro', strofa: 'Strofa', rit: 'Rit', break: 'Stacco', outro: 'Outro' };
  const count = {};
  return out.map((s) => {
    count[s.kind] = (count[s.kind] || 0) + 1;
    const multi = out.filter((o) => o.kind === s.kind).length > 1 && (s.kind === 'strofa' || s.kind === 'rit');
    return { ...s, label: `${names[s.kind]}${multi ? ` ${count[s.kind]}` : ''}` };
  });
}
