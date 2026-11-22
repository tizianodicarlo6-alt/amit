import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import TagPicker from '../../components/TagPicker.jsx';
import TrackPicker from '../../components/TrackPicker.jsx';
import BeatLoop from '../../components/BeatLoop.jsx';
import RhymeSheet from '../../components/RhymeSheet.jsx';
import { loadRank, wordAt } from '../../lib/rimario.js';
import { quartine } from '../../lib/fuoco.js';

/** Il fuoco: una barra verticale con 4 tacche; dopo ogni quartina il fuoco sale fin dove è arrivata (1-4). */
function FireBar({ level, count }) {
  const H = 210;
  // a ogni quartina nuova il fuoco riparte dal basso e sale
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const t = setTimeout(() => setShown(level), 80);
    return () => clearTimeout(t);
  }, [count, level]);
  const y = (shown / 4) * H;
  return (
    <div className="fire-bar" aria-label={count ? `Ultima quartina: fuoco ${level} su 4` : 'Il fuoco sale dopo ogni quartina'} role="img">
      <div className="fb-track">
        <div className="fb-fill" style={{ height: y }} />
      </div>
      {[1, 2, 3, 4].map((k) => (
        <span key={k} className={`fb-tick${k <= shown ? ' on' : ''}`} style={{ bottom: (k / 4) * H - 1 }} />
      ))}
      <svg className={`fb-flame l${shown}${shown === 4 ? ' top' : ''}`} style={{ bottom: y }} viewBox="0 0 24 30" aria-hidden>
        <defs>
          <linearGradient id="fbg" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#d7261e" />
            <stop offset=".55" stopColor="#ff7a1a" />
            <stop offset="1" stopColor="#ffd24a" />
          </linearGradient>
        </defs>
        <path d="M12 1c1.5 5.5 7 8.5 7 15.5A7 7 0 0 1 5 16.5c0-3.4 1.8-5.4 3.4-7.2.3 2.3 1.4 3.6 2.6 4C11 9 10.8 5 12 1z" fill="url(#fbg)" />
        <path d="M12 15c.8 2.5 3.2 3.6 3.2 6.6a3.2 3.2 0 0 1-6.4 0c0-1.8 1-2.8 1.8-3.6.2 1 .8 1.6 1.4 1.7-.2-1.7-.4-3 0-4.7z" fill="#fff3c4" />
      </svg>
      {count > 0 && <span className="fb-q">Q{count}</span>}
    </div>
  );
}
import ShareSheet from '../messaggi/ShareSheet.jsx';
import { useProfile } from '../../lib/profile.js';

import { useDbQuery } from '../../db/useDbQuery.js';
import { addIdea, addTrack, db, deleteIdea, updateIdea } from '../../db/db.js';

const longDate = (ts) =>
  new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) +
  ' alle ' +
  new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

