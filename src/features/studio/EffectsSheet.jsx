import { useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { FX_ORDER, FX_PRESETS, normalizeStrip, presetOf } from './fx.js';

const DIVS = [
  [1, '1/4'],
  [0.75, '1/8 puntato'],
  [0.5, '1/8'],
  [0.25, '1/16'],
];

// Gli insert della voce, come la colonna effetti di un canale in Logic
const SLOTS = [
  {
    id: 'eq',
    name: 'EQ',
    desc: 'Pulisce e dà presenza',
    summary: (v) => `taglio ${v.lowcut} Hz · presenza ${v.presence > 0 ? '+' : ''}${v.presence} dB`,
    params: [
      { k: 'lowcut', label: 'Taglio bassi', min: 40, max: 300, step: 5, unit: 'Hz' },
      { k: 'mud', label: 'Fango (300 Hz)', min: -10, max: 4, step: 0.5, unit: 'dB' },
      { k: 'presence', label: 'Presenza (3.5 kHz)', min: -6, max: 10, step: 0.5, unit: 'dB' },
      { k: 'air', label: 'Aria (10 kHz)', min: -6, max: 10, step: 0.5, unit: 'dB' },
    ],
  },
  {
    id: 'comp',
    name: 'Compressore',
    desc: 'Tiene la voce sempre davanti',
    summary: (v) => `${v.threshold} dB · ${v.ratio}:1`,
    params: [
      { k: 'threshold', label: 'Soglia', min: -50, max: 0, step: 1, unit: 'dB' },
      { k: 'ratio', label: 'Rapporto', min: 1, max: 20, step: 0.5, unit: ':1' },
      { k: 'attack', label: 'Attacco', min: 1, max: 80, step: 1, unit: 'ms' },
      { k: 'release', label: 'Rilascio', min: 30, max: 800, step: 10, unit: 'ms' },
      { k: 'makeup', label: 'Guadagno', min: 0, max: 18, step: 0.5, unit: 'dB' },
    ],
  },
  {
    id: 'sat',
    name: 'Saturazione',
    desc: 'Suono più sporco e caldo',
    summary: (v) => `drive ${v.drive}%`,
    params: [{ k: 'drive', label: 'Drive', min: 0, max: 100, step: 1, unit: '%' }],
  },
  {
    id: 'delay',
    name: 'Delay',
    desc: 'Eco a tempo col beat',
    summary: (v) => `${DIVS.find(([d]) => d === v.div)?.[1] || ''} · ${v.mix}%`,
    params: [
      { k: 'div', label: 'Tempo', options: DIVS },
      { k: 'feedback', label: 'Ripetizioni', min: 0, max: 80, step: 1, unit: '%' },
      { k: 'mix', label: 'Quantità', min: 0, max: 50, step: 1, unit: '%' },
    ],
  },
  {
    id: 'reverb',
    name: 'Riverbero',
    desc: 'Lo spazio intorno alla voce',
    summary: (v) => `${v.size} s · ${v.mix}%`,
    params: [
      { k: 'size', label: 'Dimensione', min: 0.3, max: 4, step: 0.1, unit: 's' },
      { k: 'mix', label: 'Quantità', min: 0, max: 60, step: 1, unit: '%' },
    ],
  },
];

export default function EffectsSheet({ fx, onChange, onPlay, playing, loading, onClose }) {
  const [strip, setStrip] = useState(() => normalizeStrip(fx));
  const [open, setOpen] = useState('comp');
  const preset = presetOf(strip);

  const commit = (next) => onChange(next);
  const setParam = (slot, k, v, now = false) => {
    const next = { ...strip, [slot]: { ...strip[slot], [k]: v } };
    setStrip(next);
    if (now) commit(next);
  };
  const toggle = (slot) => {
    const next = { ...strip, [slot]: { ...strip[slot], on: !strip[slot].on } };
    setStrip(next);
    commit(next);
  };
  const loadPreset = (k) => {
    const next = normalizeStrip(k);
    setStrip(next);
    commit(next);
  };

  return (
    <Sheet open onClose={onClose} title="Effetti voce">
      <div className="stack">
        <div className="sheet-top">
          <span className="muted small grow">Valgono per tutte le take. Tocca ▶ e regola mentre ascolti.</span>
          <button className="play-mini" onClick={onPlay} disabled={loading} aria-label={playing ? 'Stop' : 'Ascolta'}>
            {loading ? <span className="spinner" /> : <Icon name={playing ? 'stop' : 'play'} size={20} />}
          </button>
        </div>

        <div className="field">
          <span className="field-label">Parti da {preset ? '' : '· (personalizzato)'}</span>
          <div className="chips">
            {FX_ORDER.map((k) => (
              <button key={k} className={`chip${preset === k ? ' on' : ''}`} onClick={() => loadPreset(k)}>
                {FX_PRESETS[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="inserts">
          {SLOTS.map((sl) => {
            const v = strip[sl.id];
            const isOpen = open === sl.id;
            return (
              <div key={sl.id} className={`insert${v.on ? ' on' : ''}${isOpen ? ' open' : ''}`}>
                <div className="insert-head">
                  <button className="power" onClick={() => toggle(sl.id)} aria-label={v.on ? `Spegni ${sl.name}` : `Accendi ${sl.name}`} aria-pressed={v.on}>
                    ⏻
                  </button>
                  <button className="insert-name" onClick={() => setOpen(isOpen ? null : sl.id)}>
                    <span className="reco-title">{sl.name}</span>
                    <span className="muted small">{v.on ? sl.summary(v) : 'spento'}</span>
                  </button>
                  <button className="icon-btn sm" onClick={() => setOpen(isOpen ? null : sl.id)} aria-label="Apri controlli">
                    <Icon name={isOpen ? 'up' : 'down'} size={18} />
                  </button>
                </div>
                {isOpen && (
                  <div className="insert-body">
                    <p className="muted small">{sl.desc}</p>
                    {sl.params.map((pa) =>
                      pa.options ? (
                        <div key={pa.k} className="field">
                          <span className="field-label">{pa.label}</span>
                          <div className="chips">
                            {pa.options.map(([val, lab]) => (
                              <button key={val} className={`chip${v[pa.k] === val ? ' on' : ''}`} onClick={() => setParam(sl.id, pa.k, val, true)}>
                                {lab}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <label key={pa.k} className="field">
                          <span className="row between">
                            <span className="field-label">{pa.label}</span>
                            <span className="small mono">
                              {v[pa.k]} {pa.unit}
                            </span>
                          </span>
                          <input
                            className="slider"
                            type="range"
                            min={pa.min}
                            max={pa.max}
                            step={pa.step}
                            value={v[pa.k]}
                            disabled={!v.on}
                            onChange={(e) => setParam(sl.id, pa.k, Number(e.target.value))}
                            onPointerUp={() => commit(strip)}
                            onKeyUp={() => commit(strip)}
                          />
                        </label>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
