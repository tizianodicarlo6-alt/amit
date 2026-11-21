import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addBeat, addTrack, db, updateSketch, updateTrack } from '../../db/db.js';
import { computePeaks } from '../../lib/audio.js';
import { encodeWav } from '../../lib/wav.js';
import { sketchToMidi } from './midi.js';
import { KEYS, keyShort } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useTapTempo } from '../../components/useTapTempo.js';
import ExportRow, { slug } from '../studio/ExportRow.jsx';
import {
  INSTRUMENTS,
  PROGRESSIONS,
  STYLES,
  STYLE_ORDER,
  bassFromChords,
  chordLabel,
  chordsForMelody,
  chordsFromProgression,
  drumsFromStyle,
  normalizeSketch,
  scaleOf,
  transposeSketch,
} from './music.js';
import { renderSketch, renderSketchWav } from './synth.js';
import { SketchPlayer } from './player.js';
import DrumMachine, { OwnSound } from './DrumMachine.jsx';
import NotesEditor from './NotesEditor.jsx';
import HumRecorder from './HumRecorder.jsx';

// Pitch di una parte: semitoni e ottave
function PitchCtl({ value = 0, onChange }) {
  const set = (v) => onChange(Math.max(-24, Math.min(24, v)));
  return (
    <div className="pitch-ctl">
      <span className="fx-label">Pitch</span>
      <button className="btn sm" onClick={() => set(value - 12)} aria-label="Ottava giù">
        −8va
      </button>
      <button className="btn sm" onClick={() => set(value - 1)} aria-label="Semitono giù">
        −
      </button>
      <span className="mono pitch-val">
        {value > 0 ? '+' : ''}
        {value} st
      </span>
      <button className="btn sm" onClick={() => set(value + 1)} aria-label="Semitono su">
        +
      </button>
      <button className="btn sm" onClick={() => set(value + 12)} aria-label="Ottava su">
        +8va
      </button>
    </div>
  );
}

// Volume + muto di una parte
function VolCtl({ m, onChange }) {
  return (
    <div className="vol-row">
      <button className={`mute${m.mute ? ' on' : ''}`} onClick={() => onChange({ mute: !m.mute })} aria-label="Muto">
        M
      </button>
      <input className="slider" type="range" min={0} max={1} step={0.05} value={m.vol} onChange={(e) => onChange({ vol: Number(e.target.value) })} />
      <span className="small mono vol-val">{Math.round(m.vol * 100)}%</span>
    </div>
  );
}

