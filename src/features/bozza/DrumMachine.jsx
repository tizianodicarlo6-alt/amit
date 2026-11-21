import { useState } from 'react';
import { DRUMS, STYLES, STYLE_ORDER, drumsFromStyle } from './music.js';

// Drum machine a passi (come il Channel Rack di FL Studio): tocchi i quadratini.
export default function DrumMachine({ sketch, change, player, currentStep }) {
  const [page, setPage] = useState(0); // con 32 passi: battuta 1 o 2 del pattern
  const [rollMode, setRollMode] = useState(false);
  const steps = sketch.drumSteps;
  const offset = steps === 32 ? page * 16 : 0;

  const toggle = (id, i, roll) => {
    const row = [...sketch.drums[id]];
    const v = row[i] || 0;
    row[i] = roll && rollMode ? (v + 1) % 5 : v ? 0 : 1; // rulli: 1 → 2 → 3 → 4 → spento
    change({ drums: { ...sketch.drums, [id]: row } });
    if (row[i]) player.preview({ drum: id });
  };

  const applyStyle = (id) => {
    const st = STYLES[id];
    change({ drums: drumsFromStyle(id), drumSteps: 16, swing: st.swing || 0, bpm: st.bpm });
  };

  const clear = () => {
    if (confirm('Svuotare la batteria?')) change({ drums: Object.fromEntries(DRUMS.map((d) => [d.id, Array(32).fill(0)])) });
  };

  return (
    <div className="dm">
      <div className="field">
        <span className="field-label">Groove pronti (poi lo modifichi)</span>
        <div className="chips scroll-x">
          {STYLE_ORDER.map((k) => (
            <button key={k} className="chip" onClick={() => applyStyle(k)}>
              {STYLES[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="dm-opts">
        <div className="segmented">
          <button className={steps === 16 ? 'on' : ''} onClick={() => (change({ drumSteps: 16 }), setPage(0))}>
            1 battuta
          </button>
          <button className={steps === 32 ? 'on' : ''} onClick={() => change({ drumSteps: 32 })}>
            2 battute
          </button>
        </div>
        <button className={`chip${rollMode ? ' on' : ''}`} onClick={() => setRollMode(!rollMode)}>
          Rulli hi-hat
        </button>
      </div>

      {steps === 32 && (
        <div className="segmented dm-page">
          <button className={page === 0 ? 'on' : ''} onClick={() => setPage(0)}>
            Battuta 1
          </button>
          <button className={page === 1 ? 'on' : ''} onClick={() => setPage(1)}>
            Battuta 2
          </button>
        </div>
      )}

      <div className="dm-grid">
        {DRUMS.map((d) => (
          <div key={d.id} className="dm-row">
            <button className="dm-lab" onClick={() => player.preview({ drum: d.id })}>
              {d.label}
            </button>
            <div className="dm-steps">
              {Array.from({ length: 16 }, (_, k) => {
                const i = offset + k;
                const v = sketch.drums[d.id][i] || 0;
                const now = currentStep != null && currentStep % steps === i;
                return (
                  <button
                    key={k}
                    className={`dm-cell${v ? ' on' : ''}${k % 4 === 0 ? ' beat' : ''}${now ? ' now' : ''}`}
                    onClick={() => toggle(d.id, i, d.roll)}
                    aria-label={`${d.label} passo ${i + 1}`}
                  >
                    {v > 1 ? `×${v}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {rollMode && <p className="muted small">Rulli: tocca più volte un passo dell'hi-hat per ×2, ×3, ×4 colpi (tipico della trap).</p>}

      <label className="vol-row">
        <span className="fx-label">Swing</span>
        <input className="slider" type="range" min={0} max={60} step={5} value={sketch.swing} onChange={(e) => change({ swing: Number(e.target.value) })} />
        <span className="small vol-val">{sketch.swing}%</span>
      </label>
      <button className="btn ghost sm" onClick={clear}>
        Svuota la batteria
      </button>
    </div>
  );
}
