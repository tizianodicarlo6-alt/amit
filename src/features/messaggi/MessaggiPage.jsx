import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import AudioPlayer from '../../components/AudioPlayer.jsx';
import { useDbQuery } from '../../db/useDbQuery.js';
import { db } from '../../db/db.js';
import { useProfile } from '../../lib/profile.js';
import { vibeLabel } from '../../lib/spunti.js';
import { cloudLogout, deleteMessage, downloadFile, loadChat, login, markRead, memberName, otherMembers, sendMessage, startCloud, useCloud, useInbox } from '../../lib/cloud.js';
import { saveBeat, saveIdea, saveTrack } from './transfer.js';
import ShareSheet from './ShareSheet.jsx';

/** Entra nei messaggi con la password (l'account è già quello del codice socio). */
export function CloudLogin({ profile }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await login(profile.id, pw);
    } catch (e) {
      setErr(navigator.onLine === false ? 'Sei offline: per i messaggi serve internet.' : e.message || 'Non riesco ad entrare.');
    }
    setBusy(false);
  };
  return (
    <div className="card stack">
      <div className="reco-title">Entra nei messaggi</div>
      <p className="muted small">
        Sei <b>{profile.name}</b>. Scrivi la tua password dei messaggi: la chiede solo la prima volta.
      </p>
      <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" onKeyDown={(e) => e.key === 'Enter' && go()} autoComplete="current-password" />
      <button className="btn primary" onClick={go} disabled={!pw || busy}>
        {busy ? <span className="spinner" /> : null} Entra
      </button>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

const time = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
};

/** Audio allegato a un messaggio (si scarica quando lo apri). */
function RemoteAudio({ path, duration }) {
  const [blob, setBlob] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    downloadFile(path)
      .then((b) => alive && setBlob(b))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [path]);
  if (err) return <p className="muted small">Audio non disponibile.</p>;
  if (!blob)
    return (
      <p className="muted small">
        <span className="spinner" /> Scarico l'audio…
      </p>
    );
  return <AudioPlayer blob={blob} duration={duration} />;
}

function Bubble({ m, mine, onDelete }) {
  const navigate = useNavigate();
  const [state, setState] = useState(''); // '' | 'busy' | 'ok' | errore
  const p = m.payload || {};
  const doSave = async (fn, after) => {
    setState('busy');
    try {
      const r = await fn(m);
      setState('ok');
      after?.(r);
    } catch (e) {
      setState(e?.message || 'Non sono riuscito a salvarlo.');
    }
  };
  let content = null;
  if (m.kind === 'idea')
    content = (
      <>
        <div className="msg-kind">💡 Idea{p.type === 'voice' ? ' vocale' : ''}</div>
        {p.text && <div className="msg-text">{p.text}</div>}
        {m.file_path && <RemoteAudio path={m.file_path} duration={p.duration} />}
        {!mine && (
          <button className="btn sm" onClick={() => doSave(saveIdea)} disabled={state === 'busy' || state === 'ok'}>
            {state === 'ok' ? '✓ Nelle tue note' : 'Salva nelle note'}
          </button>
        )}
      </>
    );
  else if (m.kind === 'track') {
    const bars = (p.sections || []).reduce((n, s) => n + s.text.split('\n').filter((l) => l.trim()).length, 0);
    const first = (p.sections || []).map((s) => s.text).join('\n').split('\n').filter((l) => l.trim()).slice(0, 3);
    content = (
      <>
        <div className="msg-kind">🎵 Traccia</div>
        <div className="msg-title">{p.title}</div>
        <div className="muted small">
          {[vibeLabel(p.vibe || {}), `${bars} barre`, p.beat && `beat: ${p.beat.title}${m.file_path ? '' : ' (non incluso)'}`].filter(Boolean).join(' · ')}
        </div>
        {first.length > 0 && <div className="msg-lyrics">{first.join('\n')}…</div>}
        {!mine && (
          <button className="btn sm" onClick={() => doSave(saveTrack, (id) => navigate(`/traccia/${id}`))} disabled={state === 'busy' || state === 'ok'}>
            {state === 'busy' ? <span className="spinner" /> : null} {state === 'ok' ? '✓ Nelle tue tracce' : 'Apri nelle mie tracce'}
          </button>
        )}
      </>
    );
  } else if (m.kind === 'beat')
    content = (
      <>
        <div className="msg-kind">🎧 Beat</div>
        <div className="msg-title">{p.title}</div>
        <div className="muted small">{[p.producer, p.bpm && `${p.bpm} BPM`, p.key].filter(Boolean).join(' · ')}</div>
        {m.file_path && <RemoteAudio path={m.file_path} />}
        {!mine && m.file_path && (
          <button className="btn sm" onClick={() => doSave(saveBeat)} disabled={state === 'busy' || state === 'ok'}>
            {state === 'busy' ? <span className="spinner" /> : null} {state === 'ok' ? '✓ Nella tua libreria' : 'Metti nella libreria'}
          </button>
        )}
      </>
    );
  return (
    <div className={`msg${mine ? ' mine' : ''}`}>
      <div className="msg-bubble">
        {content}
        {m.body && <div className="msg-text">{m.body}</div>}
        {state && state !== 'busy' && state !== 'ok' && <div className="error small">{state}</div>}
      </div>
      <div className="msg-meta">
        {time(m.created_at)}
        {mine && (m.read_at ? ' · letto' : '')}
        {mine && (
          <button className="msg-del" onClick={() => confirm('Eliminare il messaggio per tutti e due?') && onDelete(m)}>
            elimina
          </button>
        )}
      </div>
    </div>
  );
}

