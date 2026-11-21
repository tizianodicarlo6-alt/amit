import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { keyShort } from '../../constants.js';
import { micErrorMessage } from '../../components/useRecorder.js';
import { encodeWav } from '../../lib/wav.js';
import { StudioEngine } from '../studio/engine.js';
import { DEFAULT_LAT } from '../studio/voices.js';
import { STYLES, STYLE_ORDER, beatFromMelody, noteName } from './music.js';
import { guessKey, pitchTrack, quantizeNotes, segmentNotes } from './pitchTrack.js';
import { renderSketch } from './synth.js';

const makeBuffer = (channels, sr) => {
  try {
    const b = new AudioBuffer({ length: channels[0].length, sampleRate: sr, numberOfChannels: channels.length });
    channels.forEach((c, i) => b.copyToChannel(c, i));
    return b;
  } catch {
    return null;
  }
};

/** Click del metronomo per `bars` battute (più forte sul primo battito). */
function clickTrack(bpm, bars, sr = 44100) {
  const beat = 60 / bpm;
  const x = new Float32Array(Math.ceil(bars * 4 * beat * sr));
  for (let k = 0; k < bars * 4; k++) {
    const a = Math.floor(k * beat * sr);
    const f = k % 4 === 0 ? 1600 : 1100;
    for (let i = 0; i < sr * 0.04 && a + i < x.length; i++) x[a + i] = Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * 0.008)) * 0.6;
  }
  return x;
}

const readLatency = () => {
  try {
    const v = JSON.parse(localStorage.getItem('amit.studio.lat.speaker'));
    return v != null ? v / 1000 : DEFAULT_LAT.speaker;
  } catch {
    return DEFAULT_LAT.speaker;
  }
};

