import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { db, updateBeat } from '../db/db.js';
import { MAP_KINDS, assignRange, beatMap, mapKindName } from '../lib/beatMap.js';
import { encodeWav } from '../lib/wav.js';
import { computePeaks, toAnalysisSamples } from '../lib/audio.js';
import { detectAttack } from '../lib/analysis.js';
import { makeGrid, moveRegion, regionFromDrag, regionLabel, resizeRegion } from '../lib/loopRegion.js';

// beat decodificati (per non rifarlo ogni volta che apri la pagina)
const cache = new Map();
const MAP_V = 3; // versione della mappa del beat
export async function decodeBeat(audioId) {
  if (cache.has(audioId)) return cache.get(audioId);
  const p = (async () => {
    const rec = await db.audio.get(audioId);
    if (!rec?.blob) throw new Error('beat non trovato');
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Off(1, 1, 44100);
    const data = await rec.blob.arrayBuffer();
    const buf = await new Promise((ok, ko) => {
      const pr = ctx.decodeAudioData(data, ok, ko);
      if (pr && pr.then) pr.then(ok, ko);
    });
    return { buf, blob: rec.blob, attack: detectAttack(toAnalysisSamples(buf), 11025), peaks: computePeaks(buf.getChannelData(0), 320) };
  })();
  cache.set(audioId, p);
  p.catch(() => cache.delete(audioId));
  return p;
}

/** Solo il pezzo [from, to] del beat, come WAV: col lettore in loop gira senza buchi. */
export function sliceWav(buf, from, to, overlay = null) {
  const sr = buf.sampleRate;
  const a = Math.max(0, Math.round(from * sr));
  const b = Math.min(buf.length, Math.round(to * sr));
  const chans = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chans.push(buf.getChannelData(c).slice(a, b));
  // la tua melodia (nanana) sopra il beat: allineata al suo inizio
  if (overlay?.samples) {
    const off = Math.round((overlay.from - from) * sr);
    const g = overlay.gain ?? 1.4;
    for (const ch of chans)
      for (let i = 0; i < ch.length; i++) {
        const j = i - off;
        if (j >= 0 && j < overlay.samples.length) ch[i] = Math.max(-1, Math.min(1, ch[i] * 0.8 + overlay.samples[j] * g));
      }
  }
  return encodeWav(chans, sr);
}

const HANDLE = 22; // px: quanto vicino al bordo per allargare

/**
 * Striscia del beat mentre scrivi: ▶ suona, trascini col dito per scegliere la zona da sentire in loop,
 * la sposti trascinandola, la allarghi tirando i bordi. Un tocco fuori dalla zona: suona da lì (senza loop).
 * marks: zone già salvate per le altre sezioni [{ id, label, from, to, active }].
 */
