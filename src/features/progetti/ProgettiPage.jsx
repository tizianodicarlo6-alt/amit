import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { addProject, db } from '../../db/db.js';
import { PROJECT_KINDS, kindLabel } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';

export default function ProgettiPage() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const tracks = useLiveQuery(() => db.tracks.toArray(), []) || [];
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('album');
  const navigate = useNavigate();

  const count = (id) => tracks.filter((t) => t.projectId === id).length;
  const done = (id) => tracks.filter((t) => t.projectId === id && t.status === 'finita').length;

  const create = async () => {
    if (!name.trim()) return;
    const id = await addProject({ name: name.trim(), kind });
    setCreating(false);
    setName('');
    navigate(`/progetto/${id}`);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Progetti</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={20} /> Nuovo
        </button>
      </header>

      {projects && projects.length === 0 && (
        <div className="empty">
          <p>Nessun progetto.</p>
          <p className="muted">Un progetto è un album, un EP o un singolo che raccoglie più tracce.</p>
        </div>
      )}

      <div className="list">
        {(projects || []).map((p) => {
          const n = count(p.id);
          const f = done(p.id);
          return (
            <Link key={p.id} to={`/progetto/${p.id}`} className="card project-card">
              <div className="project-cover">{(p.name || '?').slice(0, 1).toUpperCase()}</div>
              <div className="grow">
                <div className="track-title">{p.name}</div>
                <div className="muted small">
                  {kindLabel(p.kind)} · {n} {n === 1 ? 'traccia' : 'tracce'}
                </div>
                {n > 0 && (
                  <div className="progress" aria-label={`${f} su ${n} finite`}>
                    <div style={{ width: `${(f / n) * 100}%` }} />
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Nuovo progetto">
        <div className="stack">
          <label className="field">
            <span className="field-label">Nome</span>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Il mio primo EP" onKeyDown={(e) => e.key === 'Enter' && create()} />
          </label>
          <div className="field">
            <span className="field-label">Tipo</span>
            <div className="chips">
              {PROJECT_KINDS.map((k) => (
                <button key={k.id} className={`chip${kind === k.id ? ' on' : ''}`} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn primary big" onClick={create} disabled={!name.trim()}>
            <Icon name="check" /> Crea progetto
          </button>
        </div>
      </Sheet>
    </div>
  );
}
