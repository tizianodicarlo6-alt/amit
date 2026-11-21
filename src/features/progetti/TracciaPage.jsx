import { useMemo, useState } from 'react';
import { useTapTempo } from '../../components/useTapTempo.js';
import { useNavigate, useParams } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { db, deleteTake, deleteTrack, updateIdea, updateTake, updateTrack } from '../../db/db.js';
import { STATUSES, formatDate, formatTime, roleLabel } from '../../constants.js';
import AudioPlayer from '../../components/AudioPlayer.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useAutosave, SaveStatus } from '../../components/useAutosave.jsx';
import { useCapture } from '../../components/CaptureContext.jsx';
import LyricsEditor from '../editor/LyricsEditor.jsx';
import IdeaCard from '../taccuino/IdeaCard.jsx';
import IdeaSheet from '../taccuino/IdeaSheet.jsx';
import WaveformPlayer from '../../components/WaveformPlayer.jsx';
import { Link } from 'react-router-dom';

function TrackDetails({ track, projects, beats }) {
  const [form, setForm] = useState({
    title: track.title || '',
    status: track.status || 'idea',
    bpm: track.bpm ?? '',
    projectId: track.projectId || '',
    notes: track.notes || '',
    beatId: track.beatId || '',
  });
  const status = useAutosave(form, (v) =>
    updateTrack(track.id, { ...v, bpm: v.bpm === '' ? null : Number(v.bpm), projectId: v.projectId || null, beatId: v.beatId || null })
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const tap = useTapTempo((bpm) => set('bpm', bpm));

  return (
    <div className="stack">
      <div className="row between">
        <span className="field-label">Dettagli traccia</span>
        <SaveStatus status={status} />
      </div>
      <label className="field">
        <span className="field-label">Titolo</span>
        <input className="input title-input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Titolo della traccia" />
      </label>
      <div className="field">
        <span className="field-label">Stato</span>
        <div className="status-grid">
          {STATUSES.map((s) => (
            <button key={s.id} className={`chip status${form.status === s.id ? ' on' : ''}`} style={{ '--c': s.color }} onClick={() => set('status', s.id)}>
              <span className="dot" /> {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">BPM</span>
        <div className="row">
          <input
            className="input bpm-input"
            type="number"
            inputMode="numeric"
            min="40"
            max="250"
            value={form.bpm}
            onChange={(e) => set('bpm', e.target.value)}
            placeholder="90"
          />
          <button className="btn tap" onClick={tap}>
            Tap a tempo
          </button>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Beat</span>
        {beats.length === 0 ? (
          <Link to="/beat" className="btn ghost">
            <Icon name="beat" size={20} /> Importa il tuo primo beat
          </Link>
        ) : (
          <select
            className="input"
            value={form.beatId}
            onChange={(e) => {
              const b = beats.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, beatId: e.target.value, bpm: f.bpm === '' && b?.bpm ? b.bpm : f.bpm }));
            }}
          >
            <option value="">— Nessun beat —</option>
            {beats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
                {b.bpm ? ` · ${b.bpm} BPM` : ''}
              </option>
            ))}
          </select>
        )}
        {form.beatId && (() => {
          const b = beats.find((x) => x.id === form.beatId);
          return b ? <WaveformPlayer key={b.id} audioId={b.audioId} peaks={b.peaks} duration={b.duration} /> : null;
        })()}
      </div>
      <label className="field">
        <span className="field-label">Progetto</span>
        <select className="input" value={form.projectId} onChange={(e) => set('projectId', e.target.value)}>
          <option value="">— Nessun progetto —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Note</span>
        <textarea className="input" rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Riferimenti, beat, featuring, idee per il flow…" />
      </label>
    </div>
  );
}

// Le registrazioni dello studio: ascolto (solo voce) ed eliminazione
function TrackTakes({ track }) {
  const takes = useDbQuery(() => db.takes.where('trackId').equals(track.id).reverse().sortBy('createdAt'), [track.id], []) || [];
  const remove = async (t) => {
    if (confirm(`Eliminare "${t.name}" (${roleLabel(t.role)})?`)) await deleteTake(t.id);
  };
  return (
    <div className="stack">
      <div className="row between">
        <span className="field-label">Registrazioni ({takes.length})</span>
        <Link to={`/studio/${track.id}`} className="see-all">
          Apri lo studio
        </Link>
      </div>
      {takes.length === 0 && <p className="muted small">Nessuna registrazione. Apri lo Studio e premi il tasto rosso.</p>}
      {takes.map((t) => (
        <div key={t.id} className={`card stack take-card${t.included === false ? ' off' : ''}`}>
          <div className="row between">
            <div className="min0">
              <span className="reco-title">{t.name}</span> <span className="badge" style={{ '--c': '#8f8f98' }}>{roleLabel(t.role)}</span>
              <div className="muted small">
                {formatTime(t.duration)} · {formatDate(t.createdAt)} {t.included === false ? '· spenta nel mix' : ''}
              </div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className={`btn sm${t.included !== false ? ' primary' : ''}`} onClick={() => updateTake(t.id, { included: t.included === false })}>
                {t.included !== false ? 'ON' : 'OFF'}
              </button>
              <button className="icon-btn sm" onClick={() => remove(t)} aria-label="Elimina registrazione">
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>
          <AudioPlayer audioId={t.audioId} duration={t.duration} />
        </div>
      ))}
    </div>
  );
}

