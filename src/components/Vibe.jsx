import { useState } from 'react';
import { ATMOS, GENRES, MOODS, makeSpunto } from '../lib/spunti.js';

/** Scelta di intenzione, genere e atmosfera. value = { mood, genre, atmo } */
export function VibePicker({ value = {}, onChange, compact = false }) {
  const set = (k, v) => onChange({ ...value, [k]: value[k] === v ? null : v });
  return (
    <div className={`vibe${compact ? ' compact' : ''}`}>
      <div className="field">
        <span className="field-label">Intenzione</span>
        <div className="chips scroll-x">
          {MOODS.map((m) => (
            <button key={m.id} className={`chip sm${value.mood === m.id ? ' on' : ''}`} onClick={() => set('mood', m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Che pezzo è?</span>
        <div className="chips scroll-x">
          {GENRES.map((g) => (
            <button key={g.id} className={`chip sm${value.genre === g.id ? ' on' : ''}`} onClick={() => set('genre', g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Vuoi dare un'atmosfera al pezzo?</span>
        <div className="atmo-grid scroll-x">
          {ATMOS.map((a) => (
            <button
              key={a.id}
              className={`atmo${value.atmo === a.id ? ' on' : ''}`}
              style={{ background: `linear-gradient(135deg, ${a.color[0]}, ${a.color[1]})` }}
              onClick={() => set('atmo', a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Spunto creativo (domanda, parole, immagine, consiglio) con "Un altro". */
export function SpuntoCard({ vibe, onUse }) {
  const [sp, setSp] = useState(() => makeSpunto(vibe));
  const [key, setKey] = useState(JSON.stringify(vibe || {}));
  const k = JSON.stringify(vibe || {});
  if (k !== key) {
    setKey(k);
    setSp(makeSpunto(vibe));
  }
  return (
    <div className="spunto">
      <div className="sp-q">“{sp.domanda}”</div>
      <div className="sp-row">
        <span className="sp-lab">Parole</span>
        <span>{sp.parole.join(' · ')}</span>
      </div>
      <div className="sp-row">
        <span className="sp-lab">Immagine</span>
        <span>{sp.immagine}</span>
      </div>
      {sp.consiglio && (
        <div className="sp-row">
          <span className="sp-lab">Consiglio</span>
          <span>{sp.consiglio}</span>
        </div>
      )}
      <div className="row">
        <button className="btn sm" onClick={() => setSp(makeSpunto(vibe))}>
          🔄 Un altro
        </button>
        {onUse && (
          <button className="btn sm ghost" onClick={() => onUse(sp)}>
            Salva nel taccuino
          </button>
        )}
      </div>
    </div>
  );
}

/** Testo dello spunto da salvare come idea. */
export const spuntoText = (sp) => [`💡 ${sp.domanda}`, `Parole: ${sp.parole.join(', ')}`, `Immagine: ${sp.immagine}`, sp.consiglio && `Consiglio: ${sp.consiglio}`].filter(Boolean).join('\n');
