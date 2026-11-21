import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { db, updateSketch } from '../../db/db.js';
import { KEYS, keyShort } from '../../constants.js';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useTapTempo } from '../../components/useTapTempo.js';
import ExportRow, { slug } from '../studio/ExportRow.jsx';
import { PARTS, normalizeSketch } from './music.js';
import { renderSketchWav } from './synth.js';
import { SketchPlayer } from './player.js';
import DrumMachine from './DrumMachine.jsx';
import NotesEditor from './NotesEditor.jsx';

const TABS = [
  ['hum', '🎤 Canticchia'],
  ['drums', '🥁 Batteria'],
  ['notes', '🎹 Note'],
  ['mix', '🎚 Mix'],
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

  const prepAudio = async () => {
    const { blob } = await renderSketchWav(sketch, { loops: 2 });
    return [new File([blob], `${slug(sketch.title)} (${sketch.bpm} BPM ${sketch.key}).wav`, { type: 'audio/wav' })];
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
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            {l}
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
                </div>
              );
            })}
          </div>
        )}
        {tab === 'notes' && <NotesEditor sketch={sketch} change={change} player={player} currentStep={currentStep} />}
        {tab === 'hum' && (
          <div className="empty">
            <p>🎤 Canticchia la melodia</p>
            <p className="muted">In arrivo nella prossima parte. Intanto crea il groove nella Batteria e la melodia nelle Note.</p>
          </div>
        )}
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
              Il produttore riceve la tua idea con BPM ({sketch.bpm}) e tonalità ({keyShort(sketch.key)}) nel nome del file. Il file MIDI con le note arriva nella
              prossima parte.
            </p>
            <ExportRow key={JSON.stringify(sketch).length} primary icon="beat" title="Audio della bozza" subtitle="2 giri del loop in WAV, da mandare su WhatsApp." prepare={prepAudio} />
          </div>
        </Sheet>
      )}
    </div>
  );
}
