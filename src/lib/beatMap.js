// 🗺 Mappa del beat: intro, strofe, ritornelli, stacchi e chiusura.
// Logica pura (campioni mono). Non guardo solo il volume (i beat masterizzati hanno strofa e
// ritornello quasi uguali di volume) ma "com'è fatto" ogni pezzo: bassi/cassa, brillantezza
// (hi-hat, melodie in alto) e quanti colpi ci sono. Ragiono a blocchi di 4 battute.

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const db = (e) => 10 * Math.log10(e + 1e-12);

/** Per ogni battuta: volume, bassi, alti (dB) e colpi (attacchi) contati. */
export function barFeatures(x, sr, { bpm, anchor = 0 }) {
  const barLen = Math.round(((4 * 60) / bpm) * sr);
  const first = Math.round(anchor * sr) % barLen;
  const frame = Math.max(64, Math.round(sr * 0.012));
  const a = Math.exp((-2 * Math.PI * 150) / sr); // passa-basso ~150 Hz (cassa, 808)
  const bars = [];
  let lp = 0;
  let prevX = 0;
  let prevFrame = 0;
  for (let s = first; s + barLen <= x.length; s += barLen) {
    let e = 0;
    let lo = 0;
    let hi = 0;
    let hits = 0;
    for (let f = s; f + frame <= s + barLen; f += frame) {
      let fe = 0;
      let fh = 0;
      for (let i = f; i < f + frame; i++) {
        const v = x[i];
        lp = a * lp + (1 - a) * v;
        const d = v - prevX; // differenza = alti
        prevX = v;
        fe += v * v;
        lo += lp * lp;
        fh += d * d;
      }
      e += fe;
      hi += fh;
      // un "colpo": gli alti del frame saltano di almeno 4 volte rispetto a quello prima
      if (fh > prevFrame * 4 && fh > 1e-7 * frame) hits++;
      prevFrame = fh;
    }
    const n = barLen;
    bars.push({ t: s / sr, rms: db(e / n), low: db(lo / n), high: db(hi / n), hits });
  }
  return { bars, barDur: barLen / sr, first: first / sr };
}

/** Compatibilità: energia per battuta. */
export function barEnergies(x, sr, opts) {
  const { bars, barDur, first } = barFeatures(x, sr, opts);
  return { bars: bars.map((b) => ({ t: b.t, rms: 10 ** (b.rms / 20), low: 10 ** (b.low / 20) })), barDur, first };
}

// quanto pesa ogni differenza (in dB o colpi) per dire "è un altro pezzo"
const SCALE = { rms: 2.5, low: 3, bright: 2, hits: 3 };
const vec = (b) => [b.rms / SCALE.rms, b.low / SCALE.low, b.bright / SCALE.bright, b.hits / SCALE.hits];
const dist = (p, q) => Math.sqrt(p.reduce((s, v, i) => s + (v - q[i]) ** 2, 0));

/**
 * Sezioni del beat: [{ start, end (secondi), kind: 'intro'|'strofa'|'rit'|'break'|'outro', label, bars }].
 * bpm obbligatorio; anchor = primo battito (secondi).
 */
