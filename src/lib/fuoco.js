// 🔥 Il fuoco: quanto "spacca" tecnicamente ogni riga (rime, multisillabiche, incastri, parole, metrica).
// Non capisce il significato: misura la tecnica. Logica pura, testabile.
import { countLineSyllables, multiKeys, tokenizeLine, vowelSeq } from './italiano.js';

const FILLER = new Set(['yeah', 'yah', 'bro', 'fra', 'frate', 'tipo', 'cioè', 'ehi', 'eh', 'oh', 'skrt', 'uh', 'ah']);
const words = (parts) => parts.filter((p) => p.key || /[a-zàèéìòù]/i.test(p.text)).map((p) => ({ ...p, low: p.text.toLowerCase() }));
const lastWord = (ws) => [...ws].reverse().find((w) => w.key) || null;

/** Le ultime N vocali della riga (per le multisillabiche lunghe). */
const tail = (line, n) => {
  const v = tokenizeLine(line).flatMap((p) => (/[a-zàèéìòù]/i.test(p.text) ? vowelSeq(p.text) : []));
  return v.length >= n ? v.slice(-n).join('') : null;
};

/**
 * Calore di ogni riga: [{ score, level (0-3), why: [...] }].
 * rank: Map(parola → posizione nella lista delle più usate), facoltativa (parole rare = immagini più forti).
 */
export function heatLines(lines, { rank = null } = {}) {
  const parsed = lines.map((l) => {
    const parts = tokenizeLine(l);
    const ws = words(parts);
    const mk = multiKeys(parts).map((m) => m.mkey).filter(Boolean);
    return { line: l, parts, ws, mk, end: lastWord(ws), syl: l.trim() ? countLineSyllables(l) : 0 };
  });
  const sylList = parsed.filter((p) => p.syl).map((p) => p.syl).sort((a, b) => a - b);
  const median = sylList[Math.floor(sylList.length / 2)] || 0;

  return parsed.map((p, i) => {
    if (!p.line.trim()) return { score: 0, level: 0, why: [] };
    let score = 0;
    const why = [];
    const near = [i - 1, i + 1, i - 2, i + 2].map((j) => parsed[j]).filter((q) => q && q.line.trim() && q.line.trim() !== p.line.trim());

    // rima a fine riga con le righe vicine
    if (p.end) {
      if (near.some((q) => q.end && q.end.key === p.end.key && q.end.low !== p.end.low)) (score += 2), why.push('rima');
      else if (near.some((q) => q.end && q.end.akey && q.end.akey === p.end.akey)) (score += 1), why.push('assonanza');
    }
    // multisillabica: la coda della riga torna in un'altra riga (anche dentro)
    const endMk = multiKeys(p.parts).map((m) => m.mkey).filter(Boolean).at(-1);
    if (endMk && parsed.some((q, j) => j !== i && q.mk.includes(endMk))) {
      score += 3;
      why.push('multisillabica');
      const t4 = tail(p.line, 4);
      if (t4 && near.some((q) => tail(q.line, 4) === t4)) (score += 1.5), why.push('multi lunga');
    }
    // rime interne (due parole piene della stessa riga che rimano o suonano uguali)
    const inner = new Map();
    for (const w of p.ws) if (w.key && w !== p.end) inner.set(w.akey, (inner.get(w.akey) || 0) + 1);
    if (p.end?.akey) inner.set(p.end.akey, (inner.get(p.end.akey) || 0) + 1);
    const pairs = [...inner.values()].filter((n) => n >= 2).length;
    if (pairs) (score += Math.min(3, pairs * 1.5)), why.push('rima interna');
    // incastri: parole in mezzo alla riga che rimano con parole della riga prima
    const prev = parsed[i - 1];
    if (prev && prev.line.trim()) {
      const prevKeys = new Set(prev.ws.filter((w) => w.key).map((w) => w.key));
      const inc = p.ws.filter((w) => w.key && w !== p.end && prevKeys.has(w.key)).length;
      if (inc) (score += Math.min(2, inc)), why.push('incastro');
    }
    // parole: rare = immagini più forti; ripetute o riempitivi = più deboli
    if (rank) {
      const rare = p.ws.filter((w) => w.key && w.low.length > 3 && (rank.get(w.low) ?? 99999) > 4000).length;
      if (rare) (score += Math.min(2, rare * 0.6)), why.push('parole forti');
    }
    const seen = new Set();
    let rep = 0;
    for (const w of p.ws) {
      if (!w.key) continue;
      if (seen.has(w.low)) rep++;
      seen.add(w.low);
    }
    if (rep) (score -= rep), why.push('parole ripetute');
    const fill = p.ws.filter((w) => FILLER.has(w.low)).length;
    if (fill) score -= fill * 0.5;
    // metrica: righe molto più lunghe o corte delle altre perdono flow
    if (median && sylList.length >= 3) {
      const d = Math.abs(p.syl - median);
      if (d <= 2) score += 0.5;
      else if (d > 5) (score -= 1), why.push('metrica');
    }
    if (p.syl < 4) score = Math.min(score, 1);
    const level = score >= 6.5 ? 3 : score >= 4 ? 2 : score >= 2 ? 1 : 0;
    return { score: Math.round(score * 10) / 10, level, why };
  });
}

/** Il fuoco della strofa: media delle ultime righe scritte (0-1). */
export function sectionFire(heat, last = 4) {
  const xs = heat.filter((h) => h.score !== 0 || h.why.length).slice(-last);
  if (!xs.length) return 0;
  const avg = xs.reduce((s, h) => s + Math.max(0, h.score), 0) / xs.length;
  return Math.max(0, Math.min(1, avg / 7));
}

