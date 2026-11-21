import { memo, useMemo, useState } from 'react';
import { newSection, updateTrack } from '../../db/db.js';
import { SECTION_TYPES, RHYME_COLORS, sectionLabel } from '../../constants.js';
import { analyzeRhymes, countLineSyllables, tokenizeLine } from '../../lib/italiano.js';
import { useAutosave, SaveStatus } from '../../components/useAutosave.jsx';
import Icon from '../../components/Icon.jsx';

const readPref = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v === '1';
  } catch {
    return d;
  }
};
const writePref = (k, v) => {
  try {
    localStorage.setItem(k, typeof v === 'string' ? v : v ? '1' : '0');
  } catch {
    /* ignorato */
  }
};
const readMode = () => {
  try {
    return localStorage.getItem('q.rimeMode') || 'rime';
  } catch {
    return 'rime';
  }
};

const MODES = [
  ['off', 'No'],
  ['rime', 'Rime'],
  ['assonanze', 'Assonanze'],
];

function ModePicker({ value, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Evidenzia">
      {MODES.map(([id, label]) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button className={`toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="toggle-knob" />
      {label}
    </button>
  );
}

// Una riga "disegnata" sotto al campo di testo: parole colorate + sillabe.
const Line = memo(function Line({ line, analysis, showRhymes, showSyllables }) {
  const syl = showSyllables && line.trim() ? countLineSyllables(line) : null;
  let content;
  if (!line) content = '​';
  else if (!showRhymes) content = line;
  else
    content = tokenizeLine(line).map((p, i) => {
      const g = analysis.groupKey(p);
      const c = g != null ? analysis.colors.get(g) : undefined;
      if (c === undefined) return p.text;
      // Rima perfetta = colore pieno; solo assonanza = sottolineatura tratteggiata.
      const perfect = analysis.exact.has(p.key);
      return (
        <span key={i} className={perfect ? 'rhyme' : 'rhyme ass'} style={{ '--rc': RHYME_COLORS[c] }}>
          {p.text}
        </span>
      );
    });
  return (
    <div className="lyr-line">
      {content}
      {syl !== null && <span className="syl">{syl}</span>}
    </div>
  );
});

// Campo di testo trasparente sopra al "disegno": si scrive normalmente, si vedono i colori.
function SectionText({ text, onChange, analysis, showRhymes, showSyllables }) {
  const lines = text.split('\n');
  return (
    <div className={`lyr${showSyllables ? ' with-syl' : ''}`}>
      <div className="lyr-back" aria-hidden="true">
        {lines.map((l, i) => (
          <Line key={i} line={l} analysis={analysis} showRhymes={showRhymes} showSyllables={showSyllables} />
        ))}
      </div>
      <textarea
        className="lyr-input"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="sentences"
        placeholder="Scrivi qui le barre, una per riga…"
      />
    </div>
  );
}

export default function LyricsEditor({ track }) {
  const [sections, setSections] = useState(() => (track.sections?.length ? track.sections : [newSection('strofa')]));
  const [mode, setMode] = useState(readMode);
  const showRhymes = mode !== 'off';
  const [showSyllables, setShowSyllables] = useState(() => readPref('q.sillabe', true));
  const status = useAutosave(sections, (v) => updateTrack(track.id, { sections: v }));

  const allText = useMemo(() => sections.map((s) => s.text).join('\n'), [sections]);
  const analysis = useMemo(() => analyzeRhymes(allText, mode, RHYME_COLORS.length), [allText, mode]);

  const update = (id, changes) => setSections((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  const add = (type) => setSections((list) => [...list, newSection(type)]);
  const move = (i, dir) =>
    setSections((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const remove = (s) => {
    if (s.text.trim() && !confirm(`Eliminare la sezione "${sectionLabel(s.type)}"?`)) return;
    setSections((list) => list.filter((x) => x.id !== s.id));
  };

  const copyAll = async () => {
    const txt = sections.map((s) => `[${sectionLabel(s.type)}]\n${s.text.trim()}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(txt);
      alert('Testo copiato!');
    } catch {
      alert('Non riesco a copiare su questo dispositivo.');
    }
  };

  // Numerazione: "Strofa 1", "Strofa 2"… solo se ce n'è più d'una dello stesso tipo.
  const totals = sections.reduce((m, s) => ({ ...m, [s.type]: (m[s.type] || 0) + 1 }), {});
  const seen = {};
  const totalBars = allText.split('\n').filter((l) => l.trim()).length;

  return (
    <div className="editor">
      <div className="editor-bar">
        <ModePicker value={mode} onChange={(v) => (setMode(v), writePref('q.rimeMode', v))} />
        <Toggle on={showSyllables} onChange={(v) => (setShowSyllables(v), writePref('q.sillabe', v))} label="Sillabe" />
        <span className="grow" />
        <SaveStatus status={status} />
      </div>
      {showRhymes && (
        <div className="rhyme-legend muted small">
          <span>
            <span className="rhyme" style={{ '--rc': RHYME_COLORS[0] }}>rima</span> {analysis.stats.rime} {analysis.stats.rime === 1 ? "gruppo" : "gruppi"}
          </span>
          {mode === 'assonanze' && (
            <span>
              <span className="rhyme ass" style={{ '--rc': RHYME_COLORS[1] }}>assonanza</span> {analysis.stats.assonanze} {analysis.stats.assonanze === 1 ? "gruppo" : "gruppi"}
            </span>
          )}
        </div>
      )}

      {sections.map((s, i) => {
        seen[s.type] = (seen[s.type] || 0) + 1;
        const bars = s.text.split('\n').filter((l) => l.trim()).length;
        return (
          <section key={s.id} className={`lyr-section type-${s.type}`}>
            <div className="lyr-head">
              <select className="section-select" value={s.type} onChange={(e) => update(s.id, { type: e.target.value })} aria-label="Tipo di sezione">
                {SECTION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                    {totals[s.type] > 1 && t.id === s.type ? ` ${seen[s.type]}` : ''}
                  </option>
                ))}
              </select>
              <span className="muted small">{bars} barre</span>
              <span className="grow" />
              <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su">
                <Icon name="up" size={18} />
              </button>
              <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="Sposta giù">
                <Icon name="down" size={18} />
              </button>
              <button className="icon-btn sm" onClick={() => remove(s)} disabled={sections.length === 1} aria-label="Elimina sezione">
                <Icon name="trash" size={18} />
              </button>
            </div>
            <SectionText text={s.text} onChange={(text) => update(s.id, { text })} analysis={analysis} showRhymes={showRhymes} showSyllables={showSyllables} />
          </section>
        );
      })}

      <div className="add-sections">
        <span className="field-label">Aggiungi sezione</span>
        <div className="chips">
          {SECTION_TYPES.map((t) => (
            <button key={t.id} className="chip" onClick={() => add(t.id)}>
              + {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="row between muted small">
        <span>{totalBars} barre in totale</span>
        <button className="btn ghost sm" onClick={copyAll}>
          <Icon name="copy" size={18} /> Copia testo
        </button>
      </div>
    </div>
  );
}