function TrackIdeas({ track, onEditLyricsAfter }) {
  const ideas = useDbQuery(() => db.ideas.where('trackId').equals(track.id).reverse().sortBy('createdAt'), [track.id]) || [];
  const unlinked = useDbQuery(() => db.ideas.filter((i) => !i.trackId).reverse().sortBy('createdAt'), []) || [];
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(null);
  const { openCapture } = useCapture();

  const insertInLyrics = async (idea) => {
    const sections = [...(track.sections || [])];
    const last = sections.at(-1);
    if (!last) return;
    const sep = last.text && !last.text.endsWith('\n') ? '\n' : '';
    sections[sections.length - 1] = { ...last, text: last.text + sep + idea.text };
    await updateTrack(track.id, { sections });
    onEditLyricsAfter();
  };

  return (
    <div className="stack">
      <div className="row">
        <button className="btn primary grow" onClick={() => openCapture({ trackId: track.id })}>
          <Icon name="plus" size={20} /> Nuova idea
        </button>
        <button className="btn grow" onClick={() => setPicking(true)} disabled={!unlinked.length}>
          <Icon name="link" size={20} /> Collega
        </button>
      </div>
      {ideas.length === 0 && <p className="muted empty">Nessuna idea collegata a questa traccia.</p>}
      <div className="list">
        {ideas.map((i) => (
          <IdeaCard
            key={i.id}
            idea={i}
            onClick={() => setEditing(i)}
            actions={
              i.type === 'text' && i.text ? (
                <button className="btn ghost sm" onClick={() => insertInLyrics(i)}>
                  <Icon name="pen" size={16} /> Aggiungi al testo
                </button>
              ) : null
            }
          />
        ))}
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Collega un'idea">
        <div className="list">
          {unlinked.map((i) => (
            <IdeaCard
              key={i.id}
              idea={i}
              onClick={async () => {
                await updateIdea(i.id, { trackId: track.id });
                setPicking(false);
              }}
            />
          ))}
        </div>
      </Sheet>
      {editing && <IdeaSheet idea={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export default function TracciaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const track = useDbQuery(() => db.tracks.get(id), [id]);
  const projects = useDbQuery(() => db.projects.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))), []) || [];
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const ideaCount = useDbQuery(() => db.ideas.where('trackId').equals(id).count(), [id]) || 0;
  const [tab, setTab] = useState('testo');
  const project = useMemo(() => projects.find((p) => p.id === track?.projectId), [projects, track]);

  if (track === undefined) return <div className="page" />;
  if (!track) return <div className="page empty">Traccia non trovata.</div>;

  const remove = async () => {
    if (!confirm(`Eliminare la traccia "${track.title}"? Le idee collegate restano nel taccuino.`)) return;
    await deleteTrack(id);
    navigate('/tracce');
  };

  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <div className="grow min0">
          <h1 className="ellipsis">{track.title || 'Senza titolo'}</h1>
          {project && <div className="muted small ellipsis">{project.name}</div>}
        </div>
        <Link to={`/studio/${track.id}`} className="btn primary studio-btn">
          <Icon name="mic" size={20} /> Studio
        </Link>
      </header>

      <div className="tabs" role="tablist">
        {[
          ['testo', 'Testo'],
          ['dettagli', 'Dettagli'],
          ['idee', `Idee${ideaCount ? ` (${ideaCount})` : ''}`],
        ].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'testo' && <LyricsEditor key={track.id} track={track} />}
      {tab === 'dettagli' && (
        <>
          <TrackDetails key={track.id} track={track} projects={projects} beats={beats} />
          <div className="divider" />
          <TrackTakes track={track} />
          <button className="btn danger" onClick={remove}>
            <Icon name="trash" size={20} /> Elimina traccia
          </button>
        </>
      )}
      {tab === 'idee' && <TrackIdeas track={track} onEditLyricsAfter={() => setTab('testo')} />}
    </div>
  );
}
