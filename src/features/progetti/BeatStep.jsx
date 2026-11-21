import { useRef, useState } from 'react';
import { useDbQuery } from '../../db/useDbQuery.js';
import { db, updateTrack } from '../../db/db.js';
import { importBeatFiles } from '../../lib/beatImport.js';
import Icon from '../../components/Icon.jsx';
import WaveformPlayer from '../../components/WaveformPlayer.jsx';
import { BeatMeta } from '../beat/BeatPage.jsx';

// Passo ① della traccia: il beat (scegli dalla libreria o importa)
export default function BeatStep({ track, onNext }) {
  const beats = useDbQuery(() => db.beats.orderBy('createdAt').reverse().toArray(), [], []) || [];
  const current = beats.find((b) => b.id === track.beatId) || null;
  const [choosing, setChoosing] = useState(false);
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState([]);
  const fileRef = useRef(null);

  const choose = async (b) => {
    await updateTrack(track.id, { beatId: b.id, bpm: b.bpm ?? track.bpm ?? null });
    setChoosing(false);
  };

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])].slice(0, 1);
    e.target.value = '';
    if (!files.length) return;
    const { ids, failed } = await importBeatFiles(files, setProgress);
    setErrors(failed);
    if (ids[0]) {
      const b = await db.beats.get(ids[0]);
      await choose(b);
    }
  };

  const showList = choosing || !current;
  return (
    <div className="stack step-body">
      {current && !choosing && (
        <div className="card stack">
          <div className="row between">
            <div className="min0">
              <div className="field-label">Il beat di questa traccia</div>
              <div className="track-title">{current.title}</div>
              <BeatMeta beat={current} />
            </div>
          </div>
          <WaveformPlayer key={current.id} audioId={current.audioId} peaks={current.peaks} duration={current.duration} />
          <button className="btn ghost" onClick={() => setChoosing(true)}>
            Cambia beat
          </button>
        </div>
      )}

      {showList && (
        <>
          <p className="muted">{current ? 'Scegli un altro beat:' : 'Prima di tutto, scegli il beat su cui scrivere.'}</p>
          <button className="btn primary big" onClick={() => fileRef.current.click()} disabled={!!progress}>
            <Icon name="plus" /> Importa un beat dal telefono
          </button>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.aif,.aiff,.flac,.ogg" hidden onChange={onFiles} />
          {progress && (
            <div className="notice row">
              <span className="spinner" /> {progress}
            </div>
          )}
          {errors.length > 0 && <div className="notice error-box">{errors.join(' · ')}</div>}
          {beats.length > 0 && (
            <>
              <span className="field-label">Oppure dalla tua libreria</span>
              <div className="list">
                {beats.map((b) => (
                  <button key={b.id} className={`card pick beat-pick${b.id === track.beatId ? ' sel' : ''}`} onClick={() => choose(b)}>
                    <div className="track-title">{b.title}</div>
                    <BeatMeta beat={b} />
                  </button>
                ))}
              </div>
            </>
          )}
          {current && (
            <button className="btn ghost" onClick={() => setChoosing(false)}>
              Annulla
            </button>
          )}
        </>
      )}

      {current && !choosing && (
        <button className="btn primary big" onClick={onNext}>
          Avanti: scrivi il testo →
        </button>
      )}
    </div>
  );
}
