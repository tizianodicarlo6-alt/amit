import { useMemo, useState } from 'react';
import { useDbQuery } from '../../db/useDbQuery.js';
import { db } from '../../db/db.js';
import Icon from '../../components/Icon.jsx';
import { useCapture } from '../../components/CaptureContext.jsx';
import IdeaCard from './IdeaCard.jsx';
import IdeaSheet from './IdeaSheet.jsx';

const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function TaccuinoPage() {
  const ideas = useDbQuery(() => db.ideas.orderBy('createdAt').reverse().toArray(), []);
  const tracks = useDbQuery(() => db.tracks.toArray(), []) || [];
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState(null);
  const [type, setType] = useState('all');
  const [editing, setEditing] = useState(null);
  const { openCapture } = useCapture();

  const trackTitle = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, t.title || 'Senza titolo'])), [tracks]);
  const usedTags = useMemo(() => [...new Set((ideas || []).flatMap((i) => i.tags || []))].sort(), [ideas]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return (ideas || []).filter((i) => {
      if (tag && !i.tags?.includes(tag)) return false;
      if (type !== 'all' && i.type !== type) return false;
      if (!q) return true;
      const hay = normalize([i.text, ...(i.tags || []), trackTitle[i.trackId]].join(' '));
      return hay.includes(q);
    });
  }, [ideas, query, tag, type, trackTitle]);

  return (
    <div className="page">
      <header className="page-head">
        <img className="head-logo" src={`${import.meta.env.BASE_URL}logo-bianco.png`} alt="Amit" />
        <h1>Taccuino</h1>
      </header>

      <div className="search">
        <Icon name="search" size={20} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca nelle idee…" />
      </div>

      <div className="chips scroll-x">
        {[
          ['all', 'Tutte'],
          ['text', 'Testo'],
          ['voice', 'Vocali'],
        ].map(([id, label]) => (
          <button key={id} className={`chip${type === id ? ' on' : ''}`} onClick={() => setType(id)}>
            {label}
          </button>
        ))}
        {usedTags.map((t) => (
          <button key={t} className={`chip${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
            #{t}
          </button>
        ))}
      </div>

      {ideas && ideas.length === 0 && (
        <div className="empty">
          <p>Nessuna idea ancora.</p>
          <p className="muted">Tocca il pulsante + in basso per salvare la prima barra o una nota vocale.</p>
          <div className="row center">
            <button className="btn primary" onClick={() => openCapture({ mode: 'text' })}>
              <Icon name="pen" size={20} /> Scrivi
            </button>
            <button className="btn primary" onClick={() => openCapture({ mode: 'voice' })}>
              <Icon name="mic" size={20} /> Registra
            </button>
          </div>
        </div>
      )}
      {ideas && ideas.length > 0 && filtered.length === 0 && <p className="empty muted">Nessun risultato.</p>}

      <div className="list">
        {filtered.map((i) => (
          <IdeaCard key={i.id} idea={i} trackTitle={trackTitle[i.trackId]} onClick={() => setEditing(i)} />
        ))}
      </div>

      {editing && <IdeaSheet idea={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
