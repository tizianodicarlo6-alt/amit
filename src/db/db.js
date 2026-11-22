import Dexie from 'dexie';

// Database locale (IndexedDB) sul telefono.
export const db = new Dexie('amit');

db.version(1).stores({
  // Fase 1
  ideas: 'id, createdAt, updatedAt, trackId, *tags', // idee del taccuino
  audio: 'id', // note vocali come Blob: { id, blob, mime }
  projects: 'id, createdAt, updatedAt', // album / EP / singoli
  tracks: 'id, projectId, status, createdAt, updatedAt', // tracce
  meta: 'key', // impostazioni varie (es. ultimo backup)
  // Fase 2 (già pronte, per ora vuote)
  beats: 'id, createdAt',
  takes: 'id, trackId, createdAt',
});
// Fase "Crea bozza": idee di beat da mandare al produttore
db.version(2).stores({
  sketches: 'id, createdAt, updatedAt',
});

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const now = () => Date.now();

// ---------- Ricollegamento automatico ----------
// Safari su iPhone a volte "stacca" il database (es. quando chiede il microfono
// o quando l'app torna dal background). In quel caso lo riapriamo e riproviamo.
const RECOVERABLE_NAMES = /UnknownError|InvalidStateError|DatabaseClosedError|TransactionInactiveError|AbortError/;
export const isRecoverable = (e) =>
  RECOVERABLE_NAMES.test(e?.name || '') || /cursor|connection|server lost|closed/i.test(e?.message || '');

let epoch = 0;
let recovering = null;
const listeners = new Set();
export const getEpoch = () => epoch;
export const subscribeEpoch = (l) => (listeners.add(l), () => listeners.delete(l));

export function recoverDb() {
  if (!recovering) {
    recovering = (async () => {
      try {
        db.close({ disableAutoOpen: false });
      } catch {
        /* ignorato */
      }
      await db.open();
      epoch++;
      listeners.forEach((l) => l());
    })().finally(() => {
      recovering = null;
    });
  }
  return recovering;
}

/** Esegue un'operazione sul database; se Safari l'ha staccato, ricollega e riprova una volta. */
export async function withDb(fn) {
  try {
    return await fn();
  } catch (e) {
    if (!isRecoverable(e)) throw e;
    await recoverDb();
    return await fn();
  }
}

// Quando l'app torna in primo piano, controlla che il database risponda.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') withDb(() => db.meta.get('ping')).catch(() => {});
  });
}

// ---------- Idee ----------
async function addIdeaRaw({ type, text = '', blob, mime, duration = 0, tags = [], trackId = null }) {
  const id = newId();
  let audioId = null;
  await db.transaction('rw', db.ideas, db.audio, async () => {
    if (type === 'voice' && blob) {
      audioId = newId();
      await db.audio.put({ id: audioId, blob, mime: mime || blob.type });
    }
    await db.ideas.put({ id, type, text, audioId, duration, tags, trackId, createdAt: now(), updatedAt: now() });
  });
  requestPersistence();
  return id;
}

const updateIdeaRaw = (id, changes) => db.ideas.update(id, { ...changes, updatedAt: now() });

async function deleteIdeaRaw(id) {
  const idea = await db.ideas.get(id);
  await db.transaction('rw', db.ideas, db.audio, async () => {
    if (idea?.audioId) await db.audio.delete(idea.audioId);
    await db.ideas.delete(id);
  });
}

// ---------- Progetti ----------
async function addProjectRaw({ name, kind = 'album' }) {
  const id = newId();
  await db.projects.put({ id, name, kind, notes: '', createdAt: now(), updatedAt: now() });
  requestPersistence();
  return id;
}

const updateProjectRaw = (id, changes) => db.projects.update(id, { ...changes, updatedAt: now() });

async function deleteProjectRaw(id) {
  // Le tracce non vengono cancellate: restano "senza progetto".
  await db.transaction('rw', db.projects, db.tracks, async () => {
    await db.tracks.where('projectId').equals(id).modify({ projectId: null });
    await db.projects.delete(id);
  });
}

// ---------- Tracce ----------
export const newSection = (type = 'strofa') => ({ id: newId(), type, text: '' });

async function addTrackRaw({ title = 'Nuova traccia', projectId = null } = {}) {
  const id = newId();
  const order = projectId ? await db.tracks.where('projectId').equals(projectId).count() : 0;
  await db.tracks.put({
    id,
    title,
    status: 'idea',
    bpm: null,
    notes: '',
    projectId,
    order,
    sections: [newSection('strofa')],
    createdAt: now(),
    updatedAt: now(),
  });
  requestPersistence();
  return id;
}

const updateTrackRaw = (id, changes) => db.tracks.update(id, { ...changes, updatedAt: now() });

async function deleteTrackRaw(id) {
  await db.transaction('rw', db.tracks, db.ideas, db.takes, db.audio, async () => {
    await db.ideas.where('trackId').equals(id).modify({ trackId: null });
    const takes = await db.takes.where('trackId').equals(id).toArray();
    await db.audio.bulkDelete(takes.map((t) => t.audioId));
    await db.takes.where('trackId').equals(id).delete();
    await db.tracks.delete(id);
  });
}

// ---------- Beat ----------
// Il file audio sta nella tabella "audio", qui solo i dati (leggeri da elencare).
async function addBeatRaw({ blob, mime, title, producer = '', bpm = null, key = '', auto = {}, duration = 0, peaks = [] }) {
  const id = newId();
  const audioId = newId();
  await db.transaction('rw', db.beats, db.audio, async () => {
    await db.audio.put({ id: audioId, blob, mime: mime || blob.type, kind: 'beat' });
    await db.beats.put({ id, audioId, title, producer, bpm, key, auto, tags: [], duration, peaks, size: blob.size, createdAt: now(), updatedAt: now() });
  });
  requestPersistence();
  return id;
}

