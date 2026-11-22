// La "mappa" del testo sul beat: quando parte ogni sezione e ogni barra.
import { sectionLabel } from '../../constants.js';

/**
 * sections: le sezioni della traccia (con testo)
 * starts:   { [sectionId]: secondi } — partenze segnate a mano (facoltative)
 * attack:   secondi dove parte il testo se la prima sezione non è segnata
 * barDur:   durata di una battuta (4 battiti) in secondi
 * barsPerLine: battute per ogni barra di testo (di solito 1)
 * snapBars: se > 0, una sezione senza partenza segnata attacca sul prossimo giro di N battute
 *           (i pezzi del beat cambiano ogni 4/8 battute: una strofa di 14 barre lascia 2 battute di pausa)
 * firstFromMap: la prima sezione parte dal primo pezzo del beat dello stesso tipo (se l'attacco non è segnato)
 * map:      la mappa del beat [{ start, kind }]: se c'è un pezzo dello stesso tipo poco più avanti, attacco lì
 */
const MAP_KIND = { ritornello: 'rit', strofa: 'strofa', intro: 'intro', outro: 'outro', bridge: 'break' };

export function buildTimeline(sections = [], { starts = {}, attack = 0, barDur = 2.4, barsPerLine = 1, snapBars = 0, map = null, firstFromMap = false } = {}) {
  const lineDur = barDur * barsPerLine;
  const lines = [];
  const blocks = [];
  let cursor = attack;
  const seen = {};
  const totals = {};
  for (const s of sections) totals[s.type] = (totals[s.type] || 0) + 1;
  for (const s of sections) {
    const texts = s.text.split('\n').filter((l) => l.trim());
    if (!texts.length) continue;
    seen[s.type] = (seen[s.type] || 0) + 1;
    const explicit = starts[s.id] != null;
    let start = explicit ? starts[s.id] : cursor;
    if (!explicit && snapBars && blocks.length && barDur) {
      const g = snapBars * barDur;
      const a0 = blocks[0].start; // il giro parte da dove attacca il testo
      start = a0 + Math.ceil((cursor - a0) / g - 1e-3) * g;
    }
    if (!explicit && map?.length && (blocks.length || firstFromMap)) {
      const want = MAP_KIND[s.type];
      // la prima sezione (attacco non segnato): il primo pezzo di quel tipo nel beat
      const m = blocks.length ? map.find((x) => x.kind === want && x.start >= cursor - barDur * 0.5 && x.start <= cursor + 8 * barDur) : map.find((x) => x.kind === want);
      if (m) start = m.start;
    }
    const label = `${sectionLabel(s.type)}${totals[s.type] > 1 ? ` ${seen[s.type]}` : ''}`;
    const first = lines.length;
    texts.forEach((text, j) => lines.push({ index: lines.length, sectionId: s.id, text, time: start + j * lineDur }));
    const end = start + texts.length * lineDur;
    blocks.push({ id: s.id, type: s.type, label, start, end, explicit, first, count: texts.length });
    cursor = end;
  }
  return { lines, blocks, lineDur };
}

/** Riga da evidenziare al tempo t (-1 se siamo in un'intro o in una pausa tra sezioni). */
export function lineAt(t, timeline) {
  const { lines, lineDur } = timeline;
  let found = -1;
  for (const l of lines) {
    if (l.time <= t + 0.05) found = l.index;
    else break;
  }
  if (found < 0) return -1;
  // finita la riga e la prossima non è ancora iniziata → pausa
  const next = lines[found + 1];
  if (t >= lines[found].time + lineDur && (!next || next.time > t)) return -1;
  return found;
}

/** Prossima sezione che deve ancora partire (per il conto alla rovescia). */
export function nextBlockAfter(t, timeline) {
  return timeline.blocks.find((b) => b.start > t + 0.05) || null;
}

/** Aggancia un tempo al battito più vicino della griglia (ancora = attacco). */
/** L'ultimo battito del beat (griglia che parte da `anchor`) che cade a `t` o prima. */
export function onBeatBefore(t, anchor, beatDur) {
  if (!beatDur) return t;
  let b = anchor + Math.floor((t - anchor) / beatDur + 1e-6) * beatDur;
  while (b < 0) b += beatDur;
  return b;
}

export function snapToBeat(t, anchor, beatDur) {
  if (!beatDur) return t;
  return Math.max(0, anchor + Math.round((t - anchor) / beatDur) * beatDur);
}

/**
 * Voce principale registrata in più take ("punch-in"): dove due take si sovrappongono
 * vince la più recente. takes: [{ id, start, end, createdAt }] (start/end nel tempo del beat).
 * Ritorna Map(id → [[inizio, fine], …]) con le parti che suonano di ogni take.
 */
export function mainIntervals(takes) {
  const sorted = [...takes].sort((a, b) => b.createdAt - a.createdAt); // dalla più nuova
  const covered = [];
  const out = new Map();
  for (const t of sorted) {
    let parts = [[t.start, t.end]];
    for (const [cs, ce] of covered) {
      const next = [];
      for (const [s, e] of parts) {
        if (ce <= s || cs >= e) next.push([s, e]);
        else {
          if (cs > s) next.push([s, cs]);
          if (ce < e) next.push([ce, e]);
        }
      }
      parts = next;
    }
    out.set(t.id, parts.filter(([s, e]) => e - s > 0.05));
    covered.push([t.start, t.end]);
  }
  return out;
}
