import { useEffect, useRef, useState } from 'react';
import { useDbQuery } from '../db/useDbQuery.js';
import { db } from '../db/db.js';
import { formatTime } from '../constants.js';
import Icon from './Icon.jsx';

// Lettore audio semplice. Accetta un Blob oppure l'id di un audio salvato.
export default function AudioPlayer({ blob: blobProp, audioId, duration: knownDuration = 0 }) {
  const stored = useDbQuery(() => (audioId ? db.audio.get(audioId) : undefined), [audioId]);
  const blob = blobProp || stored?.blob;
  const [url, setUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(knownDuration);
  const ref = useRef(null);

  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const toggle = (e) => {
    e.stopPropagation();
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play();
    else a.pause();
  };

  const seek = (e) => {
    e.stopPropagation();
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  };

  const pct = dur ? Math.min(100, (time / dur) * 100) : 0;
  return (
    <div className="player" onClick={(e) => e.stopPropagation()}>
      <button className="player-btn" onClick={toggle} disabled={!url} aria-label={playing ? 'Pausa' : 'Riproduci'}>
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <div className="player-bar" onClick={seek}>
        <div className="player-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="player-time">{formatTime(playing || time ? time : dur)}</span>
      {url && (
        <audio
          ref={ref}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setTime(0);
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
        />
      )}
    </div>
  );
}
