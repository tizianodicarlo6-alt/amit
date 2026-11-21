import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTrack, db, deleteProject, updateProject, updateTrack } from '../../db/db.js';
import { PROJECT_KINDS } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useAutosave, SaveStatus } from '../../components/useAutosave.jsx';
import TrackCard from './TrackCard.jsx';

function ProjectForm({ project }) {
  const [form, setForm] = useState({ name: project.name, kind: project.kind, notes: project.notes || '' });
  const status = useAutosave(form, (v) => updateProject(project.id, v));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));
  return (
    <div className="stack">
      <div className="row between">
        <span className="field-label">Dettagli</span>
        <SaveStatus status={status} />
      </div>
      <input className="input title-input" value={form.name} onChange={set('name')} placeholder="Nome del progetto" />
      <div className="chips">
        {PROJECT_KINDS.map((k) => (
          <button key={k.id} className={`chip${form.kind === k.id ? ' on' : ''}`} onClick={() => set('kind')(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} placeholder="Note sul progetto (concept, uscita…)" />
    </div>
  );
}

export default function ProgettoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = useDbQuery(() => db.projects.get(id), [id]);
  const tracks = useDbQuery(() => db.tracks.where('projectId').equals(id).sortBy('order'), [id]) || [];
  const loose = useDbQuery(() => db.tracks.filter((t) => !t.projectId).toArray(), []) || [];
  const [adding, setAdding] = useState(false);

  if (project === undefined) return <div className="page" />;
  if (!project) return <div className="page empty">Progetto non trovato.</div>;

  const create = async () => navigate(`/traccia/${await addTrack({ projectId: id })}`);

  const move = async (index, dir) => {
    const list = [...tracks];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    await db.transaction('rw', db.tracks, () => Promise.all(list.map((t, i) => db.tracks.update(t.id, { order: i }))));
  };

  const attach = async (trackId) => {
    await updateTrack(trackId, { projectId: id, order: tracks.length });
    setAdding(false);
  };

  const detach = async (trackId) => {
    if (confirm('Togliere la traccia dal progetto? (la traccia non viene cancellata)')) await updateTrack(trackId, { projectId: null });
  };

  const remove = async () => {
    if (!confirm(`Eliminare il progetto "${project.name}"? Le tracce restano salvate, senza progetto.`)) return;
    await deleteProject(id);
    navigate('/progetti');
  };

  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate('/progetti')} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <h1 className="grow ellipsis">{project.name}</h1>
      </header>

      <ProjectForm key={project.id} project={project} />

      <div className="row between section-title">
        <h2>Tracklist</h2>
        <span className="muted small">{tracks.length} tracce</span>
      </div>

      <div className="list">
        {tracks.map((t, i) => (
          <TrackCard
            key={t.id}
            track={t}
            extra={
              <div className="track-actions">
                <span className="track-num">{i + 1}</span>
                <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su">
                  <Icon name="up" size={18} />
                </button>
                <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === tracks.length - 1} aria-label="Sposta giù">
                  <Icon name="down" size={18} />
                </button>
                <button className="icon-btn sm" onClick={() => detach(t.id)} aria-label="Togli dal progetto">
                  <Icon name="x" size={18} />
                </button>
              </div>
            }
          />
        ))}
      </div>

      <div className="stack">
        <button className="btn primary big" onClick={create}>
          <Icon name="plus" /> Nuova traccia nel progetto
        </button>
        {loose.length > 0 && (
          <button className="btn ghost" onClick={() => setAdding(true)}>
            <Icon name="link" size={20} /> Aggiungi una traccia esistente
          </button>
        )}
        <button className="btn danger" onClick={remove}>
          <Icon name="trash" size={20} /> Elimina progetto
        </button>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Tracce senza progetto">
        <div className="list">
          {loose.map((t) => (
            <button key={t.id} className="card pick" onClick={() => attach(t.id)}>
              {t.title || 'Senza titolo'}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
