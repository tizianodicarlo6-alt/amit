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

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const now = () => Date.now();

// ---------- Idee ----------
export async function addIdea({ type, text = '', blob, mime, duration = 0, tags = [], trackId = null }) {
  const id = newId();
  let audioId = null;
  if (type === 'voice' && blob) {
    audioId = newId();
    await db.audio.put({ id: audioId, blob, mime: mime || blob.type });
  }
  await db.ideas.put({ id, type, text, audioId, duration, tags, trackId, createdAt: now(), updatedAt: now() });
  requestPersistence();
  return id;
}

export const updateIdea = (id, changes) => db.ideas.update(id, { ...changes, updatedAt: now() });

export async function deleteIdea(id) {
  const idea = await db.ideas.get(id);
  await db.transaction('rw', db.ideas, db.audio, async () => {
    if (idea?.audioId) await db.audio.delete(idea.audioId);
    await db.ideas.delete(id);
  });
}

// ---------- Progetti ----------
export async function addProject({ name, kind = 'album' }) {
  const id = newId();
  await db.projects.put({ id, name, kind, notes: '', createdAt: now(), updatedAt: now() });
  requestPersistence();
  return id;
}

export const updateProject = (id, changes) => db.projects.update(id, { ...changes, updatedAt: now() });

export async function deleteProject(id) {
  // Le tracce non vengono cancellate: restano "senza progetto".
  await db.transaction('rw', db.projects, db.tracks, async () => {
    await db.tracks.where('projectId').equals(id).modify({ projectId: null });
    await db.projects.delete(id);
  });
}

// ---------- Tracce ----------
export const newSection = (type = 'strofa') => ({ id: newId(), type, text: '' });

export async function addTrack({ title = 'Nuova traccia', projectId = null } = {}) {
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

export const updateTrack = (id, changes) => db.tracks.update(id, { ...changes, updatedAt: now() });

export async function deleteTrack(id) {
  await db.transaction('rw', db.tracks, db.ideas, async () => {
    await db.ideas.where('trackId').equals(id).modify({ trackId: null });
    await db.tracks.delete(id);
  });
}

// ---------- Meta ----------
export const getMeta = async (key) => (await db.meta.get(key))?.value;
export const setMeta = (key, value) => db.meta.put({ key, value });

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
