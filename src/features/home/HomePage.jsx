import { Link, useNavigate } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTrack, db, getMeta } from '../../db/db.js';
import { useCapture } from '../../components/CaptureContext.jsx';
import Icon from '../../components/Icon.jsx';
import TrackCard from '../progetti/TrackCard.jsx';
import IdeaCard from '../taccuino/IdeaCard.jsx';
import { STUDIO, whatsappLink } from '../../config.js';

const logo = `${import.meta.env.BASE_URL}logo-bianco.png`;

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Notte fonda, barre migliori';
  if (h < 13) return 'Buongiorno';
  if (h < 19) return 'Buon pomeriggio';
  return 'Buonasera';
}

function SectionHead({ title, to }) {
  return (
    <div className="row between home-section-head">
      <h2>{title}</h2>
      {to && (
        <Link to={to} className="see-all">
          Vedi tutto
        </Link>
      )}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { openCapture } = useCapture();
  const tracks = useDbQuery(() => db.tracks.orderBy('updatedAt').reverse().toArray(), [], []) || [];
  const ideas = useDbQuery(() => db.ideas.orderBy('createdAt').reverse().limit(3).toArray(), [], []) || [];
  const ideaCount = useDbQuery(() => db.ideas.count(), [], 0) || 0;
  const projects = useDbQuery(() => db.projects.toArray(), [], []) || [];
  const lastBackup = useDbQuery(() => getMeta('lastBackupAt'), [], null);

  const projectName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const bars = tracks.reduce((n, t) => n + (t.sections || []).reduce((m, s) => m + s.text.split('\n').filter((l) => l.trim()).length, 0), 0);
  const hasData = ideaCount + tracks.length > 0;
  const backupDays = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null;
  const needsBackup = hasData && (backupDays === null || backupDays >= 7);

  const newTrack = async () => navigate(`/traccia/${await addTrack()}`);

  return (
    <div className="page home">
      <header className="home-top">
        <span className="wordmark">{STUDIO.name}</span>
        <Link to="/altro" className="icon-btn" aria-label="Impostazioni e backup">
          <Icon name="gear" />
        </Link>
      </header>

      <section className="hero">
        <img src={logo} alt="Logo Amit Studio" className="hero-logo" />
        <p className="hero-greet">{greeting()}</p>
        <h1 className="hero-title">Cosa scriviamo oggi?</h1>
        {hasData && (
          <p className="hero-stats">
            <span>
              <b>{ideaCount}</b> {ideaCount === 1 ? "idea" : "idee"}
            </span>
            <span>
              <b>{tracks.length}</b> {tracks.length === 1 ? "traccia" : "tracce"}
            </span>
            <span>
              <b>{bars}</b> {bars === 1 ? "barra" : "barre"}
            </span>
          </p>
        )}
      </section>

      <div className="quick">
        <button className="quick-btn primary" onClick={() => openCapture({ mode: 'text' })}>
          <Icon name="pen" size={26} />
          <span>Scrivi un'idea</span>
        </button>
        <button className="quick-btn" onClick={() => openCapture({ mode: 'voice' })}>
          <Icon name="mic" size={26} />
          <span>Registra</span>
        </button>
        <button className="quick-btn" onClick={newTrack}>
          <Icon name="tracce" size={26} />
          <span>Nuova traccia</span>
        </button>
      </div>

      <SectionHead title="Continua a scrivere" to={tracks.length > 3 ? '/tracce' : null} />
      {tracks.length === 0 ? (
        <button className="card empty-card" onClick={newTrack}>
          <Icon name="plus" />
          <span>Crea la tua prima traccia</span>
        </button>
      ) : (
        <div className="list">
          {tracks.slice(0, 3).map((t) => (
            <TrackCard key={t.id} track={t} projectName={projectName[t.projectId]} />
          ))}
        </div>
      )}

      {ideas.length > 0 && (
        <>
          <SectionHead title="Ultime idee" to="/taccuino" />
          <div className="list">
            {ideas.map((i) => (
              <IdeaCard key={i.id} idea={i} onClick={() => navigate('/taccuino')} />
            ))}
          </div>
        </>
      )}

      <SectionHead title="Consigliati" />
      <div className="list">
        {needsBackup && (
          <Link to="/altro" className="card reco">
            <Icon name="download" />
            <div className="grow">
              <div className="reco-title">Fai un backup</div>
              <div className="muted small">
                {backupDays === null ? 'Non hai ancora salvato una copia dei tuoi testi.' : `Ultimo backup ${backupDays} giorni fa.`}
              </div>
            </div>
          </Link>
        )}
        <div className="card studio-card">
          <img src={logo} alt="" className="studio-logo" />
          <div className="studio-text">
            <div className="studio-kicker">{STUDIO.name}</div>
            <div className="studio-title">Il tuo brano è pronto?</div>
            <p className="muted small">Mandalo ad {STUDIO.name} per rec, mix e master professionali.</p>
          </div>
          <a className="btn primary big" href={whatsappLink()} target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" /> Scrivici su WhatsApp
          </a>
        </div>
      </div>

      <p className="muted small center footer-note">Amit · by {STUDIO.name}</p>
    </div>
  );
}
