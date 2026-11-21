import { useEffect, useMemo, useRef, useState } from 'react';
import { INSTRUMENTS, PROGRESSIONS, chordNotes, STYLES, STYLE_ORDER, bassFromChords, chordLabel, chordsFromProgression, noteName, scaleNotes, scaleOf } from './music.js';

const LENS = [
  [1, '1/16'],
  [2, '1/8'],
  [4, '1/4'],
  [8, '1/2'],
  [16, '1 batt.'],
];
const CELL = 24; // larghezza di un sedicesimo (px)
const ROW = 28;

// Piano roll (come in Logic/FL): righe = note della tonalità, colonne = sedicesimi
function PianoRoll({ sketch, part, change, player, currentStep, noteLen }) {
  const { root } = scaleOf(sketch.key);
  const rows = useMemo(() => {
    // melodia: da circa La3 a La5 · 808: da Mi1 a Re#3
    const range = part === 'bass' ? [28, 51] : [57, 81];
    return scaleNotes(sketch.key, range[0], range[1]).reverse();
  }, [sketch.key, part]);
  const notes = sketch.notes[part] || [];
  const total = sketch.bars * 16;
  const scrollRef = useRef(null);
  const inst = part === 'bass' ? 'bass808' : sketch.instruments.melody;

  // la vista segue la testina
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || currentStep == null) return;
    const x = (currentStep % total) * CELL;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - 40);
  }, [currentStep, total]);

  const cellTap = (pitch, step) => {
    const hit = notes.find((n) => n.pitch === pitch && step >= n.start && step < n.start + n.len);
    if (hit) {
      change({ notes: { ...sketch.notes, [part]: notes.filter((n) => n !== hit) } });
      return;
    }
    const len = Math.min(noteLen, total - step);
    change({ notes: { ...sketch.notes, [part]: [...notes, { pitch, start: step, len, vel: 1 }] } });
    player.preview({ inst, midi: pitch + (sketch.partPitch?.[part] || 0) }, sketch);
  };

  return (
    <div className="roll" ref={scrollRef}>
      <div className="roll-inner" style={{ width: 52 + total * CELL, height: rows.length * ROW }}>
        {rows.map((m, r) => (
          <div key={m} className={`roll-row${(m - root) % 12 === 0 ? ' tonic' : ''}`} style={{ top: r * ROW, height: ROW }}>
            <span className="roll-key" onClick={() => player.preview({ inst, midi: m + (sketch.partPitch?.[part] || 0) }, sketch)}>
              {noteName(m)}
            </span>
          </div>
        ))}
        <div className="roll-grid" style={{ left: 52, width: total * CELL, height: rows.length * ROW, backgroundSize: `${CELL}px ${ROW}px, ${CELL * 4}px 100%, ${CELL * 16}px 100%` }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const step = Math.floor((e.clientX - rect.left) / CELL);
            const row = Math.floor((e.clientY - rect.top) / ROW);
            if (rows[row] != null && step >= 0 && step < total) cellTap(rows[row], step);
          }}
        >
          {notes.map((n, i) => {
            const r = rows.indexOf(n.pitch);
            if (r < 0) return null;
            return <div key={i} className={`roll-note ${part}`} style={{ left: n.start * CELL + 1, top: r * ROW + 2, width: n.len * CELL - 2, height: ROW - 4 }} />;
          })}
          {currentStep != null && <div className="roll-head" style={{ left: (currentStep % total) * CELL }} />}
        </div>
      </div>
    </div>
  );
}

