// Il testo di una traccia è UN testo unico. Le sezioni si segnano con una riga-titolo:
// "Ritornello", "Strofa 2", "[Rit]", "Intro:"… Da qui ricavo le sezioni (per lo studio) e viceversa.
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

const ALIASES = [
  ['ritornello', /^(rit(ornello)?|hook|chorus|ritor\.?)$/],
  ['strofa', /^(strofa|str\.?|verse|verso)$/],
  ['intro', /^intro$/],
  ['outro', /^outro$/],
  ['bridge', /^(bridge|ponte|special)$/],
];
const LABEL = { intro: 'Intro', strofa: 'Strofa', ritornello: 'Ritornello', bridge: 'Bridge', outro: 'Outro' };

/** Se la riga è un titolo di sezione ritorna il tipo ('ritornello', 'strofa'…), altrimenti null. */
export function headerType(line) {
  let t = String(line || '').trim().toLowerCase();
  if (!t || t.length > 24) return null;
  t = t.replace(/^[[(#*\-–—\s]+|[\])*:\-–—.\s]+$/g, '').trim();
  t = t.replace(/\s*(\d+|[ivx]+)$/i, '').trim(); // "Strofa 2", "Strofa II"
  for (const [type, re] of ALIASES) if (re.test(t)) return type;
  return null;
}

/**
 * Testo → sezioni. Le sezioni tengono il loro id (ritrovato per tipo e ordine) così
 * partenze, loop e melodie salvate per una sezione restano attaccate.
 * Il testo prima del primo titolo è una strofa.
 */
export function parseLyrics(text, prev = [], makeId = newId) {
  const lines = String(text || '').split('\n');
  const out = [];
  let cur = null;
  lines.forEach((l, i) => {
    const type = headerType(l);
    if (type) {
      cur = { type, header: i, lines: [] };
      out.push(cur);
      return;
    }
    if (!cur) {
      if (!l.trim()) return;
      cur = { type: 'strofa', header: -1, lines: [] };
      out.push(cur);
    }
    cur.lines.push(i);
  });
  // id stabili: la n-esima sezione di un tipo prende l'id della n-esima di quel tipo di prima
  const pool = {};
  for (const s of prev) (pool[s.type] ||= []).push(s.id);
  const used = new Set();
  return out.map((s) => {
    const id = (pool[s.type] || []).find((x) => !used.has(x)) || makeId();
    used.add(id);
    const body = s.lines.map((i) => lines[i]);
    while (body.length && !body[body.length - 1].trim()) body.pop();
    while (body.length && !body[0].trim()) body.shift();
    return { id, type: s.type, text: body.join('\n'), header: s.header, from: s.header + 1, to: s.lines.length ? s.lines[s.lines.length - 1] : s.header };
  });
}

/** Sezioni → testo unico (per le tracce scritte prima, a schede). */
export function sectionsToText(sections = []) {
  const list = sections.filter((s) => s.text?.trim() || sections.length > 1);
  if (!list.length) return '';
  if (list.length === 1 && list[0].type === 'strofa') return list[0].text;
  return list.map((s) => `${LABEL[s.type] || 'Strofa'}\n${s.text.trim()}`).join('\n\n');
}

/** La sezione in cui sta la riga `lineIndex` (null se prima di tutto). */
export function sectionAtLine(parsed, lineIndex) {
  let found = null;
  for (const s of parsed) {
    const start = s.header >= 0 ? s.header : s.from;
    if (start <= lineIndex) found = s;
  }
  return found;
}

/** Togli i campi di servizio prima di salvare. */
export const cleanSections = (parsed) => parsed.map(({ id, type, text }) => ({ id, type, text }));
