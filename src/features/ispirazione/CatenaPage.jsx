import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { addIdea } from '../../db/db.js';
import { countLineSyllables } from '../../lib/italiano.js';
import { closesOn } from './catenaLogic.js';
import { loadIndex, loadRank, suggest } from '../../lib/rimario.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const LABEL = { rima: 'rima', multi: 'multisillabica', assonanza: 'assonanza', stessa: 'stessa parola' };

// ∞ Catena di rime: una parola, 1 o 2 quartine che chiudono su quel suono
export default function CatenaPage() {
  const navigate = useNavigate();
  const [word, setWord] = useState(null);
  const [help, setHelp] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [quartine, setQuartine] = useState(1);
  const [lines, setLines] = useState(['', '', '', '']);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([loadIndex(), loadRank()])
      .then(([index, rank]) => {
        const words = [...rank.keys()].slice(300, 6000).filter((w) => w.length >= 5);
        for (let k = 0; k < 60; k++) {
          const w = pick(words);
          const r = suggest(index, w, '', 30);
          if (r.rime.length >= 8 && alive) {
            setWord(w);
            setHelp(r);
            return;
          }
        }
      })
      .catch(() => alive && setErr('La parola si scarica la prima volta con internet. Riprova quando sei connesso.'));
    return () => {
      alive = false;
    };
  }, [n]);

  const total = quartine * 4;
  const shown = Array.from({ length: total }, (_, i) => lines[i] || '');
  const results = word ? shown.map((l) => (l.trim() ? closesOn(l, word) : null)) : [];
  const good = results.filter((r) => r && r !== 'stessa').length;
  const done = word && good === total;

  const setLine = (i, v) => {
    const next = [...shown];
    next[i] = v;
    setLines(next);
    setSaved(false);
  };
  const another = () => {
    setWord(null);
    setHelp(null);
    setShowHelp(false);
    setLines(['', '', '', '']);
    setSaved(false);
    setN(n + 1);
  };
  const save = async () => {
    await addIdea({ type: 'text', text: shown.filter((l) => l.trim()).join('\n'), tags: ['catena', word] });
    setSaved(true);
  };

  return (
    <div className="page catena">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <h1 className="grow">Catena di rime</h1>
      </header>

      {err && <p className="error">{err}</p>}
      {!word && !err && (
        <p className="muted center">
          <span className="spinner" />
        </p>
      )}

      {word && (
        <div className="stack">
          <div className="cat-word">{word}</div>
          <p className="muted small">Ogni barra deve chiudere su questo suono: rima, assonanza o multisillabica. Vale tutto tranne la stessa parola.</p>
          <div className="segmented">
            {[1, 2].map((q) => (
              <button key={q} className={quartine === q ? 'on' : ''} onClick={() => setQuartine(q)}>
                {q === 1 ? '1 quartina' : '2 quartine'}
              </button>
            ))}
          </div>

          <div className="cat-lines">
            {shown.map((l, i) => (
              <div key={i} className={`cat-line${i === 4 ? ' gap' : ''}`}>
                <input className="input" value={l} onChange={(e) => setLine(i, e.target.value)} placeholder={`Barra ${i + 1}`} autoCapitalize="sentences" />
                <span className={`cat-res${results[i] && results[i] !== 'stessa' ? ' ok' : results[i] === 'stessa' ? ' no' : ''}`}>
                  {l.trim() ? (results[i] ? LABEL[results[i]] : 'non chiude') : ''}
                  {l.trim() && <small>{countLineSyllables(l)} sill.</small>}
                </span>
              </div>
            ))}
          </div>

          <div className={`cat-progress${done ? ' done' : ''}`}>{done ? 'Fatta ✓' : `${good}/${total} barre chiudono sul suono`}</div>

          <button className="btn ghost sm" onClick={() => setShowHelp(!showHelp)}>
            {showHelp ? 'Nascondi aiuto' : 'Aiuto: mostrami qualche rima'}
          </button>
          {showHelp && help && (
            <div className="chips">
              {[...help.rime.slice(0, 14), ...help.multi.slice(0, 6)].map((x) => (
                <span key={x} className="chip sm static">
                  {x}
                </span>
              ))}
            </div>
          )}

          <div className="row">
            <button className="btn primary grow" onClick={save} disabled={!shown.some((l) => l.trim()) || saved}>
              {saved ? '✓ Nelle note' : 'Salva nelle note'}
            </button>
            <button className="btn" onClick={another}>
              Un'altra parola
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
