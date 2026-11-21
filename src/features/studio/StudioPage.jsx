import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTake, db, updateTrack } from '../../db/db.js';
import { formatTime, keyShort } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import { usePref } from '../../components/usePref.js';
import { micErrorMessage } from '../../components/useRecorder.js';
import { StudioEngine, takeToWav } from './engine.js';
import Teleprompter, { buildLines } from './Teleprompter.jsx';
import TakesSheet from './TakesSheet.jsx';
import StudioSettings from './StudioSettings.jsx';
import { FX_ORDER, FX_PRESETS } from './fx.js';

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
  const [beatError, setBeatError] = useState('');
  const [mode, setMode] = useState('idle'); // idle | starting | recording | saving | playing
  const modeRef = useRef('idle');
  const [pos, setPos] = useState(0);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [selectedTake, setSelectedTake] = useState(null);
  const [startLine, setStartLine] = useState(null);
  const [sheet, setSheet] = useState(null); // 'takes' | 'settings'
  const recRef = useRef(null);
  const rafRef = useRef(0);

  // Impostazioni (salvate sul telefono)
  const [countIn, setCountIn] = usePref('studio.countIn', true);
  const [latencyMs, setLatencyMs] = usePref('studio.latencyMs', null);
  const [beatVol, setBeatVol] = usePref('studio.beatVol', 0.85);
  const [voiceVol, setVoiceVol] = usePref('studio.voiceVol', 1);
  const [fontSize, setFontSize] = usePref('studio.fontSize', 24);
  const [tipSeen, setTipSeen] = usePref('studio.headphonesTip', false);

  const latency = (latencyMs ?? Math.round(engine.estimatedLatency() * 1000)) / 1000;
  const bpm = Number(track?.bpm) || Number(beat?.bpm) || 0;
  const barDur = bpm ? 240 / bpm : 2.4;
  const introBars = track?.studio?.introBars ?? 0;
  const barsPerLine = track?.studio?.barsPerLine ?? 1;
  const fx = FX_PRESETS[track?.studio?.fx] ? track.studio.fx : 'provino';
  const setTrackStudio = (changes) => updateTrack(id, { studio: { ...(track?.studio || {}), introBars, barsPerLine, fx, ...changes } });
  const lineCount = useMemo(() => buildLines(track?.sections).count, [track?.sections]);
  const lineTime = useCallback((i) => (introBars + i * barsPerLine) * barDur, [introBars, barsPerLine, barDur]);
  const from = startLine == null ? 0 : Math.max(0, lineTime(startLine) - barDur); // 1 battuta di "rincorsa"

  const setModeBoth = (m) => {
    modeRef.current = m;
    setMode(m);
  };

  // Carico il beat in memoria
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
        if (alive) setBeatBuf(buf);
      } catch {
        if (alive) setBeatError('Non riesco a caricare il file di questo beat.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [beat, engine]);

  // Take selezionata: la preferita o l'ultima
  useEffect(() => {
    if (selectedTake && takes.some((t) => t.id === selectedTake)) return;
    setSelectedTake((takes.find((t) => t.favorite) || takes[0])?.id || null);
  }, [takes, selectedTake]);

  // Pulizia uscendo dallo studio
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

  const loadTakeBuffer = async (take) => {
    if (engine.buffers.has(take.audioId)) return engine.buffers.get(take.audioId);
    const rec = await db.audio.get(take.audioId);
    if (!rec?.blob) throw new Error('Registrazione non trovata');
    return engine.loadBuffer(take.audioId, rec.blob);
  };

  const stopAll = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    if (modeRef.current === 'recording' && recRef.current) {
      setModeBoth('saving');
      const handle = recRef.current;
      recRef.current = null;
      try {
        const r = await handle.stop();
        if (r.duration < 0.5) {
          setModeBoth('idle');
          return;
        }
        const blob = takeToWav(r.samples, r.sr);
        const saved = await addTake({ trackId: id, beatId, blob, offset: r.offset, duration: r.duration, sr: r.sr });
        const ab = engine.ctx.createBuffer(1, r.samples.length, r.sr);
        ab.copyToChannel(r.samples, 0);
        engine.buffers.set(saved.audioId, ab);
        setSelectedTake(saved.id);
        setFlash('Take salvata ✓');
      } catch (e) {
        setError(`Non sono riuscito a salvare la registrazione (${e?.message || e}).`);
      }
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
      recRef.current = await engine.record({ beat: beatBuf, from, beatGain: beatVol, countIn: countIn && bpm ? 4 : 0, bpm });
      setModeBoth('recording');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(micErrorMessage(e));
      setModeBoth('idle');
    }
  };

  const onPlay = async (takeId = selectedTake, opts = {}) => {
    if (modeRef.current === 'playing') return stopAll();
    if (modeRef.current !== 'idle' || !beatBuf) return;
    engine.unlock();
    setError('');
    try {
      const take = takes.find((t) => t.id === takeId);
      const voice = take ? { buffer: await loadTakeBuffer(take), offset: take.offset } : null;
      engine.play({ beat: beatBuf, voice, from: opts.from ?? from, beatGain: beatVol, voiceGain: voiceVol, latency, bpm, fx: opts.fx || fx });
      setModeBoth('playing');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(`Non riesco a riprodurre (${e?.message || e}).`);
    }
  };

  // Cambio effetto: se sta suonando, riparte da dov'era con il nuovo suono
  const changeFx = (v) => {
    setTrackStudio({ fx: v });
    if (modeRef.current === 'playing') {
      const p = Math.max(0, engine.position() || 0);
      cancelAnimationFrame(rafRef.current);
      engine.stop();
      setModeBoth('idle');
      onPlay(selectedTake, { from: p, fx: v });
    }
  };

  if (track === undefined) return <div className="studio" />;
  if (!track) return <div className="page empty">Traccia non trovata.</div>;

  const active = mode === 'recording' || mode === 'playing';
  const current = active ? Math.floor((pos / barDur - introBars) / barsPerLine) : startLine ?? -1;
  const duration = beatBuf?.duration || beat?.duration || 0;
  const take = takes.find((t) => t.id === selectedTake);

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
        <button className="icon-btn" onClick={() => setSheet('settings')} aria-label="Impostazioni studio" disabled={active}>
          <Icon name="gear" />
        </button>
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
        <div className="studio-beat">
          <div className="row between">
            <span className="ellipsis">
              <b>{beat?.title}</b>
              <span className="muted small">
                {bpm ? ` · ${bpm} BPM` : ''}
                {beat?.key ? ` · ${keyShort(beat.key)}` : ''}
              </span>
            </span>
            <span className="studio-time">
              {mode === 'recording' && <span className="rec-dot" />}
              {pos < 0 ? `-${Math.ceil(-pos / (60 / (bpm || 120)))}` : formatTime(active ? pos : from)} / {formatTime(duration)}
            </span>
          </div>
          <div className="studio-progress">
            <div style={{ width: `${duration ? Math.min(100, (Math.max(0, active ? pos : from) / duration) * 100) : 0}%` }} />
          </div>
          {beatError && <p className="error small">{beatError}</p>}
        </div>
      )}

      {!tipSeen && (
        <div className="notice studio-tip" onClick={() => setTipSeen(true)}>
          🎧 <b>Metti le cuffie</b> (meglio a filo): senza, il beat finisce nel microfono. <span className="muted small">Tocca per chiudere</span>
        </div>
      )}

      <Teleprompter
        sections={track.sections}
        current={current}
        following={active}
        startLine={startLine}
        fontSize={fontSize}
        onPickLine={(i) => !active && setStartLine(startLine === i ? null : i)}
      />

      <div className="studio-hint muted small">
        {active
          ? bpm
            ? `Una barra ogni ${barsPerLine === 1 ? 'battuta' : `${barsPerLine} battute`}`
            : 'Imposta il BPM della traccia per far scorrere il testo a tempo'
          : startLine != null
            ? `Parti dalla riga ${startLine + 1} (${formatTime(from)}) — tocca di nuovo la riga per ripartire dall'inizio`
            : lineCount
              ? 'Tocca una riga per partire da lì'
              : ''}
      </div>

      {error && (
        <div className="notice error-box" onClick={() => setError('')}>
          {error}
        </div>
      )}
      {flash && <div className="studio-flash">{flash}</div>}

      {takes.length > 0 && mode !== 'recording' && (
        <div className="fx-bar">
          <span className="fx-label">Effetti voce</span>
          <div className="chips scroll-x fx-chips">
            {FX_ORDER.map((k) => (
              <button key={k} className={`chip${fx === k ? ' on' : ''}`} onClick={() => changeFx(k)}>
                {FX_PRESETS[k].label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="transport">
        <button className="t-btn" onClick={() => setSheet('takes')} disabled={active}>
          <span className="t-count">{takes.length}</span>
          <span>Take</span>
        </button>
        <button className="t-btn" onClick={() => onPlay()} disabled={!beatBuf || mode === 'recording' || mode === 'starting' || mode === 'saving'}>
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
        <button className="t-btn" onClick={() => setSheet('settings')} disabled={active}>
          <Icon name="gear" size={24} />
          <span>Regola</span>
        </button>
      </div>

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
            setTimeout(() => onPlay(tid), 0);
          }}
          engine={engine}
          loadTakeBuffer={loadTakeBuffer}
          latency={latency}
          beatVol={beatVol}
          voiceVol={voiceVol}
          fx={fx}
          bpm={bpm}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'settings' && (
        <StudioSettings
          onClose={() => setSheet(null)}
          countIn={countIn}
          setCountIn={setCountIn}
          latencyMs={Math.round(latency * 1000)}
          setLatencyMs={setLatencyMs}
          beatVol={beatVol}
          setBeatVol={setBeatVol}
          voiceVol={voiceVol}
          setVoiceVol={setVoiceVol}
          fontSize={fontSize}
          setFontSize={setFontSize}
          introBars={introBars}
          barsPerLine={barsPerLine}
          setTrackStudio={setTrackStudio}
          bpm={bpm}
          setBpm={(v) => updateTrack(id, { bpm: v })}
        />
      )}
    </div>
  );
}
