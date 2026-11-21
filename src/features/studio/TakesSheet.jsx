import { useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { deleteTake, updateTake } from '../../db/db.js';
import { formatDate, formatTime } from '../../constants.js';
import { STUDIO, bookingLink } from '../../config.js';
import { FX_PRESETS } from './fx.js';

const slug = (s) => (s || 'traccia').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'traccia';

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
function ExportRow({ icon, title, subtitle, prepare, primary }) {
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
      await navigator.share({ files, title: files[0].name });
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
              <Icon name="share" size={20} /> Salva / Condividi
            </button>
          )}
          <button className="btn grow" onClick={() => files.forEach(download)}>
            <Icon name="download" size={20} /> Salva
          </button>
        </div>
      )}
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

export default function TakesSheet({ track, beatBuf, takes, selected, onSelect, onPlay, engine, loadTakeBuffer, latency, beatVol, voiceVol, fx, bpm, onClose }) {
  const take = takes.find((t) => t.id === selected);
  const base = slug(track.title);

  const remove = async (t) => {
    if (!confirm(`Eliminare "${t.name}"?`)) return;
    await deleteTake(t.id);
  };

  const prepMix = async () => {
    const voice = { buffer: await loadTakeBuffer(take), offset: take.offset };
    const blob = await engine.renderMix({ beat: beatBuf, voice, latency, beatGain: beatVol, voiceGain: voiceVol, fx, bpm });
    return [new File([blob], `${base} - provino (${take.name}).wav`, { type: 'audio/wav' })];
  };
  const prepVoice = async () => {
    const voice = { buffer: await loadTakeBuffer(take), offset: take.offset };
    const blob = engine.renderVoiceAligned({ voice, latency });
    return [new File([blob], `${base} - voce (${take.name}).wav`, { type: 'audio/wav' })];
  };
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
            key={`mix-${take.id}-${fx}`}
            primary
            icon="tracce"
            title="Salva il provino"
            subtitle={`Beat + voce con effetto "${FX_PRESETS[fx]?.label}", in un unico file da riascoltare sul telefono.`}
            prepare={prepMix}
          />
          <ExportRow key={`voice-${take.id}`} icon="mic" title="Solo voce" subtitle="La voce senza beat e senza effetti." prepare={prepVoice} />

          <div className="card studio-card">
            <div className="studio-text">
              <div className="studio-kicker">{STUDIO.name}</div>
              <div className="studio-title">Ti convince?</div>
              <p className="muted small">Se il provino spacca, vieni a registrarlo da {STUDIO.name}: rec, mix e master professionali.</p>
            </div>
            <a className="btn primary big" href={bookingLink(track.title, bpm)} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" /> Prenota la sessione
            </a>
          </div>
        </div>
      )}
    </Sheet>
  );
}
