import { useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import TagPicker from '../../components/TagPicker.jsx';
import TrackPicker from '../../components/TrackPicker.jsx';
import AudioPlayer from '../../components/AudioPlayer.jsx';
import { useRecorder } from '../../components/useRecorder.js';
import { addIdea } from '../../db/db.js';
import { formatTime } from '../../constants.js';
import NoteEditor from './NoteEditor.jsx';

// Foglio "Nuova idea": scegli testo o voce e salva in due tocchi.
export default function QuickCapture({ onClose, trackId: initialTrack = null, mode: initialMode = null, note = null }) {
  const [mode, setMode] = useState(initialMode); // null | 'text' | 'voice'
  const [text, setText] = useState('');
  const [tags, setTags] = useState([]);
  const [trackId, setTrackId] = useState(initialTrack);
  const [saving, setSaving] = useState(false);
  const rec = useRecorder();

  const chooseVoice = () => {
    setMode('voice');
    rec.start();
  };

  const canSave = mode === 'text' ? text.trim().length > 0 : rec.state === 'done' && rec.result;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    if (mode === 'text') await addIdea({ type: 'text', text: text.trim(), tags, trackId });
    else await addIdea({ type: 'voice', text: text.trim(), blob: rec.result.blob, mime: rec.result.mime, duration: rec.result.duration, tags, trackId });
    onClose();
  };

  // scrivere: pagina a tutto schermo, come l'app Note
  if (mode === 'text') return <NoteEditor trackId={trackId} onClose={onClose} start={note} />;

  return (
    <Sheet open onClose={onClose} title="Nuova idea">
      {!mode && (
        <div className="capture-choice">
          <button className="big-choice" onClick={() => setMode('text')}>
            <Icon name="pen" size={36} />
            <span>Scrivi</span>
          </button>
          <button className="big-choice" onClick={chooseVoice}>
            <Icon name="mic" size={36} />
            <span>Registra</span>
          </button>
        </div>
      )}

      {mode === 'text' && (
        <textarea
          className="input capture-text"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Scrivi la barra, il concetto, l'immagine…"
          rows={5}
        />
      )}

      {mode === 'voice' && (
        <div className="recorder">
          {rec.error && <p className="error">{rec.error}</p>}
          {rec.state === 'recording' && (
            <>
              <div className="rec-dot" />
              <div className="rec-time">{formatTime(rec.seconds)}</div>
              <button className="rec-btn stop" onClick={rec.stop} aria-label="Ferma">
                <Icon name="stop" size={34} />
              </button>
              <p className="muted">Sto registrando… tocca per fermare</p>
            </>
          )}
          {rec.state === 'starting' && <p className="muted">Attendo il microfono… (se compare la richiesta, tocca Consenti)</p>}
          {rec.state === 'idle' && (
            <>
              <button className="rec-btn" onClick={rec.start} aria-label="Registra">
                <Icon name="mic" size={36} />
              </button>
              <p className="muted">Tocca per registrare</p>
            </>
          )}
          {rec.state === 'done' && rec.result && (
            <div className="stack">
              <AudioPlayer blob={rec.result.blob} duration={rec.result.duration} />
              <button className="btn ghost" onClick={() => rec.reset()}>
                Rifai la registrazione
              </button>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nota (facoltativa)" />
            </div>
          )}
        </div>
      )}

      {(mode === 'text' || (mode === 'voice' && rec.state === 'done')) && (
        <div className="stack">
          <div className="field">
            <span className="field-label">Tag</span>
            <TagPicker value={tags} onChange={setTags} />
          </div>
          <TrackPicker value={trackId} onChange={setTrackId} />
          <button className="btn primary big" onClick={save} disabled={!canSave || saving}>
            <Icon name="check" /> Salva idea
          </button>
        </div>
      )}
    </Sheet>
  );
}
