import { Link } from 'react-router-dom';
import { statusOf, formatDate } from '../../constants.js';

export function StatusBadge({ status }) {
  const s = statusOf(status);
  return (
    <span className="badge" style={{ '--c': s.color }}>
      {s.label}
    </span>
  );
}

export default function TrackCard({ track, projectName, extra }) {
  const bars = (track.sections || []).reduce((n, s) => n + s.text.split('\n').filter((l) => l.trim()).length, 0);
  return (
    <div className="card track-card">
      <Link to={`/traccia/${track.id}`} className="track-main">
        <div className="track-title">{track.title || 'Senza titolo'}</div>
        <div className="track-meta">
          <StatusBadge status={track.status} />
          {track.bpm ? <span className="muted small">{track.bpm} BPM</span> : null}
          <span className="muted small">{bars} barre</span>
          {projectName && <span className="muted small">· {projectName}</span>}
        </div>
        <div className="muted small">Modificata {formatDate(track.updatedAt)}</div>
      </Link>
      {extra}
    </div>
  );
}
