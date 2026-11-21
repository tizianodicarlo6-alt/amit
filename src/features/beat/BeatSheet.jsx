import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTrack, db, deleteBeat, updateBeat, updateTrack } from '../../db/db.js';
import { BEAT_TAGS, KEYS, statusOf } from '../../constants.js';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import TagPicker from '../../components/TagPicker.jsx';
import WaveformPlayer from '../../components/WaveformPlayer.jsx';
import { useAutosave, SaveStatus } from '../../components/useAutosave.jsx';
import { useTapTempo } from '../../components/useTapTempo.js';

function BeatForm({ beat }) {
  const [form, setForm] = useState({ title: beat.title || '', producer: beat.producer || '', bpm: beat.bpm ?? '', key: beat.key || '', tags: beat.tags || [] });
  const status = useAutosave(form, (v) => updateBeat(beat.id, { ...v, bpm: v.bpm === '' ? null : Number(v.bpm) }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const tap = useTapTempo((bpm) => set('bpm', bpm));
  const allBeatTags = useDbQuery(async () => (await db.beats.toArray()).flatMap((b) => b.tags || []), [], []) || [];

  return (
    <div className="stack">
      <div className="row between">
        <span className="field-label">Dettagli</span>
        <SaveStatus status={status} />
      </div>
      <label className="field">
        <span className="field-label">Titolo</span>
        <input className="input title-input" value={form.title} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Produttore</span>
        <input className="input" value={form.producer} onChange={(e) => set('producer', e.target.value)} placeholder="prod. …" />
      </label>
      <div className="field">
        <span className="field-label">BPM</span>
        <div className="row">
          <input className="input bpm-input" type="number" inputMode="numeric" min="40" max="250" value={form.bpm} onChange={(e) => set('bpm', e.target.value)} placeholder="140" />
          <button className="btn tap" onClick={tap}>
            Tap a tempo
          </button>
        </div>
        <span className="muted small">Fai partire il beat e tocca "Tap" a ritmo almeno 4 volte.</span>
      </div>
      <label className="field">
        <span className="field-label">Tonalità</span>
        <select className="input" value={form.key} onChange={(e) => set('key', e.target.value)}>
          <option value="">— Non so / non serve —</option>
          {KEYS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span className="field-label">Tag</span>
        <TagPicker value={form.tags} onChange={(t) => set('tags', t)} suggestions={[...new Set([...BEAT_TAGS, ...allBeatTags])]} />
      </div>
    </div>
  );
}

export default function BeatSheet({ beatId, onClose }) {
  const beat = useDbQuery(() => db.beats.get(beatId).then((b) => b ?? null), [beatId], undefined);
  const tracks = useDbQuery(() => db.tracks.filter((t) => t.beatId === beatId).toArray(), [beatId], []) || [];
  const navigate = useNavigate();

  useEffect(() => {
    if (beat === null) onClose(); // beat eliminato
  }, [beat, onClose]);

  if (!beat) return null;

  const newTrack = async () => {
    const id = await addTrack({ title: beat.title });
    await updateTrack(id, { beatId: beat.id, bpm: beat.bpm ?? null });
    onClose();
    navigate(`/traccia/${id}`);
  };

  const remove = async () => {
    const msg = tracks.length
      ? `Eliminare il beat "${beat.title}"? Verrà scollegato da ${tracks.length} ${tracks.length === 1 ? 'traccia' : 'tracce'} (i testi restano).`
      : `Eliminare il beat "${beat.title}"?`;
    if (!confirm(msg)) return;
    await deleteBeat(beat.id);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Beat">
      <div className="stack">
        <WaveformPlayer audioId={beat.audioId} peaks={beat.peaks} duration={beat.duration} />
        <button className="btn primary big" onClick={newTrack}>
          <Icon name="pen" /> Scrivi una traccia su questo beat
        </button>
        {tracks.length > 0 && (
          <div className="field">
            <span className="field-label">Usato in</span>
            <div className="list">
              {tracks.map((t) => (
                <Link key={t.id} to={`/traccia/${t.id}`} className="card pick row between" onClick={onClose}>
                  <span>{t.title || 'Senza titolo'}</span>
                  <span className="badge" style={{ '--c': statusOf(t.status).color }}>
                    {statusOf(t.status).label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
        <BeatForm key={beat.id} beat={beat} />
        <button className="btn danger" onClick={remove}>
          <Icon name="trash" size={20} /> Elimina beat
        </button>
      </div>
    </Sheet>
  );
}
