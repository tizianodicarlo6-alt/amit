// Regole approssimate per l'italiano: sillabe (con sinalefe) e chiavi di rima.
// Logica pura, senza React: si può testare con `npm test`.

const VOWELS = 'aeiouàèéìíòóùú';
const STRONG = new Set([...'aeoàèéìíòóùú']); // vocali che formano sempre un nucleo
const ACCENTED = /[àèéìíòóùú]/;
const isVowel = (c) => c !== undefined && VOWELS.includes(c);

const LETTERS = 'a-zA-ZàèéìíòóùúÀÈÉÌÍÒÓÙÚäëïöüÄËÏÖÜçÇñÑ';
const WORD_RE = new RegExp(`[${LETTERS}]+`, 'g');

// Parole funzionali che non coloriamo (troppo "rumore").
const STOPWORDS = new Set(
  (
    'il lo la i gli le un uno una di a da in con su per tra fra e ed o od ma se ' +
    'che chi non ne ci vi mi ti si è del dello della dei degli delle al allo alla ' +
    'ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle ' +
    'sul sullo sulla sui sugli sulle col coi l dell nell sull all dall quell un ' +
    'c m t s n v d ho ha hai po'
  ).split(' ')
);

/** Minuscole + semplificazioni grafiche (y→i, j→i, h muta, dieresi). */
function basic(word) {
  return word
    .toLowerCase()
    .replace(/[äÄ]/g, 'a')
    .replace(/[ëË]/g, 'e')
    .replace(/[ïÏ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/ç/g, 's')
    .replace(/ñ/g, 'n')
    .replace(/[yj]/g, 'i');
}

/** Gruppi di vocali consecutive: [{start, text}] */
function vowelGroups(s) {
  const groups = [];
  let i = 0;
  while (i < s.length) {
    if (isVowel(s[i])) {
      const start = i;
      while (isVowel(s[i])) i++;
      groups.push({ start, text: s.slice(start, i) });
    } else i++;
  }
  return groups;
}

/** Sillabe in un gruppo di vocali (dittonghi vs iato, i/u tra vocali = consonante). */
function syllablesInGroup(g) {
  let count = 0;
  let cur = '';
  const hasStrong = (x) => [...x].some((c) => STRONG.has(c));
  for (let k = 0; k < g.length; k++) {
    const c = g[k];
    if (STRONG.has(c)) {
      if (hasStrong(cur)) {
        count++; // iato: "pa-e-se", "le-o-ne"
        cur = c;
      } else cur += c;
    } else {
      // i / u: semivocale. Tra due vocali apre una nuova sillaba ("a-iu-to").
      if (hasStrong(cur) && isVowel(g[k + 1])) {
        count++;
        cur = c;
      } else cur += c;
    }
  }
  if (cur) count++;
  return Math.max(1, count);
}

/** Numero di sillabe di una parola (senza sinalefe). */
export function countWordSyllables(word) {
  const s = basic(word).replace(/h/g, '');
  return vowelGroups(s).reduce((n, g) => n + syllablesInGroup(g.text), 0);
}

const startsWithVowel = (w) => isVowel(basic(w).replace(/^h/, '')[0]);
const endsWithVowel = (w) => isVowel(basic(w).at(-1));

/** Sillabe di una riga, con sinalefe semplice tra parole (vocale + vocale). */
export function countLineSyllables(line) {
  const words = [...line.matchAll(WORD_RE)];
  let total = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i][0];
    const n = countWordSyllables(w);
    total += n;
    const next = words[i + 1];
    if (!next || n === 0) continue;
    const between = line.slice(words[i].index + w.length, next.index);
    // Sinalefe solo se le parole sono separate da spazi (no punteggiatura forte).
    if (/^[\s,]*$/.test(between) && between.length > 0 && endsWithVowel(w) && startsWithVowel(next[0]) && countWordSyllables(next[0]) > 0) {
      total -= 1;
    }
  }
  return total;
}

