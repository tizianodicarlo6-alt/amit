import { useEffect, useMemo, useRef, useState } from 'react';
import { useDbQuery } from '../../db/useDbQuery.js';
import { db } from '../../db/db.js';
import { importBeatFiles } from '../../lib/beatImport.js';
import { formatBytes } from '../../lib/audio.js';
import { formatTime, keyShort } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import WaveformPlayer from '../../components/WaveformPlayer.jsx';
import BeatSheet from './BeatSheet.jsx';

const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function BeatMeta({ beat }) {
  const bits = [beat.producer && `prod. ${beat.producer}`, beat.bpm && `${beat.bpm} BPM`, beat.key && keyShort(beat.key), beat.duration && formatTime(beat.duration)].filter(Boolean);
  return <div className="muted small">{bits.join(' · ') || 'Tocca per aggiungere i dettagli'}</div>;
}

export default function BeatPage() {
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], undefined);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState(null);
  const [editing, setEditing] = useState(null);
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState([]);
  const [usage, setUsage] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage)).catch(() => {});
  }, [beats?.length]);

  const usedTags = useMemo(() => [...new Set((beats || []).flatMap((b) => b.tags || []))].sort(), [beats]);
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return (beats || []).filter((b) => {
      if (tag && !b.tags?.includes(tag)) return false;
      if (!q) return true;
      return normalize([b.title, b.producer, b.key, b.bpm, ...(b.tags || [])].join(' ')).includes(q);
    });
  }, [beats, query, tag]);

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const { failed } = await importBeatFiles(files, setProgress);
    setErrors(failed);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Beat</h1>
        <button className="btn primary" onClick={() => fileRef.current.click()} disabled={!!progress}>
          <Icon name="plus" size={20} /> Importa
        </button>
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.aif,.aiff,.flac,.ogg" multiple hidden onChange={onFiles} />
      </header>

      {progress && (
        <div className="notice row">
          <span className="spinner" /> {progress}
        </div>
      )}
      {errors.length > 0 && (
        <div className="notice error-box" onClick={() => setErrors([])}>
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
          <div className="muted small">Tocca per chiudere</div>
        </div>
      )}

      {beats && beats.length > 0 && (
        <>
          <div className="search">
            <Icon name="search" size={20} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per titolo, produttore, BPM…" />
          </div>
          {usedTags.length > 0 && (
            <div className="chips scroll-x">
              <button className={`chip${!tag ? ' on' : ''}`} onClick={() => setTag(null)}>
                Tutti
              </button>
              {usedTags.map((t) => (
                <button key={t} className={`chip${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                  #{t}
                </button>
              ))}
            </div>
          )}
          <p className="muted small">
            {beats.length} beat
            {usage ? ` · ${formatBytes(usage)} usati sul telefono` : ''}
          </p>
        </>
      )}

      {beats && beats.length === 0 && !progress && (
        <div className="empty">
          <Icon name="beat" size={40} />
          <p>Nessun beat ancora.</p>
          <p className="muted">Importa i tuoi beat (mp3, wav, m4a) dall'app File, da iCloud, da Drive o dai download di WhatsApp.</p>
          <button className="btn primary big" onClick={() => fileRef.current.click()}>
            <Icon name="plus" /> Importa beat
          </button>
        </div>
      )}

      <div className="list">
        {filtered.map((b) => (
          <article key={b.id} className="card beat-card" onClick={() => setEditing(b)} role="button" tabIndex={0}>
            <div className="beat-head">
              <div className="grow min0">
                <div className="track-title">{b.title}</div>
                <BeatMeta beat={b} />
              </div>
              <Icon name="pen" size={18} className="muted" />
            </div>
            <WaveformPlayer audioId={b.audioId} peaks={b.peaks} duration={b.duration} />
            {b.tags?.length > 0 && (
              <div className="chips small">
                {b.tags.map((t) => (
                  <span key={t} className="chip on static">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {editing && <BeatSheet beatId={editing.id} onClose={() => setEditing(null)} />}
    </div>
  );
}
