import { useEffect, useRef } from 'react';
import { formatTime } from '../../constants.js';

// Il "gobbo": testo grande, riga corrente evidenziata, scorre da solo a tempo.
export default function Teleprompter({ timeline, current, following, onPickLine, onPickSection, selectedLine, fontSize = 24, overlay }) {
  const { lines, blocks } = timeline;
  const refs = useRef(new Map());

  useEffect(() => {
    if (!following || current < 0) return;
    refs.current.get(current)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current, following]);

  // quando scelgo da dove partire, porto la riga in vista
  useEffect(() => {
    if (selectedLine == null) return;
    refs.current.get(selectedLine)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedLine]);

  if (!lines.length) {
    return (
      <div className="prompter empty">
        <p>Questa traccia non ha ancora un testo.</p>
        <p className="muted small">Scrivilo nella scheda "Testo" della traccia: qui lo vedrai scorrere mentre registri.</p>
      </div>
    );
  }

  return (
    <div className="prompter-wrap">
      <div className="prompter" style={{ fontSize }}>
        <div className="prompter-pad" />
        {blocks.map((b) => (
          <div key={b.id} className="prompter-block">
            <button className="prompter-label" onClick={() => (onPickSection ? onPickSection(b) : onPickLine?.(b.first))}>
              {b.label} <span>· {formatTime(b.start)}</span>
            </button>
            {lines.slice(b.first, b.first + b.count).map((l) => (
              <div
                key={l.index}
                ref={(el) => (el ? refs.current.set(l.index, el) : refs.current.delete(l.index))}
                className={`prompter-line${l.index === current ? ' now' : ''}${current >= 0 && l.index < current ? ' done' : ''}${l.index === selectedLine ? ' start' : ''}`}
                onClick={() => onPickLine?.(l.index)}
              >
                {l.text}
              </div>
            ))}
          </div>
        ))}
        <div className="prompter-pad" />
      </div>
      {overlay && <div className="prompter-overlay">{overlay}</div>}
    </div>
  );
}