/** Trascrizione "fonetica" semplificata, utile per confrontare i suoni. */
function phonetic(word) {
  const V = 'aeiouàèéìíòóùú';
  let s = basic(word);
  s = s.replace(/ph/g, 'f').replace(/x/g, 'ks').replace(/w/g, 'v').replace(/k/g, 'K');
  s = s.replace(/sch/g, 'sK');
  s = s.replace(new RegExp(`sci(?=[${V}])`, 'g'), 'S').replace(/sc(?=[eèéiìí])/g, 'S');
  s = s.replace(/ch/g, 'K').replace(/gh/g, 'G');
  s = s.replace(new RegExp(`gli(?=[${V}])`, 'g'), 'L').replace(/gli/g, 'Li').replace(/gn/g, 'N');
  s = s.replace(new RegExp(`ci(?=[${V}])`, 'g'), 'C').replace(/c(?=[eèéiìí])/g, 'C');
  s = s.replace(new RegExp(`gi(?=[${V}])`, 'g'), 'J').replace(/g(?=[eèéiìí])/g, 'J');
  s = s.replace(/c/g, 'K').replace(/q/g, 'K').replace(/g/g, 'G').replace(/h/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

/** Indice della vocale accentata (tonica) nella stringa fonetica. */
function stressIndex(s) {
  const acc = s.search(ACCENTED);
  if (acc >= 0) return acc;
  const groups = vowelGroups(s);
  if (groups.length === 0) return -1;
  const firstStrong = (g) => {
    const k = [...g.text].findIndex((c) => STRONG.has(c));
    return g.start + (k >= 0 ? k : 0);
  };
  // Parola che finisce in consonante: tronca ("amor", "cuor", "flow").
  if (!isVowel(s.at(-1))) return firstStrong(groups.at(-1));
  if (groups.length === 1) {
    const g = groups[0];
    // "mio", "tuo", "via": accento sulla prima; "tuoi", "buoi": salta la semivocale.
    return g.text.length >= 3 ? firstStrong(g) : g.start;
  }
  // Default: parola piana (accento sulla penultima sillaba).
  return firstStrong(groups.at(-2));
}

/**
 * Chiave di rima: il suono dalla vocale tonica in poi, normalizzato
 * (accenti tolti, doppie semplificate, consonanti sorde/sonore unite).
 * Ritorna null per parole da ignorare.
 */
export function rhymeKey(word) {
  const lower = basic(word);
  if (lower.length < 2 && !ACCENTED.test(lower)) return null;
  if (STOPWORDS.has(lower)) return null;
  const s = phonetic(word);
  const idx = stressIndex(s);
  if (idx < 0) return null;
  const key = s
    .slice(idx)
    .replace(/à/g, 'a')
    .replace(/[èé]/g, 'e')
    .replace(/[ìí]/g, 'i')
    .replace(/[òó]/g, 'o')
    .replace(/[ùú]/g, 'u')
    .replace(/d/g, 't')
    .replace(/b/g, 'p')
    .replace(/G/g, 'K')
    .replace(/v/g, 'f')
    .replace(/z/g, 's')
    .replace(/J/g, 'C')
    .replace(/(.)\1+/g, '$1');
  return key || null;
}

/**
 * Chiave di assonanza: solo le vocali dalla tonica in poi
 * (es. "notte" → "oe", "amore" → "oe", "strada" → "aa").
 */
export function assonanceKey(word) {
  const k = rhymeKey(word);
  if (!k) return null;
  return k.replace(/[^aeiou]/g, '') || null;
}

/** Divide una riga in pezzi: parole (con chiavi di rima e assonanza) e testo intermedio. */
export function tokenizeLine(line) {
  const parts = [];
  let last = 0;
  for (const m of line.matchAll(WORD_RE)) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index), key: null, akey: null });
    parts.push({ text: m[0], key: rhymeKey(m[0]), akey: assonanceKey(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), key: null, akey: null });
  return parts;
}

