import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { deleteTake, splitTake, updateTake } from '../../db/db.js';
import { formatTime, roleLabel } from '../../constants.js';
import { computePeaks } from '../../lib/audio.js';
import { takeLabels, takeLatency, trimOf } from './voices.js';
import ExportRow, { slug } from './ExportRow.jsx';

const ZOOMS = [6, 12, 25, 50, 100]; // pixel per secondo
const LABEL_W = 96; // colonna dei nomi delle piste
const PEAKS_PER_SEC = 40;
const ROLE_ORDER = ['main', 'double', 'adlib'];
const nextRole = (r) => ROLE_ORDER[(ROLE_ORDER.indexOf(r || 'main') + 1) % ROLE_ORDER.length];

function Bars({ peaks, width, height = 36 }) {
  if (!peaks?.length || width <= 0) return null;
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
 * Montaggio stile Logic: una riga per ogni take (con M = muto e S = solo),
 * blocchi da tagliare, spostare, dividere, con volume e pitch.
 */
export default function MixEditor(p) {
  const { takes, beat, duration, blocks, position, playing, loading, lat, engine, loadTakeBuffer } = p;
  const mixCh = p.mixCh || { mute: {}, solo: [] };
  const [zoomIdx, setZoomIdx] = useState(2);
  const pps = ZOOMS[zoomIdx];
  const [selectedId, setSelectedId] = useState(null);
  const [drag, setDrag] = useState(null); // { id, kind, x0, dt }
  const [peaks, setPeaks] = useState({}); // audioId → picchi
  const [busy, setBusy] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const scrollRef = useRef(null);
  const didScroll = useRef(false);

  const rows = useMemo(() => [...takes].sort((a, b) => a.createdAt - b.createdAt || (a.trimStart || 0) - (b.trimStart || 0)), [takes]);
  const labels = useMemo(() => takeLabels(takes), [takes]);
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

  // posizione e taglio di un blocco (con l'anteprima durante il trascinamento)
  const geom = (t) => {
    let pos = t.offset - takeLatency(t, lat);
    let { ts, te } = trimOf(t);
    if (drag && drag.id === t.id) {
      if (drag.kind === 'move') pos += drag.dt;
      if (drag.kind === 'start') ts = Math.min(te - 0.1, Math.max(0, ts + drag.dt));
      if (drag.kind === 'end') te = Math.max(ts + 0.1, Math.min(t.duration, te + drag.dt));
    }
    return { pos, ts, te, left: (pos + ts) * pps, width: Math.max(6, (te - ts) * pps) };
  };

  // all'apertura la vista va dove ci sono le take
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || didScroll.current || !takes.length) return;
    const first = Math.min(...takes.map((t) => geom(t).left));
    el.scrollLeft = Math.max(0, first - 40);
    didScroll.current = true;
  }, [takes]); // eslint-disable-line react-hooks/exhaustive-deps

  // mentre suona, la vista segue la testina
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = position * pps;
    const visible = el.clientWidth - LABEL_W;
    if (x < el.scrollLeft + 20 || x > el.scrollLeft + visible - 30) el.scrollLeft = Math.max(0, x - visible * 0.25);
  }, [position, playing, pps]);

  const contentW = Math.max(duration, ...takes.map((t) => t.offset + t.duration)) * pps + 60;
  const laneTime = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, (e.clientX - r.left) / pps);
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
  const onMove = (e) => drag && setDrag((d) => ({ ...d, dt: (e.clientX - d.x0) / pps }));
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

  // ---- comandi
  const edit = async (t, changes) => {
    await updateTake(t.id, changes);
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
    if (!confirm(`Eliminare "${labels.get(selected.id)}"?`)) return;
    await deleteTake(selected.id);
    setSelectedId(null);
    p.onEdited();
  };
  const setPitch = async (v) => {
    const semis = Math.max(-12, Math.min(12, v));
    engine.primePlayer(); // dentro il tocco: così poi te lo faccio sentire subito
    setBusy('pitch');
    await new Promise((r) => setTimeout(r, 30)); // lascio aggiornare lo schermo
    try {
      engine.pitched(selected.audioId, await loadTakeBuffer(selected), semis); // preparo subito il suono
    } catch {
      /* lo calcolerà al riascolto */
    }
    setBusy('');
    await updateTake(selected.id, { pitch: semis });
    p.onAudition?.(selected); // ascolto immediato di questo pezzo col nuovo pitch
  };
  const prepVoice = async () => {
    const [voice] = await p.loadVoices({ only: [selected.id] });
    return [new File([engine.renderVoiceAligned({ voice })], `${slug(`${p.track.title} - ${labels.get(selected.id)}`)}.wav`, { type: 'audio/wav' })];
  };

  // righello a battute (come Logic): numeri ogni 1, 2, 4… battute a seconda dello zoom
  const barDur = p.barDur || 0;
  const anchor = barDur ? (p.attack || 0) - Math.floor((p.attack || 0) / barDur) * barDur : 0;
  const barStep = barDur ? [1, 2, 4, 8, 16].find((k) => k * barDur * pps >= 30) || 16 : 0;
  const ticks = [];
  if (barDur) for (let t = anchor, n = 1; t <= duration + 0.01; t += barDur * barStep, n += barStep) ticks.push({ t, n });
  else for (let t = 0; t <= duration + 1; t += 5) ticks.push({ t, n: formatTime(t) });

  // canali (come le tracce di Logic): le take di ogni ruolo stanno nel loro canale, su più righe se si sovrappongono
  const CH = [
    { id: 'main', name: 'Voce' },
    { id: 'double', name: 'Doppie' },
    { id: 'adlib', name: 'Adlib' },
  ];
  const lanesOf = (role) => {
    const list = rows.filter((t) => (t.role || 'main') === role).map((t) => ({ t, g: geom(t) }));
    list.sort((a, b) => a.g.left - b.g.left);
    const ends = [];
    for (const it of list) {
      let k = ends.findIndex((e) => e <= it.g.left - 2);
      if (k < 0) {
        k = ends.length;
        ends.push(0);
      }
      ends[k] = it.g.left + it.g.width;
      it.lane = k;
    }
    return { list, n: Math.max(1, ends.length) };
  };
  const chTakes = (role) => takes.filter((t) => (t.role || 'main') === role);
  const chMuted = (role) => !!mixCh.mute?.[role];
  const chSolo = (role) => mixCh.solo.includes(role);
  // canale che in questo momento non si sente (muto, oppure c'è un altro canale in solo)
  const chSilent = (role) => (mixCh.solo.length ? !chSolo(role) : chMuted(role));
  const toggleChMute = (role) => p.onToggleCh?.(role, 'm');
  const toggleChSolo = (role) => p.onToggleCh?.(role, 's');
  const MS = ({ id, name }) => (
    <>
      <button className={`m${chMuted(id) ? ' on' : ''}`} onClick={(e) => (e.stopPropagation(), toggleChMute(id))} aria-label={`Muto ${name}`}>
        M
      </button>
      <button className={`s${chSolo(id) ? ' on' : ''}`} onClick={(e) => (e.stopPropagation(), toggleChSolo(id))} aria-label={`Solo ${name}`}>
        S
      </button>
    </>
  );
  const selCh = p.selCh || 'main';
  const ch = p.channels?.[selCh] || {};
  const LANE_H = 44;

  return (
    <div className="mixed">
      {/* barra strumenti */}
      <div className="mix-tools">
        <button className="btn sm primary" onClick={p.onOpenMix}>
          Mix & Salva
        </button>
        <span className="grow" />
        <button className="btn sm" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0} aria-label="Allontana">
          −
        </button>
        <span className="fx-label">Zoom</span>
        <button className="btn sm" onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Avvicina">
          +
        </button>
      </div>

      {/* tracce: righello a battute, beat, canali voce */}
      <div className="arr2" ref={scrollRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
        <div className="arr2-inner" style={{ width: LABEL_W + contentW }}>
          <div className="arr2-row ruler">
            <div className="lab corner" />
            <div className="lane" style={{ width: contentW }} onClick={(e) => p.onSeek(laneTime(e))}>
              {ticks.map(({ t, n }) => (
                <span key={t} className="tick" style={{ left: t * pps }}>
                  {n}
                </span>
              ))}
              {blocks.map((b) => (
                <span key={b.id} className="sec" style={{ left: b.start * pps }}>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
          <div className={`arr2-row beat${chSilent('beat') ? ' silent' : ''}`}>
            <div className="lab">
              <span className="lab-name">Beat</span>
              <span className="ms">{MS({ id: 'beat', name: 'Beat' })}</span>
            </div>
            <div className="lane" style={{ width: contentW }} onClick={(e) => p.onSeek(laneTime(e))}>
              {beat?.peaks && <Bars peaks={beat.peaks} width={duration * pps} height={30} />}
              {(p.beatMap || []).map((m) => (
                <span key={m.start} className={`bmap k-${m.kind}`} style={{ left: m.start * pps, width: Math.max(8, (m.end - m.start) * pps) }}>
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {CH.map((c) => {
            const { list, n } = lanesOf(c.id);
            const armed = p.recRole === c.id;
            return (
              <div key={c.id} className={`arr2-row take ch${selCh === c.id && !selected ? ' sel' : ''}${chSilent(c.id) ? ' silent' : ''}`} style={{ height: n * LANE_H + 10 }}>
                <div className={`lab role-${c.id}`} onClick={() => (setSelectedId(null), p.setSelCh?.(c.id))}>
                  <span className="lab-name">{c.name}</span>
                  <span className="ms">
                    {MS(c)}
                    <button className={`r${armed ? ' on' : ''}`} onClick={(e) => (e.stopPropagation(), p.setRecRole?.(c.id))} aria-label={`Registra su ${c.name}`}>
                      R
                    </button>
                  </span>
                </div>
                <div className="lane" style={{ width: contentW }} onClick={(e) => (setSelectedId(null), p.setSelCh?.(c.id), p.onSeek(laneTime(e)))}>
                  {list.map(({ t, g, lane }) => {
                    const sel = t.id === selectedId;
                    const muted = t.included === false;
                    return (
                      <div
                        key={t.id}
                        className={`region role-${c.id}${sel ? ' sel' : ''}${muted ? ' off' : ''}${chSolo(c.id) ? ' solo' : ''}`}
                        style={{ left: g.left, width: g.width, top: 5 + lane * LANE_H, height: LANE_H - 8, bottom: 'auto' }}
                        onPointerDown={(e) => onDown(e, t, 'move')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="reg-inner" style={{ left: -g.ts * pps, width: t.duration * pps }}>
                          <Bars peaks={peaks[t.audioId]} width={t.duration * pps} />
                        </div>
                        <span className="reg-name">
                          {labels.get(t.id)}
                          {t.pitch ? ` · ${t.pitch > 0 ? '+' : ''}${t.pitch} st` : ''}
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
              </div>
            );
          })}
          <div className="playhead" style={{ left: LABEL_W + position * pps }} />
        </div>
      </div>

      {/* pannello in basso: il blocco scelto, oppure il canale scelto (come l'inspector di Logic) */}
      <div className="inspector2">
        {selected ? (
          <>
            <div className="insp-row">
              <span className="reco-title">{labels.get(selected.id)}</span>
              <button className="chip role-chip" onClick={() => edit(selected, { role: nextRole(selected.role) })}>
                {roleLabel(selected.role).toUpperCase()}
              </button>
              <span className="grow" />
              <button className="icon-btn sm" onClick={() => setSelectedId(null)} aria-label="Chiudi">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="insp-row">
              <span className="fx-label">Vol</span>
              <button className="btn sm" onClick={() => edit(selected, { gainDb: Math.max(-24, (selected.gainDb || 0) - 1) })} aria-label="Volume giù">
                −
              </button>
              <span className="mono insp-val">
                {(selected.gainDb || 0) > 0 ? '+' : ''}
                {selected.gainDb || 0} dB
              </span>
              <button className="btn sm" onClick={() => edit(selected, { gainDb: Math.min(12, (selected.gainDb || 0) + 1) })} aria-label="Volume su">
                +
              </button>
              <span className="fx-label">Pitch</span>
              <button className="btn sm" onClick={() => setPitch((selected.pitch || 0) - 1)} disabled={busy === 'pitch'} aria-label="Pitch giù">
                −
              </button>
              <span className="mono insp-val">{busy === 'pitch' ? '…' : `${(selected.pitch || 0) > 0 ? '+' : ''}${selected.pitch || 0} st`}</span>
              <button className="btn sm" onClick={() => setPitch((selected.pitch || 0) + 1)} disabled={busy === 'pitch'} aria-label="Pitch su">
                +
              </button>
            </div>
            <div className="insp-row">
              <button className="btn sm" onClick={() => edit(selected, { included: selected.included === false })}>
                {selected.included === false ? 'Accendi' : 'Spegni'}
              </button>
              <button className="btn sm" onClick={() => edit(selected, { offset: selected.offset - 0.01 })} aria-label="Sposta indietro">
                ◀ 10ms
              </button>
              <button className="btn sm" onClick={() => edit(selected, { offset: selected.offset + 0.01 })} aria-label="Sposta avanti">
                10ms ▶
              </button>
              <button className="btn sm" onClick={split} disabled={!playheadInside} title="Metti la testina dentro il blocco">
                ✂ Taglia
              </button>
              <button className="btn sm" onClick={() => setExportOpen(true)} aria-label="Salva questa voce">
                ⬇
              </button>
              <button className="btn sm danger" onClick={remove} aria-label="Elimina">
                <Icon name="trash" size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="insp-row">
              <span className={`ch-dot role-${selCh}`} />
              <span className="reco-title">Canale {CH.find((c) => c.id === selCh)?.name}</span>
              <span className="grow" />
              <button className="btn sm primary" onClick={() => p.onOpenChannelFx?.(selCh)}>
                Plug-in{p.fxCount ? ` (${p.fxCount(selCh)})` : ''}
              </button>
            </div>
            <div className="insp-row">
              <span className="fx-label">Vol</span>
              <button className="btn sm" onClick={() => p.setChannel?.(selCh, { db: Math.max(-24, (ch.db || 0) - 1) })} aria-label="Volume canale giù">
                −
              </button>
              <span className="mono insp-val">
                {(ch.db || 0) > 0 ? '+' : ''}
                {ch.db || 0} dB
              </span>
              <button className="btn sm" onClick={() => p.setChannel?.(selCh, { db: Math.min(12, (ch.db || 0) + 1) })} aria-label="Volume canale su">
                +
              </button>
              <span className="fx-label">Pan</span>
              {[
                [-0.5, 'Sx'],
                [null, 'C'],
                [0.5, 'Dx'],
              ].map(([v, l]) => (
                <button key={l} className={`chip sm${(ch.pan ?? null) === v ? ' on' : ''}`} onClick={() => p.setChannel?.(selCh, { pan: v })}>
                  {l}
                </button>
              ))}
            </div>
            <p className="muted small insp-hint">
              Tocca un blocco per tagliarlo, spostarlo, cambiare volume o pitch. <b>M</b> muto, <b>S</b> solo, <b>R</b> registri su questo canale.
            </p>
          </>
        )}
      </div>

      {exportOpen && selected && (
        <Sheet open onClose={() => setExportOpen(false)} title={`Salva ${labels.get(selected.id)}`}>
          <ExportRow icon="mic" title="Solo questa voce" subtitle="Senza beat e senza effetti, allineata all'inizio del beat." prepare={prepVoice} />
        </Sheet>
      )}
    </div>
  );
}
