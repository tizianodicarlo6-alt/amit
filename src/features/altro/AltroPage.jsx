import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta } from '../../db/db.js';
import { createBackup, importBackup, markBackupDone } from '../../db/backup.js';
import { formatDate } from '../../constants.js';
import Icon from '../../components/Icon.jsx';

const COMING = [
  { icon: 'beat', title: 'Libreria beat', text: 'Carica e organizza i tuoi beat.', phase: 'Fase 2' },
  { icon: 'studio', title: 'Studio', text: 'Registra la voce sopra al beat.', phase: 'Fase 2' },
  { icon: 'allenamento', title: 'Allenamento', text: 'Esercizi di scrittura e freestyle.', phase: 'Fase 3' },
];

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function AltroPage() {
  const counts = useLiveQuery(async () => ({
    ideas: await db.ideas.count(),
    tracks: await db.tracks.count(),
    projects: await db.projects.count(),
  }), []);
  const lastBackup = useLiveQuery(() => getMeta('lastBackupAt'), []);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [persisted, setPersisted] = useState(null);
  const [usage, setUsage] = useState(null);
  const fileRef = useRef(null);
  const replaceRef = useRef(false);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage)).catch(() => {});
  }, [counts]);

  const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] });

  const exportBackup = async (share) => {
    setBusy('export');
    setMsg('');
    try {
      const { blob, filename } = await createBackup();
      if (share) {
        const file = new File([blob], filename, { type: 'application/json' });
        try {
          await navigator.share({ files: [file], title: 'Backup Amit' });
        } catch (e) {
          if (e.name === 'AbortError') return;
          throw e;
        }
      } else download(blob, filename);
      await markBackupDone();
      setMsg(`Backup creato (${(blob.size / 1024 / 1024).toFixed(1)} MB). Conservalo in un posto sicuro (es. Drive o iCloud).`);
    } catch (e) {
      setMsg(`Errore: ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  const pickFile = (replace) => {
    replaceRef.current = replace;
    fileRef.current.value = '';
    fileRef.current.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const replace = replaceRef.current;
    if (replace && !confirm('ATTENZIONE: tutti i dati attuali verranno cancellati e sostituiti con quelli del backup. Continuare?')) return;
    setBusy('import');
    setMsg('');
    try {
      const c = await importBackup(file, { replace });
      setMsg(`Importato: ${c.ideas} idee, ${c.tracks} tracce, ${c.projects} progetti, ${c.audio} audio.`);
    } catch (err) {
      setMsg(`Errore: ${err.message}`);
    } finally {
      setBusy('');
    }
  };

  const daysSince = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Altro</h1>
      </header>

      <section className="card stack">
        <h2>Backup</h2>
        <p className="muted small">
          I tuoi dati sono salvati solo su questo telefono. Fai un backup ogni tanto: se cambi telefono o cancelli i dati del browser,
          potrai recuperare tutto (testi e note vocali).
        </p>
        {counts && (
          <p className="small">
            {counts.ideas} idee · {counts.tracks} tracce · {counts.projects} progetti
            {usage ? ` · ${(usage / 1024 / 1024).toFixed(1)} MB` : ''}
          </p>
        )}
        <p className={`small ${daysSince === null || daysSince > 7 ? 'warn' : 'ok'}`}>
          {lastBackup ? `Ultimo backup: ${formatDate(lastBackup)}` : 'Non hai ancora fatto un backup.'}
        </p>
        <button className="btn primary big" onClick={() => exportBackup(false)} disabled={!!busy}>
          <Icon name="download" /> {busy === 'export' ? 'Preparo il file…' : 'Scarica backup'}
        </button>
        {canShareFiles && (
          <button className="btn big" onClick={() => exportBackup(true)} disabled={!!busy}>
            <Icon name="share" /> Condividi backup (Drive, iCloud, WhatsApp…)
          </button>
        )}
        <div className="divider" />
        <button className="btn" onClick={() => pickFile(false)} disabled={!!busy}>
          <Icon name="upload" size={20} /> Importa backup (unisci ai dati attuali)
        </button>
        <button className="btn danger" onClick={() => pickFile(true)} disabled={!!busy}>
          <Icon name="upload" size={20} /> Ripristina backup (sostituisci tutto)
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        {busy === 'import' && <p className="muted">Importazione in corso…</p>}
        {msg && <p className="notice">{msg}</p>}
        {persisted === false && (
          <p className="muted small">
            Suggerimento: installa l'app sulla schermata Home per proteggere meglio i dati dalla pulizia automatica del browser.
          </p>
        )}
      </section>

      <h2 className="section-title">In arrivo</h2>
      <div className="list">
        {COMING.map((c) => (
          <div key={c.title} className="card coming">
            <span className="coming-icon">
              <Icon name={c.icon} />
            </span>
            <div className="grow">
              <div className="track-title">{c.title}</div>
              <div className="muted small">{c.text}</div>
            </div>
            <span className="badge" style={{ '--c': '#8b919c' }}>
              {c.phase}
            </span>
          </div>
        ))}
      </div>

      <div className="about">
        <img src={`${import.meta.env.BASE_URL}logo-bianco.png`} alt="Logo Amit" />
        <p className="muted small center">Amit · versione 0.1 · funziona anche offline</p>
      </div>
    </div>
  );
}
