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

/** Divide una riga in pezzi: parole (con chiave di rima) e testo intermedio. */
export function tokenizeLine(line) {
  const parts = [];
  let last = 0;
  for (const m of line.matchAll(WORD_RE)) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index), key: null });
    parts.push({ text: m[0], key: rhymeKey(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), key: null });
  return parts;
}

/**
 * Dato tutto il testo, assegna un colore (indice) a ogni chiave
 * che compare almeno 2 volte. Ritorna Map(chiave → indice colore).
 */
export function rhymeColors(text, paletteSize = 12) {
  const counts = new Map();
  const order = [];
  for (const m of text.matchAll(WORD_RE)) {
    const k = rhymeKey(m[0]);
    if (!k) continue;
    if (!counts.has(k)) order.push(k);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const map = new Map();
  let i = 0;
  for (const k of order) if (counts.get(k) >= 2) map.set(k, i++ % paletteSize);
  return map;
}
