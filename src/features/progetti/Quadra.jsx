import { CLOUD } from '../../config.js';
import { useState } from 'react';
import { updateTrack } from '../../db/db.js';
import { sectionLabel } from '../../constants.js';
import { callFunction, useCloud } from '../../lib/cloud.js';

// Strade concrete per andare avanti dopo l'attacco (quando arriva "e mo' che dico?")
export const STRADE = [
  { id: 'conseguenza', label: 'La conseguenza', q: (t) => `Cosa è successo dopo${t ? ` (${t})` : ''}? Cosa è cambiato in te?` },
  { id: 'altro', label: "L'altro punto di vista", q: (t) => `Come la vede chi ti sta di fronte${t ? ` su ${t}` : ''}?` },
  { id: 'prima', label: 'Il prima', q: () => 'Com\'era prima? Da dove sei partito?' },
  { id: 'dopo', label: 'Il dopo', q: () => 'Dove sarai tra un anno se va come deve andare?' },
  { id: 'dettaglio', label: 'Il dettaglio', q: () => 'Un dettaglio che nessuno nota: un oggetto, un odore, un posto.' },
  { id: 'contrasto', label: 'Il contrasto', q: (t) => `Cosa dicono gli altri${t ? ` di ${t}` : ''} e cosa sai tu?` },
  { id: 'domanda', label: 'La domanda', q: () => 'Che domanda ti fai la notte e non dici a nessuno?' },
  { id: 'promessa', label: 'La promessa', q: () => 'Cosa prometti a te stesso, o a chi ti ascolta?' },
];

/** Tema, concetto del ritornello, direzione di ogni strofa: la "quadra" della traccia. */
export default function Quadra({ track, activeId }) {
  const q = track.quadra || {};
  const [open, setOpen] = useState(!q.tema);
  const cloudState = useCloud();
  const [ai, setAi] = useState(null); // { busy } | { strade } | { error }
  const askAi = async (s) => {
    setAi({ busy: true });
    try {
      const r = await callFunction(CLOUD.assistant, { mode: 'strade', text: s.text, context: { tema: q.tema || '', rit: q.rit || '' } });
      setAi({ strade: r.data?.strade || [] });
    } catch (e) {
      setAi({ error: e.message || 'Assistente non disponibile.' });
    }
  };
  const set = (c) => updateTrack(track.id, { quadra: { ...q, ...c } });
  const setDir = (id, v) => set({ dir: { ...(q.dir || {}), [id]: v } });
  const strofe = (track.sections || []).filter((s) => s.type !== 'ritornello');
  const totals = {};
  const seen = {};
  for (const s of track.sections || []) totals[s.type] = (totals[s.type] || 0) + 1;
  const labelOf = (s) => {
    seen[s.type] = (seen[s.type] || 0) + 1;
    return `${sectionLabel(s.type)}${totals[s.type] > 1 ? ` ${seen[s.type]}` : ''}`;
  };
  const labels = Object.fromEntries((track.sections || []).map((s) => [s.id, labelOf(s)]));
  const lines = (s) => s.text.split('\n').filter((l) => l.trim()).length;
  // la strofa su cui sei, se hai già l'attacco ma la direzione è vuota: ti propongo le strade
  const act = strofe.find((s) => s.id === activeId);
  const needWay = act && lines(act) >= 2 && !(q.dir || {})[act.id];

  if (!open)
    return (
      <button className="quadra-mini" onClick={() => setOpen(true)}>
        <span className="qm-k">Quadra</span>
        <span className="grow ellipsis">{q.tema || 'Di cosa parla il pezzo? Tocca per scriverlo'}</span>
        {needWay && <span className="qm-dot" title="Scegli dove va la strofa" />}
      </button>
    );

  return (
    <div className="quadra">
      <div className="row between">
        <span className="field-label">La quadra della traccia</span>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>
          Chiudi
        </button>
      </div>
      <label className="qd-field">
        <span>Tema</span>
        <input className="input" defaultValue={q.tema || ''} onBlur={(e) => set({ tema: e.target.value.trim() })} placeholder="In una frase: di cosa parla" />
      </label>
      <label className="qd-field">
        <span>Ritornello</span>
        <input className="input" defaultValue={q.rit || ''} onBlur={(e) => set({ rit: e.target.value.trim() })} placeholder="Il concetto che torna (non il testo)" />
      </label>
      {strofe.map((s) => (
        <div key={s.id} className={`qd-field${s.id === activeId ? ' on' : ''}`}>
          <span>{labels[s.id]}</span>
          <input
            key={(q.dir || {})[s.id] || ''}
            className="input"
            defaultValue={(q.dir || {})[s.id] || ''}
            onBlur={(e) => setDir(s.id, e.target.value.trim())}
            placeholder="Dove va: cosa dici qui"
          />
          {s.id === activeId && lines(s) >= 2 && (
            <div className="strade">
              <span className="muted small">Hai l'attacco. Dove la porti?</span>
              <div className="chips">
                {STRADE.map((st) => (
                  <button key={st.id} className="chip sm" onClick={() => setDir(s.id, `${st.label}: ${st.q(q.tema)}`)}>
                    {st.label}
                  </button>
                ))}
              </div>
              {cloudState.user && !ai?.strade && (
                <button className="btn sm" onClick={() => askAi(s)} disabled={ai?.busy}>
                  {ai?.busy ? <span className="spinner" /> : '◌'} Strade su misura (assistente)
                </button>
              )}
              {ai?.error && <p className="error small">{ai.error}</p>}
              {ai?.strade?.map((t) => (
                <button key={t} className="strada-ai" onClick={() => (setDir(s.id, t), setAi(null))}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