function Chat({ me, other }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attach, setAttach] = useState(null); // null | 'menu' | { kind, item }
  const endRef = useRef(null);

  const reload = useCallback(async () => {
    try {
      setList(await loadChat(other));
      setErr('');
      markRead(other);
    } catch {
      setErr(navigator.onLine === false ? 'Sei offline: i messaggi arrivano quando torna internet.' : 'Non riesco a caricare i messaggi.');
    }
  }, [other]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 20000); // di riserva, se il tempo reale non arriva
    const onVis = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload]);
  useInbox(reload);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [list?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendMessage(other, { kind: 'text', body });
      setText('');
      await reload();
    } catch {
      alert('Messaggio non inviato: controlla la connessione.');
    }
    setSending(false);
  };

  return (
    <div className="chat">
      <div className="chat-list">
        {list === null && !err && (
          <p className="muted center">
            <span className="spinner" />
          </p>
        )}
        {err && <div className="notice">{err}</div>}
        {list?.length === 0 && <p className="muted center small">Ancora nessun messaggio con {memberName(other)}. Scrivigli qualcosa o mandagli un'idea con +.</p>}
        {list?.map((m) => (
          <Bubble key={m.id} m={m} mine={m.from_user === me} onDelete={async (x) => (await deleteMessage(x.id), reload())} />
        ))}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <button className="icon-btn" onClick={() => setAttach('menu')} aria-label="Manda idea, traccia o beat">
          <Icon name="plus" />
        </button>
        <textarea className="input" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Scrivi a ${memberName(other)}…`} />
        <button className="icon-btn send" onClick={send} disabled={!text.trim() || sending} aria-label="Invia">
          {sending ? <span className="spinner" /> : <Icon name="send" />}
        </button>
      </div>
      {attach === 'menu' && <AttachPicker onClose={() => setAttach(null)} onPick={(a) => setAttach(a)} />}
      {attach && attach !== 'menu' && <ShareSheet kind={attach.kind} item={attach.item} to={other} onClose={() => setAttach(null)} onSent={reload} />}
    </div>
  );
}

/** Scegli cosa mandare: un'idea, una traccia, un beat. */
function AttachPicker({ onClose, onPick }) {
  const [tab, setTab] = useState('idea');
  const ideas = useDbQuery(() => db.ideas.orderBy('createdAt').reverse().limit(50).toArray(), [], []) || [];
  const tracks = useDbQuery(() => db.tracks.orderBy('updatedAt').reverse().toArray(), [], []) || [];
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  return (
    <Sheet open onClose={onClose} title="Cosa vuoi mandare?">
      <div className="tabs">
        {[
          ['idea', 'Idee'],
          ['track', 'Tracce'],
          ['beat', 'Beat'],
        ].map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="list pick-list">
        {tab === 'idea' &&
          ideas.map((i) => (
            <button key={i.id} className="beat-pick" onClick={() => onPick({ kind: 'idea', item: i })}>
              <span className="ellipsis grow">{i.type === 'voice' ? `🎤 ${i.text || 'Nota vocale'}` : (i.text || '').split('\n')[0]}</span>
            </button>
          ))}
        {tab === 'track' &&
          tracks.map((t) => (
            <button key={t.id} className="beat-pick" onClick={() => onPick({ kind: 'track', item: t })}>
              <span className="ellipsis grow">{t.title || 'Senza titolo'}</span>
            </button>
          ))}
        {tab === 'beat' &&
          beats.map((b) => (
            <button key={b.id} className="beat-pick" onClick={() => onPick({ kind: 'beat', item: b })}>
              <span className="ellipsis grow">{b.title}</span>
              <span className="muted small">{[b.bpm && `${b.bpm} BPM`, b.key].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
      </div>
    </Sheet>
  );
}

export default function MessaggiPage() {
  const profile = useProfile();
  const cloud = useCloud();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    if (profile) startCloud();
  }, [profile]);

  if (!profile)
    return (
      <div className="page empty">
        <p>I messaggi sono per i soci di Amit Studio.</p>
      </div>
    );

  const others = otherMembers(profile.id);
  const other = params.get('con') || others[0]?.id;

  return (
    <div className="page messaggi">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate('/home')} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <div className="grow min0">
          <h1 className="ellipsis">{cloud.user ? memberName(other) : 'Messaggi'}</h1>
          {cloud.user && <div className="muted small">Messaggi tra soci · solo voi due li vedete</div>}
        </div>
        {cloud.user && (
          <button className="btn sm ghost" onClick={() => confirm('Uscire dai messaggi su questo telefono?') && cloudLogout()}>
            Esci
          </button>
        )}
      </header>
      {!cloud.ready && (
        <p className="muted center">
          <span className="spinner" />
        </p>
      )}
      {cloud.ready && !cloud.user && <CloudLogin profile={profile} />}
      {cloud.user && other && <Chat key={other} me={cloud.user} other={other} />}
    </div>
  );
}
