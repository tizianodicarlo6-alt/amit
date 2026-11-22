// Livello e mana dei soci. Ogni provino chiuso = +1 livello.
// Il mana premia quanto sono tecniche le strofe (fuoco delle quartine) e difficile la melodia (nanana).
import { quartine } from './fuoco.js';

export const EMPTY = { provini: 0, mana: 0, log: [] };
export const levelOf = (p) => 1 + (p?.provini || 0);

/** Quanto è difficile una melodia: frasi e sillabe al secondo del nanana scelto. */
export function melodyMana(take) {
  const ph = take?.phrases || [];
  if (!ph.length) return 0;
  const syl = ph.reduce((s, p) => s + p.syllables, 0);
  const dur = ph.reduce((s, p) => s + Math.max(0.2, p.end - p.start), 0);
  const sps = syl / dur; // sillabe al secondo: più è alto, più è serrato
  return Math.min(40, Math.round(ph.length * 3 + sps * 5));
}

/** Mana di un provino: { total, strofe, melodia, base, quartine: n, fuoco: [livelli] } */
export function provinoMana(track, { rank = null } = {}) {
  const levels = (track.sections || []).flatMap((s) => quartine(s.text || '', { rank }).map((q) => q.level));
  const strofe = levels.reduce((s, l) => s + l * 10, 0);
  const takes = Object.values(track.studio?.melodies || {})
    .map((m) => m.takes?.find((t) => t.id === m.sel) || m.takes?.[m.takes.length - 1])
    .filter(Boolean);
  const melodia = takes.reduce((s, t) => s + melodyMana(t), 0);
  const base = 20;
  return { total: base + strofe + melodia, strofe, melodia, base, quartine: levels.length, fuoco: levels };
}

/** Aggiunge un provino chiuso ai progressi. */
export function addProvino(progress, track, mana) {
  const p = progress || EMPTY;
  return {
    provini: p.provini + 1,
    mana: p.mana + mana.total,
    log: [...(p.log || []), { trackId: track.id, title: track.title, at: Date.now(), mana: mana.total }].slice(-100),
  };
}

/** Settimana (lunedì-domenica) in formato "2026-11-16" = il lunedì. */
export function weekKey(ts = Date.now()) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // 0 = lunedì
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** I numeri di questa settimana: provini chiusi e mana presi. */
export function weekStats(progress, now = Date.now()) {
  const wk = weekKey(now);
  const log = (progress?.log || []).filter((e) => weekKey(e.at) === wk);
  return { week: wk, provini: log.length, mana: log.reduce((s, e) => s + (e.mana || 0), 0), level: levelOf(progress), totalMana: progress?.mana || 0 };
}
