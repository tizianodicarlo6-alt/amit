import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTrack, db, updateTrack } from '../../db/db.js';

/** Crea una traccia (col beat, se c'è) e la apre. */
export async function startTrack(navigate, { beat = null } = {}) {
  const id = await addTrack({ title: 'Nuova traccia' });
  if (beat) await updateTrack(id, { beatId: beat.id, bpm: beat.bpm || null });
  navigate(`/traccia/${id}`);
}

// La sfera "Ispirazione": pochi tasti, ordinati
export default function InspirationSheet({ onClose, openCapture }) {
  const navigate = useNavigate();
  const [view, setView] = useState('menu'); // menu | beat
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];

  return (
    <Sheet open onClose={onClose} title={view === 'menu' ? 'Ispirazione' : 'Scegli il beat'}>
      {view === 'menu' && (
        <div className="stack insp">
          <button className="insp-card" onClick={() => setView('beat')}>
            <span className="insp-ico">🎧</span>
            <span className="grow">
              <b>Vai sul beat</b>
              <span className="muted small">Scegli un beat e cerca la melodia col nanana.</span>
            </span>
          </button>
          <div className="row insp-quick">
            <button className="btn grow" onClick={() => (onClose(), openCapture({ mode: 'text' }))}>
              <Icon name="pen" size={20} /> Nota
            </button>
            <button className="btn grow" onClick={() => (onClose(), openCapture({ mode: 'voice' }))}>
              <Icon name="mic" size={20} /> Vocale
            </button>
          </div>
        </div>
      )}

      {view === 'beat' && (
        <div className="stack">
          {beats.length === 0 && <p className="muted">Non hai ancora beat: caricali nella sezione Beat.</p>}
          <div className="list">
            {beats.map((b) => (
              <button key={b.id} className="beat-pick" onClick={() => (onClose(), startTrack(navigate, { beat: b }))}>
                <span className="ellipsis grow">{b.title || 'Beat'}</span>
                <span className="muted small">{[b.bpm && `${b.bpm} BPM`, b.key].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setView('menu')}>
            Indietro
          </button>
        </div>
      )}
    </Sheet>
  );
}
