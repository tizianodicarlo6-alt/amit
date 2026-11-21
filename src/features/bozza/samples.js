// Suoni caricati dall'utente (one-shot della batteria, 808): li salvo e, per l'808, trovo la nota.
import { db, newId } from '../../db/db.js';
import { pitchTrack } from './pitchTrack.js';

/** Nota (MIDI) di un suono intonato, es. un 808. null se non si capisce. */
export function rootOf(samples, sr) {
  const head = samples.subarray(0, Math.min(samples.length, Math.floor(sr * 1.2))); // la parte iniziale, la più chiara
  const ms = pitchTrack(head, sr, { fmin: 25, fmax: 500, winSec: 0.1 })
    .map((f) => f.midi)
    .filter((m) => m != null)
    .sort((a, b) => a - b);
  return ms.length >= 3 ? Math.round(ms[Math.floor(ms.length / 2)]) : null;
}

/** Salva un file come suono della bozza. part = id batteria (kick, snare…) oppure 'bass'. */
export async function addUserSample(file, part) {
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Off(1, 1, 44100);
  const data = await file.arrayBuffer();
  const buf = await new Promise((ok, ko) => {
    const pr = ctx.decodeAudioData(data.slice(0), ok, ko);
    if (pr && pr.then) pr.then(ok, ko);
  });
  const audioId = newId();
  await db.audio.put({ id: audioId, blob: file, mime: file.type || 'audio/wav', kind: 'sample' });
  const name = file.name.replace(/\.[a-z0-9]{2,4}$/i, '').slice(0, 30);
  const info = { audioId, name };
  if (part === 'bass') info.root = rootOf(buf.getChannelData(0), buf.sampleRate) ?? 36;
  return info;
}
