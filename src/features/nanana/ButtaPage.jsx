import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import BeatLoop from '../../components/BeatLoop.jsx';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addIdea, addTrack, db, newId, updateIdea, updateTrack } from '../../db/db.js';
import { loadRank } from '../../lib/rimario.js';
import { sistema } from '../../lib/sistema.js';
import { logEvent } from '../../lib/stats.js';

const KEY = 'amit.butta';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};

// 🌪 Butta tutto: beat in loop, butti dentro tutto quello che ti passa per la testa, poi "Sistema"
export default function ButtaPage() {
  const navigate = useNavigate();
  const [s, setS] = useState(load); // { beatId, region, text }
  const set = (c) => setS((o) => ({ ...o, ...c }));
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignorato */
    }
  }, [s]);
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const beat = beats.find((b) => b.id === s.beatId) || null;
  const [picking, setPicking] = useState(false);
  const [res, setRes] = useState(null);
  const [pick, setPick] = useState(new Set());
  const [rank, setRank] = useState(null);
  const taRef = useRef(null);
  useEffect(() => {
    loadRank().then(setRank).catch(() => {});
  }, []);

  const run = () => {
    const r = sistema(s.text || '', { rank });
    setRes(r);
    setPick(new Set([...r.coppie.flat(), ...r.buone]));
  };
  const toggle = (f) => {
    const n = new Set(pick);
    if (n.has(f)) n.delete(f);
    else n.add(f);
    setPick(n);
  };
  // le frasi scelte, con le coppie che rimano vicine
  const chosen = () => {
    const out = [];
    for (const g of res.coppie) for (const f of g) if (pick.has(f) && !out.includes(f)) out.push(f);
    for (const f of res.buone) if (pick.has(f) && !out.includes(f)) out.push(f);
    return out;
  };
  const titleOf = () => res.temi[0]?.parola ? res.temi[0].parola[0].toUpperCase() + res.temi[0].parola.slice(1) : 'Butta tutto';

  const toNote = async () => {
    const lines = chosen();
    if (!lines.length) return;
    const extra = [res.temi.length && `Temi: ${res.temi.map((t) => t.parola).join(', ')}`, res.forti.length && `Parole: ${res.forti.join(', ')}`].filter(Boolean);
    const nid = await addIdea({ type: 'text', text: [...lines, '', ...extra].join('\n').trim(), tags: ['butta tutto'] });
    await updateIdea(nid, { title: titleOf(), beatId: beat?.id || null, loop: s.region || null });
    navigate(`/taccuino?apri=${nid}`);
  };
  const toTrack = async () => {
    logEvent('reuse');
    const lines = chosen();
    const tid = await addTrack({ title: titleOf() });
    const secId = newId();
    await updateTrack(tid, {
      sections: [{ id: secId, type: 'strofa', text: lines.join('\n') }],
      notes: res.temi.length ? `Temi: ${res.temi.map((t) => t.parola).join(', ')}` : '',
      ...(beat ? { beatId: beat.id, bpm: beat.bpm || null, studio: s.region ? { loops: { [secId]: s.region } } : {} } : {}),
    });
    navigate(`/traccia/${tid}`);
  };

  return (
    <div className="page butta">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <h1 className="grow">Butta tutto</h1>
        {beat && !picking && (
          <button className="btn sm ghost" onClick={() => setPicking(true)}>
            Cambia beat
          </button>
        )}
      </header>

      {(picking || (!beat && beats.length > 0 && s.beatId !== 'none')) && (
        <div className="stack">
          <p className="muted small">Scegli il beat (oppure vai senza).</p>
          <div className="list">
            {beats.map((b) => (
              <button key={b.id} className={`beat-pick${b.id === s.beatId ? ' on' : ''}`} onClick={() => (set({ beatId: b.id, region: null }), setPicking(false))}>
                <span className="ellipsis grow">{b.title || 'Beat'}</span>
                <span className="muted small">{[b.bpm && `${b.bpm} BPM`, b.key].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => (set({ beatId: 'none' }), setPicking(false))}>
            Senza beat
          </button>
        </div>
      )}

      {!picking && (beat || s.beatId === 'none' || !beats.length) && (
        <div className="stack">
          {beat && <BeatLoop beat={beat} region={s.region || null} onRegion={(r) => set({ region: r })} />}
          {!res ? (
            <>
              <textarea
                ref={taRef}
                className="input butta-text"
                value={s.text || ''}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="Butta tutto qui: parole, mezze frasi, immagini, quello che ti dice la testa sul beat. Anche a voce col microfono della tastiera. Non pensare, butta."
                autoCapitalize="sentences"
              />
              <div className="row">
                <button className="btn primary grow" onClick={run} disabled={!(s.text || '').trim()}>
                  Sistema
                </button>
                {(s.text || '').trim() && (
                  <button className="btn ghost" onClick={() => confirm('Cancellare tutto quello che hai buttato?') && set({ text: '' })}>
                    Svuota
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="stack sistema">
              {res.coppie.length > 0 && (
                <div className="field">
                  <span className="field-label">Coppie che rimano</span>
                  {res.coppie.map((g, i) => (
                    <div key={i} className="sis-group">
                      {g.map((f) => (
                        <label key={f} className="sis-row">
                          <input type="checkbox" checked={pick.has(f)} onChange={() => toggle(f)} />
                          <span>{f}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {res.buone.filter((f) => !res.coppie.flat().includes(f)).length > 0 && (
                <div className="field">
                  <span className="field-label">Frasi buone</span>
                  {res.buone
                    .filter((f) => !res.coppie.flat().includes(f))
                    .map((f) => (
                      <label key={f} className="sis-row">
                        <input type="checkbox" checked={pick.has(f)} onChange={() => toggle(f)} />
                        <span>{f}</span>
                      </label>
                    ))}
                </div>
              )}
              {res.temi.length > 0 && (
                <div className="field">
                  <span className="field-label">Temi che tornano</span>
                  <div className="chips">
                    {res.temi.map((t) => (
                      <span key={t.parola} className="chip sm static">
                        {t.parola} ×{t.volte}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {res.forti.length > 0 && (
                <div className="field">
                  <span className="field-label">Parole forti</span>
                  <div className="chips">
                    {res.forti.map((w) => (
                      <span key={w} className="chip sm static ghosty">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {!res.coppie.length && !res.buone.length && <p className="muted">Ancora troppo poco per sistemare: butta qualche frase in più.</p>}
              <div className="row">
                <button className="btn primary grow" onClick={toTrack} disabled={!pick.size}>
                  Porta in una traccia
                </button>
                <button className="btn" onClick={toNote} disabled={!pick.size}>
                  Nota
                </button>
              </div>
              <button className="btn ghost" onClick={() => setRes(null)}>
                Torna a buttare
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
