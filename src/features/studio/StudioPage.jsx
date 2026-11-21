import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTake, db, updateTrack } from '../../db/db.js';
import { formatTime, keyShort } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import { usePref } from '../../components/usePref.js';
import { micErrorMessage } from '../../components/useRecorder.js';
import { detectAttack } from '../../lib/analysis.js';
import { toAnalysisSamples } from '../../lib/audio.js';
import { StudioEngine, takeToWav } from './engine.js';
import Teleprompter from './Teleprompter.jsx';
import TakesSheet from './TakesSheet.jsx';
import StudioSettings from './StudioSettings.jsx';
import StructureSheet from './StructureSheet.jsx';
import BeatTimeline from './BeatTimeline.jsx';
import { FX_ORDER, FX_PRESETS, dbToGain } from './fx.js';
import { buildTimeline, lineAt, nextBlockAfter, snapToBeat } from './timeline.js';

export default function StudioPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const track = useDbQuery(() => db.tracks.get(id).then((t) => t ?? null), [id], undefined);
  const beatId = track?.beatId || null;
  const beat = useDbQuery(() => (beatId ? db.beats.get(beatId).then((b) => b ?? null) : null), [beatId], undefined);
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const takes = useDbQuery(() => db.takes.where('trackId').equals(id).reverse().sortBy('createdAt'), [id], []) || [];

  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new StudioEngine();
  const engine = engineRef.current;

  const [beatBuf, setBeatBuf] = useState(null);
  const [autoAttack, setAutoAttack] = useState(0);
  const [beatError, setBeatError] = useState('');
  const [mode, setMode] = useState('idle'); // idle | starting | recording | saving | playing
  const modeRef = useRef('idle');
  const [pos, setPos] = useState(0);
  const [pre, setPre] = useState(0); // secondi di conteggio rimasti
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [selectedTake, setSelectedTake] = useState(null);
  const [startPick, setStartPick] = useState(null); // partenza scelta a mano (null = automatica)
  const [level, setLevel] = useState(0); // livello microfono mentre registri
  const silentSince = useRef(0);
  const [selectedLine, setSelectedLine] = useState(null);
  const [sheet, setSheet] = useState(null); // 'takes' | 'settings' | 'structure'
  const [sync, setSync] = useState(null); // { queue: [blockId...], marked: n } durante "Segna a orecchio"
  const recRef = useRef(null);
  const rafRef = useRef(0);

  // Impostazioni salvate sul telefono
  const [countIn, setCountIn] = usePref('studio.countIn2', false);
  const [preRoll, setPreRoll] = usePref('studio.preRoll', 5);
  const [monitor, setMonitor] = usePref('studio.monitor', false);
  const [headphones, setHeadphones] = usePref('studio.headphones', false); // di default: senza cuffie
  const [latencyMs, setLatencyMs] = usePref('studio.latencyMs', null);
  const [beatVol, setBeatVol] = usePref('studio.beatVol', 0.8);
  const [voiceDb, setVoiceDb] = usePref('studio.voiceDb', 2);
  const [fontSize, setFontSize] = usePref('studio.fontSize', 24);
  const [tipSeen, setTipSeen] = usePref('studio.headphonesTip', false);

  const voiceGain = dbToGain(voiceDb);
  const duration = beatBuf?.duration || beat?.duration || 0;
  const latency = (latencyMs ?? Math.round(engine.estimatedLatency() * 1000)) / 1000;
  const bpm = Number(track?.bpm) || Number(beat?.bpm) || 0;
  const beatDur = bpm ? 60 / bpm : 0.6;
  const barDur = beatDur * 4;

  // Struttura (per traccia)
  const st = track?.studio || {};
  const fx = FX_PRESETS[st.fx] ? st.fx : 'provino';
  const barsPerLine = st.barsPerLine ?? 1;
  const starts = st.starts || {};
  const attackAuto = st.attack == null && st.introBars == null;
  const attack = st.attack ?? (st.introBars != null ? st.introBars * barDur : autoAttack);
  const setTrackStudio = (changes) => updateTrack(id, { studio: { ...st, fx, barsPerLine, ...changes } });

  const timeline = useMemo(() => buildTimeline(track?.sections, { starts, attack, barDur, barsPerLine }), [track?.sections, starts, attack, barDur, barsPerLine]);
  // Partenza automatica: qualche secondo prima della prima sezione scritta
  const firstBlock = timeline.blocks[0];
  const autoStart = firstBlock ? Math.max(0, firstBlock.start - preRoll) : 0;
  const startAt = startPick ?? autoStart;
  const setStartAt = setStartPick;

  const setModeBoth = (m) => {
    modeRef.current = m;
    setMode(m);
  };

  // Carico il beat e trovo l'attacco
  useEffect(() => {
    let alive = true;
    setBeatBuf(null);
    setBeatError('');
    if (!beat) return;
    (async () => {
      try {
        const rec = await db.audio.get(beat.audioId);
        if (!rec?.blob) throw new Error('missing');
        const buf = await engine.loadBuffer(beat.audioId, rec.blob);
        if (!alive) return;
        setBeatBuf(buf);
        try {
          setAutoAttack(detectAttack(toAnalysisSamples(buf), 11025));
        } catch {
          setAutoAttack(0);
        }
      } catch {
        if (alive) setBeatError('Non riesco a caricare il file di questo beat.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [beat, engine]);

  useEffect(() => {
    if (selectedTake && takes.some((t) => t.id === selectedTake)) return;
    setSelectedTake((takes.find((t) => t.favorite) || takes[0])?.id || null);
  }, [takes, selectedTake]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      engine.stop();
      engine.releaseMic();
      engine.ctx?.close?.().catch(() => {});
    },
    [engine]
  );

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  // Volume voce dal vivo
  useEffect(() => {
    engine.setGains({ voiceGain, beatGain: beatVol });
  }, [engine, voiceGain, beatVol]);

  const loadTakeBuffer = async (take) => {
    if (engine.buffers.has(take.audioId)) return engine.buffers.get(take.audioId);
    const rec = await db.audio.get(take.audioId);
    if (!rec?.blob) throw new Error('Registrazione non trovata');
    return engine.loadBuffer(take.audioId, rec.blob);
  };

  const stopAll = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    setSync(null);
    if (modeRef.current === 'recording' && recRef.current) {
      setModeBoth('saving');
      const handle = recRef.current;
      recRef.current = null;
      try {
        const r = await handle.stop();
        setLevel(0);
        if (r.duration < 0.5) {
          await engine.endMicSession();
          setModeBoth('idle');
          return;
        }
        if (r.silent) {
          await engine.endMicSession();
          setError('La registrazione è muta: il microfono non ha catturato niente. Controlla il permesso microfono (Impostazioni → Safari → Microfono) e che le cuffie col microfono siano collegate bene, poi riprova.');
          setModeBoth('idle');
          return;
        }
        const blob = takeToWav(r.samples, r.sr);
        const saved = await addTake({ trackId: id, beatId, blob, offset: r.offset, duration: r.duration, sr: r.sr });
        const ab = engine.ctx.createBuffer(1, r.samples.length, r.sr);
        ab.copyToChannel(r.samples, 0);
        engine.buffers.set(saved.audioId, ab);
        setSelectedTake(saved.id);
        setFlash('Take salvata ✓ · tocca Ascolta');
      } catch (e) {
        setError(`Non sono riuscito a salvare la registrazione (${e?.message || e}).`);
      }
      await engine.endMicSession(); // il riascolto torna sull'altoparlante
      setModeBoth('idle');
      return;
    }
    engine.stop();
    setModeBoth('idle');
  }, [engine, id, beatId]);

  const tick = useCallback(() => {
    const p = engine.position();
    if (p == null) return;
    setPos(p);
    setPre(engine.countInLeft());
    if (modeRef.current === 'recording') {
      const lv = engine.micLevel();
      setLevel((prev) => Math.max(lv, prev * 0.9)); // scende piano, così si legge
      if (lv > 0.0005) silentSince.current = 0;
      else if (!silentSince.current) silentSince.current = performance.now();
    }
    const end = engine.playing?.length ?? 0;
    if (p > end + 0.3) {
      stopAll();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [engine, stopAll]);

  const onRec = async () => {
    if (modeRef.current === 'recording') return stopAll();
    if (modeRef.current !== 'idle' || !beatBuf) return;
    engine.unlock(); // dentro il tocco: necessario su iPhone
    setError('');
    setModeBoth('starting');
    try {
      silentSince.current = 0;
      recRef.current = await engine.record({ beat: beatBuf, from: startAt, beatGain: beatVol, countIn: countIn && bpm ? 4 : 0, bpm, monitor: monitor && headphones, fx, speaker: !headphones });
      setModeBoth('recording');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(micErrorMessage(e));
      await engine.endMicSession();
      setModeBoth('idle');
    }
  };

  const playFrom = async (from, { takeId = selectedTake, fxId = fx, beatOnly = false } = {}) => {
    if (!beatBuf) return;
    engine.unlock();
    cancelAnimationFrame(rafRef.current);
    engine.stop();
    setError('');
    try {
      const take = beatOnly ? null : takes.find((t) => t.id === takeId);
      const voice = take ? { buffer: await loadTakeBuffer(take), offset: take.offset } : null;
      engine.play({ beat: beatBuf, voice, from, beatGain: beatVol, voiceGain, latency, bpm, fx: fxId });
      setModeBoth('playing');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(`Non riesco a riprodurre (${e?.message || e}).`);
      setModeBoth('idle');
    }
  };

  const onPlay = () => {
    if (modeRef.current === 'playing') return stopAll();
    if (modeRef.current !== 'idle') return;
    playFrom(startAt);
  };

  // Tocco sulla forma d'onda: se suona salta lì, se è fermo sceglie da dove partire
  const onSeek = (t) => {
    if (modeRef.current === 'playing' && !sync) return playFrom(t);
    if (modeRef.current !== 'idle') return;
    setStartAt(t);
    setPos(t);
    setSelectedLine(null);
  };

  // Tocco su una riga/sezione: parto qualche secondo prima (di default 5 s)
  const onPickLine = (i) => {
    if (modeRef.current !== 'idle') return;
    if (selectedLine === i) {
      setSelectedLine(null);
      setStartAt(null);
      return;
    }
    const t = Math.max(0, timeline.lines[i].time - preRoll);
    setSelectedLine(i);
    setStartAt(t);
    setPos(t);
  };

  // Mentre suona il beat: tocco il nome di una sezione = "questa sezione parte adesso"
  const onMarkSection = (blockId) => {
    if (modeRef.current !== 'playing') return false;
    const p = Math.max(0, (engine.position() ?? 0) - 0.08);
    const isFirst = timeline.blocks[0]?.id === blockId;
    if (isFirst) {
      const next = { ...starts };
      delete next[blockId];
      setTrackStudio({ attack: Math.round(p * 100) / 100, starts: next, introBars: null });
    } else setTrackStudio({ starts: { ...starts, [blockId]: snapToBeat(p, attack, beatDur) } });
    const b = timeline.blocks.find((x) => x.id === blockId);
    setFlash(`${b?.label} parte qui ✓`);
    return true;
  };

  const nudgeStart = (d) => {
    const t = Math.max(0, Math.min(duration - 1, startAt + d));
    setSelectedLine(null);
    setStartAt(t);
    setPos(t);
  };

  const changeFx = (v) => {
    setTrackStudio({ fx: v });
    if (modeRef.current === 'playing') playFrom(Math.max(0, engine.position() || 0), { fxId: v });
  };

  // "Segna a orecchio": parte il beat, tocchi quando inizia ogni sezione
  const startSync = () => {
    if (!beatBuf || !timeline.blocks.length) return;
    setSync({ queue: timeline.blocks.map((b) => b.id), marked: 0 });
    playFrom(0, { beatOnly: true });
  };
  const markSync = () => {
    if (!sync) return;
    const p = engine.position() ?? 0;
    const [blockId, ...rest] = sync.queue;
    const isFirst = sync.marked === 0;
    const anchor = isFirst ? 0 : attack;
    const t = isFirst ? Math.max(0, p - 0.08) : snapToBeat(p - 0.08, anchor, beatDur); // 80 ms: tempo di reazione
    if (isFirst) {
      const nextStarts = { ...starts };
      delete nextStarts[blockId];
      setTrackStudio({ attack: Math.round(t * 100) / 100, starts: nextStarts, introBars: null });
    } else setTrackStudio({ starts: { ...starts, [blockId]: t } });
    if (!rest.length) {
      stopAll();
      setFlash('Struttura salvata ✓');
    } else setSync({ queue: rest, marked: sync.marked + 1 });
  };

  if (track === undefined) return <div className="studio" />;
  if (!track) return <div className="page empty">Traccia non trovata.</div>;

  const active = mode === 'recording' || mode === 'playing';
  const micSilent = mode === 'recording' && silentSince.current && performance.now() - silentSince.current > 2500 && pre <= 0.02;
  const counting = active && pre > 0.02;
  const current = active && !sync && !counting ? lineAt(pos, timeline) : -1;
  const take = takes.find((t) => t.id === selectedTake);
  const syncLabel = sync ? timeline.blocks.find((b) => b.id === sync.queue[0])?.label : null;

  // Conto alla rovescia durante intro e pause
  let overlay = null;
  if (counting) {
    overlay = (
      <>
        <span className="muted">{mode === 'recording' ? 'Si registra tra' : 'Parte tra'}</span>
        <span className="big-count">{Math.ceil(pre / beatDur)}</span>
      </>
    );
  } else if (active && !sync && current < 0) {
    const next = nextBlockAfter(pos, timeline);
    if (next) {
      const beatsLeft = Math.ceil((next.start - pos) / beatDur);
      overlay =
        beatsLeft <= 8 ? (
          <>
            <span className="muted">{next.label} tra</span>
            <span className="big-count">{beatsLeft}</span>
          </>
        ) : (
          <span className="muted">
            {pos < timeline.blocks[0]?.start ? 'Intro del beat' : 'Pausa'} · {next.label} tra {Math.ceil((next.start - pos) / barDur)} battute
          </span>
        );
    }
  }
  if (sync) overlay = <span className="muted">Tocca il pulsante quando inizia la sezione</span>;

  return (
    <div className={`studio${mode === 'recording' ? ' is-rec' : ''}`}>
      <header className="studio-head">
        <button className="icon-btn" onClick={() => navigate(`/traccia/${id}`)} aria-label="Esci dallo studio" disabled={active}>
          <Icon name="back" />
        </button>
        <div className="grow min0">
          <div className="studio-kicker">Studio</div>
          <div className="studio-track ellipsis">{track.title || 'Senza titolo'}</div>
        </div>
        {beat && (
          <span className="muted small studio-meta">
            {bpm ? `${bpm} BPM` : 'BPM ?'}
            {beat.key ? ` · ${keyShort(beat.key)}` : ''}
          </span>
        )}
      </header>

      {!beatId || beat === null ? (
        <div className="studio-nobeat stack">
          <p>Scegli il beat su cui registrare:</p>
          {beats.length ? (
            <select className="input" value="" onChange={(e) => e.target.value && updateTrack(id, { beatId: e.target.value, bpm: track.bpm ?? beats.find((b) => b.id === e.target.value)?.bpm ?? null })}>
              <option value="">— Scegli un beat —</option>
              {beats.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                  {b.bpm ? ` · ${b.bpm} BPM` : ''}
                </option>
              ))}
            </select>
          ) : (
            <Link to="/beat" className="btn primary big">
              <Icon name="beat" /> Importa un beat
            </Link>
          )}
        </div>
      ) : (
        <>
          <BeatTimeline
            peaks={beat?.peaks}
            duration={duration}
            position={active ? pos : startAt}
            startAt={startAt}
            blocks={timeline.blocks}
            onSeek={onSeek}
            disabled={mode === 'recording' || mode === 'starting' || mode === 'saving'}
            recording={mode === 'recording'}
          />
          {beatError && <p className="error small">{beatError}</p>}
        </>
      )}

      {!tipSeen && (
        <div className="notice studio-tip" onClick={() => setTipSeen(true)}>
          {headphones ? (
            <>
              🎧 <b>Modalità cuffie</b>: senti il beat in cuffia, la voce resta pulita. <span className="muted small">Tocca per chiudere</span>
            </>
          ) : (
            <>
              📱 <b>Senza cuffie</b>: tieni il telefono a 20–30 cm dalla bocca e il volume del beat medio. Se hai le cuffie, attivale in <b>Regola</b> per un suono più pulito.{' '}
              <span className="muted small">Tocca per chiudere</span>
            </>
          )}
        </div>
      )}

      <Teleprompter
        timeline={timeline}
        current={current}
        following={active}
        selectedLine={selectedLine}
        fontSize={fontSize}
        onPickLine={onPickLine}
        onPickSection={(b) => onMarkSection(b.id) || onPickLine(b.first)}
        overlay={overlay}
      />

      {mode === 'recording' && (
        <div className={`meter${micSilent ? ' silent' : ''}`}>
          <span className="fx-label">Microfono</span>
          <div className="meter-bar">
            <div style={{ width: `${Math.min(100, Math.sqrt(level) * 140)}%` }} />
          </div>
          {micSilent && <span className="small error">non sento niente!</span>}
        </div>
      )}

      {!active && !sync && beatBuf && (
        <div className="startbar">
          <div className="grow min0">
            <div className="fx-label">Partenza</div>
            <div className="small ellipsis">
              <b className="mono">{formatTime(startAt)}</b>
              <span className="muted">
                {' '}
                {startPick == null
                  ? firstBlock
                    ? `· ${preRoll} s prima di ${firstBlock.label}`
                    : '· inizio beat'
                  : selectedLine != null
                    ? `· ${preRoll} s prima della riga scelta`
                    : '· scelta da te'}
              </span>
            </div>
          </div>
          <button className="btn sm" onClick={() => (setSelectedLine(null), setStartAt(0), setPos(0))}>
            Inizio
          </button>
          <button className="btn sm" onClick={() => nudgeStart(-5)}>
            −5 s
          </button>
          <button className="btn sm" onClick={() => nudgeStart(5)}>
            +5 s
          </button>
        </div>
      )}

      <div className="studio-hint muted small">
        {sync
          ? ''
          : mode === 'playing'
            ? 'Tocca il nome di una sezione quando inizia, per segnarla'
            : active
              ? ''
              : timeline.lines.length
                ? 'Tocca una riga o una sezione per partire da lì · tocca la forma d\'onda per scegliere il punto'
                : ''}
      </div>

      {error && (
        <div className="notice error-box" onClick={() => setError('')}>
          {error}
        </div>
      )}
      {flash && <div className="studio-flash">{flash}</div>}

      {takes.length > 0 && mode !== 'recording' && !sync && (
        <div className="mixbar">
          <div className="fx-bar">
            <span className="fx-label">Effetti</span>
            <div className="chips scroll-x fx-chips">
              {FX_ORDER.map((k) => (
                <button key={k} className={`chip${fx === k ? ' on' : ''}`} onClick={() => changeFx(k)}>
                  {FX_PRESETS[k].label}
                </button>
              ))}
            </div>
          </div>
          <label className="vol-row">
            <span className="fx-label">Voce sul beat</span>
            <input className="slider" type="range" min={-6} max={12} step={0.5} value={voiceDb} onChange={(e) => setVoiceDb(Number(e.target.value))} />
            <span className="small vol-val">
              {voiceDb > 0 ? '+' : ''}
              {voiceDb} dB
            </span>
          </label>
        </div>
      )}

      {sync ? (
        <div className="transport sync">
          <button className="btn ghost" onClick={stopAll}>
            Annulla
          </button>
          <button className="btn primary big sync-btn" onClick={markSync}>
            ▼ {syncLabel} parte ORA
          </button>
        </div>
      ) : (
        <div className="transport">
          <button className="t-btn" onClick={() => setSheet('takes')} disabled={active}>
            <span className="t-count">{takes.length}</span>
            <span>Take</span>
          </button>
          <button className="t-btn" onClick={onPlay} disabled={!beatBuf || mode === 'recording' || mode === 'starting' || mode === 'saving'}>
            <Icon name={mode === 'playing' ? 'stop' : 'play'} size={26} />
            <span>{mode === 'playing' ? 'Stop' : take ? 'Ascolta' : 'Beat'}</span>
          </button>
          <button
            className={`rec-main${mode === 'recording' ? ' on' : ''}`}
            onClick={onRec}
            disabled={!beatBuf || mode === 'playing' || mode === 'saving' || mode === 'starting'}
            aria-label={mode === 'recording' ? 'Ferma registrazione' : 'Registra'}
          >
            {mode === 'recording' ? <Icon name="stop" size={30} /> : mode === 'saving' || mode === 'starting' ? <span className="spinner big" /> : <span className="rec-core" />}
          </button>
          <button className="t-btn" onClick={() => setSheet('structure')} disabled={active}>
            <Icon name="beat" size={24} />
            <span>Struttura</span>
          </button>
          <button className="t-btn" onClick={() => setSheet('settings')} disabled={active}>
            <Icon name="gear" size={24} />
            <span>Regola</span>
          </button>
        </div>
      )}

      {sheet === 'takes' && (
        <TakesSheet
          track={track}
          beatBuf={beatBuf}
          takes={takes}
          selected={selectedTake}
          onSelect={setSelectedTake}
          onPlay={(tid) => {
            setSelectedTake(tid);
            setSheet(null);
            setTimeout(() => playFrom(startAt, { takeId: tid }), 0);
          }}
          engine={engine}
          loadTakeBuffer={loadTakeBuffer}
          latency={latency}
          beatVol={beatVol}
          voiceVol={voiceGain}
          fx={fx}
          bpm={bpm}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'structure' && (
        <StructureSheet
          timeline={timeline}
          attack={attack}
          attackAuto={attackAuto}
          autoAttack={autoAttack}
          barDur={barDur}
          barsPerLine={barsPerLine}
          starts={starts}
          onChange={(c) => setTrackStudio({ ...c, introBars: null })}
          onListen={(t) => {
            setSheet(null);
            setStartAt(t);
            playFrom(t, { beatOnly: true });
          }}
          onSync={startSync}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'settings' && (
        <StudioSettings
          onClose={() => setSheet(null)}
          countIn={countIn}
          setCountIn={setCountIn}
          preRoll={preRoll}
          setPreRoll={setPreRoll}
          monitor={monitor}
          setMonitor={setMonitor}
          headphones={headphones}
          setHeadphones={setHeadphones}
          latencyMs={Math.round(latency * 1000)}
          setLatencyMs={setLatencyMs}
          beatVol={beatVol}
          setBeatVol={setBeatVol}
          fontSize={fontSize}
          setFontSize={setFontSize}
          bpm={bpm}
          setBpm={(v) => updateTrack(id, { bpm: v })}
        />
      )}
    </div>
  );
}
