import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { updateTrack } from '../../db/db.js';
import { SECTION_TYPES, RHYME_COLORS, formatDate } from '../../constants.js';
import { cleanSections, headerType, parseLyrics, sectionAtLine, sectionsToText } from '../../lib/sezioni.js';
import { analyzeRhymes, countLineSyllables, multiColors, multiKeys, tokenizeLine } from '../../lib/italiano.js';
import { addBars } from '../../lib/stats.js';
import { useAutosave, SaveStatus } from '../../components/useAutosave.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useDbQuery } from '../../db/useDbQuery.js';
import { db } from '../../db/db.js';

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
export const readMode = () => {
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
  ['multi', 'Multi'],
];

/** Analisi delle rime del testo nel modo scelto. */
export const rhymeAnalysis = (text, mode) => (mode === 'multi' ? { mode: 'multi', colors: multiColors(text, RHYME_COLORS.length), stats: {} } : analyzeRhymes(text, mode, RHYME_COLORS.length));

/** Il conteggio sotto la barra: gruppi di rime, assonanze, multisillabiche. */
export function RhymeLegend({ mode, analysis }) {
  if (mode === 'off') return null;
  if (mode === 'multi')
    return (
      <div className="rhyme-legend muted small">
        <span>
          <span className="rhyme" style={{ '--rc': RHYME_COLORS[0] }}>multisillabiche</span> {analysis.colors.size} {analysis.colors.size === 1 ? 'gruppo' : 'gruppi'} · stesse vocali sulle ultime 3+ sillabe, anche dentro la riga
        </span>
      </div>
    );
  return (
    <div className="rhyme-legend muted small">
      <span>
        <span className="rhyme" style={{ '--rc': RHYME_COLORS[0] }}>rima</span> {analysis.stats.rime} {analysis.stats.rime === 1 ? 'gruppo' : 'gruppi'}
      </span>
      {mode === 'assonanze' && (
        <span>
          <span className="rhyme ass" style={{ '--rc': RHYME_COLORS[1] }}>assonanza</span> {analysis.stats.assonanze} {analysis.stats.assonanze === 1 ? 'gruppo' : 'gruppi'}
        </span>
      )}
    </div>
  );
}

export function ModePicker({ value, onChange }) {
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
export const Line = memo(function Line({ line, analysis, showRhymes, showSyllables, target, header }) {
  if (header) return <div className={`lyr-line lyr-headline${header.active ? ' on' : ''}`}>{line}</div>;
  const syl = showSyllables && line.trim() ? countLineSyllables(line) : null;
  let content;
  if (!line) content = '​';
  else if (!showRhymes) content = line;
  else if (analysis.mode === 'multi') {
    // rime multisillabiche: coloro tutte le parole che fanno parte della rima
    const parts = tokenizeLine(line);
    const col = Array(parts.length).fill(undefined);
    multiKeys(parts).forEach((m, i) => {
      const c = m.mkey ? analysis.colors.get(m.mkey) : undefined;
      if (c === undefined) return;
      for (let j = m.from; j <= i; j++) if (/[a-zàèéìòù]/i.test(parts[j].text)) col[j] = c;
    });
    content = parts.map((p, i) =>
      col[i] === undefined ? (
        p.text
      ) : (
        <span key={i} className="rhyme" style={{ '--rc': RHYME_COLORS[col[i]] }}>
          {p.text}
        </span>
      )
    );
  } else
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
      {syl !== null && (
        <span className={`syl${target ? (syl === target ? ' fit' : Math.abs(syl - target) <= 1 ? ' near' : ' off') : ''}`}>
          {syl}
          {target ? `/${target}` : ''}
        </span>
      )}
      {syl === null && target && showSyllables && <span className="syl target">{target}</span>}
    </div>
  );
});

// Il testo di partenza: quello scritto come testo unico, oppure le vecchie schede messe in fila
const startText = (track) => {
  const secs = track.sections || [];
  if (typeof track.lyrics === 'string') {
    const same = cleanSections(parseLyrics(track.lyrics, secs));
    if (JSON.stringify(same) === JSON.stringify(secs.map(({ id, type, text }) => ({ id, type, text })))) return track.lyrics;
  }
  return sectionsToText(secs);
};

