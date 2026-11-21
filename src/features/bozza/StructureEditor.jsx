import { CLASSIC_STRUCTURE, PARTS, SECTION_TYPES, newSection, sectionLabels, sectionType } from './music.js';

const SHORT = { drums: 'Batteria', melody: 'Melodia', chords: 'Accordi', bass: '808', sample: 'Sample', voce: 'Voce' };
const BARS = [4, 8, 12, 16];

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

// 🧱 Struttura: il loop diventa un brano (Intro, Strofa, Ritornello, Bridge, Outro)
export default function StructureEditor({ sketch, change, onPlayFrom, currentSec }) {
  const st = sketch.structure;
  const labels = sectionLabels(st);
  const barDur = (4 * 60) / sketch.bpm;
  const totalBars = st.reduce((a, s) => a + s.bars, 0);
  const set = (structure) => change({ structure });
  const upd = (i, c) => set(st.map((s, k) => (k === i ? { ...s, ...c } : s)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= st.length) return;
    const next = [...st];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  const barOf = (i) => st.slice(0, i).reduce((a, s) => a + s.bars, 0);

  return (
    <div className="stack structure">
      {st.length === 0 ? (
        <div className="card stack">
          <div className="reco-title">Dai una struttura al beat</div>
          <p className="muted small">
            Il tuo loop di {sketch.bars} battute diventa un brano vero: Intro, Strofe, Ritornelli, Bridge e Outro. In ogni parte scegli cosa suona (es. nell'intro
            niente batteria, nel ritornello tutto).
          </p>
          <button className="btn primary" onClick={() => set(CLASSIC_STRUCTURE.map(newSection))}>
            Struttura classica
          </button>
          <span className="muted small center">Intro · Strofa · Ritornello · Strofa · Ritornello · Bridge · Ritornello · Outro</span>
        </div>
      ) : (
        <>
          <div className="struct-bar" aria-hidden>
            {st.map((s, i) => (
              <div key={s.id} className={`struct-seg t-${s.type}${currentSec === i ? ' now' : ''}`} style={{ flex: s.bars }} />
            ))}
          </div>
          <p className="muted small">
            {st.length} parti · {totalBars} battute · <b>{fmt(totalBars * barDur)}</b>. Premi ▶ su una parte per sentire il brano da lì.
          </p>
          {st.map((s, i) => (
            <div key={s.id} className={`sec-card t-${s.type}${currentSec === i ? ' now' : ''}`}>
              <div className="sec-head">
                <button className="icon-btn sm" onClick={() => onPlayFrom(barOf(i))} aria-label={`Suona da ${labels[i]}`}>
                  ▶
                </button>
                <select className="sec-type" value={s.type} onChange={(e) => upd(i, { type: e.target.value, bars: newSection(e.target.value).bars, parts: newSection(e.target.value).parts })} aria-label="Tipo di parte">
                  {SECTION_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <span className="sec-name grow">{labels[i] !== sectionType(s.type).label ? labels[i] : ''}</span>
                <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su">
                  ↑
                </button>
                <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === st.length - 1} aria-label="Sposta giù">
                  ↓
                </button>
                <button className="icon-btn sm" onClick={() => set(st.filter((_, k) => k !== i))} aria-label="Togli">
                  ✕
                </button>
              </div>
              <div className="chips sec-bars">
                {BARS.map((b) => (
                  <button key={b} className={`chip sm${s.bars === b ? ' on' : ''}`} onClick={() => upd(i, { bars: b })}>
                    {b} batt.
                  </button>
                ))}
              </div>
              <div className="chips sec-parts">
                {PARTS.map((p) => (
                  <button key={p.id} className={`chip sm${s.parts[p.id] ? ' on' : ''}`} onClick={() => upd(i, { parts: { ...s.parts, [p.id]: !s.parts[p.id] } })}>
                    {SHORT[p.id]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="field">
        <span className="field-label">Aggiungi una parte</span>
        <div className="chips">
          {SECTION_TYPES.map((t) => (
            <button key={t.id} className="chip" onClick={() => set([...st, newSection(t.id)])}>
              + {t.label}
            </button>
          ))}
        </div>
      </div>
      {st.length > 0 && (
        <button className="btn sm ghost" onClick={() => confirm('Togliere tutta la struttura? (il loop resta)') && set([])}>
          Togli la struttura
        </button>
      )}
    </div>
  );
}
