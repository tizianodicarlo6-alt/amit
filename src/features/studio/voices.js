// Dalle take salvate alle "voci" da mixare: ritardo, volume, posizione (pan), punch-in.
import { mainIntervals } from './timeline.js';

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
  const mains = placed
    .filter(({ t }) => (t.role || 'main') === 'main')
    .map(({ t, pos }) => {
      const { ts, te } = trimOf(t);
      return { id: t.id, createdAt: t.createdAt, start: pos + Math.max(t.voiceStart || 0, ts), end: pos + Math.min(t.voiceEnd ?? t.duration, te) };
    });
  const intervals = mainIntervals(mains);
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
      active: role === 'main' ? intervals.get(t.id) || [] : null,
    };
  });
}
