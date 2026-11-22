import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { updateTrack } from '../../db/db.js';
import { SECTION_TYPES, RHYME_COLORS } from '../../constants.js';
import { cleanSections, headerType, parseLyrics, sectionAtLine, sectionsToText } from '../../lib/sezioni.js';
import { analyzeRhymes, countLineSyllables, multiColors, multiKeys, tokenizeLine } from '../../lib/italiano.js';
import { wordAt } from '../../lib/rimario.js';
import RhymeSheet from '../../components/RhymeSheet.jsx';
import GhostBar, { insertGhostLine, useGhost } from '../../components/GhostBar.jsx';
import { addBars, logEvent } from '../../lib/stats.js';
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
  ['multi', 'Multi'],
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
const Line = memo(function Line({ line, analysis, showRhymes, showSyllables, target, header }) {
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
  const [mode, setMode] = useState(readMode);
  const showRhymes = mode !== 'off';
  const [showSyllables, setShowSyllables] = useState(() => readPref('q.sillabe', true));
  const parsedRef = useRef(null);
  const parsed = useMemo(() => parseLyrics(text, parsedRef.current || track.sections || []), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  parsedRef.current = parsed;
  const status = useAutosave(text, (v) => updateTrack(track.id, { lyrics: v, sections: cleanSections(parseLyrics(v, parsedRef.current || [])) }));
  const taRef = useRef(null);

  const lines = text.split('\n');
  const isHeader = useMemo(() => lines.map((l) => !!headerType(l)), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  // per le rime conto solo le barre (non i titoli)
  const barsText = useMemo(() => lines.filter((l, i) => !isHeader[i]).join('\n'), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const analysis = useMemo(
    () => (mode === 'multi' ? { mode: 'multi', colors: multiColors(barsText, RHYME_COLORS.length), stats: {} } : analyzeRhymes(barsText, mode, RHYME_COLORS.length)),
    [barsText, mode]
  );
  const [caretLine, setCaretLine] = useState(0);
  const caret = useRef({ text: '', pos: 0 });
  const totalBars = lines.filter((l, i) => l.trim() && !isHeader[i]).length;
  const filledRef = useRef(totalBars);
  useEffect(() => {
    if (totalBars > filledRef.current) addBars(totalBars - filledRef.current);
    filledRef.current = Math.max(filledRef.current, totalBars);
  }, [totalBars]);
  const [rimario, setRimario] = useState(null);
  const openRimario = () => setRimario(wordAt(caret.current.text, caret.current.pos));

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

  // 👻 barra fantasma: fermo da ~3 minuti
  const ghost = useGhost({ lines, at: caretLine, exclude: track.id, enabled: true });

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
        <ModePicker value={mode} onChange={(v) => (setMode(v), writePref('q.rimeMode', v))} />
        <Toggle on={showSyllables} onChange={(v) => (setShowSyllables(v), writePref('q.sillabe', v))} label="Sillabe" />
        <button className="btn sm" onPointerDown={(e) => e.preventDefault()} onClick={openRimario}>
          Rimario
        </button>
        <span className="grow" />
        <SaveStatus status={status} />
      </div>
      {rimario && <RhymeSheet word={rimario.word} prev={rimario.prev} onClose={() => setRimario(null)} />}
      <GhostBar
        ghost={ghost.ghost}
        count={ghost.count}
        onNext={ghost.next}
        onClose={ghost.dismiss}
        onUse={(g) => {
          setText(insertGhostLine(text, caretLine, g));
          logEvent('reuse');
          ghost.dismiss();
        }}
      />
      {mode === 'multi' && (
        <div className="rhyme-legend muted small">
          <span>
            <span className="rhyme" style={{ '--rc': RHYME_COLORS[0] }}>multisillabiche</span> {analysis.colors.size} {analysis.colors.size === 1 ? 'gruppo' : 'gruppi'} · stesse vocali sulle ultime 3+ sillabe, anche dentro la riga
          </span>
        </div>
      )}
      {showRhymes && mode !== 'multi' && (
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
      )}

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
            placeholder={'Scrivi qui le barre, una per riga.\n\nPer dividere il pezzo scrivi su una riga da sola “Ritornello” o “Strofa 2”, oppure usa i tasti qui sotto.'}
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