export function beatMap(x, sr, { bpm, anchor = 0 }) {
  if (!bpm || !x?.length) return [];
  const { bars, barDur, first } = barFeatures(x, sr, { bpm, anchor });
  if (bars.length < 8) return [];
  // blocchi di 4 battute
  const blocks = [];
  for (let i = 0; i < bars.length; i += 4) {
    const bb = bars.slice(i, i + 4);
    const b = { i, n: bb.length, rms: mean(bb.map((q) => q.rms)), low: mean(bb.map((q) => q.low)), high: mean(bb.map((q) => q.high)), hits: mean(bb.map((q) => q.hits)) };
    b.bright = b.high - b.rms; // quanto è "brillante" rispetto al volume
    blocks.push(b);
  }
  // l'ultimo blocco a metà (meno di 2 battute) lo attacco al precedente
  if (blocks.length > 2 && blocks[blocks.length - 1].n < 2) {
    const l = blocks.pop();
    blocks[blocks.length - 1].n += l.n;
  }
  const lowMed = median(blocks.map((b) => b.low));
  const rmsMed = median(blocks.map((b) => b.rms));
  // "vuoto": senza cassa/bassi o molto più piano (intro, stacchi, chiusura)
  const quiet = blocks.map((b) => b.low < lowMed - 7.5 || b.rms < rmsMed - 6);

  // confini: dove il blocco cambia "faccia" rispetto a quello prima
  const v = blocks.map(vec);
  // soglia relativa: dentro un pezzo i blocchi si somigliano, quindi un salto "tanto più grande del solito" è un confine
  const steps = blocks.slice(1).map((b, k) => dist(v[k + 1], v[k]));
  const thr = Math.min(1.6, Math.max(1, 3 * median(steps)));
  const cut = blocks.map((b, k) => k > 0 && (quiet[k] !== quiet[k - 1] || dist(v[k], v[k - 1]) > thr));
  // un blocco diverso da solo in mezzo a due uguali tra loro: di solito è un fill, non un pezzo nuovo
  for (let k = 1; k < blocks.length - 1; k++)
    if (cut[k] && cut[k + 1] && !quiet[k] && !quiet[k - 1] && !quiet[k + 1] && dist(v[k - 1], v[k + 1]) < 1.2 && dist(v[k], v[k - 1]) < 3) cut[k] = cut[k + 1] = false;
  const segs = [];
  blocks.forEach((b, k) => {
    if (!segs.length || cut[k]) segs.push({ from: k, to: k, quiet: quiet[k] });
    else segs[segs.length - 1].to = k;
  });
  for (const s of segs) {
    const bl = blocks.slice(s.from, s.to + 1);
    const w = bl.map((b) => b.n);
    const wm = (key) => bl.reduce((acc, b, j) => acc + b[key] * w[j], 0) / w.reduce((p, q) => p + q, 0);
    s.f = { rms: wm('rms'), low: wm('low'), bright: wm('bright'), hits: wm('hits') };
    s.v = vec(s.f);
    s.bars = bl.reduce((p, b) => p + b.n, 0);
    // "pienezza": volume + brillantezza + colpi
    s.full = s.f.rms / SCALE.rms + s.f.bright / SCALE.bright + s.f.hits / SCALE.hits;
  }
  // inizio/fine diversi da tutto il resto, corti e più vuoti: intro e chiusura anche se c'è la cassa
  const edge = (s, others) => {
    if (s.quiet || s.bars > 8 || !others.length) return false;
    const minOther = Math.min(...others.map((o) => o.full));
    return s.full < minOther - 0.4 && others.every((o) => dist(o.v, s.v) >= thr);
  };
  if (segs.length > 1 && edge(segs[0], segs.slice(1).filter((o) => !o.quiet))) segs[0].quiet = true;
  const lastSeg = segs[segs.length - 1];
  if (segs.length > 2 && edge(lastSeg, segs.slice(0, -1).filter((o) => !o.quiet))) lastSeg.quiet = true;
  // raggruppo i pezzi pieni che si somigliano (stesso "tipo")
  const loud = segs.filter((s) => !s.quiet);
  const groups = [];
  for (const s of loud) {
    // stesso tipo se somiglia a uno qualsiasi dei pezzi del gruppo (più vicino che ai pezzi degli altri gruppi)
    let best = null;
    let bestD = Infinity;
    for (const gg of groups)
      for (const o of gg.segs) {
        const d = dist(o.v, s.v);
        if (d < bestD) (bestD = d), (best = gg);
      }
    if (best && bestD < thr) best.segs.push(s);
    else groups.push({ segs: [s] });
  }
  for (const g of groups) {
    g.full = mean(g.segs.map((s) => s.full));
    g.bars = g.segs.reduce((p, s) => p + s.bars, 0);
  }
  // il ritornello è il tipo più pieno, ma deve sembrare un ritornello: pezzi da 4-12 battute,
  // che tornano (o almeno 8 battute) e non metà del beat. Se nessuno lo sembra: tutto strofa (meglio onesti)
  const loudBars = groups.reduce((p, g) => p + g.bars, 0);
  const canBeRit = (g) => g.segs.every((x) => x.bars <= 12) && (g.segs.length >= 2 || g.bars >= 8) && g.bars <= loudBars * 0.6;
  let ritGroup = null;
  if (groups.length >= 2) {
    const byFull = groups.filter(canBeRit).sort((p, q) => q.full - p.full);
    ritGroup = byFull[0] || null;
    // tra due quasi uguali scelgo quello che torna di più a pezzi corti (8 battute)
    if (byFull[1] && byFull[0].full - byFull[1].full < 0.3) {
      const shortness = (g) => g.segs.length / Math.max(1, g.bars / 8);
      if (shortness(byFull[1]) > shortness(byFull[0])) ritGroup = byFull[1];
    }
  }
  const out = segs.map((g, idx) => {
    const start = first + blocks[g.from].i * barDur;
    const end = first + (blocks[g.to].i + blocks[g.to].n) * barDur;
    let kind;
    if (g.quiet) kind = idx === 0 ? 'intro' : idx === segs.length - 1 ? 'outro' : 'break';
    else kind = ritGroup?.segs.includes(g) ? 'rit' : 'strofa';
    return { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, kind, bars: g.bars };
  });
  // due pezzi vicini dello stesso tipo diventano uno
  const merged = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.kind === s.kind) {
      last.end = s.end;
      last.bars += s.bars;
    } else merged.push({ ...s });
  }
  return labelMap(merged);
}