// La bozza di beat in una sola pagina: stile, melodia, accordi, 808, batteria.
export default function SketchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const stored = useDbQuery(() => db.sketches.get(id).then((s) => s ?? null), [id], undefined);
  const [sketch, setSketch] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [sheet, setSheet] = useState(null); // settings | export | hum | melody | bass | drums
  const [beatState, setBeatState] = useState(null); // "Usa come beat"
  const playerRef = useRef(null);
  if (!playerRef.current) playerRef.current = new SketchPlayer();
  const player = playerRef.current;
  const saveTimer = useRef(0);
  const renderTimer = useRef(0);
  const sketchRef = useRef(null);
  sketchRef.current = sketch;

  // carico una volta la bozza salvata, poi lavoro sulla copia locale
  useEffect(() => {
    if (stored && !sketch) setSketch(normalizeSketch(stored));
  }, [stored, sketch]);

  useEffect(() => () => player.dispose(), [player]);

  // testina mentre suona
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => {
      setPos(player.position());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, player]);

  // ogni modifica: salvo (dopo un attimo) e, se suona, aggiorno il loop
  const change = useCallback(
    (changes) => {
      setSketch((s) => {
        const next = { ...s, ...changes };
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => updateSketch(id, next), 400);
        if (player.playing) {
          clearTimeout(renderTimer.current);
          renderTimer.current = setTimeout(() => player.play(sketchRef.current, { keepPosition: true }), 180);
        }
        return next;
      });
    },
    [id, player]
  );

  // salvo subito uscendo
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      if (sketchRef.current) updateSketch(id, sketchRef.current);
    },
    [id]
  );

  const tap = useTapTempo((b) => change({ bpm: b }));

  // suona subito (da chiamare dentro un tocco)
  const playNow = () => {
    player.prime();
    setLoading(true);
    setTimeout(async () => {
      try {
        await player.play(sketchRef.current);
        setPlaying(true);
      } catch {
        /* l'utente può premere ▶ */
      }
      setLoading(false);
    }, 80);
  };

  const onPlay = async () => {
    player.prime(); // dentro il tocco
    if (playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      await player.play(sketch);
      setPlaying(true);
    } catch (e) {
      alert(`Non riesco a suonare la bozza (${e?.message || e}).`);
    } finally {
      setLoading(false);
    }
  };

  if (stored === undefined || (stored && !sketch)) return <div className="studio" />;
  if (!stored) return <div className="page empty">Bozza non trovata.</div>;

  const stepDur = 60 / sketch.bpm / 4;
  const currentStep = playing ? Math.floor(pos / stepDur) : null;
  const bar = currentStep != null ? Math.floor(currentStep / 16) + 1 : 1;
  const beatN = currentStep != null ? Math.floor((currentStep % 16) / 4) + 1 : 1;
  const { minor } = scaleOf(sketch.key);
  const progs = minor ? PROGRESSIONS.minor : PROGRESSIONS.major;
  const hasChords = sketch.chords.some((c) => c != null);
  const melodyCount = sketch.notes.melody.length;
  const drumHits = Object.values(sketch.drums).reduce((n, r) => n + r.slice(0, sketch.drumSteps).filter(Boolean).length, 0);
  const setMix = (part, c) => change({ mix: { ...sketch.mix, [part]: { ...sketch.mix[part], ...c } } });
  const setPitch = (part, v) => change({ partPitch: { ...sketch.partPitch, [part]: v } });

  // ① stile: batteria, swing, BPM, ritmo dell'808 e suono degli accordi in un tocco
  const applyStyle = (k) => {
    const st = STYLES[k];
    const changes = { style: k, drums: drumsFromStyle(k), drumSteps: 16, swing: st.swing || 0, bpm: st.bpm, instruments: { ...sketch.instruments, chords: k === 'lofi' || k === 'rnb' ? 'piano' : 'pad' } };
    if (hasChords) changes.notes = { ...sketch.notes, bass: bassFromChords(sketch, k) };
    change(changes);
    if (!playing) playNow();
  };

  const baseName = `${slug(sketch.title)} (${sketch.bpm} BPM ${sketch.key})`;
  const prepAudio = async () => {
    const samples = await player.loadSamples(sketch);
    const { blob } = await renderSketchWav(sketch, { loops: 2, samples });
    return [new File([blob], `${baseName}.wav`, { type: 'audio/wav' })];
  };
  const prepMidi = async () => [new File([sketchToMidi(sketch, { loops: 2 })], `${baseName}.mid`, { type: 'audio/midi' })];
  const prepBoth = async () => [...(await prepAudio()), ...(await prepMidi())];

  // "Usa come beat": la bozza (ripetuta per ~2 minuti) va nella Libreria
  const useAsBeat = async () => {
    setBeatState({ busy: true });
    try {
      const loopDur = (sketch.bars * 4 * 60) / sketch.bpm;
      const loops = Math.max(1, Math.ceil(120 / loopDur));
      const samples = await player.loadSamples(sketch);
      const r = await renderSketch(sketch, { loops, samples });
      const blob = encodeWav([r.L, r.R], r.sr);
      const beatId = await addBeat({ blob, mime: 'audio/wav', title: sketch.title || 'Bozza', producer: 'bozza Amit', bpm: sketch.bpm, key: sketch.key, duration: r.L.length / r.sr, peaks: computePeaks(r.L) });
      setBeatState({ beatId });
    } catch (e) {
      setBeatState({ error: e?.message || String(e) });
    }
  };
  const writeOnIt = async () => {
    const tid = await addTrack({ title: sketch.title || 'Nuova traccia' });
    await updateTrack(tid, { beatId: beatState.beatId, bpm: sketch.bpm });
    navigate(`/traccia/${tid}`);
  };

  return (
    <div className="studio sketch">
      <header className="studio-head">
        <button className="icon-btn" onClick={() => navigate('/beat?tab=bozze')} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <div className="grow min0">
          <div className="studio-kicker">Bozza beat</div>
          <input className="sketch-title" value={sketch.title || ''} onChange={(e) => change({ title: e.target.value })} aria-label="Nome della bozza" />
        </div>
        <button className="btn sm" onClick={() => setSheet('settings')}>
          {sketch.bpm} BPM · {sketch.key}
        </button>
      </header>

      <div className="sketch-body">
        {/* ① STILE */}
        <section className="sk-card">
          <div className="sk-head">
            <span className="sk-n">1</span>
            <h2>Stile</h2>
          </div>
          <div className="chips">
            {STYLE_ORDER.map((k) => (
              <button key={k} className={`chip${sketch.style === k ? ' on' : ''}`} onClick={() => applyStyle(k)}>
                {STYLES[k].label}
              </button>
            ))}
          </div>
          <p className="muted small">Un tocco e hai già la batteria e il tempo giusto. Poi aggiungi il resto.</p>
        </section>

        {/* ② MELODIA */}
        <section className={`sk-card${sketch.mix.melody.mute ? ' muted-part' : ''}`}>
          <div className="sk-head">
            <span className="sk-n">2</span>
            <h2>Melodia</h2>
            <span className="muted small grow right">{melodyCount ? `${melodyCount} note` : 'vuota'}</span>
          </div>
          <div className="row">
            <button className="btn primary grow" onClick={() => setSheet('hum')}>
              🎤 Canta
            </button>
            <button className="btn grow" onClick={() => setSheet('melody')}>
              ✏️ Scrivi
            </button>
          </div>
          <div className="chips scroll-x">
            {INSTRUMENTS.filter((i) => i.id !== 'bass808').map((i) => (
              <button key={i.id} className={`chip${sketch.instruments.melody === i.id ? ' on' : ''}`} onClick={() => change({ instruments: { ...sketch.instruments, melody: i.id } })}>
                {i.label}
              </button>
            ))}
          </div>
          <PitchCtl value={sketch.partPitch.melody} onChange={(v) => setPitch('melody', v)} />
          <VolCtl m={sketch.mix.melody} onChange={(c) => setMix('melody', c)} />
        </section>

        {/* ③ ACCORDI */}
        <section className={`sk-card${sketch.mix.chords.mute ? ' muted-part' : ''}`}>
          <div className="sk-head">
            <span className="sk-n">3</span>
            <h2>Accordi</h2>
            <span className="muted small grow right">{hasChords ? sketch.chords.map((d) => chordLabel(sketch.key, d)).join(' · ') : 'nessuno'}</span>
          </div>
          <div className="chips">
            {melodyCount > 0 && (
              <button className="chip" onClick={() => change({ chords: chordsForMelody(sketch.notes.melody, sketch.key, sketch.bars, sketch.style || 'trap') })}>
                ✨ Dalla melodia
              </button>
            )}
            {progs.map((pr) => (
              <button key={pr.id} className="chip" onClick={() => change({ chords: chordsFromProgression(pr.degrees, sketch.bars) })}>
                {pr.label}
              </button>
            ))}
            {hasChords && (
              <button className="chip" onClick={() => change({ chords: [] })}>
                Nessuno
              </button>
            )}
          </div>
          <div className="chips scroll-x">
            {INSTRUMENTS.filter((i) => ['pad', 'piano', 'pluck', 'bell'].includes(i.id)).map((i) => (
              <button key={i.id} className={`chip${sketch.instruments.chords === i.id ? ' on' : ''}`} onClick={() => change({ instruments: { ...sketch.instruments, chords: i.id } })}>
                {i.label}
              </button>
            ))}
          </div>
          <PitchCtl value={sketch.partPitch.chords} onChange={(v) => setPitch('chords', v)} />
          <VolCtl m={sketch.mix.chords} onChange={(c) => setMix('chords', c)} />
        </section>

        {/* ④ 808 */}
        <section className={`sk-card${sketch.mix.bass.mute ? ' muted-part' : ''}`}>
          <div className="sk-head">
            <span className="sk-n">4</span>
            <h2>808</h2>
            <span className="muted small grow right">{sketch.notes.bass.length ? `${sketch.notes.bass.length} note` : 'vuoto'}</span>
          </div>
          <div className="row">
            <button className="btn primary grow" onClick={() => change({ notes: { ...sketch.notes, bass: bassFromChords(sketch, sketch.style || 'trap') } })} disabled={!hasChords}>
              Dagli accordi
            </button>
            <button className="btn grow" onClick={() => setSheet('bass')}>
              ✏️ Scrivi
            </button>
          </div>
          {!hasChords && <p className="muted small">Scegli prima gli accordi: l'808 li segue.</p>}
          <OwnSound part="bass" label="Il tuo 808" sketch={sketch} change={change} player={player} preview={{ inst: 'bass808', midi: 33 + (sketch.partPitch.bass || 0) }} />
          <PitchCtl value={sketch.partPitch.bass} onChange={(v) => setPitch('bass', v)} />
          <VolCtl m={sketch.mix.bass} onChange={(c) => setMix('bass', c)} />
        </section>

        {/* ⑤ BATTERIA */}
        <section className={`sk-card${sketch.mix.drums.mute ? ' muted-part' : ''}`}>
          <div className="sk-head">
            <span className="sk-n">5</span>
            <h2>Batteria</h2>
            <span className="muted small grow right">{drumHits ? `${drumHits} colpi · swing ${sketch.swing}%` : 'vuota'}</span>
          </div>
          <button className="btn" onClick={() => setSheet('drums')}>
            ✏️ Modifica la batteria e i tuoi suoni
          </button>
          <VolCtl m={sketch.mix.drums} onChange={(c) => setMix('drums', c)} />
        </section>

        {/* TUTTO IL BEAT */}
        <section className="sk-card">
          <div className="sk-head">
            <h2>Tutto il beat</h2>
          </div>
          <div className="pitch-ctl">
            <span className="fx-label">Trasponi</span>
            <button className="btn sm" onClick={() => change(transposeSketch(sketch, -1))} aria-label="Tutto un semitono giù">
              −
            </button>
            <span className="mono pitch-val">{keyShort(sketch.key)}</span>
            <button className="btn sm" onClick={() => change(transposeSketch(sketch, 1))} aria-label="Tutto un semitono su">
              +
            </button>
          </div>
          <p className="muted small">Sposta tutto più in alto o più in basso (cambia la tonalità): utile per la tua voce.</p>
        </section>
      </div>

      <div className="transport sketch-transport">
        <span className="mono sketch-pos">
          {bar}.{beatN}
        </span>
        <button className="play-main" onClick={onPlay} disabled={loading} aria-label={playing ? 'Stop' : 'Suona'}>
          {loading ? <span className="spinner big" /> : <Icon name={playing ? 'stop' : 'play'} size={34} />}
        </button>
        <button className="btn sm primary" onClick={() => setSheet('export')}>
          Manda al produttore
        </button>
      </div>

      {sheet === 'hum' && (
        <Sheet open onClose={() => setSheet(null)} title="Canta la melodia">
          <HumRecorder
            sketch={sketch}
            change={change}
            player={player}
            onDone={() => {
              setSheet(null);
              playNow();
            }}
          />
        </Sheet>
      )}
      {sheet === 'melody' && (
        <Sheet open onClose={() => setSheet(null)} title="Melodia">
          <NotesEditor sketch={sketch} change={change} player={player} currentStep={currentStep} fixedPart="melody" />
        </Sheet>
      )}
      {sheet === 'bass' && (
        <Sheet open onClose={() => setSheet(null)} title="808">
          <NotesEditor sketch={sketch} change={change} player={player} currentStep={currentStep} fixedPart="bass" />
        </Sheet>
      )}
      {sheet === 'drums' && (
        <Sheet open onClose={() => setSheet(null)} title="Batteria">
          <DrumMachine sketch={sketch} change={change} player={player} currentStep={currentStep} />
        </Sheet>
      )}

      {sheet === 'settings' && (
        <Sheet open onClose={() => setSheet(null)} title="Impostazioni bozza">
          <div className="stack">
            <div className="field">
              <span className="field-label">BPM</span>
              <div className="row">
                <input className="input bpm-input" type="number" inputMode="numeric" value={sketch.bpm} onChange={(e) => change({ bpm: Math.max(50, Math.min(220, Number(e.target.value) || 0)) || 90 })} />
                <button className="btn tap" onClick={tap}>
                  Tap a tempo
                </button>
              </div>
            </div>
            <label className="field">
              <span className="field-label">Tonalità</span>
              <select className="input" value={sketch.key} onChange={(e) => change({ key: e.target.value })}>
                {KEYS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.full}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field-label">Lunghezza del loop</span>
              <div className="chips">
                {[2, 4, 8].map((b) => (
                  <button key={b} className={`chip${sketch.bars === b ? ' on' : ''}`} onClick={() => change({ bars: b })}>
                    {b} battute
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Sheet>
      )}
      {sheet === 'export' && (
        <Sheet open onClose={() => setSheet(null)} title="Manda al produttore">
          <div className="stack">
            <p className="muted small">
              Il produttore riceve l'<b>audio</b> per ascoltarla subito e il <b>MIDI</b> con le note esatte (batteria, melodia, accordi e 808 su tracce separate),
              con BPM ({sketch.bpm}) e tonalità ({keyShort(sketch.key)}). Lo apre in FL Studio, Logic o Ableton.
            </p>
            <ExportRow key={`b${JSON.stringify(sketch).length}`} primary icon="share" title="Audio + MIDI" subtitle="I due file insieme: poi scegli WhatsApp e il produttore." prepare={prepBoth} />
            <ExportRow key={`a${JSON.stringify(sketch).length}`} icon="beat" title="Solo audio" subtitle="WAV, 2 giri del loop." prepare={prepAudio} />
            <ExportRow key={`m${JSON.stringify(sketch).length}`} icon="tracce" title="Solo MIDI" subtitle="Le note, da aprire nel programma del produttore." prepare={prepMidi} />
            <div className="divider" />
            <div className="export-row">
              <div className="reco-title">Usa come beat</div>
              <div className="muted small">La bozza va nella tua Libreria (ripetuta per circa 2 minuti): ci scrivi e registri sopra.</div>
              {!beatState?.beatId ? (
                <button className="btn" onClick={useAsBeat} disabled={beatState?.busy}>
                  {beatState?.busy ? <span className="spinner" /> : <Icon name="beat" size={20} />} {beatState?.busy ? 'Preparo…' : 'Metti nella Libreria'}
                </button>
              ) : (
                <>
                  <p className="ok small">✓ Aggiunta alla Libreria dei beat</p>
                  <button className="btn primary" onClick={writeOnIt}>
                    <Icon name="pen" size={20} /> Scrivi una traccia su questo beat
                  </button>
                </>
              )}
              {beatState?.error && <p className="error small">{beatState.error}</p>}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
