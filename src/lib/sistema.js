// "Butta tutto" → Sistema: dal caos buttato giù sul beat a frasi buone, coppie che rimano, parole forti e temi.
// Logica pura, senza internet.
import { countLineSyllables, tokenizeLine } from './italiano.js';

const STOP = new Set(
  'della delle dello degli nella nelle sulla sulle quando quella quello questo questa questi quelle perché come dove anche ancora sempre tutto tutti tutta niente nessuno sono siamo sei era erano essere fare fatto ogni molto poco cosa cose però quindi allora mentre dentro fuori sopra sotto'.split(' ')
);

/** Spezza il testo buttato in frasi (righe, punti, virgole lunghe). */
export function frasi(text) {
  return text
    .split(/\n|[.!?;]+\s*/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const lastFull = (s) => [...tokenizeLine(s)].reverse().find((p) => p.key) || null;
const content = (s) =>
  tokenizeLine(s)
    .filter((p) => p.key && p.text.length >= 4)
    .map((p) => p.text.toLowerCase())
    .filter((w) => !STOP.has(w));

/**
 * rank: Map parola → posizione tra le più usate (facoltativa, per le parole forti).
 * Ritorna { buone: [frasi], coppie: [[a, b, …]], forti: [parole], temi: [{ parola, volte }] }.
 */
export function sistema(text, { rank = null } = {}) {
  const fs = frasi(text);
  // frasi buone: abbastanza lunghe da essere una barra (6-20 sillabe)
  const buone = fs.filter((f) => {
    const n = countLineSyllables(f);
    return n >= 6 && n <= 20;
  });
  // coppie che rimano: frasi che chiudono con lo stesso suono
  const byEnd = new Map();
  const barre = fs.filter((f) => countLineSyllables(f) >= 4); // le parole sole non fanno coppia
  for (const f of barre) {
    const l = lastFull(f);
    if (!l) continue;
    const k = l.key;
    if (!byEnd.has(k)) byEnd.set(k, []);
    const g = byEnd.get(k);
    // stessa parola finale: tengo la frase più lunga
    const same = g.findIndex((x) => lastFull(x)?.text.toLowerCase() === l.text.toLowerCase());
    if (same < 0) g.push(f);
    else if (f.length > g[same].length) g[same] = f;
  }
  const coppie = [...byEnd.values()].filter((g) => g.length >= 2);
  // assonanze se non ci sono rime piene
  if (!coppie.length) {
    const byAss = new Map();
    for (const f of barre) {
      const l = lastFull(f);
      if (!l?.akey) continue;
      if (!byAss.has(l.akey)) byAss.set(l.akey, []);
      byAss.get(l.akey).push(f);
    }
    coppie.push(...[...byAss.values()].filter((g) => g.length >= 2));
  }
  // temi: parole piene che tornano
  const count = new Map();
  for (const f of fs) for (const w of new Set(content(f))) count.set(w, (count.get(w) || 0) + 1);
  const temi = [...count.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([parola, volte]) => ({ parola, volte }));
  // parole forti: poco comuni (immagini), o che tornano spesso
  const all = [...new Set(fs.flatMap(content))];
  const forti = all
    .filter((w) => (rank ? (rank.get(w) ?? 99999) > 3000 : w.length >= 7))
    .slice(0, 12);
  return { buone, coppie, forti, temi };
}
