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
import { PARTS, normalizeSketch, sectionLabels, songBars, transposeSketch } from './music.js';
import StructureEditor from './StructureEditor.jsx';
import LayersEditor from './LayersEditor.jsx';
import { renderSketch, renderSketchWav } from './synth.js';
import { SketchPlayer } from './player.js';
import DrumMachine, { OwnSound } from './DrumMachine.jsx';
import NotesEditor from './NotesEditor.jsx';
import HumRecorder from './HumRecorder.jsx';
import PitchCtl from './PitchCtl.jsx';

const TABS = [
  ['drums', '🥁', 'Batteria'],
  ['hum', '🎤', 'Canta'],
  ['notes', '🎹', 'Note'],
  ['layers', '🎧', 'Sample'],
  ['struct', '🧱', 'Struttura'],
  ['mix', '🎚', 'Mix'],
];

// La bozza di beat: batteria, note, accordi, mix. Suona in loop.
export default function SketchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const stored = useDbQuery(() => db.sketches.get(id).then((s) => s ?? null), [id], undefined);
  const [sketch, setSketch] = useState(null);
  const [tab, setTab] = useState('drums');
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [sheet, setSheet] = useState(null); // 'settings' | 'export'
  const [beatState, setBeatState] = useState(null); // "Usa come beat"
  const [song, setSongState] = useState(false); // false = suona il loop, true = tutto il brano
  const songRef = useRef(false);
  const setSong = (v) => {
    songRef.current = v;
    setSongState(v);
  };
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
          renderTimer.current = setTimeout(() => player.play(sketchRef.current, { keepPosition: true, song: songRef.current && sketchRef.current.structure.length > 0 }), 180);
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

  // suona subito (da chiamare dentro un tocco). at = secondo da cui partire
  const playNow = (opts = {}) => {
    player.prime();
    setLoading(true);
    setTimeout(async () => {
      try {
        await player.play(sketchRef.current, { song: songRef.current && sketchRef.current.structure.length > 0, ...opts });
        setPlaying(true);
      } catch {
        /* l'utente può premere ▶ */
      }
      setLoading(false);
    }, 60);
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
      await player.play(sketch, { song: song && sketch.structure.length > 0 });
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
  const hasSong = sketch.structure.length > 0;
  const songOn = song && hasSong;
  const absStep = playing ? Math.floor(pos / stepDur) : null;
  // nel brano: in che parte siamo e a che punto del loop
  const sBars = songOn ? songBars(sketch) : null;
  const sBar = absStep != null && sBars ? sBars[Math.min(sBars.length - 1, Math.floor(absStep / 16))] : null;
  const currentStep = absStep == null ? null : sBar ? sBar.patternBar * 16 + (absStep % 16) : absStep;
  const currentSec = sBar ? sBar.sec : null;
  const bar = absStep != null ? Math.floor(absStep / 16) + 1 : 1;
  const beatN = absStep != null ? Math.floor((absStep % 16) / 4) + 1 : 1;
  const secLabel = currentSec != null ? sectionLabels(sketch.structure)[currentSec] : null;
  const playFromBar = (b) => {
    setSong(true);
    playNow({ song: true, at: b * 16 * stepDur });
  };

  const baseName = `${slug(sketch.title)} (${sketch.bpm} BPM ${sketch.key})`;
  const prepAudio = async () => {
    const samples = await player.loadSamples(sketch);
    const { blob } = await renderSketchWav(sketch, { loops: 2, samples, song: hasSong });
    return [new File([blob], `${baseName}.wav`, { type: 'audio/wav' })];
  };
  const prepMidi = async () => [new File([sketchToMidi(sketch, { loops: 2, song: hasSong })], `${baseName}.mid`, { type: 'audio/midi' })];
  const prepBoth = async () => [...(await prepAudio()), ...(await prepMidi())];

  // "Usa come beat": la bozza (ripetuta per ~2 minuti) va nella Libreria
  const useAsBeat = async () => {
    setBeatState({ busy: true });
    try {
      const loopDur = (sketch.bars * 4 * 60) / sketch.bpm;
      const loops = Math.max(1, Math.ceil(120 / loopDur));
      const samples = await player.loadSamples(sketch);
      const r = await renderSketch(sketch, { loops, samples, song: hasSong });
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
          {sketch.bpm} BPM · {keyShort(sketch.key).split(' ')[0]} · {sketch.bars} batt.
        </button>
      </header>

      <div className="tabs studio-tabs">
        {TABS.map(([k, ico, l]) => (
          <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            <span className="tab-ico">{ico}</span>
            <span className="tab-lab">{l}</span>
          </button>
        ))}
      </div>

      <div className="sketch-body">
        {tab === 'drums' && <DrumMachine sketch={sketch} change={change} player={player} currentStep={currentStep} />}
        {tab === 'mix' && (
          <div className="stack">
            {PARTS.map((p) => {
              const m = sketch.mix[p.id];
              const setM = (c) => change({ mix: { ...sketch.mix, [p.id]: { ...m, ...c } } });
              return (
                <div key={p.id} className="mix-row">
                  <span className="mix-name">{p.label}</span>
                  <button className={`mute${m.mute ? ' on' : ''}`} onClick={() => setM({ mute: !m.mute })}>
                    M
                  </button>
                  <input className="slider" type="range" min={0} max={1} step={0.05} value={m.vol} onChange={(e) => setM({ vol: Number(e.target.value) })} />
                  <span className="small mono vol-val">{Math.round(m.vol * 100)}%</span>
                  {['melody', 'chords', 'bass'].includes(p.id) && (
                    <div className="mix-extra">
                      <PitchCtl value={sketch.partPitch?.[p.id] || 0} onChange={(v) => change({ partPitch: { ...sketch.partPitch, [p.id]: v } })} />
                      {p.id === 'bass' && <OwnSound part="bass" label="Il tuo 808" sketch={sketch} change={change} player={player} preview={{ inst: 'bass808', midi: 33 + (sketch.partPitch?.bass || 0) }} />}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="pitch-ctl">
              <span className="fx-label">Trasponi tutto</span>
              <button className="btn sm" onClick={() => change(transposeSketch(sketch, -1))} aria-label="Tutto un semitono giù">
                −
              </button>
              <span className="mono pitch-val">{keyShort(sketch.key)}</span>
              <button className="btn sm" onClick={() => change(transposeSketch(sketch, 1))} aria-label="Tutto un semitono su">
                +
              </button>
            </div>
            <p className="muted small">Pitch: alza o abbassa una parte (− + di un semitono, 8va di un'ottava). Trasponi sposta tutto il beat insieme.</p>
          </div>
        )}
        {tab === 'struct' && <StructureEditor sketch={sketch} change={change} onPlayFrom={playFromBar} currentSec={currentSec} />}
        {tab === 'layers' && <LayersEditor sketch={sketch} change={change} player={player} onPlay={() => (playing ? null : playNow())} />}
        {tab === 'notes' && <NotesEditor sketch={sketch} change={change} player={player} currentStep={currentStep} />}
        {tab === 'hum' && (
          <HumRecorder
            sketch={sketch}
            change={change}
            player={player}
            onDone={() => {
              // beat creato: lo faccio sentire subito
              setTab('notes');
              playNow();
            }}
          />
        )}
      </div>

      {hasSong && (
        <div className="segmented song-toggle">
          <button className={!songOn ? 'on' : ''} onClick={() => (setSong(false), playing && playNow({ song: false }))}>
            Solo il loop
          </button>
          <button className={songOn ? 'on' : ''} onClick={() => (setSong(true), playing && playNow({ song: true }))}>
            Tutto il brano
          </button>
        </div>
      )}
      <div className="transport sketch-transport">
        <span className="mono sketch-pos">
          {secLabel && <span className="sec-now">{secLabel}</span>}
          {bar}.{beatN}
        </span>
        <button className="play-main" onClick={onPlay} disabled={loading} aria-label={playing ? 'Stop' : 'Suona'}>
          {loading ? <span className="spinner big" /> : <Icon name={playing ? 'stop' : 'play'} size={34} />}
        </button>
        <button className="btn sm primary" onClick={() => setSheet('export')}>
          Manda al produttore
        </button>
      </div>

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
              {hasSong && ' C\'è tutto il brano con la struttura (Intro, Strofe, Ritornelli…), con i nomi delle parti nel MIDI. Il sample e la voce sono solo nell\'audio.'}
            </p>
            <ExportRow key={`b${JSON.stringify(sketch).length}`} primary icon="share" title="Audio + MIDI" subtitle="I due file insieme: poi scegli WhatsApp e il produttore." prepare={prepBoth} />
            <ExportRow key={`a${JSON.stringify(sketch).length}`} icon="beat" title="Solo audio" subtitle={hasSong ? "WAV, tutto il brano." : "WAV, 2 giri del loop."} prepare={prepAudio} />
            <ExportRow key={`m${JSON.stringify(sketch).length}`} icon="tracce" title="Solo MIDI" subtitle="Le note, da aprire nel programma del produttore." prepare={prepMidi} />
            <div className="divider" />
            <div className="export-row">
              <div className="reco-title">Usa come beat</div>
              <div className="muted small">{hasSong ? 'Tutto il brano, con la struttura, va nella tua Libreria: ci scrivi e registri sopra.' : 'La bozza va nella tua Libreria (ripetuta per circa 2 minuti): ci scrivi e registri sopra.'}</div>
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
