import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTake, db, updateTake, updateTrack } from '../../db/db.js';
import { ROLES, formatTime, keyShort, roleLabel } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import { usePref } from '../../components/usePref.js';
import { micErrorMessage } from '../../components/useRecorder.js';
import { detectAttack } from '../../lib/analysis.js';
import { toAnalysisSamples } from '../../lib/audio.js';
import { voicedBounds } from '../../lib/wav.js';
import { buildVoices, takeLatency } from './voices.js';
import { StudioEngine, takeToWav } from './engine.js';
import Teleprompter from './Teleprompter.jsx';
import MixEditor from './MixEditor.jsx';
import StudioSettings from './StudioSettings.jsx';
import StructureSheet from './StructureSheet.jsx';
import BeatTimeline from './BeatTimeline.jsx';
import { dbToGain, normalizeStrip } from './fx.js';
import EffectsSheet from './EffectsSheet.jsx';
import MixSheet from './MixSheet.jsx';
import { buildTimeline, lineAt, nextBlockAfter, onBeatBefore, snapToBeat } from './timeline.js';

export default function StudioPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const track = useDbQuery(() => db.tracks.get(id).then((t) => t ?? null), [id], undefined);
  const beatId = track?.beatId || null;
  const beat = useDbQuery(() => (beatId ? db.beats.get(beatId).then((b) => b ?? null) : null), [beatId], undefined);
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const takes = useDbQuery(() => db.takes.where('trackId').equals(id).reverse().sortBy('createdAt'), [id], []) || [];
  const takesRef = useRef(takes);
  takesRef.current = takes;

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
  const [sheet, setSheet] = useState(null); // 'settings' | 'structure'
  const [view, setView] = useState('rec'); // 'rec' = Registra · 'mix' = Montaggio
  const [solo, setSolo] = useState([]); // take in "solo" (si sentono solo quelle)
  const [editTick, setEditTick] = useState(0);
  const playFromRef = useRef(null);
  const [sync, setSync] = useState(null); // { queue: [blockId...], marked: n } durante "Segna a orecchio"
  const recRef = useRef(null);
  const recRoleRef = useRef('main');
  const headphonesRef = useRef(false);
  const rafRef = useRef(0);

  // Impostazioni salvate sul telefono
  const [countIn, setCountIn] = usePref('studio.countIn2', false);
  const [preRoll, setPreRoll] = usePref('studio.preRoll', 5);
  const [monitor, setMonitor] = usePref('studio.monitor', false);
  const [headphones, setHeadphones] = usePref('studio.headphones', false); // di default: senza cuffie
  const [latSpk, setLatSpk] = usePref('studio.lat.speaker', null); // ms misurati senza cuffie
  const [latHp, setLatHp] = usePref('studio.lat.headphones', null); // ms con cuffie
  const [recRole, setRecRole] = useState('main'); // cosa stai registrando: voce, doppia, adlib
  const [beatVol, setBeatVol] = usePref('studio.beatVol', 0.8);
  const [voiceDb, setVoiceDb] = usePref('studio.voiceDb', 2);
  const [fontSize, setFontSize] = usePref('studio.fontSize', 24);
  const [tipSeen, setTipSeen] = usePref('studio.headphonesTip', false);

  const voiceGain = dbToGain(voiceDb);
  const duration = beatBuf?.duration || beat?.duration || 0;
  const lat = { speaker: latSpk != null ? latSpk / 1000 : undefined, headphones: latHp != null ? latHp / 1000 : undefined };
  const curMode = headphones ? 'headphones' : 'speaker';
  const curLatMs = Math.round(takeLatency({ mode: curMode }, lat) * 1000);
  const setCurLat = (ms) => (curMode === 'speaker' ? setLatSpk(ms) : setLatHp(ms));
  const bpm = Number(track?.bpm) || Number(beat?.bpm) || 0;
  const beatDur = bpm ? 60 / bpm : 0.6;
  const barDur = beatDur * 4;

  // Struttura (per traccia)
  const st = track?.studio || {};
  const fx = normalizeStrip(st.fx); // catena effetti della voce (per traccia)
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
      engine.dispose();
    },
    [engine]
  );

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 2200);
    return () => clearTimeout(t);
  }, [flash]);


  const loadTakeBuffer = async (take) => {
    if (engine.buffers.has(take.audioId)) return engine.buffers.get(take.audioId);
    const rec = await db.audio.get(take.audioId);
    if (!rec?.blob) throw new Error('Registrazione non trovata');
    return engine.loadBuffer(take.audioId, rec.blob);
  };

  // Voci da mixare (take accese, oppure solo quelle in `only`) col buffer audio caricato
  const loadVoices = async ({ only = null, vGain = voiceGain, latOverride = lat, ignoreSolo = false } = {}) => {
    if (!only && !ignoreSolo && solo.length) only = solo; // "S": si sentono solo quelle
    const list = only ? takes.filter((t) => only.includes(t.id)) : takes.filter((t) => t.included !== false);
    // buffer con l'eventuale pitch già applicato
    const withBuf = await Promise.all(list.map(async (t) => ({ ...t, buffer: engine.pitched(t.audioId, await loadTakeBuffer(t), t.pitch || 0) })));
    return buildVoices(withBuf, { lat: latOverride, voiceGain: vGain, only });
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
        const bounds = voicedBounds(r.samples, r.sr);
        const saved = await addTake({
          trackId: id,
          beatId,
          blob,
          offset: r.offset,
          duration: r.duration,
          sr: r.sr,
          role: recRoleRef.current,
          mode: headphonesRef.current ? 'headphones' : 'speaker',
          voiceStart: bounds.start,
          voiceEnd: bounds.end,
        });
        const ab = engine.ctx.createBuffer(1, r.samples.length, r.sr);
        ab.copyToChannel(r.samples, 0);
        engine.buffers.set(saved.audioId, ab);
        setSelectedTake(saved.id);
        setFlash(`${roleLabel(recRoleRef.current)} salvata ✓ · tocca Ascolta`);
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
    recRoleRef.current = recRole;
    headphonesRef.current = headphones;
    try {
      silentSince.current = 0;
      // Per doppie e adlib senti le voci già registrate
      const guide = recRole === 'main' ? [] : await loadVoices({ ignoreSolo: true });
      // col metronomo parto su un battito del beat: così i click cadono a tempo
      const from = countIn && bpm ? onBeatBefore(startAt, attack, beatDur) : startAt;
      recRef.current = await engine.record({ beat: beatBuf, from, beatGain: beatVol, countIn: countIn && bpm ? 4 : 0, bpm, monitor: monitor && headphones, fx, speaker: !headphones, guide });
      setModeBoth('recording');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(micErrorMessage(e));
      await engine.endMicSession();
      setModeBoth('idle');
    }
  };

  // Riascolto col lettore normale dell'iPhone (suona sempre, anche col silenzioso)
  const playFrom = async (from, { only = null, fxId = fx, beatOnly = false, vGain = voiceGain, latOverride = lat } = {}) => {
    if (!beatBuf || !beat) return;
    engine.primePlayer(); // dentro il tocco: sblocca il lettore
    cancelAnimationFrame(rafRef.current);
    engine.stop();
    setError('');
    setModeBoth('loading');
    try {
      const voices = beatOnly ? [] : await loadVoices({ only, vGain, latOverride });
      if (voices.length) {
        await engine.playMixMedia({ beat: beatBuf, voices, from, beatGain: beatVol, bpm, fx: fxId });
      } else {
        await engine.playBeatMedia(beat.audioId, from, beatBuf.duration);
      }
      setModeBoth('playing');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(`Non riesco a riprodurre (${e?.message || e}). Tocca di nuovo Ascolta.`);
      engine.stop();
      setModeBoth('idle');
    }
  };

  playFromRef.current = playFrom;
  const onEdited = () => setEditTick((x) => x + 1);
  useEffect(() => {
    if (!editTick || modeRef.current !== 'playing') return;
    const t = setTimeout(() => playFromRef.current?.(Math.max(0, engine.position() || 0)), 150); // aspetto che il database si aggiorni
    return () => clearTimeout(t);
  }, [editTick, engine]);

  const onPlay = () => {
    if (modeRef.current === 'playing') return stopAll();
    if (modeRef.current === 'loading') return;
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

  // Ritardo voce: −/+ a orecchio (rifà il mix se sta suonando)
  const nudgeLat = (d) => {
    const ms = Math.max(0, Math.min(600, curLatMs + d));
    setCurLat(ms);
    if (modeRef.current === 'playing') playFrom(Math.max(0, engine.position() || 0), { latOverride: { ...lat, [curMode]: ms / 1000 } });
  };

  // Misura automatica del ritardo (altoparlante → microfono)
  const onCalibrate = async () => {
    if (modeRef.current !== 'idle') return;
    engine.unlock();
    setError('');
    setModeBoth('starting');
    setFlash('Misuro… stai in silenzio 3 secondi');
    try {
      const v = await engine.calibrate();
      if (v == null) setError('Misura non riuscita: alza il volume, stai in silenzio e riprova. Puoi anche regolare a orecchio con − e +.');
      else {
        setLatSpk(Math.round(v * 1000));
        setFlash(`Ritardo misurato: ${Math.round(v * 1000)} ms ✓`);
      }
    } catch (e) {
      setError(micErrorMessage(e));
    }
    await engine.endMicSession();
    setModeBoth('idle');
  };

  const changeFx = (strip) => {
    setTrackStudio({ fx: strip });
    if (modeRef.current === 'playing') playFrom(Math.max(0, engine.position() || 0), { fxId: strip });
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

      <div className="tabs studio-tabs" role="tablist">
        <button role="tab" aria-selected={view === 'rec'} className={`tab${view === 'rec' ? ' on' : ''}`} onClick={() => !active && setView('rec')} disabled={active && view !== 'rec'}>
          🎙 Registra
        </button>
        <button role="tab" aria-selected={view === 'mix'} className={`tab${view === 'mix' ? ' on' : ''}`} onClick={() => !active && setView('mix')} disabled={active && view !== 'mix'}>
          🎚 Montaggio{takes.length ? ` (${takes.length})` : ''}
        </button>
      </div>

      {error && (
        <div className="notice error-box" onClick={() => setError('')}>
          {error}
        </div>
      )}
      {flash && <div className="studio-flash">{flash}</div>}

      {view === 'mix' && beat && (
        <MixEditor
          takes={takes}
          beat={beat}
          beatBuf={beatBuf}
          duration={duration}
          blocks={timeline.blocks}
          position={mode === 'playing' ? pos : startAt}
          playing={mode === 'playing'}
          loading={mode === 'loading'}
          lat={lat}
          engine={engine}
          loadTakeBuffer={loadTakeBuffer}
          loadVoices={loadVoices}
          onSeek={onSeek}
          onPlay={onPlay}
          onEdited={onEdited}
          solo={solo}
          setSolo={setSolo}
          onOpenFx={() => setSheet('fx')}
          onAudition={(t) =>
            // dopo che il database si è aggiornato, suono solo quel pezzo da poco prima che attacchi
            setTimeout(() => {
              const tt = takesRef.current.find((x) => x.id === t.id) || t;
              const from = Math.max(0, tt.offset - takeLatency(tt, lat) + (tt.trimStart || 0) - 1);
              playFromRef.current?.(from, { only: [tt.id] });
            }, 200)
          }
          onOpenMix={() => setSheet('mix')}
          track={track}
        />
      )}

      {view === 'rec' && (
        <>

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
          {!active && !sync && <div className="btl-label">Da dove registri? <b>Tocca il beat</b> o una riga del testo</div>}
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
              : timeline.lines.length && !takes.length
                ? 'Tocca una riga o una sezione per partire da lì · tocca la forma d\'onda per scegliere il punto'
                : ''}
      </div>


      {!active && !sync && mode !== 'loading' && (
        <div className="hp-row">
          <div className="segmented" role="radiogroup" aria-label="Cosa registri">
            {ROLES.map((ro) => (
              <button key={ro.id} role="radio" aria-checked={recRole === ro.id} className={recRole === ro.id ? 'on' : ''} onClick={() => setRecRole(ro.id)}>
                {ro.label}
              </button>
            ))}
          </div>
          <button className={`btn sm hp-toggle${headphones ? ' on' : ''}`} onClick={() => setHeadphones(!headphones)} aria-label="Cuffie sì o no">
            {headphones ? '🎧 Cuffie' : '📱 No cuffie'}
          </button>
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
          <button className="t-btn" onClick={() => setView('mix')} disabled={active}>
            <span className="t-count">{takes.length}</span>
            <span>Montaggio</span>
          </button>
          <button className="t-btn" onClick={onPlay} disabled={!beatBuf || mode === 'recording' || mode === 'starting' || mode === 'saving' || mode === 'loading'}>
            {mode === 'loading' ? <span className="spinner" /> : <Icon name={mode === 'playing' ? 'stop' : 'play'} size={26} />}
            <span>{mode === 'loading' ? 'Preparo…' : mode === 'playing' ? 'Stop' : takes.some((t) => t.included !== false) ? 'Ascolta' : 'Beat'}</span>
          </button>
          <button
            className={`rec-main${mode === 'recording' ? ' on' : ''}`}
            onClick={onRec}
            disabled={!beatBuf || mode === 'playing' || mode === 'saving' || mode === 'starting' || mode === 'loading'}
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

        </>
      )}

      {sheet === 'fx' && <EffectsSheet fx={fx} onChange={changeFx} onPlay={onPlay} playing={mode === 'playing'} loading={mode === 'loading'} onClose={() => setSheet(null)} />}
      {sheet === 'mix' && (
        <MixSheet
          takes={takes}
          track={track}
          engine={engine}
          beatBuf={beatBuf}
          loadVoices={loadVoices}
          fx={fx}
          bpm={bpm}
          voiceDb={voiceDb}
          setVoiceDb={setVoiceDb}
          beatVol={beatVol}
          setBeatVol={setBeatVol}
          nudgeLat={nudgeLat}
          curLatMs={curLatMs}
          headphones={headphones}
          onEdited={onEdited}
          onPlay={onPlay}
          playing={mode === 'playing'}
          loading={mode === 'loading'}
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
          latSpk={Math.round(takeLatency({ mode: 'speaker' }, lat) * 1000)}
          latHp={Math.round(takeLatency({ mode: 'headphones' }, lat) * 1000)}
          setLatSpk={setLatSpk}
          setLatHp={setLatHp}
          onCalibrate={() => {
            setSheet(null);
            onCalibrate();
          }}
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
