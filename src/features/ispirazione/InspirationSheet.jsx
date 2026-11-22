import { useMemo, useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import AudioPlayer from '../../components/AudioPlayer.jsx';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTrack, db, updateTrack } from '../../db/db.js';
import { formatDate } from '../../constants.js';
import { makeGrid } from '../../lib/loopRegion.js';
import { sfidaDelGiorno } from '../../lib/sfide.js';
import { logEvent } from '../../lib/stats.js';
import { useNavigate } from 'react-router-dom';

/** Crea una traccia (col beat, se c'è) e la apre. */
export async function startTrack(navigate, { beat = null } = {}) {
  const id = await addTrack({ title: 'Nuova traccia' });
  if (beat) await updateTrack(id, { beatId: beat.id, bpm: beat.bpm || null });
  navigate(`/traccia/${id}`);
}

const TITLES = { menu: 'Ispirazione', ritorno: 'Ti ricordi questa?', sfida: 'La sfida di oggi', flash: 'Sessione flash', catena: 'Catena di rime' };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** 1 · Le tue idee che ritornano: una vecchia nota o un vocale dal taccuino. */
function Ritorno({ onOpen }) {
  const ideas = useDbQuery(() => db.ideas.toArray(), [], null);
  const [n, setN] = useState(0);
  const idea = useMemo(() => {
    if (!ideas?.length) return null;
    const old = ideas.filter((i) => Date.now() - i.createdAt > 2 * 86400000);
    const pool = old.length ? old : ideas;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [ideas, n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (ideas === null) return <span className="spinner" />;
  if (!idea) return <p className="muted">Le note sono ancora vuote: le tue idee torneranno qui.</p>;
  return (
    <div className="stack">
      <div className="ritorno">
        <div className="muted small">{formatDate(idea.createdAt)}</div>
        {idea.type === 'voice' && <AudioPlayer audioId={idea.audioId} duration={idea.duration} />}
        {idea.text && <div className="ritorno-text">{idea.text}</div>}
      </div>
      <div className="row">
        <button className="btn primary grow" onClick={() => onOpen(idea)}>
          Riprendila
        </button>
        <button className="btn" onClick={() => setN(n + 1)}>
          Un'altra
        </button>
      </div>
    </div>
  );
}

/** 2 · La sfida del giorno. */
function Sfida({ write }) {
  const [off, setOff] = useState(0);
  const s = sfidaDelGiorno(off);
  return (
    <div className="stack">
      <div className="sfida">{s}</div>
      <div className="row">
        <button className="btn primary grow" onClick={() => write({ text: `Sfida: ${s}\n\n` })}>
          Scrivila
        </button>
        <button className="btn" onClick={() => setOff(off + 1)}>
          Un'altra
        </button>
      </div>
    </div>
  );
}

/** 3 · Sessione flash: beat a caso, 8 battute in loop, timer. */
function Flash({ write }) {
  const beats = useDbQuery(() => db.beats.toArray(), [], null);
  const [min, setMin] = useState(10);
  if (beats === null) return <span className="spinner" />;
  if (!beats.length) return <p className="muted">Carica qualche beat nella sezione Beat: la sessione ne sceglie uno a caso.</p>;
  const go = () => {
    const b = pick(beats);
    const dur = b.duration || 120;
    const g = makeGrid({ bpm: b.bpm, anchor: 0, duration: dur });
    const len = g.barDur ? g.barDur * 8 : 16;
    let from = dur * (0.2 + Math.random() * 0.4);
    if (g.barDur) from = Math.floor(from / g.barDur) * g.barDur;
    from = Math.max(0, Math.min(from, dur - len));
    write({ beatId: b.id, loop: { from: Math.round(from * 1000) / 1000, to: Math.round((from + len) * 1000) / 1000 }, timer: min });
  };
  return (
    <div className="stack">
      <p className="muted">Scelgo io un beat a caso e ti metto in loop 8 battute. Tu scrivi senza pensarci troppo finché non scade il tempo.</p>
      <div className="chips">
        {[5, 10, 15].map((m) => (
          <button key={m} className={`chip${min === m ? ' on' : ''}`} onClick={() => setMin(m)}>
            {m} minuti
          </button>
        ))}
      </div>
      <button className="btn primary big" onClick={go}>
        ⏱ Parti
      </button>
    </div>
  );
}

// La sfera "Ispirazione": quattro modi per accenderti, ordinati
export default function InspirationSheet({ onClose, openCapture }) {
  const [view, setView] = useState('menu');
  const write = (note) => (onClose(), openCapture({ mode: 'text', note }));
  const navigate = useNavigate();

  return (
    <Sheet open onClose={onClose} title={TITLES[view]}>
      {view === 'menu' && (
        <div className="stack insp">
          <button className="insp-tile wide" onClick={() => (onClose(), navigate('/butta'))}>
            <span className="insp-sym">≋</span>
            <b>Butta tutto</b>
            <span className="muted small">Metti il beat e butta dentro tutto a caso: poi lo sistemo io</span>
          </button>
          <div className="insp-grid">
            {[
              ['ritorno', '↺', 'Idee che ritornano', 'Una tua vecchia nota o un vocale'],
              ['sfida', '◎', 'Sfida del giorno', 'Una sola sfida, cambia ogni giorno'],
              ['flash', '⏱', 'Sessione flash', 'Beat a caso, loop e timer'],
              ['catena', '∞', 'Catena di rime', 'Una parola, una o due quartine'],
            ].map(([k, ico, t, d]) => (
              <button key={k} className="insp-tile" onClick={() => (k === 'catena' ? (onClose(), navigate('/allenamento/catena')) : setView(k))}>
                <span className="insp-sym">{ico}</span>
                <b>{t}</b>
                <span className="muted small">{d}</span>
              </button>
            ))}
          </div>
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
      {view === 'ritorno' && <Ritorno onOpen={(i) => (logEvent('reuse'), onClose(), navigate(`/taccuino?apri=${i.id}`))} />}
      {view === 'sfida' && <Sfida write={write} />}
      {view === 'flash' && <Flash write={write} />}
      {view !== 'menu' && (
        <button className="btn ghost insp-back" onClick={() => setView('menu')}>
          Indietro
        </button>
      )}
    </Sheet>
  );
}
