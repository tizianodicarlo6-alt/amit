import Icon from '../../components/Icon.jsx';
import AudioPlayer from '../../components/AudioPlayer.jsx';
import { formatDate } from '../../constants.js';

export default function IdeaCard({ idea, trackTitle, onClick, actions }) {
  return (
    <article className="card idea-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="idea-top">
        <span className={`idea-type ${idea.type}`}>
          <Icon name={idea.type === 'voice' ? 'mic' : 'pen'} size={16} />
        </span>
        <span className="muted small">{formatDate(idea.createdAt)}</span>
        {trackTitle && (
          <span className="idea-link small">
            <Icon name="link" size={14} /> {trackTitle}
          </span>
        )}
      </div>
      {idea.type === 'voice' && <AudioPlayer audioId={idea.audioId} duration={idea.duration} />}
      {idea.title && <div className="idea-title">{idea.title}</div>}
      {idea.text && <p className="idea-text">{idea.text}</p>}
      {idea.tags?.length > 0 && (
        <div className="chips small">
          {idea.tags.map((t) => (
            <span key={t} className="chip on static">
              #{t}
            </span>
          ))}
        </div>
      )}
      {actions && (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </article>
  );
}
