import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { SpuntoCard, VibePicker, spuntoText } from '../../components/Vibe.jsx';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addIdea, addTrack, db, updateTrack } from '../../db/db.js';
import { setPrefs, useProfile } from '../../lib/profile.js';
import { vibeLabel } from '../../lib/spunti.js';

/** Crea una traccia con intenzione/genere/atmosfera (e il beat, se c'è) e la apre. */
export async function startTrack(navigate, { vibe = {}, beat = null } = {}) {
  const id = await addTrack({ title: 'Nuova traccia' });
  const changes = {};
  if (vibe.mood || vibe.genre || vibe.atmo) changes.vibe = vibe;
  if (beat) Object.assign(changes, { beatId: beat.id, bpm: beat.bpm || null });
  if (Object.keys(changes).length) await updateTrack(id, changes);
  navigate(`/traccia/${id}`);
}

// La sfera "Ispirazione": parliamone (presto), spunto veloce, vai sul beat, nota veloce
export default function InspirationSheet({ onClose, openCapture }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const [view, setView] = useState('menu'); // menu | spunto | beat
  const [vibe, setVibe] = useState(() => profile?.prefs?.vibe || {});
  const [saved, setSaved] = useState(false);
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];

  const changeVibe = (v) => {
    setVibe(v);
    setPrefs({ vibe: v, atmo: v.atmo || null }); // la sfera prende il colore dell'atmosfera
  };
  const go = async (opts) => {
    onClose();
    await startTrack(navigate, { vibe, ...opts });
  };

  return (
    <Sheet open onClose={onClose} title={view === 'menu' ? 'Ispirazione' : view === 'spunto' ? 'Spunto veloce' : 'Vai sul beat'}>
      {view === 'menu' && (
        <div className="stack insp">
          <button className="insp-card soon" disabled>
            <span className="insp-ico">💬</span>
            <span className="grow">
              <b>Parliamone</b>
              <span className="muted small">Una chiacchierata per capire dove vuoi andare a parare. Arriva presto.</span>
            </span>
          </button>
          <button className="insp-card" onClick={() => setView('spunto')}>
            <span className="insp-ico">💡</span>
            <span className="grow">
              <b>Spunto veloce</b>
              <span className="muted small">Scegli intenzione e atmosfera: ti do una domanda, parole e un'immagine.</span>
            </span>
          </button>
          <button className="insp-card" onClick={() => setView('beat')}>
            <span className="insp-ico">🎧</span>
            <span className="grow">
              <b>Vai sul beat</b>
              <span className="muted small">Scegli un beat, metti in loop il pezzo e cerca la melodia col nanana.</span>
            </span>
          </button>
          <div className="row insp-quick">
            <button className="btn grow" onClick={() => (onClose(), openCapture({ mode: 'text' }))}>
              <Icon name="pen" size={20} /> Nota veloce
            </button>
            <button className="btn grow" onClick={() => (onClose(), openCapture({ mode: 'voice' }))}>
              <Icon name="mic" size={20} /> Vocale
            </button>
          </div>
        </div>
      )}

      {view === 'spunto' && (
        <div className="stack">
          <VibePicker value={vibe} onChange={changeVibe} />
          <SpuntoCard
            vibe={vibe}
            onUse={async (sp) => {
              await addIdea({ type: 'text', text: spuntoText(sp), tags: ['spunto'] });
              setSaved(true);
            }}
          />
          {saved && <p className="ok small">✓ Salvato nel taccuino</p>}
          <button className="btn primary big" onClick={() => go()}>
            ✍️ Inizia una traccia{vibeLabel(vibe) ? ` · ${vibeLabel(vibe)}` : ''}
          </button>
          <button className="btn ghost" onClick={() => setView('menu')}>
            Indietro
          </button>
        </div>
      )}

      {view === 'beat' && (
        <div className="stack">
          <p className="muted small">Si apre una traccia nuova con questo beat: in alto trascini il dito per scegliere il pezzo del ritornello e premi 🎤 per i nanana.</p>
          {beats.length === 0 && <p className="muted">Non hai ancora beat: caricali nella sezione Beat.</p>}
          <div className="list">
            {beats.map((b) => (
              <button key={b.id} className="beat-pick" onClick={() => go({ beat: b })}>
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
