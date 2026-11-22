// Contatori della prova della v2 (sul telefono): scrittura, idee riprese, blocchi superati.
const KEY = 'amit.stats';
const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { days: {}, ev: [] };
  } catch {
    return { days: {}, ev: [] };
  }
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignorato */
  }
}

/** Hai scritto `n` barre nuove oggi. */
export function addBars(n) {
  if (n <= 0) return;
  const s = read();
  const d = dayKey();
  s.days[d] = (s.days[d] || 0) + n;
  write(s);
}

/** Un evento: 'capture' (idea salvata), 'reuse' (idea ripresa), 'stall' (bloccato), 'unblock' (ripartito). */
export function logEvent(type) {
  const s = read();
  s.ev.push({ t: type, at: Date.now() });
  s.ev = s.ev.slice(-2000);
  write(s);
}

/** Ultima volta che sei rimasto bloccato (per capire se riparti entro 10 minuti). */
export function lastStall() {
  const s = read();
  for (let i = s.ev.length - 1; i >= 0; i--) if (s.ev[i].t === 'stall') return s.ev[i].at;
  return 0;
}

/** I numeri della prova negli ultimi `days` giorni. */
export function trialNumbers(days = 28, now = Date.now()) {
  const s = read();
  const from = now - days * 86400000;
  const last7 = now - 7 * 86400000;
  const daysWriting7 = Object.entries(s.days).filter(([d, n]) => Date.parse(d) >= last7 - 86400000 && n >= 4).length;
  const ev = s.ev.filter((e) => e.at >= from);
  const c = (t) => ev.filter((e) => e.t === t).length;
  return { daysWriting7, capture: c('capture'), reuse: c('reuse'), stall: c('stall'), unblock: c('unblock') };
}
