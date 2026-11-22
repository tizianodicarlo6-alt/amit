// Rimario: parole che rimano con quella che hai scelto (rime, assonanze, multisillabiche).
// Le parole (circa 34.000, dalle più usate) si scaricano una volta e poi restano offline.
import { assonanceKey, rhymeKey, vowelSeq } from './italiano.js';

let indexP = null;

/** Indice delle parole: per chiave di rima, di assonanza e per le ultime 3 vocali. */
export function buildIndex(words) {
  const rime = new Map();
  const ass = new Map();
  const tail3 = new Map();
  const add = (m, k, w) => {
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(w);
  };
  for (const w of words) {
    add(rime, rhymeKey(w), w);
    add(ass, assonanceKey(w), w);
    const v = vowelSeq(w);
    if (v.length >= 3) add(tail3, v.slice(-3).join(''), w);
  }
  return { rime, ass, tail3 };
}

export function loadIndex() {
  if (!indexP) {
    indexP = fetch(`${import.meta.env.BASE_URL}words-it.txt`)
      .then((r) => {
        if (!r.ok) throw new Error('rimario non disponibile');
        return r.text();
      })
      .then((t) => buildIndex(t.split('\n').filter(Boolean)))
      .catch((e) => {
        indexP = null;
        throw e;
      });
  }
  return indexP;
}

/**
 * Suggerimenti per `word` (prev = parola prima nella riga, per le multisillabiche).
 * Ritorna { rime, assonanze, multi, target } con le parole più usate per prime.
 */
export function suggest(index, word, prev = '', limit = 60) {
  const w = word.toLowerCase();
  const rk = rhymeKey(w);
  const ak = assonanceKey(w);
  const rime = (index.rime.get(rk) || []).filter((x) => x !== w).slice(0, limit);
  const rSet = new Set(rime);
  const assonanze = (index.ass.get(ak) || []).filter((x) => x !== w && !rSet.has(x)).slice(0, limit);
  // multisillabica: le ultime 3 vocali (anche prendendo dalla parola prima)
  const seq = [...vowelSeq(prev), ...vowelSeq(w)];
  const target = seq.length >= 3 ? seq.slice(-3) : null;
  const multi = target ? (index.tail3.get(target.join('')) || []).filter((x) => x !== w && !rSet.has(x)).slice(0, limit) : [];
  return { rime, assonanze, multi, target: target ? target.join('·') : null };
}

/** La parola sotto il cursore e quella prima (nella stessa riga). */
export function wordAt(text, pos) {
  const re = /[a-zA-ZàèéìíòóùúÀÈÉÌÍÒÓÙÚ]+/g;
  const lineStart = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  const lineEnd = text.indexOf('\n', pos) === -1 ? text.length : text.indexOf('\n', pos);
  const line = text.slice(lineStart, lineEnd);
  const rel = pos - lineStart;
  const words = [...line.matchAll(re)];
  let k = words.findIndex((m) => rel >= m.index && rel <= m.index + m[0].length);
  if (k < 0) {
    // cursore dopo l'ultima parola della riga (es. a fine riga): prendo quella prima
    for (let j = words.length - 1; j >= 0; j--)
      if (words[j].index < rel) {
        k = j;
        break;
      }
  }
  if (k < 0) return { word: '', prev: '' };
  return { word: words[k][0], prev: k > 0 ? words[k - 1][0] : '' };
}
