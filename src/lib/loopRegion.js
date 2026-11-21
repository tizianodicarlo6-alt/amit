// Zona del beat da sentire in loop mentre scrivi: agganciata alle battute.
// Logica pura (testabile senza browser).

/** Griglia: battute da `anchor` (primo battito) lunghe `barDur`. Senza BPM: passi da 0,5 s. */
export function makeGrid({ bpm, anchor = 0, duration }) {
  const barDur = bpm ? 240 / bpm : 0;
  const step = barDur || 0.5;
  // l'inizio della griglia: l'attacco riportato indietro fino vicino a 0
  const a = barDur ? anchor - Math.floor(anchor / step) * step : 0;
  return { step, anchor: a, barDur, duration };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const floorG = (t, g) => g.anchor + Math.floor((t - g.anchor) / g.step + 1e-6) * g.step;
const ceilG = (t, g) => g.anchor + Math.ceil((t - g.anchor) / g.step - 1e-6) * g.step;
const roundG = (t, g) => g.anchor + Math.round((t - g.anchor) / g.step) * g.step;

/** Zona dal punto dove hai appoggiato il dito a quello dove sei arrivato (almeno 1 battuta). */
export function regionFromDrag(t1, t2, g) {
  let from = floorG(Math.min(t1, t2), g);
  let to = ceilG(Math.max(t1, t2), g);
  if (to - from < g.step - 1e-6) to = from + g.step;
  if (from < 0) from += g.step; // prima del primo battito: parto dal primo battito
  if (to - from < g.step - 1e-6) to = from + g.step;
  to = Math.min(g.duration, to);
  if (to - from < 0.2) from = Math.max(0, to - g.step);
  return { from: round3(from), to: round3(to) };
}

/** Sposta tutta la zona di dt secondi (stessa lunghezza). */
export function moveRegion(r, dt, g) {
  const len = r.to - r.from;
  const from = clamp(roundG(r.from + dt, g), g.anchor, Math.max(g.anchor, g.duration - len));
  return { from: round3(from), to: round3(Math.min(g.duration, from + len)) };
}

/** Allarga/stringe da un lato ('from' o 'to'). */
export function resizeRegion(r, side, t, g) {
  if (side === 'from') {
    const from = clamp(roundG(t, g), g.anchor, r.to - g.step);
    return { from: round3(from), to: r.to };
  }
  const to = clamp(roundG(t, g), r.from + g.step, g.duration);
  return { from: r.from, to: round3(Math.min(g.duration, to)) };
}

/** "Batt. 9–16 · 8 battute" (o i secondi se non c'è il BPM). */
export function regionLabel(r, g) {
  if (!r) return '';
  if (!g.barDur) return `${fmt(r.from)}–${fmt(r.to)}`;
  const b1 = Math.round((r.from - g.anchor) / g.barDur) + 1;
  const n = Math.round((r.to - r.from) / g.barDur);
  return `Batt. ${b1}–${b1 + n - 1} · ${n} ${n === 1 ? 'battuta' : 'battute'}`;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const round3 = (v) => Math.round(v * 1000) / 1000;
