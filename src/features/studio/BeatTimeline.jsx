import { useRef } from 'react';
import { formatTime } from '../../constants.js';

const SHORT = { strofa: 'S', ritornello: 'RIT', bridge: 'BR', intro: 'IN', outro: 'OUT' };
const shortLabel = (b) => {
  const n = b.label.match(/(\d+)$/)?.[1] || '';
  return b.type === 'strofa' ? `S${n || ''}` : `${SHORT[b.type] || b.label}${n}`;
};

// Forma d'onda del beat: tocca o trascina per spostarti. Mostra le sezioni del testo.
export default function BeatTimeline({ peaks = [], duration, position, startAt, blocks = [], onSeek, disabled, recording }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const n = peaks.length || 1;
  const w = 100 / n;
  const pct = (t) => (duration ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0);

  const timeFromEvent = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration));
  };

  const onDown = (e) => {
    if (disabled || !duration) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    onSeek(timeFromEvent(e));
  };

  return (
    <div className={`btl${disabled ? ' disabled' : ''}`}>
      <div ref={ref} className="btl-wave" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (dragging.current = false)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {peaks.map((p, i) => {
            const h = Math.max(4, p * 100);
            const played = (i + 0.5) * w <= pct(position);
            return <rect key={i} className={played ? 'pl' : ''} x={i * w + w * 0.15} y={(100 - h) / 2} width={w * 0.7} height={h} />;
          })}
        </svg>
        {blocks.map((b) => (
          <div key={b.id} className={`btl-mark${b.explicit ? ' explicit' : ''}`} style={{ left: `${pct(b.start)}%` }}>
            <span>{shortLabel(b)}</span>
          </div>
        ))}
        {startAt > 0 && <div className="btl-start" style={{ left: `${pct(startAt)}%` }} />}
        <div className={`btl-head${recording ? ' rec' : ''}`} style={{ left: `${pct(position)}%` }} />
      </div>
      <div className="btl-times muted small">
        <span>{formatTime(Math.max(0, position))}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
