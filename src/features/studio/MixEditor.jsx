import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { deleteTake, splitTake, updateTake } from '../../db/db.js';
import { formatTime, roleLabel } from '../../constants.js';
import { STUDIO, bookingLink } from '../../config.js';
import { computePeaks } from '../../lib/audio.js';
import { FX_ORDER, FX_PRESETS } from './fx.js';
import { takeLatency, trimOf } from './voices.js';
import ExportRow, { slug } from './ExportRow.jsx';

const LANES = [
  { id: 'main', label: 'Voce' },
  { id: 'double', label: 'Doppie' },
  { id: 'adlib', label: 'Adlib' },
];
const ZOOMS = [6, 12, 25, 50, 100]; // pixel per secondo
const PEAKS_PER_SEC = 40;
const ROLE_ORDER = ['main', 'double', 'adlib'];
const nextRole = (r) => ROLE_ORDER[(ROLE_ORDER.indexOf(r || 'main') + 1) % ROLE_ORDER.length];

function Bars({ peaks, width, height = 40 }) {
  if (!peaks?.length) return null;
  const w = width / peaks.length;
  return (
    <svg className="reg-wave" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {peaks.map((p, i) => {
        const h = Math.max(1, p * height);
        return <rect key={i} x={i * w} y={(height - h) / 2} width={Math.max(0.6, w * 0.8)} height={h} />;
      })}
    </svg>
  );
}

/**
 * Montaggio stile Logic: piste Voce / Doppie / Adlib, blocchi da tagliare, spostare, dividere,
 * con volume e pitch per ogni take.
 */