function countKeys(text, keyFn) {
  const counts = new Map();
  for (const m of text.matchAll(WORD_RE)) {
    const k = keyFn(m[0]);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts; // Map mantiene l'ordine di prima apparizione
}

function colorMap(counts, paletteSize) {
  const map = new Map();
  let i = 0;
  for (const [k, n] of counts) if (n >= 2) map.set(k, i++ % paletteSize);
  return map;
}

/** Rime perfette: Map(chiave → indice colore) per le chiavi che compaiono almeno 2 volte. */
export function rhymeColors(text, paletteSize = 12) {
  return colorMap(countKeys(text, rhymeKey), paletteSize);
}

/**
 * Analisi completa per l'editor.
 * mode "rime": colora le rime perfette.
 * mode "assonanze": colora per vocali; le rime perfette restano "piene", le sole assonanze sottolineate.
 * Ritorna { colors, exact, groupKey(part), stats: { rime, assonanze } }.
 */
export function analyzeRhymes(text, mode = 'rime', paletteSize = 12) {
  const exactCounts = countKeys(text, rhymeKey);
  const exact = new Set([...exactCounts].filter(([, n]) => n >= 2).map(([k]) => k));
  const assCounts = countKeys(text, assonanceKey);
  const colors = mode === 'assonanze' ? colorMap(assCounts, paletteSize) : colorMap(exactCounts, paletteSize);
  const groupKey = (p) => (mode === 'assonanze' ? p.akey : p.key);
  // Gruppi di assonanza che contengono almeno 2 parole che NON rimano perfettamente tra loro.
  const assGroups = new Map();
  for (const m of text.matchAll(WORD_RE)) {
    const a = assonanceKey(m[0]);
    if (!a || assCounts.get(a) < 2) continue;
    if (!assGroups.has(a)) assGroups.set(a, new Set());
    assGroups.get(a).add(rhymeKey(m[0]));
  }
  const stats = {
    rime: exact.size,
    assonanze: [...assGroups.values()].filter((set) => set.size >= 2).length,
  };
  return { colors, exact, groupKey, stats };
}

// ---------- Vocali delle sillabe e rime multisillabiche ----------

const plainV = (c) => ({ à: 'a', è: 'e', é: 'e', ì: 'i', í: 'i', ò: 'o', ó: 'o', ù: 'u', ú: 'u' })[c] || c;

/** Le vocali "che si sentono", una per sillaba: "fantasma" → ['a','a','a'], "ciao" → ['a','o']. */
export function vowelSeq(word) {
  const s = phonetic(word);
  const out = [];
  for (const g of vowelGroups(s)) {
    const n = syllablesInGroup(g.text);
    const strong = [...g.text].filter((c) => STRONG.has(c));
    if (n === 1) out.push(plainV(strong[0] || g.text.at(-1)));
    else if (strong.length === n) out.push(...strong.map(plainV));
    else {
      // "a-iu-to": la prima forte e poi l'ultima del gruppo
      const parts = [strong[0] || g.text[0]];
      for (let k = 1; k < n; k++) parts.push(g.text.at(-1));
      out.push(...parts.map(plainV));
    }
  }
  return out;
}

/**
 * Chiavi multisillabiche di una riga (parti di tokenizeLine): per ogni parola "piena",
 * le ultime vocali della riga fino a lì (almeno 3, e almeno quelle dalla tonica in poi).
 * Ritorna per ogni parte { mkey, from } (from = indice della parte dove inizia la rima).
 */
export function multiKeys(parts) {
  const seq = []; // { v, part }
  return parts.map((p, i) => {
    if (p.key == null && !/[a-zàèéìòù]/i.test(p.text)) return { mkey: null, from: i };
    for (const v of vowelSeq(p.text)) seq.push({ v, part: i });
    if (!p.akey) return { mkey: null, from: i };
    const n = Math.max(3, p.akey.length);
    if (seq.length < n) return { mkey: null, from: i };
    const tail = seq.slice(-n);
    return { mkey: tail.map((x) => x.v).join(''), from: tail[0].part };
  });
}

/** Colori delle rime multisillabiche in tutto il testo: Map(chiave → colore) per chi compare ≥ 2 volte. */
export function multiColors(text, paletteSize = 12) {
  const counts = new Map();
  for (const line of text.split('\n')) {
    const seen = new Set();
    for (const { mkey } of multiKeys(tokenizeLine(line))) {
      if (!mkey || seen.has(mkey)) continue;
      seen.add(mkey);
      counts.set(mkey, (counts.get(mkey) || 0) + 1);
    }
  }
  return colorMap(counts, paletteSize);
}
