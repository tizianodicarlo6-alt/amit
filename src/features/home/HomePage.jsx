import { Link, useNavigate } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addTrack, db, getMeta } from '../../db/db.js';
import { useCapture } from '../../components/CaptureContext.jsx';
import Icon from '../../components/Icon.jsx';
import IdeaCard from '../taccuino/IdeaCard.jsx';
import { STUDIO, whatsappLink } from '../../config.js';
import { personalGreeting, useProfile } from '../../lib/profile.js';
import { levelOf, weekStats } from '../../lib/progress.js';
import { getResume } from '../../lib/resume.js';
import { sectionLabel } from '../../constants.js';
import { loadScores, otherMembers, sendScore, useCloud } from '../../lib/cloud.js';
import { useEffect, useState } from 'react';

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

// "Riprendi da dove eri": l'ultimo pezzo aperto, un tocco e sei lì
function ResumeCard() {
  const navigate = useNavigate();
  const r = getResume();
  const item = useDbQuery(() => (r ? (r.kind === 'track' ? db.tracks.get(r.id) : db.ideas.get(r.id)).then((x) => x || null) : Promise.resolve(null)), [r?.id], null);
  if (!r || !item) return null;
  const sec = r.kind === 'track' ? (item.sections || []).find((x) => x.id === r.sec) : null;
  const go = () => navigate(r.kind === 'track' ? `/traccia/${r.id}${r.sec ? `?sez=${r.sec}` : ''}` : `/taccuino?apri=${r.id}`);
  return (
    <button className="card resume-card" onClick={go}>
      <span className="resume-k">Riprendi da dove eri</span>
      <span className="resume-t ellipsis">{item.title || r.title}</span>
      <span className="muted small">{r.kind === 'track' ? `Traccia${sec ? ` · ${sectionLabel(sec.type)}` : ''}` : 'Nota'}</span>
    </button>
  );
}

// ⚔ La classifica della settimana tra soci (provini chiusi e mana)
function Classifica({ profile }) {
  const cloudState = useCloud();
  const progress = useDbQuery(() => getMeta('progress'), [], null);
  const [others, setOthers] = useState(null);
  const mine = weekStats(progress);
  useEffect(() => {
    if (!cloudState.user) return;
    loadScores().then(setOthers).catch(() => setOthers({}));
    // i miei numeri agli altri, se sono cambiati da quando li ho mandati
    const key = JSON.stringify({ w: mine.week, p: mine.provini, m: mine.mana });
    let last = null;
    try {
      last = localStorage.getItem('amit.scoreSent');
    } catch {
      /* ignorato */
    }
    if (progress !== null && last !== key) sendScore(mine).then(() => localStorage.setItem('amit.scoreSent', key)).catch(() => {});
  }, [cloudState.user, progress]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cloudState.user) return null;
  const rows = [{ id: profile.id, name: profile.name, ...mine, me: true }];
  for (const m of otherMembers(profile.id)) {
    const sc = others?.[m.id];
    const same = sc && sc.week === mine.week;
    rows.push({ id: m.id, name: m.name, provini: same ? sc.provini : 0, mana: same ? sc.mana : 0, level: sc?.level || 1 });
  }
  rows.sort((a, b) => b.provini - a.provini || b.mana - a.mana);
  return (
    <div className="card classifica">
      <div className="row between">
        <span className="resume-k">Classifica della settimana</span>
        <Link to="/messaggi" className="see-all">
          Sfida
        </Link>
      </div>
      {rows.map((r, i) => (
        <div key={r.id} className={`cl-row${r.me ? ' me' : ''}`}>
          <span className="cl-pos">{i + 1}</span>
          <span className="grow">
            {r.name} <span className="muted small">· liv. {r.level}</span>
          </span>
          <span className="cl-num">
            <b>{r.provini}</b> provini
          </span>
          <span className="cl-num mana">✦ {r.mana}</span>
        </div>
      ))}
    </div>
  );
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
  // le note che stavi scrivendo (le ultime toccate): i provini sono già scritti, stanno in Tracce
  const ideas = useDbQuery(() => db.ideas.orderBy('updatedAt').reverse().filter((i) => i.type === 'text' && !!(i.text || '').trim()).limit(3).toArray(), [], []) || [];
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

      <ResumeCard />
      {profile && <Classifica profile={profile} />}

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

      <SectionHead title="Continua a scrivere" to="/taccuino" />
      {ideas.length === 0 ? (
        <button className="card empty-card" onClick={() => openCapture()}>
          <Icon name="plus" />
          <span>Inizia una nota</span>
        </button>
      ) : (
        <div className="list">
          {ideas.map((i) => (
            <IdeaCard key={i.id} idea={i} onClick={() => navigate(`/taccuino?apri=${i.id}`)} />
          ))}
        </div>
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
