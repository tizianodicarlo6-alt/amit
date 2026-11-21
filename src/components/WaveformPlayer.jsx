import { useEffect, useId, useRef, useState } from 'react';
import { useDbQuery } from '../db/useDbQuery.js';
import { db } from '../db/db.js';
import { formatTime } from '../constants.js';
import Icon from './Icon.jsx';
import { claim, release } from './audioBus.js';

function Wave({ peaks, pct }) {
  const n = peaks.length || 1;
  const w = 100 / n;
  const bars = peaks.map((p, i) => {
    const h = Math.max(4, p * 100);
    return <rect key={i} x={i * w + w * 0.15} y={(100 - h) / 2} width={w * 0.7} height={h} rx={w * 0.3} />;
  });
  const id = useId().replace(/:/g, '');
  return (
    <svg className="wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={`wp${id}`}>
          <rect x="0" y="0" width={pct} height="100" />
        </clipPath>
      </defs>
      <g className="wave-bg">{bars}</g>
      <g className="wave-fg" clipPath={`url(#wp${id})`}>
        {bars}
      </g>
    </svg>
  );
}

// Lettore con forma d'onda per i beat (tocca la forma d'onda per spostarti).
export default function WaveformPlayer({ audioId, peaks = [], duration: knownDuration = 0, compact = false }) {
  const stored = useDbQuery(() => (audioId ? db.audio.get(audioId).then((r) => r ?? null) : null), [audioId], undefined);
  const [url, setUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(knownDuration);
  const ref = useRef(null);

  useEffect(() => {
    if (!stored?.blob) return;
    const u = URL.createObjectURL(stored.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [stored]);

  useEffect(() => {
    const a = ref.current;
    return () => a && release(a);
  }, [url]);

  if (stored === null) return <p className="muted small">File audio non presente su questo telefono (forse importato da un backup senza beat).</p>;

  const toggle = (e) => {
    e.stopPropagation();
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      claim(a);
      a.play().catch(() => {});
    } else a.pause();
  };

  const seek = (e) => {
    e.stopPropagation();
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
    setTime(a.currentTime);
  };

  const pct = dur ? Math.min(100, (time / dur) * 100) : 0;
  return (
    <div className={`wplayer${compact ? ' compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button className="player-btn" onClick={toggle} disabled={!url} aria-label={playing ? 'Pausa' : 'Riproduci'}>
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <div className="wave-wrap" onClick={seek}>
        {peaks.length ? <Wave peaks={peaks} pct={pct} /> : <div className="player-bar"><div className="player-fill" style={{ width: `${pct}%` }} /></div>}
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
