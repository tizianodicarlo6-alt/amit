// Mandare e ricevere idee, tracce e beat tra soci.
import { addBeat, addIdea, addTrack, db, newId, updateTrack } from '../../db/db.js';
import { analyzeAudio } from '../../lib/audio.js';
import { downloadFile, memberName, sendMessage } from '../../lib/cloud.js';

// ---------- mandare ----------

export async function sendIdea(to, idea, note = '') {
  if (idea.type === 'voice' && idea.audioId) {
    const rec = await db.audio.get(idea.audioId);
    return sendMessage(to, { kind: 'idea', body: note, payload: { type: 'voice', text: idea.text || '', tags: idea.tags || [], duration: idea.duration || 0 }, file: rec?.blob ? { blob: rec.blob, mime: rec.mime } : null });
  }
  return sendMessage(to, { kind: 'idea', body: note, payload: { type: 'text', text: idea.text || '', tags: idea.tags || [] } });
}

export async function sendTrack(to, track, { withBeat = true, note = '' } = {}) {
  const beat = track.beatId ? await db.beats.get(track.beatId) : null;
  let file = null;
  if (withBeat && beat) {
    const rec = await db.audio.get(beat.audioId);
    if (rec?.blob) file = { blob: rec.blob, mime: rec.mime };
  }
  const payload = {
    title: track.title || 'Senza titolo',
    sections: (track.sections || []).map((s) => ({ type: s.type, text: s.text })),
    vibe: track.vibe || null,
    bpm: track.bpm || beat?.bpm || null,
    notes: track.notes || '',
    beat: beat ? { title: beat.title, producer: beat.producer || '', bpm: beat.bpm || null, key: beat.key || '' } : null,
  };
  return sendMessage(to, { kind: 'track', body: note, payload, file });
}

export async function sendBeat(to, beat, note = '') {
  const rec = await db.audio.get(beat.audioId);
  return sendMessage(to, { kind: 'beat', body: note, payload: { title: beat.title, producer: beat.producer || '', bpm: beat.bpm || null, key: beat.key || '' }, file: rec?.blob ? { blob: rec.blob, mime: rec.mime } : null });
}

// ---------- ricevere (salvare nella propria app) ----------

const fromTag = (m) => `da ${memberName(m.from_user).toLowerCase()}`;

export async function saveIdea(m) {
  const p = m.payload || {};
  const tags = [...new Set([...(p.tags || []), fromTag(m)])];
  if (p.type === 'voice' && m.file_path) {
    const blob = await downloadFile(m.file_path);
    return addIdea({ type: 'voice', text: p.text || m.body || '', blob, mime: blob.type, duration: p.duration || 0, tags });
  }
  return addIdea({ type: 'text', text: p.text || m.body || '', tags });
}

async function importBeat(m, meta) {
  const blob = await downloadFile(m.file_path);
  const info = await analyzeAudio(blob, { detect: !meta?.bpm });
  return addBeat({ blob, mime: blob.type || 'audio/mpeg', title: meta?.title || 'Beat', producer: meta?.producer || `da ${memberName(m.from_user)}`, bpm: meta?.bpm ?? info.bpm ?? null, key: meta?.key || info.key || '', duration: info.duration, peaks: info.peaks });
}

export async function saveBeat(m) {
  return importBeat(m, m.payload);
}

/** Crea una traccia con il testo (e il beat, se è arrivato). Ritorna l'id della traccia. */
export async function saveTrack(m) {
  const p = m.payload || {};
  const id = await addTrack({ title: `${p.title || 'Traccia'} (da ${memberName(m.from_user)})` });
  const changes = {
    sections: (p.sections?.length ? p.sections : [{ type: 'strofa', text: '' }]).map((s) => ({ id: newId(), type: s.type, text: s.text || '' })),
    notes: p.notes || '',
  };
  if (p.vibe) changes.vibe = p.vibe;
  if (p.bpm) changes.bpm = p.bpm;
  if (m.file_path) changes.beatId = await importBeat(m, p.beat);
  await updateTrack(id, changes);
  return id;
}
