import { useNavigate } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addSketch, db, deleteSketch } from '../../db/db.js';
import { formatDate, keyShort } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import { newSketchData } from './music.js';

// Elenco delle bozze di beat
export default function SketchList() {
  const sketches = useDbQuery(() => db.sketches.orderBy('updatedAt').reverse().toArray(), [], undefined);
  const navigate = useNavigate();
  const create = async () => navigate(`/bozza/${await addSketch(newSketchData())}`);
  const remove = async (s) => {
    if (confirm(`Eliminare "${s.title}"?`)) await deleteSketch(s.id);
  };

  return (
    <div className="stack">
      <p className="muted small">
        Hai un beat in testa? Crealo qui: <b>canticchia la melodia</b>, aggiungi <b>batteria</b>, <b>accordi</b> e <b>808</b>, poi mandalo al produttore (audio + MIDI).
      </p>
      <button className="btn primary big" onClick={create}>
        <Icon name="plus" /> Nuova bozza
      </button>
      {sketches && sketches.length === 0 && <p className="muted center">Nessuna bozza ancora.</p>}
      <div className="list">
        {(sketches || []).map((s) => (
          <div key={s.id} className="card track-card">
            <button className="track-main sketch-card" onClick={() => navigate(`/bozza/${s.id}`)}>
              <div className="track-title">{s.title}</div>
              <div className="muted small">
                {s.bpm} BPM · {keyShort(s.key)} · {s.bars} battute · {formatDate(s.updatedAt)}
              </div>
            </button>
            <button className="icon-btn sm" onClick={() => remove(s)} aria-label="Elimina bozza">
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
