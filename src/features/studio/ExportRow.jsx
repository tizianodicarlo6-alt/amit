import { useState } from 'react';
import Icon from '../../components/Icon.jsx';

// Nome file sicuro per ogni telefono (niente simboli strani)
export const slug = (s) => (s || 'traccia').normalize('NFC').replace(/[^\p{L}\p{N} ()._-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'traccia';

export function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const canShare = (files) => {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
};

// Esportazione in due passaggi: prima preparo il file, poi lo condividi (regola di iPhone).
export default function ExportRow({ icon, title, subtitle, prepare, primary }) {
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