// 🎤 Canticchia la melodia: la voce diventa note, poi "Crea beat da questa melodia"
export default function HumRecorder({ sketch, change, player, onDone }) {
  const engineRef = useRef(null);
  const [guide, setGuide] = useState('click');
  const [state, setState] = useState('idle'); // idle | starting | recording | working | result
  const [pos, setPos] = useState(0);
  const [pre, setPre] = useState(0);
  const [result, setResult] = useState(null); // { notes, keyGuess, url }
  const [error, setError] = useState('');
  const handleRef = useRef(null);
  const hasGroove = Object.values(sketch.drums).some((r) => r.some(Boolean)) || sketch.chords.some((c) => c != null);

  useEffect(() => {
    engineRef.current = new StudioEngine();
    return () => {
      engineRef.current?.dispose();
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // durante la registrazione: conto alla rovescia e fine automatica
  useEffect(() => {
    if (state !== 'recording') return;
    let raf;
    const loopDur = (sketch.bars * 4 * 60) / sketch.bpm;
    const tick = () => {
      const e = engineRef.current;
      const p = e.position() ?? 0;
      setPos(p);
      setPre(e.countInLeft());
      if (p > loopDur + 0.15) return stop();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    const e = engineRef.current;
    player.stop();
    e.unlock(); // dentro il tocco
    setError('');
    setResult(null);
    setState('starting');
    try {
      let buf;
      if (guide === 'groove' && hasGroove) {
        const r = await renderSketch({ ...sketch, mix: { ...sketch.mix, melody: { ...sketch.mix.melody, mute: true } } });
        buf = makeBuffer([r.L, r.R], r.sr);
      } else buf = makeBuffer([clickTrack(sketch.bpm, sketch.bars)], 44100);
      handleRef.current = await e.record({ beat: buf, from: 0, countIn: 4, bpm: sketch.bpm, speaker: true });
      setState('recording');
    } catch (err) {
      setError(micErrorMessage(err));
      await e.endMicSession();
      setState('idle');
    }
  };

  const stop = async () => {
    const h = handleRef.current;
    if (!h) return;
    handleRef.current = null;
    setState('working');
    try {
      const r = await h.stop();
      await engineRef.current.endMicSession();
      await new Promise((ok) => setTimeout(ok, 30));
      // inizio della battuta 1 nella registrazione (+ ritardo del telefono)
      const beatStart = -r.offset + readLatency();
      const segs = segmentNotes(pitchTrack(r.samples, r.sr));
      const keyGuess = guessKey(segs.map((s) => ({ pitch: s.pitch, len: s.end - s.start })));
      const notes = quantizeNotes(segs, { bpm: sketch.bpm, key: sketch.key, bars: sketch.bars, beatStart });
      const url = URL.createObjectURL(encodeWav([r.samples], r.sr));
      setResult({ segs, beatStart, notes, keyGuess, url });
      setState('result');
    } catch (err) {
      setError(`Non sono riuscito ad ascoltare la registrazione (${err?.message || err}).`);
      setState('idle');
    }
  };

  const useKey = (k) => {
    const notes = quantizeNotes(result.segs, { bpm: sketch.bpm, key: k, bars: sketch.bars, beatStart: result.beatStart });
    setResult({ ...result, notes, keyGuess: k, keyApplied: true });
    change({ key: k });
  };

  const putInMelody = () => {
    change({ notes: { ...sketch.notes, melody: result.notes } });
    setResult({ ...result, placed: true });
  };

  const makeBeat = (styleId) => {
    const melody = result.placed ? sketch.notes.melody : result.notes;
    change(beatFromMelody({ ...sketch, notes: { ...sketch.notes, melody } }, styleId));
    onDone?.(styleId);
  };

  const loopDur = (sketch.bars * 4 * 60) / sketch.bpm;
  const barNow = Math.min(sketch.bars, Math.floor(Math.max(0, pos) / ((4 * 60) / sketch.bpm)) + 1);

  return (
    <div className="stack hum">
      {(state === 'idle' || state === 'starting') && (
        <>
          <p className="muted">
            Canta o fischia la melodia che hai in testa, <b>una nota alla volta</b>. Partono 4 click, poi registri per {sketch.bars} battute a {sketch.bpm} BPM.
          </p>
          <div className="field">
            <span className="field-label">Canti sopra…</span>
            <div className="segmented">
              <button className={guide === 'click' ? 'on' : ''} onClick={() => setGuide('click')}>
                Il click
              </button>
              <button className={guide === 'groove' ? 'on' : ''} onClick={() => setGuide('groove')} disabled={!hasGroove}>
                Il groove
              </button>
            </div>
            {!hasGroove && <span className="muted small">Per cantare sul groove, crea prima la batteria o gli accordi.</span>}
          </div>
          <button className="rec-main hum-rec" onClick={start} disabled={state === 'starting'} aria-label="Registra la melodia">
            {state === 'starting' ? <span className="spinner big" /> : <span className="rec-core" />}
          </button>
          <p className="muted small center">Consiglio: stanza silenziosa, telefono a 20–30 cm. Fischiare funziona molto bene.</p>
        </>
      )}

      {state === 'recording' && (
        <div className="hum-live">
          {pre > 0.02 ? (
            <>
              <span className="muted">Pronto…</span>
              <span className="big-count">{Math.ceil(pre / (60 / sketch.bpm))}</span>
            </>
          ) : (
            <>
              <span className="muted">Canta! Battuta</span>
              <span className="big-count">
                {barNow}/{sketch.bars}
              </span>
              <div className="studio-progress hum-prog">
                <div style={{ width: `${Math.min(100, (Math.max(0, pos) / loopDur) * 100)}%` }} />
              </div>
            </>
          )}
          <button className="rec-main on" onClick={stop} aria-label="Ferma">
            <Icon name="stop" size={30} />
          </button>
        </div>
      )}

      {state === 'working' && (
        <div className="hum-live">
          <span className="spinner big" />
          <span className="muted">Trasformo la voce in note…</span>
        </div>
      )}

      {state === 'result' && result && (
        <div className="stack">
          {result.notes.length === 0 ? (
            <div className="notice error-box">Non ho sentito note chiare. Prova a cantare più vicino al telefono, una nota alla volta, oppure fischia.</div>
          ) : (
            <>
              <div className="card stack">
                <div className="reco-title">Ho trovato {result.notes.length} note</div>
                <div className="hum-notes">
                  {result.notes.map((n, i) => (
                    <span key={i} className="chip static on">
                      {noteName(n.pitch)}
                    </span>
                  ))}
                </div>
                <audio controls src={result.url} className="hum-audio" />
                {result.keyGuess && result.keyGuess !== sketch.key && !result.keyApplied && (
                  <div className="notice">
                    Hai cantato in <b>{keyShort(result.keyGuess)}</b>, ma la bozza è in {keyShort(sketch.key)}.
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="btn sm primary" onClick={() => useKey(result.keyGuess)}>
                        Usa {result.keyGuess}
                      </button>
                      <button className="btn sm" onClick={() => setResult({ ...result, keyApplied: true })}>
                        Tieni {sketch.key}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {!result.placed ? (
                <button className="btn primary big" onClick={putInMelody}>
                  Metti nella melodia
                </button>
              ) : (
                <p className="ok small center">✓ Nella melodia (la trovi e la correggi in 🎹 Note)</p>
              )}
              <div className="field">
                <span className="field-label">Crea beat da questa melodia</span>
                <div className="chips">
                  {STYLE_ORDER.map((k) => (
                    <button key={k} className="chip" onClick={() => makeBeat(k)}>
                      {STYLES[k].label}
                    </button>
                  ))}
                </div>
                <span className="muted small">Aggiunge accordi che stanno sotto la tua melodia, batteria e 808 nello stile scelto.</span>
              </div>
            </>
          )}
          <button className="btn ghost" onClick={() => setState('idle')}>
            Rifai
          </button>
        </div>
      )}

      {error && <div className="notice error-box">{error}</div>}
    </div>
  );
}
