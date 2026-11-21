import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { micErrorMessage } from '../../components/useRecorder.js';
import { db, newId } from '../../db/db.js';
import { encodeWav } from '../../lib/wav.js';
import { StudioEngine } from '../studio/engine.js';
import { DEFAULT_LAT } from '../studio/voices.js';
import { LOOP_BARS, VOICE_FX, guessLoopBars, trimStart } from './layers.js';
import { renderSketch } from './synth.js';
import PitchCtl from './PitchCtl.jsx';

const readLatency = () => {
  try {
    const v = JSON.parse(localStorage.getItem('amit.studio.lat.speaker'));
    return v != null ? v / 1000 : DEFAULT_LAT.speaker;
  } catch {
    return DEFAULT_LAT.speaker;
  }
};

async function decodeFile(file) {
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Off(1, 1, 44100);
  const data = await file.arrayBuffer();
  return new Promise((ok, ko) => {
    const pr = ctx.decodeAudioData(data, ok, ko);
    if (pr && pr.then) pr.then(ok, ko);
  });
}

// 🎧 Sample e cori: un loop audio caricato e la tua voce registrata sul beat
export default function LayersEditor({ sketch, change, player, onPlay }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const sm = sketch.samples.sample;
  const vo = sketch.samples.voce;
  const setLayer = (part, info) => {
    const samples = { ...sketch.samples };
    if (info) samples[part] = info;
    else delete samples[part];
    change({ samples });
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const buf = await decodeFile(f);
      const x = trimStart(buf.getChannelData(0), buf.sampleRate);
      const { bars, srcBpm } = guessLoopBars(x, buf.sampleRate, sketch.bpm);
      const audioId = newId();
      await db.audio.put({ id: audioId, blob: f, mime: f.type || 'audio/wav', kind: 'sample' });
      setLayer('sample', { audioId, name: f.name.replace(/\.[a-z0-9]{2,4}$/i, '').slice(0, 40), bars, srcBpm, semis: 0, dur: x.length / buf.sampleRate });
    } catch {
      alert('Non riesco a leggere questo file audio.');
    }
    setBusy(false);
  };

  return (
    <div className="stack layers">
      {/* SAMPLE */}
      <section className="card stack">
        <div className="reco-title">🎧 Sample</div>
        {!sm ? (
          <>
            <p className="muted small">
              Un <b>sample</b> è un pezzo di audio che si ripete sul beat: un giro di chitarra o di piano, un coro, un suono che hai registrato col telefono… Lo carichi e l'app
              lo mette <b>a tempo</b> col BPM della bozza (e se vuoi lo alzi o abbassi di tono).
            </p>
            <button className="btn primary" onClick={() => fileRef.current.click()} disabled={busy}>
              {busy ? <span className="spinner" /> : <Icon name="plus" size={20} />} {busy ? 'Lo preparo…' : 'Carica un sample'}
            </button>
            <p className="muted small">
              Attenzione: per un provino va benissimo, ma se poi pubblichi il brano con un pezzo di una canzone di altri serve il loro permesso. Meglio sample “royalty free”
              o suoni tuoi.
            </p>
          </>
        ) : (
          <>
            <div className="own-row">
              <span className="own-name ellipsis grow">{sm.name}</span>
              <button className="btn sm ghost" onClick={() => setLayer('sample', null)}>
                Togli
              </button>
            </div>
            <p className="muted small">
              {sm.srcBpm ? `Era a ${sm.srcBpm} BPM: ora va a ${sketch.bpm} come il beat.` : `Messo a tempo a ${sketch.bpm} BPM.`} Se suona troppo veloce o lento, cambia le battute.
            </p>
            <div className="field">
              <span className="field-label">Lungo quante battute</span>
              <div className="chips">
                {LOOP_BARS.map((b) => (
                  <button key={b} className={`chip sm${sm.bars === b ? ' on' : ''}`} onClick={() => setLayer('sample', { ...sm, bars: b })}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <PitchCtl value={sm.semis || 0} onChange={(v) => setLayer('sample', { ...sm, semis: v })} />
            <button className="btn sm" onClick={onPlay}>
              ▶ Ascolta col beat
            </button>
          </>
        )}
        <input ref={fileRef} type="file" accept="audio/*,.wav,.mp3,.m4a,.aif,.aiff,.flac,.ogg" hidden onChange={onFile} />
      </section>

      {/* VOCE E CORI */}
      <section className="card stack">
        <div className="reco-title">🎤 Voce e cori</div>
        <VoiceRecorder sketch={sketch} player={player} info={vo} onSaved={(info) => setLayer('voce', info)} />
        {vo && (
          <>
            <div className="field">
              <span className="field-label">Effetto</span>
              <div className="chips">
                {VOICE_FX.map((f) => (
                  <button key={f.id} className={`chip sm${(vo.fx || 'coro') === f.id ? ' on' : ''}`} onClick={() => setLayer('voce', { ...vo, fx: f.id })}>
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="muted small">{VOICE_FX.find((f) => f.id === (vo.fx || 'coro'))?.hint}</span>
            </div>
            <PitchCtl value={vo.semis || 0} onChange={(v) => setLayer('voce', { ...vo, semis: v })} />
            <div className="row">
              <button className="btn sm" onClick={onPlay}>
                ▶ Ascolta col beat
              </button>
              <button className="btn sm ghost" onClick={() => confirm('Togliere la voce?') && setLayer('voce', null)}>
                Togli la voce
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// Registra la voce sopra il loop (4 click, poi una volta il loop) e la salva allineata alla battuta 1
function VoiceRecorder({ sketch, player, info, onSaved }) {
  const engineRef = useRef(null);
  const handleRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | starting | recording | working
  const [pos, setPos] = useState(0);
  const [pre, setPre] = useState(0);
  const [error, setError] = useState('');
  const loopDur = (sketch.bars * 4 * 60) / sketch.bpm;

  useEffect(() => {
    engineRef.current = new StudioEngine();
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (state !== 'recording') return;
    let raf;
    const tick = () => {
      const e = engineRef.current;
      const p = e.position() ?? 0;
      setPos(p);
      setPre(e.countInLeft());
      if (p > loopDur + 0.2) return stop();
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
    setState('starting');
    try {
      const samples = await player.loadSamples({ ...sketch, samples: Object.fromEntries(Object.entries(sketch.samples).filter(([k]) => k !== 'voce')) });
      const r = await renderSketch({ ...sketch, structure: [] }, { samples });
      const buf = new AudioBuffer({ length: r.L.length, numberOfChannels: 2, sampleRate: r.sr });
      buf.copyToChannel(r.L, 0);
      buf.copyToChannel(r.R, 1);
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
      if (r.silent) throw new Error('la registrazione è muta');
      // tengo esattamente il loop: dalla battuta 1 (+ ritardo del telefono) per `bars` battute
      const start = Math.round((-r.offset + readLatency()) * r.sr);
      const len = Math.round(loopDur * r.sr);
      const x = new Float32Array(len);
      for (let i = 0; i < len; i++) x[i] = r.samples[start + i] || 0;
      const audioId = newId();
      await db.audio.put({ id: audioId, blob: encodeWav([x], r.sr), mime: 'audio/wav', kind: 'sample' });
      onSaved({ audioId, name: 'La tua voce', bars: sketch.bars, bpm: sketch.bpm, semis: 0, fx: info?.fx || 'coro' });
    } catch (err) {
      setError(`Non sono riuscito a salvare la voce (${err?.message || err}).`);
    }
    setState('idle');
  };

  const barNow = Math.min(sketch.bars, Math.floor(Math.max(0, pos) / ((4 * 60) / sketch.bpm)) + 1);

  if (state === 'recording')
    return (
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
          </>
        )}
        <button className="rec-main on" onClick={stop} aria-label="Ferma">
          <Icon name="stop" size={30} />
        </button>
      </div>
    );

  return (
    <>
      {!info && (
        <p className="muted small">
          Registra la tua voce sul beat: un ritornello, degli “ooh / aah”, un adlib… Parte il beat con 4 click e registri per {sketch.bars} battute. Con l'effetto{' '}
          <b>Coro</b> sembra cantato da più persone. Poi in 🧱 Struttura scegli in quali parti si sente.
        </p>
      )}
      {state === 'working' ? (
        <div className="row center">
          <span className="spinner" /> <span className="muted">Preparo la voce…</span>
        </div>
      ) : (
        <button className={`btn ${info ? '' : 'primary'}`} onClick={start} disabled={state === 'starting'}>
          {state === 'starting' ? <span className="spinner" /> : <span className="rec-dot" />} {info ? 'Registra di nuovo' : 'Registra voce o cori'}
        </button>
      )}
      {error && <div className="notice error-box">{error}</div>}
    </>
  );
}
