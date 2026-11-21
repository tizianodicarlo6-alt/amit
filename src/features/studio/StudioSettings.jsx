import Sheet from '../../components/Sheet.jsx';
import { useTapTempo } from '../../components/useTapTempo.js';

function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <label className="field">
      <span className="row between">
        <span className="field-label">{label}</span>
        <span className="small">{format ? format(value) : value}</span>
      </span>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Stepper({ label, value, min = 0, max = 64, onChange, hint }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="stepper">
        <button className="btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          −
        </button>
        <span className="stepper-value">{value}</span>
        <button className="btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          +
        </button>
      </div>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

export default function StudioSettings(p) {
  const tap = useTapTempo((b) => p.setBpm(b));
  return (
    <Sheet open onClose={p.onClose} title="Regola lo studio">
      <div className="stack">
        <h2>Testo che scorre</h2>
        <div className="field">
          <span className="field-label">BPM della traccia</span>
          <div className="row">
            <input className="input bpm-input" type="number" inputMode="numeric" value={p.bpm || ''} placeholder="BPM" onChange={(e) => p.setBpm(e.target.value ? Number(e.target.value) : null)} />
            <button className="btn tap" onClick={tap}>
              Tap a tempo
            </button>
          </div>
        </div>
        <Stepper
          label="Battute di intro prima del testo"
          value={p.introBars}
          onChange={(v) => p.setTrackStudio({ introBars: v })}
          hint="Quante battute suona il beat prima che inizi la prima barra (di solito 4 o 8)."
        />
        <div className="field">
          <span className="field-label">Velocità</span>
          <div className="chips">
            {[
              [1, '1 barra = 1 battuta'],
              [2, '1 barra = 2 battute'],
            ].map(([v, l]) => (
              <button key={v} className={`chip${p.barsPerLine === v ? ' on' : ''}`} onClick={() => p.setTrackStudio({ barsPerLine: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Grandezza testo</span>
          <div className="chips">
            {[
              [20, 'Piccolo'],
              [24, 'Medio'],
              [30, 'Grande'],
            ].map(([v, l]) => (
              <button key={v} className={`chip${p.fontSize === v ? ' on' : ''}`} onClick={() => p.setFontSize(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="divider" />
        <h2>Registrazione</h2>
        <label className="check">
          <input type="checkbox" checked={p.countIn} onChange={(e) => p.setCountIn(e.target.checked)} />
          <span>
            Conteggio d'ingresso<span className="muted small"> — 4 click prima che parta il beat</span>
          </span>
        </label>
        <Slider label="Volume beat" value={p.beatVol} min={0} max={1} step={0.05} onChange={p.setBeatVol} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Volume voce (riascolto e mix)" value={p.voiceVol} min={0} max={2} step={0.05} onChange={p.setVoiceVol} format={(v) => `${Math.round(v * 100)}%`} />

        <div className="divider" />
        <h2>Ritardo cuffie</h2>
        <Slider label="Compensazione" value={p.latencyMs} min={0} max={500} step={5} onChange={p.setLatencyMs} format={(v) => `${v} ms`} />
        <p className="muted small">
          Se riascoltando la voce arriva <b>in ritardo</b> rispetto al beat, alza questo valore; se arriva in anticipo, abbassalo. Cuffie a filo: di solito 20–80 ms.
          Bluetooth (AirPods): 150–300 ms. Prova: registra battendo le mani sulla cassa e regola finché combaciano.
        </p>
        <button className="btn ghost" onClick={() => p.setLatencyMs(null)}>
          Ripristina valore automatico
        </button>
      </div>
    </Sheet>
  );
}
