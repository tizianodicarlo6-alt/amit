import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useDbQuery } from '../../db/useDbQuery.js';
import { db, deleteFinal } from '../../db/db.js';
import { formatDate, formatTime } from '../../constants.js';
import { canShare, download, slug } from '../studio/ExportRow.jsx';
import TracksTabs from './TracksTabs.jsx';

const ext = (mime = '') => (/wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /aiff/.test(mime) ? 'aif' : /flac/.test(mime) ? 'flac' : /ogg/.test(mime) ? 'ogg' : 'wav');

/** Il file audio pronto da mettere nei File dell'iPhone (o da mandare). */
async function fileOf(audioId, name) {
  const rec = await db.audio.get(audioId);
  if (!rec?.blob) throw new Error('File non trovato');
  const mime = rec.mime || rec.blob.type || 'audio/wav';
  return new File([rec.blob], `${slug(name)}.${ext(mime)}`, { type: mime });
}

// Una riga: ▶ ascolta · Salva su File · elimina
function AudioRow({ id, audioId, title, sub, playing, onPlay, onDelete, link }) {
  const [ready, setReady] = useState(null); // File pronto quando il primo tocco non è bastato
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      const f = ready || (setBusy(true), await fileOf(audioId, title));
      setBusy(false);
      if (canShare([f])) {
        try {
          await navigator.share({ files: [f], title: f.name });
          setReady(null);
        } catch (e) {
          if (e?.name === 'NotAllowedError') setReady(f); // iPhone: serve un secondo tocco
          else if (e?.name !== 'AbortError') throw e;
        }
      } else download(f);
    } catch (e) {
      setBusy(false);
      setErr(e?.message || 'Non riesco a preparare il file.');
    }
  };
  return (
    <div className={`card fin-row${playing ? ' on' : ''}`}>
      <button className="fin-play" onClick={() => onPlay(id, audioId)} aria-label={playing ? 'Ferma' : 'Ascolta'}>
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <div className="grow min0">
        <div className="fin-title ellipsis">{link ? <Link to={link}>{title}</Link> : title}</div>
        <div className="muted small ellipsis">{sub}</div>
        {err && <div className="error small">{err}</div>}
      </div>
      <button className={`btn sm${ready ? ' primary' : ''}`} onClick={save} disabled={busy}>
        {busy ? <span className="spinner" /> : <Icon name="share" size={18} />} {ready ? 'Tocca ancora' : 'File'}
      </button>
      {onDelete && (
        <button className="icon-btn sm" onClick={onDelete} aria-label={`Elimina ${title}`}>
          <Icon name="trash" size={18} />
        </button>
      )}
    </div>
  );
}

// 🎧 Finite: le tracce mixate dallo studio e i beat, ordinati, da ascoltare e mettere nei File
export default function FinitePage() {
  const [tab, setTab] = useState('tracce');
  const finals = useDbQuery(() => db.finals.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const tracks = useDbQuery(() => db.tracks.toArray(), [], []) || [];
  const trackOf = Object.fromEntries(tracks.map((t) => [t.id, t]));
  const [now, setNow] = useState(null); // id in riproduzione
  const [pos, setPos] = useState(0);
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const play = async (id, audioId) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.setAttribute('playsinline', '');
      audioRef.current.ontimeupdate = () => setPos(audioRef.current.currentTime);
      audioRef.current.onended = () => setNow(null);
    }
    const a = audioRef.current;
    if (now === id) {
      a.pause();
      setNow(null);
      return;
    }
    a.pause();
    a.play().catch(() => {}); // sblocco dentro il tocco (iPhone)
    const rec = await db.audio.get(audioId);
    if (!rec?.blob) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(rec.blob);
    a.src = urlRef.current;
    setPos(0);
    setNow(id);
    a.play().catch(() => setNow(null));
  };

  const removeFinal = async (f) => {
    if (!confirm(`Eliminare "${f.title}"? Il file si cancella dall'app (le voci in studio restano).`)) return;
    if (now === f.id) audioRef.current?.pause();
    await deleteFinal(f.id);
  };

  const seek = (e) => {
    const a = audioRef.current;
    if (!a?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Tracce</h1>
      </header>
      <TracksTabs />
      <div className="segmented fin-tabs" role="tablist">
        <button className={tab === 'tracce' ? 'on' : ''} onClick={() => setTab('tracce')}>
          Tracce finite{finals.length ? ` (${finals.length})` : ''}
        </button>
        <button className={tab === 'beat' ? 'on' : ''} onClick={() => setTab('beat')}>
          Beat{beats.length ? ` (${beats.length})` : ''}
        </button>
      </div>

      {now && audioRef.current?.duration > 0 && (
        <div className="fin-progress" onClick={seek} role="slider" aria-label="Posizione" aria-valuenow={Math.round(pos)}>
          <div style={{ width: `${(pos / audioRef.current.duration) * 100}%` }} />
          <span className="mono small">
            {formatTime(pos)} / {formatTime(audioRef.current.duration)}
          </span>
        </div>
      )}

      {tab === 'tracce' &&
        (finals.length === 0 ? (
          <div className="empty">
            <p>Nessuna traccia finita.</p>
            <p className="muted">
              Quando hai registrato e mixato, nello Studio tocca <b>Mix & Salva</b> → <b>Salva tra le Finite</b>: il pezzo intero (beat, voce, doppie, adlib) arriva qui.
            </p>
          </div>
        ) : (
          <div className="list">
            {finals.map((f) => (
              <AudioRow
                key={f.id}
                id={f.id}
                audioId={f.audioId}
                title={f.title}
                sub={[formatDate(f.createdAt), f.duration ? formatTime(f.duration) : null, f.size ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : null].filter(Boolean).join(' · ')}
                link={f.trackId && trackOf[f.trackId] ? `/traccia/${f.trackId}` : null}
                playing={now === f.id}
                onPlay={play}
                onDelete={() => removeFinal(f)}
              />
            ))}
          </div>
        ))}

      {tab === 'beat' &&
        (beats.length === 0 ? (
          <div className="empty">
            <p>Nessun beat.</p>
            <p className="muted">Caricali nella sezione Beat.</p>
          </div>
        ) : (
          <div className="list">
            {beats.map((b) => (
              <AudioRow
                key={b.id}
                id={b.id}
                audioId={b.audioId}
                title={b.title || 'Beat'}
                sub={[b.producer, b.bpm && `${b.bpm} BPM`, b.key, b.duration ? formatTime(b.duration) : null].filter(Boolean).join(' · ')}
                playing={now === b.id}
                onPlay={play}
              />
            ))}
          </div>
        ))}
      <p className="muted small fin-hint">
        <b>File</b> apre la condivisione dell'iPhone: scegli <b>Salva su File</b> per metterlo nei tuoi file, oppure mandalo su WhatsApp, AirDrop…
      </p>
    </div>
  );
}
