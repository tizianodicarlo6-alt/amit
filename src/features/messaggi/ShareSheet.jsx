import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { db } from '../../db/db.js';
import { formatBytes } from '../../lib/audio.js';
import { otherMembers, startCloud, useCloud } from '../../lib/cloud.js';
import { useProfile } from '../../lib/profile.js';
import { sendBeat, sendIdea, sendTrack } from './transfer.js';

const TITLES = { idea: "Manda l'idea", track: 'Manda la traccia', beat: 'Manda il beat' };

/** Manda un'idea, una traccia o un beat a un socio. */
export default function ShareSheet({ kind, item, to: fixedTo = null, onClose, onSent }) {
  const profile = useProfile();
  const cloud = useCloud();
  const navigate = useNavigate();
  const others = profile ? otherMembers(profile.id) : [];
  const [to, setTo] = useState(fixedTo || others[0]?.id);
  const [note, setNote] = useState('');
  const [withBeat, setWithBeat] = useState(true);
  const [beatSize, setBeatSize] = useState(null);
  const [state, setState] = useState(''); // '' | busy | ok | errore

  useEffect(() => {
    startCloud();
  }, []);
  useEffect(() => {
    if (kind !== 'track' || !item.beatId) return;
    db.beats.get(item.beatId).then((b) => b && setBeatSize(b.size || null));
  }, [kind, item]);

  const send = async () => {
    setState('busy');
    try {
      if (kind === 'idea') await sendIdea(to, item, note.trim());
      else if (kind === 'track') await sendTrack(to, item, { withBeat, note: note.trim() });
      else await sendBeat(to, item, note.trim());
      setState('ok');
      onSent?.();
      setTimeout(onClose, 900);
    } catch (e) {
      setState(navigator.onLine === false ? 'Sei offline: riprova quando c\'è internet.' : `Non inviato (${e?.message || e}).`);
    }
  };

  return (
    <Sheet open onClose={onClose} title={TITLES[kind]}>
      {!cloud.user ? (
        <div className="stack">
          <p className="muted">Per mandare cose ai soci entra prima nei messaggi (serve la tua password, solo la prima volta).</p>
          <button className="btn primary" onClick={() => (onClose(), navigate('/messaggi'))}>
            Vai ai messaggi
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="card">
            <div className="reco-title ellipsis">{kind === 'idea' ? (item.type === 'voice' ? '🎤 Nota vocale' : `💡 ${(item.text || '').split('\n')[0]}`) : kind === 'track' ? `🎵 ${item.title || 'Senza titolo'}` : `🎧 ${item.title}`}</div>
          </div>
          {!fixedTo && others.length > 1 && (
            <div className="chips">
              {others.map((m) => (
                <button key={m.id} className={`chip${to === m.id ? ' on' : ''}`} onClick={() => setTo(m.id)}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
          {!fixedTo && others.length === 1 && <p className="muted small">A {others[0].name}</p>}
          {kind === 'track' && item.beatId && (
            <label className="row check-row">
              <input type="checkbox" checked={withBeat} onChange={(e) => setWithBeat(e.target.checked)} />
              <span>Manda anche il beat{beatSize ? ` (${formatBytes(beatSize)})` : ''}</span>
            </label>
          )}
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Due parole (facoltativo)…" />
          <button className="btn primary big" onClick={send} disabled={!to || state === 'busy' || state === 'ok'}>
            {state === 'busy' ? <span className="spinner" /> : <Icon name="send" size={20} />} {state === 'ok' ? 'Inviato ✓' : state === 'busy' ? 'Invio…' : 'Manda'}
          </button>
          {state && state !== 'busy' && state !== 'ok' && <p className="error small">{state}</p>}
        </div>
      )}
    </Sheet>
  );
}
