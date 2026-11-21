import { useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { deleteTake, db, updateTake } from '../../db/db.js';
import { formatDate, formatTime } from '../../constants.js';
import { STUDIO } from '../../config.js';

const slug = (s) => (s || 'traccia').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'traccia';
const extOf = (mime = '') => (mime.includes('wav') ? 'wav' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('aac') ? 'aac' : mime.includes('ogg') ? 'ogg' : 'mp3');

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const canShare = (files) => {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
};

// Esportazione in due passaggi: prima preparo il file, poi lo condividi (regola di iPhone).
function ExportRow({ icon, title, subtitle, prepare, shareText, primary }) {
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const doPrepare = async () => {
    setBusy(true);
    setErr('');
    try {
      setFiles(await prepare());
    } catch (e) {
      setErr(`Errore: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ files, text: shareText, title: files[0].name });
    } catch (e) {
      if (e?.name !== 'AbortError') setErr('Condivisione non riuscita: usa "Scarica".');
    }
  };

  const mb = files ? (files.reduce((n, f) => n + f.size, 0) / 1024 / 1024).toFixed(1) : null;
  return (
    <div className={`export-row${primary ? ' primary' : ''}`}>
      <div className="row">
        <Icon name={icon} />
        <div className="grow">
          <div className="reco-title">{title}</div>
          <div className="muted small">{files ? `Pronto · ${mb} MB` : subtitle}</div>
        </div>
      </div>
      {!files ? (
        <button className={`btn ${primary ? 'primary' : ''}`} onClick={doPrepare} disabled={busy}>
          {busy ? <span className="spinner" /> : null} {busy ? 'Preparo…' : 'Prepara'}
        </button>
      ) : (
        <div className="row">
          {canShare(files) && (
            <button className="btn primary grow" onClick={share}>
              <Icon name="share" size={20} /> Condividi
            </button>
          )}
          <button className="btn grow" onClick={() => files.forEach(download)}>
            <Icon name="download" size={20} /> Scarica
          </button>
        </div>
      )}
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

export default function TakesSheet({ track, beat, beatBuf, takes, selected, onSelect, onPlay, engine, loadTakeBuffer, latency, beatVol, voiceVol, onClose }) {
  const take = takes.find((t) => t.id === selected);
  const base = slug(track.title);

  const remove = async (t) => {
    if (!confirm(`Eliminare "${t.name}"?`)) return;
    await deleteTake(t.id);
  };

  const prepMix = async () => {
    const voice = { buffer: await loadTakeBuffer(take), offset: take.offset };
    const blob = await engine.renderMix({ beat: beatBuf, voice, latency, beatGain: beatVol, voiceGain: voiceVol });
    return [new File([blob], `${base} - mix (${take.name}).wav`, { type: 'audio/wav' })];
  };
  const prepVoice = async () => {
    const voice = { buffer: await loadTakeBuffer(take), offset: take.offset };
    const blob = engine.renderVoiceAligned({ voice, latency });
    return [new File([blob], `${base} - voce (${take.name}).wav`, { type: 'audio/wav' })];
  };
  const prepStudio = async () => {
    const [voiceFile] = await prepVoice();
    const files = [voiceFile];
    const rec = beat ? await db.audio.get(beat.audioId) : null;
    if (rec?.blob) files.push(new File([rec.blob], `${base} - beat.${extOf(rec.mime || rec.blob.type)}`, { type: rec.mime || rec.blob.type || 'audio/mpeg' }));
    return files;
  };
  const studioText = `Ciao ${STUDIO.name}! Ti mando voce e beat di "${track.title || 'la mia traccia'}"${track.bpm ? ` (${track.bpm} BPM)` : ''}. Vorrei info per rec, mix e master.`;

  return (
    <Sheet open onClose={onClose} title={`Take (${takes.length})`}>
      {takes.length === 0 ? (
        <p className="muted">Nessuna registrazione ancora. Premi il tasto rosso per registrare la prima take.</p>
      ) : (
        <div className="list">
          {takes.map((t) => (
            <div key={t.id} className={`card take-row${t.id === selected ? ' sel' : ''}`} onClick={() => onSelect(t.id)}>
              <button
                className="icon-btn sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(t.id);
                }}
                aria-label="Ascolta sul beat"
              >
                <Icon name="play" size={18} />
              </button>
              <div className="grow min0">
                <div className="reco-title">
                  {t.name} {t.favorite && '⭐'}
                </div>
                <div className="muted small">
                  {formatTime(t.duration)} · {formatDate(t.createdAt)}
                </div>
              </div>
              <button
                className="icon-btn sm"
                onClick={(e) => {
                  e.stopPropagation();
                  updateTake(t.id, { favorite: !t.favorite });
                }}
                aria-label={t.favorite ? 'Togli dalle preferite' : 'Segna come preferita'}
              >
                <span style={{ fontSize: 18, opacity: t.favorite ? 1 : 0.35 }}>⭐</span>
              </button>
              <button
                className="icon-btn sm"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(t);
                }}
                aria-label="Elimina take"
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {take && beatBuf && (
        <div className="stack">
          <h2 className="section-title">Esporta "{take.name}"</h2>
          <ExportRow
            key={`studio-${take.id}`}
            primary
            icon="whatsapp"
            title={`Manda ad ${STUDIO.name}`}
            subtitle="Voce + beat pronti per rec, mix e master. Poi scegli WhatsApp."
            prepare={prepStudio}
            shareText={studioText}
          />
          <ExportRow key={`mix-${take.id}`} icon="tracce" title="Mix (beat + voce)" subtitle="Un unico file WAV da ascoltare o far sentire." prepare={prepMix} />
          <ExportRow key={`voice-${take.id}`} icon="mic" title="Solo voce" subtitle="WAV allineato all'inizio del beat: lo studio lo mette a 0:00." prepare={prepVoice} />
        </div>
      )}
    </Sheet>
  );
}