export default function NotesEditor({ sketch, change, player, currentStep, fixedPart }) {
  const [partPick, setPart] = useState('melody');
  const part = fixedPart || partPick;
  const [noteLen, setNoteLen] = useState(2);
  const [bassStyle, setBassStyle] = useState('trap');
  const { minor } = scaleOf(sketch.key);
  const progs = minor ? PROGRESSIONS.minor : PROGRESSIONS.major;

  const setChord = (bar, deg) => {
    const chords = Array.from({ length: sketch.bars }, (_, i) => sketch.chords[i] ?? null);
    chords[bar] = deg;
    change({ chords });
    if (deg != null) player.preview({ inst: sketch.instruments.chords, midi: chordNotes(sketch.key, deg, 57)[0] });
  };

  return (
    <div className="stack notes-ed">
      {!fixedPart && (
      <div className="segmented parts">
        {[
          ['melody', 'Melodia'],
          ['bass', '808'],
          ['chords', 'Accordi'],
        ].map(([k, l]) => (
          <button key={k} className={part === k ? 'on' : ''} onClick={() => setPart(k)}>
            {l}
          </button>
        ))}
      </div>
      )}

      {part === 'melody' && (
        <div className="chips scroll-x">
          {INSTRUMENTS.filter((i) => i.id !== 'bass808').map((i) => (
            <button key={i.id} className={`chip${sketch.instruments.melody === i.id ? ' on' : ''}`} onClick={() => change({ instruments: { ...sketch.instruments, melody: i.id } })}>
              {i.label}
            </button>
          ))}
        </div>
      )}

      {part !== 'chords' && (
        <>
          <div className="row notes-tools">
            <span className="fx-label">Lunghezza nota</span>
            <div className="chips">
              {LENS.map(([v, l]) => (
                <button key={v} className={`chip${noteLen === v ? ' on' : ''}`} onClick={() => setNoteLen(v)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <PianoRoll sketch={sketch} part={part} change={change} player={player} currentStep={currentStep} noteLen={noteLen} />
          <p className="muted small">Tocca un quadratino per mettere una nota, tocca la nota per toglierla. Ci sono solo le note della tonalità: suonano sempre "giuste".</p>
          <div className="row">
            {part === 'bass' && (
              <>
                <select className="input bass-style" value={bassStyle} onChange={(e) => setBassStyle(e.target.value)} aria-label="Ritmo dell'808">
                  {STYLE_ORDER.map((k) => (
                    <option key={k} value={k}>
                      Ritmo {STYLES[k].label}
                    </option>
                  ))}
                </select>
                <button className="btn sm" onClick={() => change({ notes: { ...sketch.notes, bass: bassFromChords(sketch, bassStyle) } })} disabled={!sketch.chords.some((c) => c != null)}>
                  808 dagli accordi
                </button>
              </>
            )}
            <button className="btn sm ghost" onClick={() => confirm('Cancellare tutte le note di questa parte?') && change({ notes: { ...sketch.notes, [part]: [] } })}>
              Svuota
            </button>
          </div>
          {part === 'bass' && !sketch.chords.some((c) => c != null) && <p className="muted small">Per creare l'808 in automatico, scegli prima gli accordi.</p>}
        </>
      )}

      {part === 'chords' && (
        <>
          <div className="field">
            <span className="field-label">Giri pronti ({minor ? 'minore' : 'maggiore'})</span>
            <div className="chips">
              {progs.map((pr) => (
                <button key={pr.id} className="chip" onClick={() => change({ chords: chordsFromProgression(pr.degrees, sketch.bars) })}>
                  {pr.label} · {pr.degrees.map((d) => chordLabel(sketch.key, d)).join(' ')}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Suono</span>
            <div className="chips">
              {INSTRUMENTS.filter((i) => ['pad', 'piano', 'pluck', 'bell'].includes(i.id)).map((i) => (
                <button key={i.id} className={`chip${sketch.instruments.chords === i.id ? ' on' : ''}`} onClick={() => change({ instruments: { ...sketch.instruments, chords: i.id } })}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>
          <div className="chord-bars">
            {Array.from({ length: sketch.bars }, (_, bar) => {
              const now = currentStep != null && Math.floor((currentStep % (sketch.bars * 16)) / 16) === bar;
              return (
                <div key={bar} className={`chord-bar${now ? ' now' : ''}`}>
                  <span className="fx-label">Batt. {bar + 1}</span>
                  <select className="input" value={sketch.chords[bar] ?? ''} onChange={(e) => setChord(bar, e.target.value === '' ? null : Number(e.target.value))}>
                    <option value="">— nessuno —</option>
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <option key={d} value={d}>
                        {chordLabel(sketch.key, d)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          <button className="btn sm ghost" onClick={() => change({ chords: [] })}>
            Togli gli accordi
          </button>
        </>
      )}
    </div>
  );
}
