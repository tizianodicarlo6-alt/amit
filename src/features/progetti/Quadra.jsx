import { CLOUD } from '../../config.js';
import { useState } from 'react';
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

/**
 * La "quadra" del pezzo: tema, concetto del ritornello, direzione di ogni strofa.
 * value/onChange: { tema, rit, dir: { [chiave strofa]: testo } }
 * strofe: [{ key, label, text }] le strofe del testo (per la direzione di ognuna)
 */
export default function Quadra({ value, onChange, strofe = [], activeKey = null, onClose }) {
  const q = value || {};
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
  const set = (c) => onChange({ ...q, ...c });
  const setDir = (k, v) => set({ dir: { ...(q.dir || {}), [k]: v } });
  const lines = (s) => s.text.split('\n').filter((l) => l.trim()).length;
  // la strofa su cui sei (o l'ultima) con l'attacco scritto: ti propongo le strade
  const act = strofe.find((s) => s.key === activeKey) || strofe[strofe.length - 1];

  return (
    <div className="quadra">
      <div className="row between">
        <span className="field-label">La quadra del pezzo</span>
        {onClose && (
          <button className="btn sm ghost" onClick={onClose}>
            Nascondi
          </button>
        )}
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
        <div key={s.key} className={`qd-field${act && s.key === act.key ? ' on' : ''}`}>
          <span>{s.label}</span>
          <input
            key={(q.dir || {})[s.key] || ''}
            className="input"
            defaultValue={(q.dir || {})[s.key] || ''}
            onBlur={(e) => setDir(s.key, e.target.value.trim())}
            placeholder="Dove va: cosa dici qui"
          />
          {act && s.key === act.key && lines(s) >= 2 && !(q.dir || {})[s.key] && (
            <div className="strade">
              <span className="muted small">Hai l'attacco. Dove la porti?</span>
              <div className="chips">
                {STRADE.map((st) => (
                  <button key={st.id} className="chip sm" onClick={() => setDir(s.key, `${st.label}: ${st.q(q.tema)}`)}>
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
                <button key={t} className="strada-ai" onClick={() => (setDir(s.key, t), setAi(null))}>
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