const updateBeatRaw = (id, changes) => db.beats.update(id, { ...changes, updatedAt: now() });

async function deleteBeatRaw(id) {
  const beat = await db.beats.get(id);
  await db.transaction('rw', db.beats, db.audio, db.tracks, async () => {
    await db.tracks.filter((t) => t.beatId === id).modify({ beatId: null });
    if (beat?.audioId) await db.audio.delete(beat.audioId);
    await db.beats.delete(id);
  });
}

// ---------- Take (registrazioni dello studio) ----------
async function addTakeRaw({ trackId, beatId = null, blob, offset = 0, duration = 0, sr = 48000, role = 'main', mode = 'speaker', voiceStart = 0, voiceEnd = null }) {
  const id = newId();
  const audioId = newId();
  const n = (await db.takes.where('trackId').equals(trackId).count()) + 1;
  await db.transaction('rw', db.takes, db.audio, async () => {
    await db.audio.put({ id: audioId, blob, mime: 'audio/wav', kind: 'take' });
    await db.takes.put({
      id,
      trackId,
      beatId,
      audioId,
      offset,
      duration,
      sr,
      role, // main | double | adlib
      mode, // speaker | headphones (serve per il ritardo da compensare)
      included: true, // suona nel mix
      voiceStart, // dove inizia davvero la voce (secondi dall'inizio della take)
      voiceEnd: voiceEnd ?? duration,
      trimStart: 0, // taglio: da dove suona (secondi dentro la take)
      trimEnd: duration, // taglio: fin dove suona
      pitch: 0, // semitoni (−12…+12)
      gainDb: 0, // volume della singola take
      name: `Take ${n}`,
      favorite: false,
      createdAt: now(),
    });
  });
  requestPersistence();
  return { id, audioId };
}

const updateTakeRaw = (id, changes) => db.takes.update(id, changes);

async function deleteTakeRaw(id) {
  const take = await db.takes.get(id);
  await db.transaction('rw', db.takes, db.audio, async () => {
    await db.takes.delete(id);
    // l'audio lo cancello solo se nessun altro pezzo (dopo un "taglia") lo usa ancora
    const others = take?.audioId ? await db.takes.filter((t) => t.audioId === take.audioId).count() : 0;
    if (take?.audioId && !others) await db.audio.delete(take.audioId);
  });
}

/** Taglia una take in due nel punto `at` (secondi dentro la take). */
async function splitTakeRaw(id, at) {
  const t = await db.takes.get(id);
  if (!t) return null;
  const ts = t.trimStart ?? 0;
  const te = t.trimEnd ?? t.duration;
  if (at <= ts + 0.05 || at >= te - 0.05) return null;
  const newId = newId_();
  await db.transaction('rw', db.takes, async () => {
    await db.takes.update(id, { trimEnd: at });
    await db.takes.put({ ...t, id: newId, trimStart: at, trimEnd: te, name: `${t.name} B` });
  });
  return newId;
}
const newId_ = () => newId();

// ---------- Bozze di beat ----------
async function addSketchRaw(data) {
  const id = newId();
  const n = (await db.sketches.count()) + 1;
  await db.sketches.put({ title: `Bozza ${n}`, ...data, id, createdAt: now(), updatedAt: now() });
  requestPersistence();
  return id;
}
const updateSketchRaw = (id, changes) => db.sketches.update(id, { ...changes, updatedAt: now() });
const deleteSketchRaw = (id) => db.sketches.delete(id);

// ---------- Meta ----------
const getMetaRaw = async (key) => (await db.meta.get(key))?.value;
const setMetaRaw = (key, value) => db.meta.put({ key, value });

// Chiede al browser di non cancellare i dati quando lo spazio è poco.
let persistAsked = false;
export async function requestPersistence() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* ignorato */
  }
}

// ---------- Funzioni esportate (con ricollegamento automatico) ----------
export const addIdea = (...args) => (logCapture(), withDb(() => addIdeaRaw(...args)));
const logCapture = () => {
  try {
    import('../lib/stats.js').then((m) => m.logEvent('capture'));
  } catch {
    /* ignorato */
  }
};
export const updateIdea = (...args) => withDb(() => updateIdeaRaw(...args));
export const deleteIdea = (...args) => withDb(() => deleteIdeaRaw(...args));
export const addProject = (...args) => withDb(() => addProjectRaw(...args));
export const updateProject = (...args) => withDb(() => updateProjectRaw(...args));
export const deleteProject = (...args) => withDb(() => deleteProjectRaw(...args));
export const addTrack = (...args) => withDb(() => addTrackRaw(...args));
export const updateTrack = (...args) => withDb(() => updateTrackRaw(...args));
export const deleteTrack = (...args) => withDb(() => deleteTrackRaw(...args));
export const getMeta = (...args) => withDb(() => getMetaRaw(...args));
export const setMeta = (...args) => withDb(() => setMetaRaw(...args));
export const addBeat = (...args) => withDb(() => addBeatRaw(...args));
export const updateBeat = (...args) => withDb(() => updateBeatRaw(...args));
export const deleteBeat = (...args) => withDb(() => deleteBeatRaw(...args));
export const addTake = (...args) => withDb(() => addTakeRaw(...args));
export const updateTake = (...args) => withDb(() => updateTakeRaw(...args));
export const deleteTake = (...args) => withDb(() => deleteTakeRaw(...args));
export const splitTake = (...args) => withDb(() => splitTakeRaw(...args));
export const addSketch = (...args) => withDb(() => addSketchRaw(...args));
export const updateSketch = (...args) => withDb(() => updateSketchRaw(...args));
export const deleteSketch = (...args) => withDb(() => deleteSketchRaw(...args));
