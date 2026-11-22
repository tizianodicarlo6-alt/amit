import { CLOUD } from '../../config.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { VibePicker } from '../../components/Vibe.jsx';
import { addIdea, addTrack, updateTrack } from '../../db/db.js';
import { callFunction, startCloud, useCloud } from '../../lib/cloud.js';
import { useProfile } from '../../lib/profile.js';
import { vibeLabel } from '../../lib/spunti.js';
import { CloudLogin } from '../messaggi/MessaggiPage.jsx';

const KEY = 'amit.parliamone';
const load = () => {
  try {
    const c = JSON.parse(localStorage.getItem(KEY)) || null;
    // chiacchierate della versione di prova vecchia: si ricomincia
    if (c?.api?.some((m) => typeof m.content !== 'string')) return null;
    return c;
  } catch {
    return null;
  }
};
const store = (v) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* pieno o bloccato: la chiacchierata resta solo in memoria */
  }
};

/** La mappa del pezzo come testo (per il taccuino e le note della traccia). */
export const mapText = (m) =>
  [
    `🧭 ${m.tema}`,
    m.concetti?.length && `Concetti: ${m.concetti.join(' · ')}`,
    m.immagini?.length && `Immagini: ${m.immagini.join(' · ')}`,
    m.parole?.length && `Parole: ${m.parole.join(', ')}`,
    m.ritornello && `Ritornello: ${m.ritornello}`,
    m.titoli?.length && `Titoli: ${m.titoli.join(' / ')}`,
  ]
    .filter(Boolean)
    .join('\n');

/** Scheda "la mappa del pezzo". */
export function MapCard({ map }) {
  return (
    <div className="map-card">
      <div className="map-tema">{map.tema}</div>
      {[
        ['Concetti', map.concetti],
        ['Immagini', map.immagini],
        ['Parole', map.parole],
      ].map(
        ([l, v]) =>
          v?.length > 0 && (
            <div key={l} className="map-row">
              <span className="sp-lab">{l}</span>
              <span>{v.join(' · ')}</span>
            </div>
          )
      )}
      {map.ritornello && (
        <div className="map-row">
          <span className="sp-lab">Ritornello</span>
          <span>{map.ritornello}</span>
        </div>
      )}
      {map.titoli?.length > 0 && (
        <div className="map-row">
          <span className="sp-lab">Titoli</span>
          <span>{map.titoli.join(' / ')}</span>
        </div>
      )}
    </div>
  );
}

