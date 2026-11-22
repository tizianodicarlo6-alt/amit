import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTrack, db, deleteTrack } from '../../db/db.js';
import { STATUSES } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import TracksTabs from './TracksTabs.jsx';
import TrackCard from './TrackCard.jsx';

export default function TraccePage() {
  const tracks = useDbQuery(() => db.tracks.orderBy('updatedAt').reverse().toArray(), []);
  const projects = useDbQuery(() => db.projects.toArray(), []) || [];
  const [status, setStatus] = useState('all');
  const remove = async (t) => {
    if (!confirm(`Eliminare la traccia "${t.title || 'Senza titolo'}"? Le note collegate restano nelle Note.`)) return;
    await deleteTrack(t.id);
  };
  const navigate = useNavigate();

  const projectName = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);
  const filtered = (tracks || []).filter((t) => status === 'all' || t.status === status);

  const create = async () => navigate(`/traccia/${await addTrack()}`);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="grow">Tracce</h1>
        <button className="btn primary" onClick={create}>
          <Icon name="plus" size={20} /> Nuova
        </button>
      </header>

      <TracksTabs />

      <div className="chips scroll-x">
        <button className={`chip${status === 'all' ? ' on' : ''}`} onClick={() => setStatus('all')}>
          Tutte
        </button>
        {STATUSES.map((s) => (
          <button key={s.id} className={`chip${status === s.id ? ' on' : ''}`} onClick={() => setStatus(s.id)} style={{ '--c': s.color }}>
            <span className="dot" /> {s.label}
          </button>
        ))}
      </div>

      {tracks && tracks.length === 0 && (
        <div className="empty">
          <p>Nessuna traccia.</p>
          <p className="muted">Crea la tua prima traccia e inizia a scrivere.</p>
          <button className="btn primary" onClick={create}>
            <Icon name="plus" size={20} /> Nuova traccia
          </button>
        </div>
      )}

      <div className="list">
        {filtered.map((t) => (
          <TrackCard
            key={t.id}
            track={t}
            projectName={projectName[t.projectId]}
            extra={
              <button className="track-del" onClick={() => remove(t)} aria-label={`Elimina ${t.title || 'traccia'}`}>
                <Icon name="trash" size={20} />
              </button>
            }
          />
        ))}
      </div>
    </div>
  );
}
