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

export default function StudioSettings(p) {
  const tap = useTapTempo((b) => p.setBpm(b));
  return (
    <Sheet open onClose={p.onClose} title="Regola lo studio">
      <div className="stack">
        <div className="field">
          <span className="field-label">BPM della traccia</span>
          <div className="row">
            <input className="input bpm-input" type="number" inputMode="numeric" value={p.bpm || ''} placeholder="BPM" onChange={(e) => p.setBpm(e.target.value ? Number(e.target.value) : null)} />
            <button className="btn tap" onClick={tap}>
              Tap a tempo
            </button>
          </div>
          <span className="muted small">Serve per far scorrere il testo a tempo e per il delay degli effetti.</span>
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
        <div className="field">
          <span className="field-label">Quando scegli una strofa, parti…</span>
          <div className="chips">
            {[2, 5, 10].map((v) => (
              <button key={v} className={`chip${p.preRoll === v ? ' on' : ''}`} onClick={() => p.setPreRoll(v)}>
                {v} s prima
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Come registri?</span>
          <div className="chips">
            <button className={`chip${!p.headphones ? ' on' : ''}`} onClick={() => p.setHeadphones(false)}>
              📱 Senza cuffie
            </button>
            <button className={`chip${p.headphones ? ' on' : ''}`} onClick={() => p.setHeadphones(true)}>
              🎧 Con le cuffie
            </button>
          </div>
          <span className="muted small">
            {p.headphones
              ? 'Voce pulitissima: il beat lo senti solo tu in cuffia.'
              : 'Il beat esce dall\'altoparlante: l\'app toglie il più possibile il beat dalla voce (cancellazione eco).'}
          </span>
        </div>
        {p.headphones && (
          <label className="check">
            <input type="checkbox" checked={p.monitor} onChange={(e) => p.setMonitor(e.target.checked)} />
            <span>
              Sentiti in cuffia mentre registri<span className="muted small"> — con gli AirPods la voce arriva un po' in ritardo.</span>
            </span>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={p.countIn} onChange={(e) => p.setCountIn(e.target.checked)} />
          <span>
            Conteggio d'ingresso<span className="muted small"> — 4 click prima che parta il beat</span>
          </span>
        </label>
        <Slider label="Volume beat" value={p.beatVol} min={0} max={1} step={0.05} onChange={p.setBeatVol} format={(v) => `${Math.round(v * 100)}%`} />

        <div className="divider" />
        <h2>Voce in ritardo?</h2>
        <p className="muted small">
          Il telefono ci mette un attimo a far uscire il beat e a registrare la voce: l'app lo compensa. Se nel riascolto la voce arriva <b>in ritardo</b>, alza il valore;
          se arriva <b>in anticipo</b>, abbassalo. Vale per tutte le take registrate in quel modo.
        </p>
        <Slider label="📱 Senza cuffie" value={p.latSpk} min={0} max={600} step={5} onChange={p.setLatSpk} format={(v) => `${v} ms`} />
        <button className="btn" onClick={p.onCalibrate}>
          Misura in automatico (senza cuffie)
        </button>
        <Slider label="🎧 Con cuffie" value={p.latHp} min={0} max={600} step={5} onChange={p.setLatHp} format={(v) => `${v} ms`} />
        <p className="muted small">Con le cuffie regola a orecchio: a filo di solito 20–80 ms, AirPods 150–300 ms.</p>
      </div>
    </Sheet>
  );
}