export default function MixEditor(p) {
  const { takes, beat, beatBuf, duration, blocks, position, playing, loading, lat, engine, loadTakeBuffer } = p;
  const [zoomIdx, setZoomIdx] = useState(2);
  const pps = ZOOMS[zoomIdx];
  const [selectedId, setSelectedId] = useState(null);
  const [drag, setDrag] = useState(null); // { id, kind, x0, dt }
  const [peaks, setPeaks] = useState({}); // audioId → picchi
  const [busy, setBusy] = useState('');
  const scrollRef = useRef(null);

  const selected = takes.find((t) => t.id === selectedId) || null;

  // forme d'onda delle take
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const t of takes) {
        if (peaks[t.audioId]) continue;
        try {
          const buf = await loadTakeBuffer(t);
          const pk = computePeaks(buf.getChannelData(0), Math.max(8, Math.ceil(buf.duration * PEAKS_PER_SEC)));
          if (alive) setPeaks((m) => ({ ...m, [t.audioId]: pk }));
        } catch {
          /* ignorato */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [takes]); // eslint-disable-line react-hooks/exhaustive-deps

  // la vista segue la testina mentre suona
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = position * pps;
    if (x < el.scrollLeft + 30 || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.25);
  }, [position, playing, pps]);

  // posizione e taglio (con l'anteprima durante il trascinamento)
  const geom = (t) => {
    const pos = t.offset - takeLatency(t, lat);
    let { ts, te } = trimOf(t);
    let offset = pos;
    if (drag && drag.id === t.id) {
      if (drag.kind === 'move') offset += drag.dt;
      if (drag.kind === 'start') ts = Math.min(te - 0.1, Math.max(0, ts + drag.dt));
      if (drag.kind === 'end') te = Math.max(ts + 0.1, Math.min(t.duration, te + drag.dt));
    }
    return { pos: offset, ts, te, left: (offset + ts) * pps, width: Math.max(4, (te - ts) * pps) };
  };

  const totalWidth = Math.max(duration, ...takes.map((t) => t.offset + t.duration)) * pps + 80;

  // ---- tocchi sul righello: sposto la testina
  const timeAt = (e) => {
    const el = scrollRef.current;
    const r = el.getBoundingClientRect();
    return Math.max(0, (e.clientX - r.left + el.scrollLeft) / pps);
  };

  // ---- trascinamento dei blocchi
  const onDown = (e, t, kind) => {
    e.stopPropagation();
    if (selectedId !== t.id) {
      setSelectedId(t.id);
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: t.id, kind, x0: e.clientX, dt: 0 });
  };
  const onMove = (e) => {
    if (!drag) return;
    setDrag((d) => ({ ...d, dt: (e.clientX - d.x0) / pps }));
  };
  const onUp = async () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (Math.abs(d.dt) < 0.005) return;
    const t = takes.find((x) => x.id === d.id);
    if (!t) return;
    const { ts, te } = trimOf(t);
    if (d.kind === 'move') await updateTake(t.id, { offset: t.offset + d.dt });
    if (d.kind === 'start') await updateTake(t.id, { trimStart: Math.min(te - 0.1, Math.max(0, ts + d.dt)) });
    if (d.kind === 'end') await updateTake(t.id, { trimEnd: Math.max(ts + 0.1, Math.min(t.duration, te + d.dt)) });
    p.onEdited();
  };

  // ---- comandi sul blocco selezionato
  const edit = async (changes) => {
    await updateTake(selected.id, changes);
    p.onEdited();
  };
  const selGeom = selected ? geom(selected) : null;
  const playheadInside = selGeom && position > selGeom.pos + selGeom.ts + 0.05 && position < selGeom.pos + selGeom.te - 0.05;

  const split = async () => {
    if (!playheadInside) return;
    const newId = await splitTake(selected.id, position - selGeom.pos);
    if (newId) setSelectedId(newId);
    p.onEdited();
  };
  const remove = async () => {
    if (!confirm(`Eliminare "${selected.name}"?`)) return;
    await deleteTake(selected.id);
    setSelectedId(null);
    p.onEdited();
  };
  const setPitch = async (v) => {
    const semis = Math.max(-12, Math.min(12, v));
    setBusy('pitch');
    await new Promise((r) => setTimeout(r, 30)); // lascio aggiornare lo schermo
    try {
      engine.pitched(selected.audioId, await loadTakeBuffer(selected), semis); // preparo subito il suono
    } catch {
      /* lo calcolerà al riascolto */
    }
    setBusy('');
    edit({ pitch: semis });
  };

  const sectionMarks = useMemo(() => blocks.map((b) => ({ id: b.id, x: b.start * pps, label: b.label })), [blocks, pps]);
  const tickEvery = pps >= 50 ? 1 : pps >= 25 ? 2 : pps >= 12 ? 5 : 10;
  const ticks = [];
  for (let s = 0; s <= duration + 1; s += tickEvery) ticks.push(s);

  const onCount = takes.filter((t) => t.included !== false).length;
  const prepMix = async () => {
    const voices = await p.loadVoices();
    if (!voices.length) throw new Error('nessuna take accesa');
    const blob = await engine.renderMix({ beat: beatBuf, voices, beatGain: p.beatVol, fx: p.fx, bpm: p.bpm });
    return [new File([blob], `${slug(p.track.title)} - provino.wav`, { type: 'audio/wav' })];
  };
  const prepVoice = async () => {
    const [voice] = await p.loadVoices({ only: [selected.id] });
    return [new File([engine.renderVoiceAligned({ voice })], `${slug(`${p.track.title} - ${selected.name}`)}.wav`, { type: 'audio/wav' })];
  };

  return (
    <div className="mixed">
      {/* ------- area di arrangiamento ------- */}
      <div className="arr">
        <div className="arr-labels">
          <div className="arr-ruler-h" />
          <div className="arr-lab beat">Beat</div>
          {LANES.map((l) => (
            <div key={l.id} className="arr-lab">
              {l.label}
            </div>
          ))}
        </div>
        <div className="arr-scroll" ref={scrollRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
          <div className="arr-inner" style={{ width: totalWidth }}>
            <div className="arr-ruler" onClick={(e) => p.onSeek(timeAt(e))}>
              {ticks.map((s) => (
                <span key={s} className="tick" style={{ left: s * pps }}>
                  {formatTime(s)}
                </span>
              ))}
              {sectionMarks.map((m) => (
                <span key={m.id} className="sec" style={{ left: m.x }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="arr-lane beat" onClick={(e) => p.onSeek(timeAt(e))}>
              {beat?.peaks && <Bars peaks={beat.peaks} width={duration * pps} height={36} />}
            </div>
            {LANES.map((l) => (
              <div key={l.id} className="arr-lane" onClick={() => setSelectedId(null)}>
                {takes
                  .filter((t) => (t.role || 'main') === l.id)
                  .sort((a, b) => a.createdAt - b.createdAt)
                  .map((t) => {
                    const g = geom(t);
                    const pk = peaks[t.audioId];
                    const sel = t.id === selectedId;
                    return (
                      <div
                        key={t.id}
                        className={`region role-${l.id}${sel ? ' sel' : ''}${t.included === false ? ' off' : ''}`}
                        style={{ left: g.left, width: g.width }}
                        onPointerDown={(e) => onDown(e, t, 'move')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="reg-inner" style={{ left: -g.ts * pps, width: t.duration * pps }}>
                          <Bars peaks={pk} width={t.duration * pps} />
                        </div>
                        <span className="reg-name">
                          {t.name}
                          {t.pitch ? ` · ${t.pitch > 0 ? '+' : ''}${t.pitch}` : ''}
                        </span>
                        {sel && (
                          <>
                            <span className="handle l" onPointerDown={(e) => onDown(e, t, 'start')} />
                            <span className="handle r" onPointerDown={(e) => onDown(e, t, 'end')} />
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
            <div className="playhead" style={{ left: position * pps }} />
          </div>
        </div>
      </div>

      {/* ------- comandi ------- */}
      <div className="mixed-panel">
        {selected ? (
          <div className="inspector">
            <div className="row between">
              <div className="row" style={{ gap: 8 }}>
                <span className="reco-title">{selected.name}</span>
                <button className="chip role-chip" onClick={() => edit({ role: nextRole(selected.role) })}>
                  {roleLabel(selected.role).toUpperCase()}
                </button>
              </div>
              <button className="icon-btn sm" onClick={() => setSelectedId(null)} aria-label="Chiudi">
                <Icon name="x" size={18} />
              </button>
            </div>
            <p className="muted small">Trascina i bordi bianchi per tagliare · trascina il blocco per spostarlo</p>
            <div className="insp-grid">
              <span className="fx-label">Volume</span>
              <div className="stepper sm">
                <button className="btn sm" onClick={() => edit({ gainDb: Math.max(-24, (selected.gainDb || 0) - 1) })}>
                  −
                </button>
                <span className="mono">
                  {(selected.gainDb || 0) > 0 ? '+' : ''}
                  {selected.gainDb || 0} dB
                </span>
                <button className="btn sm" onClick={() => edit({ gainDb: Math.min(12, (selected.gainDb || 0) + 1) })}>
                  +
                </button>
              </div>
              <span className="fx-label">Pitch</span>
              <div className="stepper sm">
                <button className="btn sm" onClick={() => setPitch((selected.pitch || 0) - 1)} disabled={busy === 'pitch'}>
                  −
                </button>
                <span className="mono">{busy === 'pitch' ? '…' : `${(selected.pitch || 0) > 0 ? '+' : ''}${selected.pitch || 0} st`}</span>
                <button className="btn sm" onClick={() => setPitch((selected.pitch || 0) + 1)} disabled={busy === 'pitch'}>
                  +
                </button>
                {selected.pitch ? (
                  <button className="btn sm ghost" onClick={() => setPitch(0)}>
                    0
                  </button>
                ) : null}
              </div>
              <span className="fx-label">Sposta</span>
              <div className="stepper sm">
                <button className="btn sm" onClick={() => edit({ offset: selected.offset - 0.01 })}>
                  ◀ 10 ms
                </button>
                <button className="btn sm" onClick={() => edit({ offset: selected.offset + 0.01 })}>
                  10 ms ▶
                </button>
              </div>
            </div>
            <div className="row">
              <button className="btn sm grow" onClick={split} disabled={!playheadInside} title="Porta la testina dentro il blocco">
                ✂ Taglia qui
              </button>
              <button className={`btn sm grow${selected.included !== false ? ' primary' : ''}`} onClick={() => edit({ included: selected.included === false })}>
                {selected.included !== false ? 'Acceso' : 'Spento'}
              </button>
              <button className="btn sm danger" onClick={remove} aria-label="Elimina">
                <Icon name="trash" size={18} />
              </button>
            </div>
            {!playheadInside && <p className="muted small">Per tagliare in due: tocca il righello per mettere la testina dentro il blocco.</p>}
            <ExportRow key={`v-${selected.id}-${selected.pitch}-${selected.trimStart}-${selected.trimEnd}`} icon="mic" title="Salva solo questa voce" subtitle="Senza beat e senza effetti." prepare={prepVoice} />
          </div>
        ) : (
          <div className="stack">
            {takes.length === 0 && <p className="muted">Nessuna registrazione ancora: vai su "Registra" e premi il tasto rosso.</p>}
            {takes.length > 0 && <p className="muted small">Tocca un blocco per tagliarlo, spostarlo, cambiare volume o pitch.</p>}
            <div className="fx-bar">
              <span className="fx-label">Effetti</span>
              <div className="chips scroll-x fx-chips">
                {FX_ORDER.map((k) => (
                  <button key={k} className={`chip${p.fx === k ? ' on' : ''}`} onClick={() => p.changeFx(k)}>
                    {FX_PRESETS[k].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="vol-row">
              <span className="fx-label">Voce sul beat</span>
              <input className="slider" type="range" min={-6} max={12} step={0.5} value={p.voiceDb} onChange={(e) => p.setVoiceDb(Number(e.target.value))} onPointerUp={p.onEdited} />
              <span className="small vol-val">
                {p.voiceDb > 0 ? '+' : ''}
                {p.voiceDb} dB
              </span>
            </label>
            <div className="vol-row">
              <span className="fx-label">Voce in ritardo? {p.headphones ? '🎧' : '📱'}</span>
              <button className="btn sm" onClick={() => p.nudgeLat(-10)} aria-label="Meno ritardo">
                −
              </button>
              <span className="small vol-val mono">{p.curLatMs} ms</span>
              <button className="btn sm" onClick={() => p.nudgeLat(10)} aria-label="Più ritardo">
                +
              </button>
            </div>
            {takes.length > 0 && beatBuf && (
              <>
                <ExportRow
                  key={`mix-${p.fx}-${p.voiceDb}-${takes.map((t) => `${t.id}${t.included}${t.role}${t.trimStart}${t.trimEnd}${t.pitch}${t.gainDb}${t.offset}`).join()}`}
                  primary
                  icon="tracce"
                  title="Salva il provino"
                  subtitle={`Beat + ${onCount} ${onCount === 1 ? 'take' : 'take'} con effetto "${FX_PRESETS[p.fx]?.label}", in un unico file.`}
                  prepare={prepMix}
                />
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
              </>
            )}
          </div>
        )}
      </div>

      {/* ------- trasporto ------- */}
      <div className="transport mixed-transport">
        <button className="t-btn" onClick={() => p.onSeek(0)} disabled={loading}>
          <Icon name="back" size={24} />
          <span>Inizio</span>
        </button>
        <button className="play-main" onClick={p.onPlay} disabled={!beatBuf || loading} aria-label={playing ? 'Stop' : 'Ascolta'}>
          {loading ? <span className="spinner big" /> : <Icon name={playing ? 'stop' : 'play'} size={34} />}
        </button>
        <span className="mono mixed-time">{formatTime(Math.max(0, position))}</span>
        <div className="zoom">
          <button className="btn sm" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0} aria-label="Allontana">
            −
          </button>
          <span className="fx-label">Zoom</span>
          <button className="btn sm" onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Avvicina">
            +
          </button>
        </div>
      </div>
    </div>
  );
}

