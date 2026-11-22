// 👻 Barra fantasma: quando sei bloccato, una tua vecchia barra che sta bene per continuare.
// Logica pura (testabile): sceglie tra le barre dell'archivio quelle che rimano e suonano giuste.
import { countLineSyllables, tokenizeLine, vowelSeq } from './italiano.js';

const STOP = new Set('della delle dello degli nella nelle sulla sulle quando quella quello questo questa perché come dove anche ancora sempre tutto tutti tutta niente nessuno'.split(' '));
const contentWords = (line) =>
  tokenizeLine(line)
    .filter((p) => p.key && p.text.length >= 4)
    .map((p) => p.text.toLowerCase())
    .filter((w) => !STOP.has(w));
const lastFull = (line) => [...tokenizeLine(line)].reverse().find((p) => p.key) || null;
const tail3 = (line) => {
  const v = tokenizeLine(line).flatMap((p) => (/[a-zàèéìòù]/i.test(p.text) ? vowelSeq(p.text) : []));
  return v.length >= 3 ? v.slice(-3).join('') : null;
};

/**
 * Archivio di barre: [{ text, from: 'nota' | 'traccia', ref, title }] da note e tracce.
 * Righe brevi (meno di 5 sillabe) e righe di sezione tipo "[Ritornello]" non contano.
 */
export function buildArchive({ ideas = [], tracks = [] }) {
  const out = [];
  const seen = new Set();
  const add = (line, from, ref, title) => {
    const t = line.trim();
    if (!t || t.startsWith('[') || t.startsWith('Sfida:') || t.startsWith('💡') || seen.has(t.toLowerCase())) return;
    if (countLineSyllables(t) < 5) return;
    seen.add(t.toLowerCase());
    out.push({ text: t, from, ref, title });
  };
  for (const i of ideas) if (i.type !== 'voice' && i.text) for (const l of i.text.split('\n')) add(l, 'nota', i.id, i.title || '');
  for (const tr of tracks) for (const s of tr.sections || []) for (const l of (s.text || '').split('\n')) add(l, 'traccia', tr.id, tr.title || '');
  return out;
}

/**
 * Le barre migliori per continuare `lines` (il testo che stai scrivendo), dopo la riga `at`.
 * exclude = id della nota/traccia aperta (le sue barre non si propongono).
 * Ritorna [{ text, from, title, score, why }] dalla migliore.
 */
export function suggestGhost(archive, lines, at, { exclude = null, limit = 8 } = {}) {
  const written = lines.filter((l) => l.trim());
  // la riga a cui agganciarsi: quella dove sei, o l'ultima piena prima
  let ref = '';
  for (let i = Math.min(at, lines.length - 1); i >= 0; i--)
    if (lines[i]?.trim()) {
      ref = lines[i];
      break;
    }
  const refLast = ref ? lastFull(ref) : null;
  const refT3 = ref ? tail3(ref) : null;
  const refSyl = ref ? countLineSyllables(ref) : 10;
  const theme = new Set(written.flatMap(contentWords));
  const already = new Set(written.map((l) => l.trim().toLowerCase()));

  const scored = [];
  for (const c of archive) {
    if (c.ref === exclude || already.has(c.text.toLowerCase())) continue;
    let score = 0;
    const why = [];
    const last = lastFull(c.text);
    if (refLast && last && last.text.toLowerCase() !== refLast.text.toLowerCase()) {
      if (last.key === refLast.key) (score += 3), why.push('rima');
      else if (last.akey && last.akey === refLast.akey) (score += 2), why.push('assonanza');
      if (refT3 && tail3(c.text) === refT3) (score += 1.5), why.push('multisillabica');
    }
    const shared = contentWords(c.text).filter((w) => theme.has(w)).length;
    if (shared) (score += Math.min(2, shared)), why.push('stesso tema');
    score -= Math.abs(countLineSyllables(c.text) - refSyl) * 0.25; // metrica simile
    if (score > 0.5) scored.push({ ...c, score: Math.round(score * 10) / 10, why });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