// 💬 Parliamone: una chiacchierata per capire cosa vuoi dire, poi "Tira le fila"
export default function ParliamonePage() {
  const profile = useProfile();
  const cloud = useCloud();
  const navigate = useNavigate();
  const [conv, setConv] = useState(load); // { context, vibe, api: [...], view: [{ who, text }], map }
  const [vibe, setVibe] = useState(() => profile?.prefs?.vibe || {});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (profile) startCloud();
  }, [profile]);
  useEffect(() => {
    store(conv);
  }, [conv]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' }); // (nei browser nuovi restituisce una Promise: niente return)
  }, [conv?.view?.length, busy]);

  if (!profile) return <div className="page empty">Parliamone è per i soci di Amit Studio.</div>;

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    // il "contesto" si decide all'inizio e resta uguale per tutta la chiacchierata
    const c = conv || { context: { name: profile.name, style: profile.style || '', vibe: vibeLabel(vibe) }, vibe, api: [], view: [] };
    const api = [...c.api, { role: 'user', content: t }];
    const next = { ...c, api, view: [...c.view, { who: 'me', text: t }] };
    setConv(next);
    setText('');
    setBusy('chat');
    setErr('');
    try {
      const r = await callFunction(CLOUD.assistant, { mode: 'chat', context: next.context, messages: api });
      setConv({ ...next, api: [...api, { role: 'assistant', content: r.text }], view: [...next.view, { who: 'ai', text: r.text }] });
    } catch (e) {
      setErr(navigator.onLine === false ? 'Sei offline: per parlare con l\'assistente serve internet.' : e.message);
      setConv(conv); // la domanda non è partita: torno a prima
      setText(t);
    }
    setBusy('');
  };

  const tiraLeFila = async () => {
    setBusy('map');
    setErr('');
    try {
      // la chiacchierata in un pezzo solo (il modello gratuito la gestisce meglio); un secondo tentativo se sbaglia
      const transcript = conv.api.map((m) => `${m.role === 'user' ? conv.context.name || 'Io' : 'Assistente'}: ${m.content}`).join('\n');
      const ask = () => callFunction(CLOUD.assistant, { mode: 'map', context: conv.context, messages: [{ role: 'user', content: transcript }] });
      let r;
      try {
        r = await ask();
      } catch {
        r = await ask();
      }
      const map = r.data || {};
      setConv({ ...conv, map, view: [...conv.view, { who: 'map', map }] });
    } catch (e) {
      setErr(e.message || 'Non sono riuscito a tirare le fila.');
    }
    setBusy('');
  };

  const startTrackFromMap = async () => {
    const m = conv.map;
    const id = await addTrack({ title: m.titoli?.[0] || 'Nuova traccia' });
    await updateTrack(id, { mappa: m, notes: mapText(m), ...(conv.vibe && (conv.vibe.mood || conv.vibe.genre || conv.vibe.atmo) ? { vibe: conv.vibe } : {}) });
    navigate(`/traccia/${id}`);
  };

  const userTurns = conv?.view.filter((v) => v.who === 'me').length || 0;

  return (
    <div className="page parliamone">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <div className="grow min0">
          <h1 className="ellipsis">Parliamone</h1>
          {conv?.context?.vibe && <div className="muted small ellipsis">{conv.context.vibe}</div>}
        </div>
        {conv && (
          <button className="btn sm ghost" onClick={() => confirm('Iniziare una nuova chiacchierata? Questa si cancella (salva prima la mappa, se ti serve).') && setConv(null)}>
            Nuova
          </button>
        )}
      </header>

      {cloud.ready && !cloud.user && <CloudLogin profile={profile} />}

      {cloud.user && !conv && (
        <div className="stack">
          <div className="card stack">
            <div className="reco-title">Di cosa vuoi parlare?</div>
            <p className="muted small">
              Raccontami quello che hai in testa, anche confuso: una cosa che ti è successa, una sensazione, una persona. Ti faccio qualche domanda, poi con <b>Tira le fila</b> ti
              preparo la mappa del pezzo: tema, concetti, immagini, ritornello. Le barre le scrivi tu.
            </p>
            <p className="muted small">Puoi anche parlare: tocca il microfono sulla tastiera dell'iPhone.</p>
          </div>
          <VibePicker value={vibe} onChange={setVibe} />
        </div>
      )}

      {conv && (
        <div className="talk">
          {conv.view.map((v, i) =>
            v.who === 'map' ? (
              <div key={i} className="stack">
                <MapCard map={v.map} />
                {i === conv.view.length - 1 && (
                  <div className="row">
                    <button className="btn primary grow" onClick={startTrackFromMap}>
                      ✍️ Inizia la traccia
                    </button>
                    <button className="btn" onClick={async () => (await addIdea({ type: 'text', text: mapText(v.map), tags: ['mappa'] }), alert('Salvata nelle note'))}>
                      Salva
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div key={i} className={`msg${v.who === 'me' ? ' mine' : ''}`}>
                <div className="msg-bubble">
                  <div className="msg-text">{v.text}</div>
                </div>
              </div>
            )
          )}
          {busy && (
            <div className="msg">
              <div className="msg-bubble typing">
                <span className="spinner" /> {busy === 'map' ? 'Tiro le fila…' : 'Sto pensando…'}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {err && <div className="notice error-box">{err}</div>}

      {cloud.user && (
        <div className="chat-input talk-input">
          {conv && userTurns >= 2 && !busy && (
            <button className="btn sm fila" onClick={tiraLeFila}>
              🧭 Tira le fila
            </button>
          )}
          <textarea className="input" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={conv ? 'Rispondi…' : 'Inizia a raccontare…'} />
          <button className="icon-btn send" onClick={send} disabled={!text.trim() || !!busy} aria-label="Invia">
            <Icon name="send" />
          </button>
        </div>
      )}
    </div>
  );
}
