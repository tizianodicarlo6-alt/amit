import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { STUDIO, bookingLink } from '../../config.js';
import { getProfile } from '../../lib/profile.js';
import ExportRow, { slug } from './ExportRow.jsx';
import { presetOf, FX_PRESETS } from './fx.js';

// "Mix & Salva": volumi, ritardo della voce e salvataggio del provino
export default function MixSheet(p) {
  const onCount = p.takes.filter((t) => t.included !== false).length;
  const preset = presetOf(p.fx);
  const prepMix = async () => {
    const voices = await p.loadVoices({ only: null, ignoreSolo: true });
    if (!voices.length) throw new Error('nessuna take accesa');
    const blob = await p.engine.renderMix({ beat: p.beatBuf, voices, beatGain: p.beatVol, fx: p.fx, bpm: p.bpm });
    return [new File([blob], `${slug(`${p.track.title} - provino`)}.wav`, { type: 'audio/wav' })];
  };

  return (
    <Sheet open onClose={p.onClose} title="Mix & Salva">
      <div className="stack">
        <div className="sheet-top">
          <span className="muted small grow">Regola mentre ascolti.</span>
          <button className="play-mini" onClick={p.onPlay} disabled={p.loading} aria-label={p.playing ? 'Stop' : 'Ascolta'}>
            {p.loading ? <span className="spinner" /> : <Icon name={p.playing ? 'stop' : 'play'} size={20} />}
          </button>
        </div>

        <label className="field">
          <span className="row between">
            <span className="field-label">Voce sul beat</span>
            <span className="small mono">
              {p.voiceDb > 0 ? '+' : ''}
              {p.voiceDb} dB
            </span>
          </span>
          <input className="slider" type="range" min={-6} max={12} step={0.5} value={p.voiceDb} onChange={(e) => p.setVoiceDb(Number(e.target.value))} onPointerUp={p.onEdited} />
        </label>
        <label className="field">
          <span className="row between">
            <span className="field-label">Volume beat</span>
            <span className="small mono">{Math.round(p.beatVol * 100)}%</span>
          </span>
          <input className="slider" type="range" min={0} max={1} step={0.05} value={p.beatVol} onChange={(e) => p.setBeatVol(Number(e.target.value))} onPointerUp={p.onEdited} />
        </label>
        <div className="field">
          <span className="field-label">Voce in ritardo? {p.headphones ? '🎧 con cuffie' : '📱 senza cuffie'}</span>
          <div className="stepper sm">
            <button className="btn sm" onClick={() => p.nudgeLat(-10)} aria-label="Meno ritardo">
              −
            </button>
            <span className="mono">{p.curLatMs} ms</span>
            <button className="btn sm" onClick={() => p.nudgeLat(10)} aria-label="Più ritardo">
              +
            </button>
          </div>
          <span className="muted small">Se la voce arriva dopo il beat alza, se arriva prima abbassa.</span>
        </div>

        <div className="divider" />
        <ExportRow
          key={`mix-${JSON.stringify(p.fx)}-${p.voiceDb}-${p.beatVol}-${p.takes.map((t) => `${t.id}${t.included}${t.role}${t.trimStart}${t.trimEnd}${t.pitch}${t.gainDb}${t.offset}`).join()}`}
          primary
          icon="tracce"
          title="Salva il provino"
          subtitle={`Beat + ${onCount} take con effetti ${preset ? `"${FX_PRESETS[preset].label}"` : 'personalizzati'}, in un unico file.`}
          prepare={prepMix}
        />
        {!getProfile() && (
        <div className="card studio-card">
          <div className="studio-text">
            <div className="studio-kicker">{STUDIO.name}</div>
            <div className="studio-title">Ti convince?</div>
            <p className="muted small">Se il provino spacca, vieni a registrarlo da {STUDIO.name}: rec, mix e master professionali.</p>
          </div>
          <a className="btn primary big" href={bookingLink(p.track.title, p.bpm)} target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" /> Prenota la sessione
          </a>
        </div>
        )}
      </div>
    </Sheet>
  );
}