/**
 * Il testo della traccia: un foglio unico, come le note. Chi scrive sa dov'è il ritornello:
 * basta una riga "Ritornello" o "Strofa 2" (o i tasti sotto) e lo studio sa dove parte ogni pezzo.
 */
export default function LyricsEditor({ track, onFocusSection, activeId, targets = {} }) {
  const [text, setText] = useState(() => startText(track));
  // qui il testo arriva già scritto (dalle note) e serve allo studio: niente strumenti di scrittura
  const mode = 'off';
  const showRhymes = false;
  const showSyllables = false;
  const [picking, setPicking] = useState(false);
  const parsedRef = useRef(null);
  const parsed = useMemo(() => parseLyrics(text, parsedRef.current || track.sections || []), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  parsedRef.current = parsed;
  const status = useAutosave(text, (v) => updateTrack(track.id, { lyrics: v, sections: cleanSections(parseLyrics(v, parsedRef.current || [])) }));
  const taRef = useRef(null);

  const lines = text.split('\n');
  const isHeader = useMemo(() => lines.map((l) => !!headerType(l)), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const analysis = useMemo(() => ({ mode, colors: new Map(), exact: new Set(), stats: {}, groupKey: () => null }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [caretLine, setCaretLine] = useState(0);
  const caret = useRef({ text: '', pos: 0 });
  const totalBars = lines.filter((l, i) => l.trim() && !isHeader[i]).length;
  const filledRef = useRef(totalBars);
  useEffect(() => {
    if (totalBars > filledRef.current) addBars(totalBars - filledRef.current);
    filledRef.current = Math.max(filledRef.current, totalBars);
  }, [totalBars]);

  // in che sezione sto scrivendo (dal cursore)
  const onCaret = (value, pos) => {
    const lineIdx = value.slice(0, pos).split('\n').length - 1;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = value.indexOf('\n', pos);
    caret.current = { text: value.slice(lineStart, lineEnd < 0 ? undefined : lineEnd), pos: pos - lineStart };
    setCaretLine(lineIdx);
    const sec = sectionAtLine(parseLyrics(value, parsedRef.current || []), lineIdx);
    if (sec && sec.id !== activeId) onFocusSection?.(sec.id);
  };
  // quando cambio sezione da fuori (la Home, "Riprendi") porto il cursore lì
  const jumpTo = useRef(activeId); // solo la sezione con cui apro la pagina, non quelle in cui entro scrivendo
  useEffect(() => {
    if (!jumpTo.current || !taRef.current) return;
    const sec = parsed.find((x) => x.id === jumpTo.current);
    if (!sec) return;
    jumpTo.current = null;
    const ta = taRef.current;
    const pos = lines.slice(0, Math.max(sec.from, 0)).join('\n').length + (sec.from > 0 ? 1 : 0);
    setTimeout(() => {
      if (document.activeElement === ta) return; // stai già scrivendo: non ti sposto
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(pos, pos);
      ta.scrollIntoView({ block: 'center' });
    }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // il testo di una nota: se qui è vuoto lo metto e basta, altrimenti chiedo
  const useNote = (t) => {
    const clean = (t || '').trim();
    if (!clean) return;
    if (!text.trim()) return setText(clean);
    if (confirm('Sostituire il testo che c\'è con quello della nota?\n\nOK = sostituisci · Annulla = aggiungilo in fondo')) setText(clean);
    else setText(`${text.replace(/\s+$/, '')}\n\n${clean}`);
  };

  // + Ritornello / + Strofa: scrive la riga-titolo dove sei
  const addHeader = (type) => {
    const ta = taRef.current;
    const pos = ta ? ta.selectionStart : text.length;
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const n = parsed.filter((x) => x.type === type).length;
    const label = SECTION_TYPES.find((t) => t.id === type)?.label || 'Strofa';
    const title = `${label}${type === 'strofa' && n >= 1 ? ` ${n + 1}` : ''}`;
    const pre = !before.trim() ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const ins = `${pre}${title}\n`;
    const next = before + ins + (after.startsWith('\n') || !after ? after : `\n${after}`);
    pendingCaret.current = before.length + ins.length;
    setText(next);
  };
  // il cursore va subito dopo il titolo, prima che arrivi la prossima lettera
  const pendingCaret = useRef(null);
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    const ta = taRef.current;
    if (at == null || !ta) return;
    pendingCaret.current = null;
    ta.focus();
    ta.setSelectionRange(at, at);
    onCaret(text, at);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text.trim());
      alert('Testo copiato!');
    } catch {
      alert('Non riesco a copiare su questo dispositivo.');
    }
  };

  // sillabe del nanana accanto alle barre della sezione che le ha
  const lineTargets = {};
  for (const s of parsed) {
    const tg = targets[s.id];
    if (!tg) continue;
    let k = 0;
    for (let i = s.from; i <= s.to && k < tg.length; i++) if (lines[i]?.trim()) lineTargets[i] = tg[k++];
  }
  const activeSec = parsed.find((x) => x.id === activeId);

  return (
    <div className="editor">
      <div className="editor-bar">
        <button className="btn sm" onClick={() => setPicking(true)}>
          <Icon name="taccuino" size={18} /> Prendi da una nota
        </button>
        <span className="grow" />
        <SaveStatus status={status} />
      </div>
      {picking && <NotePicker onClose={() => setPicking(false)} onPick={(t) => (useNote(t), setPicking(false))} />}

      <div className="lyr-sheet">
        <div className={`lyr${showSyllables ? ' with-syl' : ''}`}>
          <div className="lyr-back" aria-hidden="true">
            {lines.map((l, i) => (
              <Line key={i} line={l} analysis={analysis} showRhymes={showRhymes} showSyllables={showSyllables} target={lineTargets[i]} header={isHeader[i] ? { active: activeSec?.header === i } : null} />
            ))}
          </div>
          <textarea
            ref={taRef}
            className="lyr-input"
            value={text}
            onChange={(e) => (setText(e.target.value), onCaret(e.target.value, e.target.selectionStart))}
            onSelect={(e) => onCaret(e.target.value, e.target.selectionStart)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="sentences"
            placeholder={'Incolla qui il testo (o prendilo da una nota col tasto sopra): è quello che vedrai scorrere mentre registri.\n\nSe vuoi che lo studio parta dal ritornello, scrivi su una riga da sola “Ritornello” (o usa i tasti sotto).'}
          />
        </div>
      </div>

      <div className="add-sections">
        <div className="chips">
          {SECTION_TYPES.map((t) => (
            <button key={t.id} className="chip sm" onPointerDown={(e) => e.preventDefault()} onClick={() => addHeader(t.id)}>
              + {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="row between muted small">
        <span>{totalBars} barre</span>
        <button className="btn ghost sm" onClick={copyAll}>
          <Icon name="copy" size={18} /> Copia testo
        </button>
      </div>
    </div>
  );
}

/** Scegli una nota da cui prendere il testo. */
function NotePicker({ onClose, onPick }) {
  const notes = useDbQuery(() => db.ideas.orderBy('updatedAt').reverse().filter((i) => i.type === 'text' && !!(i.text || '').trim()).toArray(), [], []) || [];
  return (
    <Sheet open onClose={onClose} title="Prendi il testo da una nota">
      <div className="list">
        {notes.length === 0 && <p className="muted">Non hai ancora note con del testo.</p>}
        {notes.map((n) => (
          <button key={n.id} className="beat-pick note-pick" onClick={() => onPick(n.text)}>
            <span className="grow min0">
              <span className="ellipsis" style={{ display: 'block', fontWeight: 800 }}>
                {n.title || n.text.trim().split('\n')[0]}
              </span>
              <span className="muted small ellipsis" style={{ display: 'block', fontWeight: 400 }}>
                {n.text.trim().split('\n').filter((l) => l.trim()).length} righe · {formatDate(n.updatedAt || n.createdAt)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