const NAMES = { intro: 'Intro', strofa: 'Strofa', rit: 'Rit', break: 'Stacco', outro: 'Outro' };
export const MAP_KINDS = ['intro', 'strofa', 'rit', 'break', 'outro'];
export const mapKindName = (k) => NAMES[k] || 'Pezzo';

/** Nomi "Strofa 1", "Rit 2"… (solo se ce n'è più d'uno). */
export function labelMap(list) {
  const count = {};
  return list.map((s) => {
    count[s.kind] = (count[s.kind] || 0) + 1;
    const multi = list.filter((o) => o.kind === s.kind).length > 1 && (s.kind === 'strofa' || s.kind === 'rit');
    return { ...s, label: `${NAMES[s.kind]}${multi ? ` ${count[s.kind]}` : ''}` };
  });
}

/** Correzione a mano: cambia il tipo di un pezzo (i vicini uguali si uniscono). */
export function setMapKind(map, idx, kind) {
  const list = map.map((s, i) => ({ ...s, kind: i === idx ? kind : s.kind }));
  const merged = [];
  for (const s of list) {
    const last = merged[merged.length - 1];
    if (last && last.kind === s.kind) {
      last.end = s.end;
      last.bars = (last.bars || 0) + (s.bars || 0);
    } else merged.push({ ...s });
  }
  return labelMap(merged);
}

/** Correzione a mano: divide un pezzo a metà (sul giro di 4 battute più vicino). */
export function splitMap(map, idx, barDur) {
  const s = map[idx];
  if (!s || !barDur) return map;
  const bars = s.bars || Math.round((s.end - s.start) / barDur);
  if (bars < 2) return map;
  const half = bars >= 8 ? Math.round(bars / 2 / 4) * 4 || 4 : Math.floor(bars / 2);
  const mid = Math.round((s.start + half * barDur) * 100) / 100;
  const a = { ...s, end: mid, bars: half };
  const b = { ...s, start: mid, bars: bars - half, kind: s.kind === 'rit' ? 'strofa' : s.kind === 'strofa' ? 'rit' : s.kind };
  return labelMap([...map.slice(0, idx), a, b, ...map.slice(idx + 1)]);
}

/**
 * Correzione a mano: "questo pezzo (da `from` a `to` secondi) è un ritornello".
 * Taglia i pezzi che ci cadono sopra e unisce i vicini dello stesso tipo.
 */
export function assignRange(map, from, to, kind, barDur = 0) {
  if (!(to > from)) return map;
  const r2 = (t) => Math.round(t * 100) / 100;
  const out = [];
  for (const s of map) {
    if (s.end <= from || s.start >= to) {
      out.push({ ...s });
      continue;
    }
    if (s.start < from - 0.05) out.push({ ...s, end: r2(from) });
    if (s.end > to + 0.05) out.push({ ...s, start: r2(to) });
  }
  out.push({ start: r2(from), end: r2(to), kind });
  out.sort((a, b) => a.start - b.start);
  const bars = (s) => (barDur ? Math.max(1, Math.round((s.end - s.start) / barDur)) : s.bars);
  const merged = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.kind === s.kind && Math.abs(last.end - s.start) < 0.1) last.end = s.end;
    else merged.push({ ...s });
  }
  return labelMap(merged.map((s) => ({ ...s, bars: bars(s) })));
}
