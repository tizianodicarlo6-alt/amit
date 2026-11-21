import { useEffect, useMemo, useRef } from 'react';
import { sectionLabel } from '../../constants.js';

/** Prepara le righe: ogni barra non vuota ha un numero progressivo. */
export function buildLines(sections = []) {
  const items = [];
  let n = 0;
  for (const s of sections) {
    const lines = s.text.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    items.push({ kind: 'label', key: `l-${s.id}`, text: sectionLabel(s.type) });
    for (const [i, l] of lines.entries()) items.push({ kind: 'line', key: `${s.id}-${i}`, text: l, index: n++ });
  }
  return { items, count: n };
}

// Il "gobbo": testo grande, riga corrente evidenziata, scorre da solo a tempo.
export default function Teleprompter({ sections, current, following, onPickLine, startLine, fontSize = 24 }) {
  const { items, count } = useMemo(() => buildLines(sections), [sections]);
  const refs = useRef(new Map());

  useEffect(() => {
    if (!following || current < 0) return;
    const el = refs.current.get(Math.min(current, count - 1));
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current, following, count]);

  if (!count) {
    return (
      <div className="prompter empty">
        <p>Questa traccia non ha ancora un testo.</p>
        <p className="muted small">Scrivilo nella scheda "Testo" della traccia: qui lo vedrai scorrere mentre registri.</p>
      </div>
    );
  }

  return (
    <div className="prompter" style={{ fontSize }}>
      <div className="prompter-pad" />
      {items.map((it) =>
        it.kind === 'label' ? (
          <div key={it.key} className="prompter-label">
            {it.text}
          </div>
        ) : (
          <div
            key={it.key}
            ref={(el) => (el ? refs.current.set(it.index, el) : refs.current.delete(it.index))}
            className={`prompter-line${it.index === current ? ' now' : ''}${it.index < current ? ' done' : ''}${it.index === startLine ? ' start' : ''}`}
            onClick={() => onPickLine?.(it.index)}
          >
            {it.text}
          </div>
        )
      )}
      <div className="prompter-pad" />
    </div>
  );
}
