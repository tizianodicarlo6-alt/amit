import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import TagPicker from '../../components/TagPicker.jsx';
import TrackPicker from '../../components/TrackPicker.jsx';
import AudioPlayer from '../../components/AudioPlayer.jsx';
import { addTrack, deleteIdea, updateIdea } from '../../db/db.js';
import { formatDate } from '../../constants.js';
import NoteEditor from './NoteEditor.jsx';
import ShareSheet from '../messaggi/ShareSheet.jsx';
import { useProfile } from '../../lib/profile.js';


// Modifica di un'idea esistente.
export default function IdeaSheet({ idea, onClose }) {
  if (idea.type !== 'voice') return <NoteEditor idea={idea} onClose={onClose} />;
  return <VoiceIdeaSheet idea={idea} onClose={onClose} />;
}

function VoiceIdeaSheet({ idea, onClose }) {
  const profile = useProfile();
  const [sharing, setSharing] = useState(false);
  const [text, setText] = useState(idea.text || '');
  const [tags, setTags] = useState(idea.tags || []);
  const [trackId, setTrackId] = useState(idea.trackId || null);
  const navigate = useNavigate();

  const save = async () => {
    await updateIdea(idea.id, { text: text.trim(), tags, trackId });
    onClose();
  };

  const remove = async () => {
    if (!confirm('Eliminare questa idea?')) return;
    await deleteIdea(idea.id);
    onClose();
  };

  // Crea una traccia nuova partendo da questa idea.
  const toTrack = async () => {
    const title = idea.type === 'text' ? text.trim().split('\n')[0].slice(0, 40) : 'Nuova traccia';
    const id = await addTrack({ title: title || 'Nuova traccia' });
    await updateIdea(idea.id, { text: text.trim(), tags, trackId: id });
    onClose();
    navigate(`/traccia/${id}`);
  };

  return (
    <Sheet open onClose={onClose} title={idea.type === 'voice' ? 'Nota vocale' : 'Idea'}>
      <div className="stack">
        <p className="muted small">Creata {formatDate(idea.createdAt)}</p>
        {idea.type === 'voice' && <AudioPlayer audioId={idea.audioId} duration={idea.duration} />}
        <textarea
          className="input"
          rows={idea.type === 'voice' ? 2 : 5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={idea.type === 'voice' ? 'Nota (facoltativa)' : 'Testo'}
        />
        <div className="field">
          <span className="field-label">Tag</span>
          <TagPicker value={tags} onChange={setTags} />
        </div>
        <TrackPicker value={trackId} onChange={setTrackId} />
        {!trackId && (
          <button className="btn ghost" onClick={toTrack}>
            <Icon name="tracce" size={20} /> Crea una traccia da questa idea
          </button>
        )}
        {profile && (
          <button className="btn" onClick={() => setSharing(true)}>
            <Icon name="send" size={20} /> Manda a un socio
          </button>
        )}
        {sharing && <ShareSheet kind="idea" item={{ ...idea, text, tags }} onClose={() => setSharing(false)} />}
        <button className="btn primary big" onClick={save}>
          <Icon name="check" /> Salva
        </button>
        <button className="btn danger" onClick={remove}>
          <Icon name="trash" size={20} /> Elimina
        </button>
      </div>
    </Sheet>
  );
}