export default function BeatLoop({ beat, region, onRegion, marks = [], caption, attack: knownAttack = null, overlay = null, children, pauseSignal = 0 }) {
  const [fixing, setFixing] = useState(false); // sto dando un nome al pezzo scelto
  const [decoded, setDecoded] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState(null);
  const [live, setLive] = useState(null); // zona mentre trascini
  const elRef = useRef(null);
  const urlRef = useRef(null);
  const srcKey = useRef(''); // cosa sta suonando il lettore: 'full' o 'from-to'
  const waveRef = useRef(null);
  const drag = useRef(null);
  const pendingSeek = useRef(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const regionRef = useRef(region);
  regionRef.current = region;

  const duration = decoded?.buf.duration || beat.duration || 0;
  const grid = useMemo(() => makeGrid({ bpm: beat.bpm, anchor: knownAttack ?? decoded?.attack ?? 0, duration }), [beat.bpm, knownAttack, decoded, duration]);
  const peaks = decoded?.peaks || beat.peaks || [];
  const shown = live || region;

  useEffect(() => {
    let alive = true;
    decodeBeat(beat.audioId)
      .then((d) => {
        if (!alive) return;
        setDecoded(d);
        // la mappa del beat (intro, strofe, rit…) si calcola una volta e si salva sul beat
        // (versione 2: guarda anche brillantezza e colpi; se l'hai corretta a mano non la tocco)
        if (beat.bpm && (!beat.map || (beat.mapV !== MAP_V && !beat.mapEdited))) {
          try {
            const m = beatMap(d.buf.getChannelData(0), d.buf.sampleRate, { bpm: beat.bpm, anchor: d.attack || 0 });
            updateBeat(beat.id, { map: m, mapV: MAP_V });
          } catch {
            /* la mappa è un aiuto, non serve per suonare */
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [beat.audioId]);

  // via dalla pagina: fermo e libero
  useEffect(
    () => () => {
      try {
        elRef.current?.pause();
      } catch {
        /* ignorato */
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  // testina
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => {
      const el = elRef.current;
      if (el) {
        const base = srcKey.current === 'full' ? 0 : regionRef.current?.from || 0;
        setPos(base + el.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  /** Fa suonare la zona (in loop) o tutto il beat da `at` secondi. */
  const start = async (r, at) => {
    if (!elRef.current) {
      elRef.current = new Audio();
      elRef.current.setAttribute('playsinline', '');
    }
    const el = elRef.current;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* non supportato */
    }
    const ov = overlayRef.current;
    const key = r ? `${r.from}-${r.to}${ov ? `|${ov.id}` : ''}` : 'full';
    if (srcKey.current !== key) {
      let blob;
      if (r) {
        setBusy(true);
        const d = decoded || (await decodeBeat(beat.audioId));
        blob = sliceWav(d.buf, r.from, r.to, ov);
        setBusy(false);
      } else blob = decoded?.blob || (await db.audio.get(beat.audioId))?.blob;
      if (!blob) return;
      const old = urlRef.current;
      urlRef.current = URL.createObjectURL(blob);
      el.src = urlRef.current;
      srcKey.current = key;
      el.loop = true;
      if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
      await new Promise((ok) => {
        if (el.readyState >= 1) return ok();
        el.onloadedmetadata = ok;
        setTimeout(ok, 2500);
      });
    }
    const rel = r ? Math.max(0, Math.min(r.to - r.from - 0.05, (at ?? r.from) - r.from)) : at ?? 0;
    try {
      el.currentTime = rel;
    } catch {
      /* ignorato */
    }
    await el.play();
    setPlaying(true);
  };

  const stop = () => {
    elRef.current?.pause();
    setPlaying(false);
  };

  // la zona è cambiata mentre suona: continuo dentro la nuova zona
  useEffect(() => {
    if (!playing) return;
    const key = region ? `${region.from}-${region.to}${overlay ? `|${overlay.id}` : ''}` : 'full';
    if (key === srcKey.current) return;
    const now = pendingSeek.current ?? pos ?? 0;
    pendingSeek.current = null;
    const inside = region && now >= region.from && now < region.to;
    start(region, inside ? now : region ? region.from : now).catch(() => setPlaying(false));
  }, [region?.from, region?.to, overlay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // qualcuno (es. la registrazione) chiede di fermare il beat
  useEffect(() => {
    if (pauseSignal) stop();
  }, [pauseSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPlay = () => {
    if (playing) return stop();
    start(region, region ? region.from : pos ?? 0).catch(() => {
      setBusy(false);
      alert('Non riesco a far suonare il beat.');
    });
  };

  // ---- dito sulla forma d'onda ----
  const tOf = (e) => {
    const rect = waveRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration));
  };
  const pxOf = (t) => (t / (duration || 1)) * (waveRef.current?.getBoundingClientRect().width || 1);

  const down = (e) => {
    if (!duration) return;
    e.preventDefault();
    waveRef.current.setPointerCapture?.(e.pointerId);
    const t = tOf(e);
    const x = e.clientX - waveRef.current.getBoundingClientRect().left;
    let mode = 'create';
    if (region) {
      if (Math.abs(x - pxOf(region.from)) < HANDLE) mode = 'from';
      else if (Math.abs(x - pxOf(region.to)) < HANDLE) mode = 'to';
      else if (t > region.from && t < region.to) mode = 'move';
    }
    drag.current = { mode, t0: t, x0: e.clientX, moved: false, orig: region };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x0) > 6) d.moved = true;
    if (!d.moved) return;
    const t = tOf(e);
    if (d.mode === 'create') setLive(regionFromDrag(d.t0, t, grid));
    else if (d.mode === 'move') setLive(moveRegion(d.orig, t - d.t0, grid));
    else setLive(resizeRegion(d.orig, d.mode, t, grid));
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const r = live;
      setLive(null);
      if (r) onRegion(r);
      return;
    }
    // tocco senza trascinare
    const t = tOf(e);
    if (region && t >= region.from && t < region.to) {
      if (playing) start(region, t).catch(() => {});
      return;
    }
    if (region) {
      pendingSeek.current = t; // fuori dalla zona: tolgo il loop e suono da qui
      onRegion(null);
      if (!playing) setPos(t);
      return;
    }
    if (playing) start(null, t).catch(() => {});
    else setPos(t);
  };

  const pct = (t) => `${(t / (duration || 1)) * 100}%`;
  useEffect(() => setFixing(false), [region?.from, region?.to]);
  const fixMap = (kind) => {
    if (!region) return;
    updateBeat(beat.id, { map: assignRange(beat.map || [], region.from, Math.min(region.to, duration), kind, (4 * 60) / beat.bpm), mapEdited: true });
    setFixing(false);
  };
  const bars = grid.barDur ? Math.floor((duration - grid.anchor) / grid.barDur) : 0;

  return (
    <div className="beatloop">
      <div className="bl-top">
        <button className="bl-play" onClick={onPlay} aria-label={playing ? 'Ferma il beat' : 'Suona il beat'}>
          {busy ? <span className="spinner" /> : <Icon name={playing ? 'pause' : 'play'} size={22} />}
        </button>
        <div className="grow min0">
          <div className="bl-title ellipsis">{caption || beat.title || 'Beat'}</div>
          <div className="bl-sub ellipsis">{shown ? `🔁 ${regionLabel(shown, grid)}` : 'Trascina sul beat per scegliere il pezzo da sentire in loop'}</div>
        </div>
        {region && (
          <button className="btn sm ghost" onClick={() => onRegion(null)}>
            Tutto
          </button>
        )}
      </div>
      {beat.map?.length > 0 && (
        <>
          <div className="bl-maprow">
            <div className="bl-map" aria-label="Mappa del beat">
              {beat.map.map((m) => (
                <button
                  key={m.start}
                  className={`bl-sec k-${m.kind}${region && Math.abs(region.from - m.start) < 0.05 && Math.abs(region.to - m.end) < 0.05 ? ' on' : ''}`}
                  style={{ left: pct(m.start), width: pct(m.end - m.start) }}
                  onClick={() => onRegion({ from: m.start, to: Math.min(m.end, duration) })}
                  title={`Loop su ${m.label}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {region && beat.bpm && (
        <div className="bl-fixbar">
          {!fixing ? (
            <button className="bl-name" onClick={() => setFixing(true)}>
              🏷 Questo pezzo è…
            </button>
          ) : (
            <>
              {MAP_KINDS.map((k) => (
                <button key={k} className="chip sm" onClick={() => fixMap(k)}>
                  {mapKindName(k)}
                </button>
              ))}
              <button className="chip sm ghosty" onClick={() => setFixing(false)}>
                Annulla
              </button>
            </>
          )}
        </div>
      )}
      <div className="bl-marks">
        {marks
          .filter((m) => m.from != null)
          .map((m) => (
            <span key={m.id} className={`bl-mark${m.active ? ' on' : ''}`} style={{ left: pct(m.from), width: pct(m.to - m.from) }}>
              {m.label}
            </span>
          ))}
      </div>
      <div className="bl-wave" ref={waveRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => ((drag.current = null), setLive(null))}>
        {Array.from({ length: Math.min(bars + 1, 400) }, (_, i) => (
          <span key={i} className={`bl-grid${i % 4 === 0 ? ' four' : ''}`} style={{ left: pct(grid.anchor + i * grid.barDur) }} />
        ))}
        <svg viewBox={`0 0 ${peaks.length || 1} 100`} preserveAspectRatio="none" aria-hidden>
          {peaks.map((p, i) => (
            <rect key={i} x={i + 0.15} width={0.7} y={50 - Math.max(1.5, p * 46)} height={Math.max(3, p * 92)} />
          ))}
        </svg>
        {shown && (
          <div className="bl-region" style={{ left: pct(shown.from), width: pct(shown.to - shown.from) }}>
            <span className="bl-h l" />
            <span className="bl-h r" />
          </div>
        )}
        {pos != null && <span className="bl-head" style={{ left: pct(pos) }} />}
      </div>
      {children}
    </div>
  );
}
