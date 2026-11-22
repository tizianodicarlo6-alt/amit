import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import BeatLoop, { decodeBeat, sliceWav } from '../../components/BeatLoop.jsx';
import RhymeSheet from '../../components/RhymeSheet.jsx';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addIdea, addTrack, db, newId, updateIdea, updateTrack } from '../../db/db.js';
import { importBeatFiles } from '../../lib/beatImport.js';
import { countLineSyllables } from '../../lib/italiano.js';
import { wordAt } from '../../lib/rimario.js';
import MelodyBar, { decodeTake, selectedTake } from '../editor/MelodyBar.jsx';

const KEY = 'amit.nanana';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};
const save = (v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignorato */
  }
};

/** Le sillabe della melodia come "pallini": lunghi = note tenute, pieni = accenti. */
function SylPattern({ syl }) {
  return (
    <span className="sylpat" aria-hidden>
      {syl.map((s, i) => (
        <span key={i} className={`sp${s.accent ? ' acc' : ''}`} style={{ width: Math.max(8, Math.min(40, s.dur * 60)) }} />
      ))}
    </span>
  );
}

// 🎤 Nanana: beat al volo → scegli il pezzo → canti → frasi e sillabe → parole
export default function NananaPage() {
  const navigate = useNavigate();
  const [s, setS] = useState(load); // { beatId, region, melody, lines }
  const set = (c) => setS((o) => ({ ...o, ...c }));
  useEffect(() => save(s), [s]);
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const beat = beats.find((b) => b.id === s.beatId) || null;
  const [overlay, setOverlay] = useState(null);
  const [pauseSig, setPauseSig] = useState(0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState('');
  const [rimario, setRimario] = useState(null);
  const fileRef = useRef(null);
  const focused = useRef({ i: 0, pos: 0 });
  const playerRef = useRef(null);

  const take = s.melody ? selectedTake(s.melody) : null;
  const phrases = take?.phrases || [];
  const lines = s.lines || [];
  const setLine = (i, v) => {
    const next = [...lines];
    next[i] = v;
    set({ lines: next });
  };

  // ascolta solo una frase (beat + nanana)
  const playPhrase = async (p) => {
    setPauseSig((n) => n + 1);
    const d = await decodeBeat(beat.audioId);
    const samples = await decodeTake(take.audioId, d.buf.sampleRate);
    const from = Math.max(0, take.from + p.start - 0.15);
    const to = take.from + p.end + 0.25;
    const url = URL.createObjectURL(sliceWav(d.buf, from, to, { from: take.from, samples }));
    if (!playerRef.current) {
      playerRef.current = new Audio();
      playerRef.current.setAttribute('playsinline', '');
    }
    const a = playerRef.current;
    if (a.src) URL.revokeObjectURL(a.src);
    a.src = url;
    a.play().catch(() => {});
  };

  const onFile = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy('beat');
    const { ids } = await importBeatFiles(files);
    setBusy('');
    if (ids[0]) {
      set({ beatId: ids[0], region: null, melody: null });
      setPicking(false);
    }
  };

  const toNote = async () => {
    const text = lines.filter((l) => l?.trim()).join('\n');
    if (!text) return alert('Scrivi prima qualche parola sotto le frasi.');
    const id = await addIdea({ type: 'text', text, tags: ['nanana'] });
    await updateIdea(id, { beatId: beat?.id || null, loop: s.region || null });
    alert('Salvata nel taccuino');
  };

  const toTrack = async () => {
    const tid = await addTrack({ title: lines.find((l) => l?.trim())?.slice(0, 40) || 'Nuova traccia' });
    const secId = newId();
    await updateTrack(tid, {
      beatId: beat.id,
      bpm: beat.bpm || null,
      sections: [{ id: secId, type: 'ritornello', text: lines.join('\n').replace(/\n+$/, '') }],
      studio: s.region ? { loops: { [secId]: s.region }, starts: { [secId]: s.region.from }, melodies: s.melody ? { [secId]: s.melody } : {} } : {},
    });
    navigate(`/traccia/${tid}`);
  };

  const reset = () => confirm('Ricominciare da capo? (il beat resta)') && set({ region: null, melody: null, lines: [] });

  return (
    <div className="page nanana">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <h1 className="grow">Nanana</h1>
        {beat && (
          <button className="btn sm ghost" onClick={() => setPicking(true)}>
            Cambia beat
          </button>
        )}
      </header>

      {(!beat || picking) && (
        <div className="stack">
          <p className="muted small">Scegli il beat su cui cercare la melodia.</p>
          <button className="btn primary" onClick={() => fileRef.current.click()} disabled={busy === 'beat'}>
            {busy === 'beat' ? <span className="spinner" /> : <Icon name="upload" size={20} />} Carica un beat
          </button>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.aif,.aiff,.flac,.ogg" hidden onChange={onFile} />
          <div className="list">
            {beats.map((b) => (
              <button key={b.id} className={`beat-pick${b.id === s.beatId ? ' on' : ''}`} onClick={() => (set({ beatId: b.id, region: b.id === s.beatId ? s.region : null, melody: b.id === s.beatId ? s.melody : null }), setPicking(false))}>
                <span className="ellipsis grow">{b.title || 'Beat'}</span>
                <span className="muted small">{[b.bpm && `${b.bpm} BPM`, b.key].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {beat && !picking && (
        <>
          <BeatLoop beat={beat} region={s.region || null} onRegion={(r) => set({ region: r })} overlay={overlay} pauseSignal={pauseSig}>
            <MelodyBar melody={s.melody} onChange={(m) => set({ melody: m })} beat={beat} region={s.region || null} onOverlay={setOverlay} onPause={() => setPauseSig((n) => n + 1)} />
          </BeatLoop>

          {!take && <p className="muted small nn-hint">1. Trascina il dito sul beat per scegliere il pezzo · 2. Premi 🎤 Nanana e canta · 3. Qui sotto compaiono le frasi con le sillabe.</p>}

          {take && phrases.length > 0 && (
            <div className="stack nn-phrases">
              <div className="row between">
                <span className="field-label">Trasforma in parole</span>
                <button className="btn sm" onPointerDown={(e) => e.preventDefault()} onClick={() => setRimario(wordAt(lines[focused.current.i] || '', focused.current.pos))}>
                  Rimario
                </button>
              </div>
              {phrases.map((p, i) => {
                const n = lines[i]?.trim() ? countLineSyllables(lines[i]) : 0;
                const cls = !n ? '' : n === p.syllables ? ' fit' : Math.abs(n - p.syllables) <= 1 ? ' near' : ' off';
                return (
                  <div key={i} className="nn-phrase">
                    <div className="nn-top">
                      <button className="icon-btn sm" onClick={() => playPhrase(p)} aria-label={`Ascolta la frase ${i + 1}`}>
                        <Icon name="play" size={16} />
                      </button>
                      <span className="nn-n">{p.syllables} sillabe</span>
                      <SylPattern syl={p.syl || []} />
                    </div>
                    <div className="nn-line">
                      <input
                        className="input"
                        value={lines[i] || ''}
                        onChange={(e) => setLine(i, e.target.value)}
                        onFocus={(e) => (focused.current = { i, pos: e.target.selectionStart })}
                        onSelect={(e) => (focused.current = { i, pos: e.target.selectionStart })}
                        placeholder={`Parole per la frase ${i + 1}…`}
                        autoCapitalize="sentences"
                      />
                      <span className={`nn-count${cls}`}>{n ? `${n}/${p.syllables}` : ''}</span>
                    </div>
                  </div>
                );
              })}
              <p className="muted small">Pallini lunghi = note tenute, pallini pieni = accenti: metti lì le sillabe forti delle parole. Verde = le sillabe tornano.</p>
              <div className="row">
                <button className="btn primary grow" onClick={toTrack}>
                  Porta in una traccia
                </button>
                <button className="btn" onClick={toNote}>
                  Salva nota
                </button>
              </div>
              <button className="btn ghost sm" onClick={reset}>
                Ricomincia
              </button>
            </div>
          )}
          {take && phrases.length === 0 && <p className="muted small nn-hint">Non ho trovato frasi chiare: riprova cantando più vicino al telefono, staccando le frasi.</p>}
        </>
      )}
      {rimario && <RhymeSheet word={rimario.word} prev={rimario.prev} onClose={() => setRimario(null)} />}
    </div>
  );
}