// Nota a tutto schermo, come l'app Note: scrivi e basta, si salva da sola.
// In alto (se vuoi) il beat: scegli col dito il pezzo da sentire in loop mentre scrivi.
export default function NoteEditor({ idea = null, trackId: initialTrack = null, onClose, start = null }) {
  const [id, setId] = useState(idea?.id || null);
  const [text, setText] = useState(idea?.text || start?.text || '');
  const [title, setTitle] = useState(idea?.title || start?.title || '');
  const titleRef = useRef(null);
  const [tags, setTags] = useState(idea?.tags || []);
  const [trackId, setTrackId] = useState(idea?.trackId ?? initialTrack);
  const [beatId, setBeatId] = useState(idea?.beatId || start?.beatId || null);
  const [loop, setLoop] = useState(idea?.loop || start?.loop || null);
  // sessione flash: conto alla rovescia
  const [endsAt] = useState(() => (start?.timer ? Date.now() + start.timer * 60000 : null));
  const [left, setLeft] = useState(start?.timer ? start.timer * 60 : null);
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(t);
        try {
          navigator.vibrate?.(300);
        } catch {
          /* ignorato */
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  const [sheet, setSheet] = useState(null); // 'info' | 'beat'
  const [rimario, setRimario] = useState(null);
  const [sharing, setSharing] = useState(false);
  const profile = useProfile();
  const [rank, setRank] = useState(null);
  useEffect(() => {
    if (profile) loadRank().then(setRank).catch(() => {});
  }, [profile]);
  // quartine finite: il fuoco mostra l'ultima
  const quarts = useMemo(() => (profile ? quartine(text, { rank }) : []), [text, rank, profile]);
  const lastQ = quarts[quarts.length - 1];

  const caret = useRef(0);
  const [created] = useState(idea?.createdAt || Date.now());
  const navigate = useNavigate();
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const beat = beats.find((b) => b.id === beatId) || null;
  const taRef = useRef(null);
  const timer = useRef(0);
  const saving = useRef(Promise.resolve());
  const latest = useRef({});
  latest.current = { text, title, tags, trackId, beatId, loop };
  const idRef = useRef(id);
  idRef.current = id;

  // salvataggio automatico (poco dopo l'ultima modifica)
  const saveNow = () => {
    clearTimeout(timer.current);
    saving.current = saving.current.then(async () => {
      const v = latest.current;
      const data = { text: v.text.trim() ? v.text : '', title: v.title.trim(), tags: v.tags, trackId: v.trackId, beatId: v.beatId, loop: v.loop };
      if (!idRef.current) {
        if (!v.text.trim() && !v.title.trim()) return;
        const nid = await addIdea({ type: 'text', text: data.text, tags: data.tags, trackId: data.trackId });
        idRef.current = nid;
        setId(nid);
        await updateIdea(nid, { title: data.title, beatId: data.beatId, loop: data.loop });
      } else await updateIdea(idRef.current, data);
    });
    return saving.current;
  };
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, 500);
  }, [text, title, tags, trackId, beatId, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.classList.add('no-scroll');
    if (!idea && start?.text) setTimeout(() => taRef.current?.focus(), 50);
    return () => document.body.classList.remove('no-scroll');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = async () => {
    await saveNow();
    // nota rimasta vuota: non la tengo (come l'app Note)
    if (idRef.current && !latest.current.text.trim() && !latest.current.title.trim()) await deleteIdea(idRef.current);
    onClose();
  };

  const remove = async () => {
    if (!confirm('Eliminare questa nota?')) return;
    clearTimeout(timer.current);
    await saving.current;
    if (idRef.current) await deleteIdea(idRef.current);
    onClose();
  };

  const toTrack = async () => {
    const tTitle = title.trim() || text.trim().split('\n')[0].slice(0, 40) || 'Nuova traccia';
    const tid = await addTrack({ title: tTitle });
    setTrackId(tid);
    latest.current.trackId = tid;
    await saveNow();
    onClose();
    navigate(`/traccia/${tid}`);
  };

  return createPortal(
    <div className="note-page" role="dialog" aria-label="Nota">
      <header className="note-head">
        <button className="note-back" onClick={close}>
          <Icon name="back" size={22} /> Note
        </button>
        {left != null && <span className={`flash-timer${left === 0 ? ' done' : ''}`}>{left === 0 ? 'Tempo! 🔥' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span>}
        <span className="grow" />
        <button className="btn sm ghost" onPointerDown={(e) => e.preventDefault()} onClick={() => setRimario(wordAt(text, caret.current))}>
          Rimario
        </button>
        <button className={`icon-btn${beatId ? ' on' : ''}`} onClick={() => setSheet('beat')} aria-label="Scrivi su un beat">
          <Icon name="beat" size={22} />
        </button>
        <button className="icon-btn" onClick={() => setSheet('info')} aria-label="Tag, traccia e altro">
          <Icon name="altro" size={22} />
        </button>
        <button className="note-done" onClick={close}>
          Fine
        </button>
      </header>

      {profile && text.trim() && <FireBar level={lastQ?.level || 0} count={quarts.length} />}
      <div className="note-body">
        {beat && <BeatLoop beat={beat} region={loop} onRegion={setLoop} caption={beat.title} />}
        <div className="note-date">{longDate(created)}</div>
        <input
          ref={titleRef}
          autoFocus={!idea && !start?.text}
          className="note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), taRef.current?.focus())}
          placeholder="Titolo"
          autoCapitalize="sentences"
          enterKeyHint="next"
        />
        {(tags.length > 0 || trackId) && (
          <button className="note-meta" onClick={() => setSheet('info')}>
            {tags.map((t) => `#${t}`).join(' ')}
            {trackId ? `${tags.length ? ' · ' : ''}🔗 collegata a una traccia` : ''}
          </button>
        )}
        <textarea ref={taRef} className="note-text" value={text} onChange={(e) => setText(e.target.value)} onSelect={(e) => (caret.current = e.target.selectionStart)} placeholder="Scrivi la barra, il concetto, l'immagine…" autoCapitalize="sentences" />
      </div>

      {sharing && <ShareSheet kind="idea" item={{ type: 'text', text, tags }} onClose={() => setSharing(false)} />}
      {rimario && <RhymeSheet word={rimario.word} prev={rimario.prev} onClose={() => setRimario(null)} />}
      {sheet === 'beat' && (
        <Sheet open onClose={() => setSheet(null)} title="Scrivi su un beat">
          <div className="stack">
            <p className="muted small">Il beat compare in alto: ▶ per sentirlo, trascina il dito sul beat per scegliere il pezzo da sentire in loop.</p>
            {beats.length === 0 && <p className="muted">Non hai ancora beat: caricali nella sezione Beat.</p>}
            <div className="list">
              {beats.map((b) => (
                <button key={b.id} className={`beat-pick${b.id === beatId ? ' on' : ''}`} onClick={() => (setBeatId(b.id), setLoop(null), setSheet(null))}>
                  <span className="ellipsis grow">{b.title || 'Beat'}</span>
                  <span className="muted small">{[b.bpm && `${b.bpm} BPM`, b.key].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
            {beatId && (
              <button className="btn ghost" onClick={() => (setBeatId(null), setLoop(null), setSheet(null))}>
                Togli il beat
              </button>
            )}
          </div>
        </Sheet>
      )}

      {sheet === 'info' && (
        <Sheet open onClose={() => setSheet(null)} title="Nota">
          <div className="stack">
            <div className="field">
              <span className="field-label">Tag</span>
              <TagPicker value={tags} onChange={setTags} />
            </div>
            <TrackPicker value={trackId} onChange={setTrackId} />
            {!trackId && text.trim() && (
              <button className="btn ghost" onClick={toTrack}>
                <Icon name="tracce" size={20} /> Crea una traccia da questa nota
              </button>
            )}
            {profile && text.trim() && (
              <button className="btn" onClick={() => (saveNow(), setSheet(null), setSharing(true))}>
                <Icon name="send" size={20} /> Manda a un socio
              </button>
            )}
            <button className="btn danger" onClick={remove}>
              <Icon name="trash" size={20} /> Elimina nota
            </button>
          </div>
        </Sheet>
      )}
    </div>,
    document.body
  );
}
