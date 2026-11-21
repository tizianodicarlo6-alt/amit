// Dalle take salvate alle "voci" da mixare: ritardo, volume, posizione (pan), punch-in.

const dbToGain = (db) => Math.pow(10, db / 20);
export const trimOf = (t) => ({ ts: t.trimStart ?? 0, te: t.trimEnd ?? t.duration });

// Ritardo di partenza se non l'hai ancora misurato (secondi)
export const DEFAULT_LAT = { speaker: 0.12, headphones: 0.04 };

export function takeLatency(take, lat = {}) {
  const m = take.mode || 'headphones';
  return lat[m] ?? DEFAULT_LAT[m];
}

// Come suona ogni ruolo nel mix
const ROLE_MIX = {
  main: { gain: 1, pans: [0] },
  double: { gain: 0.45, pans: [-0.35, 0.35] }, // doppie: più basse, aperte a sinistra/destra
  adlib: { gain: 0.55, pans: [0.5, -0.5] }, // adlib: di lato
};

/**
 * takes: take con `.buffer` già caricato.
 * only: se presente, usa solo queste take (anche se spente nel mix).
 */
export function buildVoices(takes, { lat = {}, voiceGain = 1, only = null } = {}) {
  const chosen = takes.filter((t) => (only ? only.includes(t.id) : t.included !== false));
  const placed = chosen.map((t) => ({ t, pos: t.offset - takeLatency(t, lat) }));
  const count = { main: 0, double: 0, adlib: 0 };
  return placed.map(({ t, pos }) => {
    const role = t.role || 'main';
    const cfg = ROLE_MIX[role] || ROLE_MIX.main;
    const pan = cfg.pans[count[role]++ % cfg.pans.length];
    const { ts, te } = trimOf(t);
    return {
      id: t.id,
      role,
      buffer: t.buffer,
      pos,
      trimStart: ts,
      trimEnd: te,
      gain: cfg.gain * voiceGain * dbToGain(t.gainDb || 0),
      pan,
      active: null, // ogni take suona per intero (nel suo taglio): niente coperture automatiche
    };
  });
}

/**
 * Nomi chiari per le take: "Voce 1", "Voce 2", "Doppia 1", "Adlib 1"…
 * I pezzi nati da un "taglia qui" (stessa registrazione) hanno lo stesso numero + "B", "C"…
 */
export function takeLabels(takes) {
  const names = { main: 'Voce', double: 'Doppia', adlib: 'Adlib' };
  const sorted = [...takes].sort((a, b) => a.createdAt - b.createdAt || (a.trimStart || 0) - (b.trimStart || 0));
  const num = new Map(); // audioId → numero
  const count = { main: 0, double: 0, adlib: 0 };
  const pieces = new Map(); // audioId → quanti pezzi visti
  const out = new Map();
  for (const t of sorted) {
    const role = t.role || 'main';
    const key = `${role}:${t.audioId}`;
    if (!num.has(key)) num.set(key, ++count[role]);
    const k = (pieces.get(key) || 0) + 1;
    pieces.set(key, k);
    out.set(t.id, `${names[role]} ${num.get(key)}${k > 1 ? String.fromCharCode(64 + k) : ''}`);
  }
  return out;
}
