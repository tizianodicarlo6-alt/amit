import { useEffect, useRef, useState } from 'react';
import { updateTrack } from '../../db/db.js';

export const INTENTI = ['Aggressiva', 'Calma', 'Sicura', 'Malinconica', 'Energica', 'Sussurrata', 'Ironica', 'Arrabbiata'];

/**
 * Appunti dello studio: l'intenzione con cui la canti e due righe al volo
 * (una barra da cambiare, una nuova da provare). Si vede anche mentre registri.
 */
export default function StudioNotes({ track, compact = false }) {
  const n = track.studioNotes || {};
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(n.text || '');
  const [intent, setIntent] = useState(n.intent || '');
  const cur = useRef({ text: n.text || '', intent: n.intent || '' });
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  const save = (c) => {
    cur.current = { ...cur.current, ...c };
    if ('intent' in c) setIntent(c.intent);
    return updateTrack(track.id, { studioNotes: { ...cur.current } });
  };
  const onText = (v) => {
    setText(v);
    clearTimeout(t.current);
    t.current = setTimeout(() => save({ text: v }), 500);
  };

  if (!open)
    return (
      <button className={`snotes-mini${compact ? ' compact' : ''}`} onClick={() => setOpen(true)}>
        <span className="sn-k">Appunti</span>
        {intent && <span className="sn-int">{intent}</span>}
        <span className="grow ellipsis muted">{text.trim() ? text.trim().split('\n').slice(-1)[0] : intent ? '' : "L'intenzione, una barra al volo…"}</span>
      </button>
    );

  return (
    <div className="snotes">
      <div className="row between">
        <span className="field-label">Come la canti</span>
        <button className="btn sm ghost" onClick={() => (save({ text }), setOpen(false))}>
          Chiudi
        </button>
      </div>
      <div className="chips sn-chips">
        {INTENTI.map((x) => (
          <button key={x} className={`chip sm${intent === x ? ' on' : ''}`} onClick={() => save({ intent: intent === x ? '' : x })}>
            {x}
          </button>
        ))}
      </div>
      <textarea
        className="input sn-text"
        rows={3}
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Appunti al volo: la barra da cambiare, una nuova da provare, dove respirare…"
        autoCapitalize="sentences"
      />
    </div>
  );
}
