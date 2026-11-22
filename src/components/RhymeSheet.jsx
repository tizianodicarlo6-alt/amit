import { useEffect, useState } from 'react';
import Sheet from './Sheet.jsx';
import { loadIndex, suggest } from '../lib/rimario.js';

// Rimario: scrivi (o tocchi) una parola e trovi rime, assonanze e multisillabiche
export default function RhymeSheet({ word: initial = '', prev: initialPrev = '', onClose, onPick }) {
  const [word, setWord] = useState(initial);
  const [prev, setPrev] = useState(initialPrev);
  const [index, setIndex] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch(() => setError('Il rimario si scarica la prima volta con internet. Riprova quando sei connesso.'));
  }, []);

  const w = word.trim().split(/\s+/).at(-1) || '';
  const res = index && w ? suggest(index, w, prev) : null;

  const pick = async (x) => {
    if (onPick) return onPick(x);
    try {
      await navigator.clipboard.writeText(x);
      setCopied(x);
    } catch {
      setCopied('');
    }
  };

  const Group = ({ title, hint, list }) =>
    list.length > 0 && (
      <div className="field">
        <span className="field-label">
          {title} <span className="muted">({list.length})</span>
        </span>
        {hint && <span className="muted small">{hint}</span>}
        <div className="chips">
          {list.map((x) => (
            <button key={x} className={`chip sm${copied === x ? ' on' : ''}`} onClick={() => pick(x)}>
              {x}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <Sheet open onClose={onClose} title="Rimario">
      <div className="stack">
        <input
          className="input"
          value={word}
          onChange={(e) => (setWord(e.target.value), setPrev(''))}
          placeholder="Scrivi una parola…"
          autoCapitalize="none"
          autoCorrect="off"
        />
        {!index && !error && (
          <p className="muted small">
            <span className="spinner" /> Preparo il rimario…
          </p>
        )}
        {error && <p className="error small">{error}</p>}
        {copied && <p className="ok small">“{copied}” copiata: incollala dove vuoi.</p>}
        {res && (
          <>
            <Group title="Rime" list={res.rime} />
            <Group title="Multisillabiche" hint={res.target ? `Stesse vocali ${res.target}${prev ? ` (da “${prev} ${w}”)` : ''}` : ''} list={res.multi} />
            <Group title="Assonanze" hint="Stesse vocali dall'accento in poi" list={res.assonanze} />
            {!res.rime.length && !res.multi.length && !res.assonanze.length && <p className="muted">Nessuna parola trovata.</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}
