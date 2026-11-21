import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { formatTime } from '../../constants.js';

const fmt = (t) => {
  const s = Math.max(0, t);
  return `${formatTime(s)}.${Math.floor((s % 1) * 10)}`;
};

// Dove parte il testo nel beat: attacco + partenza di ogni sezione.
export default function StructureSheet({ timeline, attack, attackAuto, autoAttack, barDur, barsPerLine, starts, onChange, onListen, onSync, onClose }) {
  const { blocks } = timeline;
  const setAttack = (v) => onChange({ attack: v == null ? null : Math.max(0, v) });
  const setStart = (id, v) => {
    const next = { ...starts };
    if (v == null) delete next[id];
    else next[id] = Math.max(0, v);
    onChange({ starts: next });
  };

  return (
    <Sheet open onClose={onClose} title="Struttura del beat">
      <div className="stack">
        <p className="muted small">
          Qui dici all'app <b>dove parte ogni parte del testo</b> nel beat, così salta l'intro del produttore e ogni strofa parte al momento giusto.
        </p>

        <button
          className="btn primary big"
          onClick={() => {
            onClose();
            onSync();
          }}
        >
          <Icon name="beat" /> Segna a orecchio
        </button>
        <p className="muted small">Parte il beat: tocca il pulsante grande nel momento in cui inizia ogni sezione. L'app aggancia il tocco al tempo.</p>

        <div className="divider" />

        {blocks.length === 0 && <p className="muted">Scrivi prima il testo della traccia, poi torna qui.</p>}

        {blocks.map((b, i) => {
          const isFirst = i === 0 && starts[b.id] == null;
          const value = isFirst ? attack : b.start;
          const status = isFirst ? (attackAuto ? 'trovato in automatico' : 'segnato da te') : b.explicit ? 'segnato da te' : 'subito dopo la sezione prima';
          const nudge = (dir) => (isFirst ? setAttack(attack + dir * barDur) : setStart(b.id, b.start + dir * barDur));
          return (
            <div key={b.id} className="card struct-row">
              <div className="struct-head">
                <div className="grow min0">
                  <div className="reco-title">{b.label}</div>
                  <div className="muted small">
                    parte a <b className="mono">{fmt(value)}</b> · {status}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => onListen(Math.max(0, value - barDur))} aria-label="Ascolta da qui">
                  <Icon name="play" size={20} />
                </button>
              </div>
              <div className="row">
                <button className="btn sm grow" onClick={() => nudge(-1)} disabled={value - barDur < -0.01}>
                  − 1 battuta
                </button>
                <button className="btn sm grow" onClick={() => nudge(1)}>
                  + 1 battuta
                </button>
              </div>
              {isFirst && !attackAuto && (
                <button className="btn ghost sm" onClick={() => setAttack(null)}>
                  Usa l'attacco automatico ({fmt(autoAttack)})
                </button>
              )}
              {!isFirst && b.explicit && (
                <button className="btn ghost sm" onClick={() => setStart(b.id, null)}>
                  Rimetti subito dopo la sezione prima
                </button>
              )}
            </div>
          );
        })}

        <div className="field">
          <span className="field-label">Velocità del testo</span>
          <div className="chips">
            {[
              [1, '1 barra = 1 battuta'],
              [2, '1 barra = 2 battute'],
              [0.5, '2 barre per battuta'],
            ].map(([v, l]) => (
              <button key={v} className={`chip${barsPerLine === v ? ' on' : ''}`} onClick={() => onChange({ barsPerLine: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
