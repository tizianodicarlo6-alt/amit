import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { decodeBeat } from '../../components/BeatLoop.jsx';
import { micErrorMessage } from '../../components/useRecorder.js';
import { db, newId, updateTrack } from '../../db/db.js';
import { encodeWav } from '../../lib/wav.js';
import { melodyPhrases } from '../../lib/melodyPhrases.js';
import { StudioEngine } from '../studio/engine.js';
import { DEFAULT_LAT } from '../studio/voices.js';

const readLatency = () => {
  try {
    const v = JSON.parse(localStorage.getItem('amit.studio.lat.speaker'));
    return v != null ? v / 1000 : DEFAULT_LAT.speaker;
  } catch {
    return DEFAULT_LAT.speaker;
  }
};

const takeCache = new Map();
async function decodeTake(audioId, sr) {
  const k = `${audioId}@${sr}`;
  if (!takeCache.has(k)) {
    takeCache.set(
      k,
      (async () => {
        const rec = await db.audio.get(audioId);
        const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const ctx = new Off(1, 1, sr); // decodifico già alla frequenza del beat
        const data = await rec.blob.arrayBuffer();
        const buf = await new Promise((ok, ko) => {
          const pr = ctx.decodeAudioData(data, ok, ko);
          if (pr && pr.then) pr.then(ok, ko);
        });
        return buf.getChannelData(0);
      })()
    );
  }
  return takeCache.get(k);
}

/** La melodia (nanana) scelta per una sezione: { takes, sel, listen } */
export const melodyOf = (track, key) => track.studio?.melodies?.[key] || { takes: [], sel: null, listen: true };
export const selectedTake = (m) => m.takes.find((t) => t.id === m.sel) || m.takes[m.takes.length - 1] || null;

// 🎤 Nanana: registri la melodia sul pezzo in loop, l'app trova le frasi e le sillabe
export default function MelodyBar({ track, beat, region, sectionKey, onOverlay, onPause }) {
  const engineRef = useRef(null);
  const handleRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | starting | recording | working
  const [pre, setPre] = useState(0);
  const [pos, setPos] = useState(0);
  const [msg, setMsg] = useState('');
  const m = melodyOf(track, sectionKey);
  const take = selectedTake(m);
  const dur = region ? region.to - region.from : 0;

  useEffect(() => {
    engineRef.current = new StudioEngine();
    return () => engineRef.current?.dispose();
  }, []);

  // la melodia scelta suona sopra il beat (se "col nanana" è acceso)
  useEffect(() => {
    let alive = true;
    if (!take || !m.listen) {
      onOverlay(null);
      return;
    }
    decodeBeat(beat.audioId)
      .then((d) => decodeTake(take.audioId, d.buf.sampleRate))
      .then((samples) => alive && onOverlay({ id: take.id, from: take.from, samples }))
      .catch(() => onOverlay(null));
    return () => {
      alive = false;
    };
  }, [take?.id, m.listen, beat.audioId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next) => updateTrack(track.id, { studio: { ...(track.studio || {}), melodies: { ...(track.studio?.melodies || {}), [sectionKey]: next } } });

  useEffect(() => {
    if (state !== 'recording') return;
    let raf;
    const tick = () => {
      const e = engineRef.current;
      setPos(e.position() ?? 0);
      setPre(e.countInLeft());
      if ((e.position() ?? 0) > dur + 0.15) return stop();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (!region) {
      setMsg('Prima trascina il dito sul beat per scegliere il pezzo (es. il ritornello).');
      return;
    }
    const e = engineRef.current;
    onPause();
    e.unlock(); // dentro il tocco
    setMsg('');
    setState('starting');
    try {
      const d = await decodeBeat(beat.audioId);
      const sr = d.buf.sampleRate;
      const a = Math.round(region.from * sr);
      const len = Math.max(1, Math.min(d.buf.length - a, Math.round(dur * sr)));
      const piece = new AudioBuffer({ length: len, numberOfChannels: Math.min(2, d.buf.numberOfChannels), sampleRate: sr });
      for (let c = 0; c < piece.numberOfChannels; c++) piece.copyToChannel(d.buf.getChannelData(c).subarray(a, a + len), c);
      handleRef.current = await e.record({ beat: piece, from: 0, countIn: beat.bpm ? 4 : 0, bpm: beat.bpm || 0, speaker: true });
      setState('recording');
    } catch (err) {
      setMsg(micErrorMessage(err));
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
      if (r.silent) throw new Error('non ho sentito la voce');
      const s0 = Math.round((-r.offset + readLatency()) * r.sr);
      const len = Math.round(dur * r.sr);
      const x = new Float32Array(len);
      for (let i = 0; i < len; i++) x[i] = r.samples[s0 + i] || 0;
      const phrases = melodyPhrases(x, r.sr);
      const audioId = newId();
      await db.audio.put({ id: audioId, blob: encodeWav([x], r.sr), mime: 'audio/wav', kind: 'melody' });
      const t = { id: newId(), audioId, from: region.from, to: region.to, phrases, at: Date.now() };
      const takes = [...m.takes, t].slice(-5); // tengo le ultime 5 prove
      save({ ...m, takes, sel: t.id, listen: true });
      setMsg(phrases.length ? '' : 'Non ho trovato frasi chiare: prova a cantare più vicino al telefono.');
    } catch (err) {
      setMsg(`Non sono riuscito a salvare la melodia (${err?.message || err}).`);
    }
    setState('idle');
  };

  const remove = () => {
    if (!take || !confirm('Cancellare questa prova di melodia?')) return;
    const takes = m.takes.filter((x) => x.id !== take.id);
    save({ ...m, takes, sel: takes[takes.length - 1]?.id || null });
  };

  if (state === 'recording' || state === 'starting')
    return (
      <div className="melbar rec">
        <span className="rec-dot" />
        <span className="grow">{state === 'starting' ? 'Preparo…' : pre > 0.02 ? `Pronto… ${Math.ceil(pre / (60 / (beat.bpm || 120)))}` : `Canta! ${Math.max(0, pos).toFixed(1)} / ${dur.toFixed(1)} s`}</span>
        <button className="btn sm" onClick={stop} disabled={state === 'starting'}>
          <Icon name="stop" size={18} /> Stop
        </button>
      </div>
    );

  return (
    <div className="melbar">
      <div className="row melbar-row">
        <button className="btn sm mel-rec" onClick={start} disabled={state === 'working'}>
          {state === 'working' ? <span className="spinner" /> : '🎤'} Nanana
        </button>
        {m.takes.map((t, i) => (
          <button key={t.id} className={`chip sm${take?.id === t.id ? ' on' : ''}`} onClick={() => save({ ...m, sel: t.id })}>
            {i + 1}
          </button>
        ))}
        {take && (
          <>
            <button className={`chip sm${m.listen ? ' on' : ''}`} onClick={() => save({ ...m, listen: !m.listen })} aria-label="Ascolta il beat col nanana">
              🎧
            </button>
            <button className="icon-btn sm" onClick={remove} aria-label="Cancella la prova">
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>
      {take && take.phrases.length > 0 && (
        <div className="mel-phr">
          Frasi: {take.phrases.map((p) => p.syllables).join(' · ')} sillabe
        </div>
      )}
      {msg && <div className="mel-msg">{msg}</div>}
    </div>
  );
}
