import { Link, useNavigate } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTrack, db, getMeta } from '../../db/db.js';
import { useCapture } from '../../components/CaptureContext.jsx';
import Icon from '../../components/Icon.jsx';
import TrackCard from '../progetti/TrackCard.jsx';
import IdeaCard from '../taccuino/IdeaCard.jsx';
import { STUDIO, whatsappLink } from '../../config.js';
import { personalGreeting, useProfile } from '../../lib/profile.js';
import { levelOf } from '../../lib/progress.js';
import { useCloud } from '../../lib/cloud.js';

// Home dei soci: saluto personale e "che pezzo vuoi scrivere?"
function MemberHero({ profile }) {
  const g = personalGreeting(profile.name);
  const progress = useDbQuery(() => getMeta('progress'), [], null);
  return (
    <section className="member-hero">
      <p className="hero-greet">{g.hello.replace(/,$/, '')}</p>
      <h1 className="hero-title">{g.question}</h1>
      <div className="lv-line">
        <span className="lv-pill">Livello {levelOf(progress)}</span>
        <span className="mana-pill">✦ {progress?.mana || 0} mana</span>
      </div>
    </section>
  );
}

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
  const profile = useProfile();
  const cloud = useCloud();
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
        {profile && (
          <Link to="/messaggi" className="icon-btn msg-btn" aria-label={`Messaggi${cloud.unread ? `, ${cloud.unread} nuovi` : ''}`}>
            <Icon name="chat" />
            {cloud.unread > 0 && <span className="badge">{cloud.unread}</span>}
          </Link>
        )}
        <Link to="/altro" className="icon-btn" aria-label="Impostazioni e backup">
          <Icon name="gear" />
        </Link>
      </header>

      {profile ? (
        <MemberHero profile={profile} />
      ) : (
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
      )}

      <div className="quick">
        <button className="quick-btn primary" onClick={() => openCapture({ mode: 'text' })}>
          <Icon name="pen" size={26} />
          <span>Nuova nota</span>
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
          <SectionHead title="Ultime note" to="/taccuino" />
          <div className="list">
            {ideas.map((i) => (
              <IdeaCard key={i.id} idea={i} onClick={() => navigate('/taccuino')} />
            ))}
          </div>
        </>
      )}

      {(needsBackup || !profile) && <SectionHead title="Consigliati" />}
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
        {!profile && (
        <div className="card studio-card">
          <img src={logo} alt="" className="studio-logo" />
          <div className="studio-text">
            <div className="studio-kicker">{STUDIO.name}</div>
            <div className="studio-title">Il pezzo ti convince?</div>
            <p className="muted small">Hai fatto il provino e suona bene? Vieni a registrarlo da {STUDIO.name}: rec, mix e master professionali.</p>
          </div>
          <a className="btn primary big" href={whatsappLink()} target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" /> Prenota su WhatsApp
          </a>
        </div>
        )}
      </div>

      <p className="muted small center footer-note">Amit · by {STUDIO.name}</p>
    </div>
  );
}
