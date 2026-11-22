import { useEffect, useMemo, useState } from 'react';
import { useTapTempo } from '../../components/useTapTempo.js';
import { useNavigate, useParams } from 'react-router-dom';
import { useDbQuery } from '../../db/useDbQuery.js';
import { addIdea, db, deleteTake, deleteTrack, updateIdea, updateTake, updateTrack } from '../../db/db.js';
import { STATUSES, formatDate, formatTime, roleLabel, sectionLabel } from '../../constants.js';
import AudioPlayer from '../../components/AudioPlayer.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useAutosave, SaveStatus } from '../../components/useAutosave.jsx';
import { useCapture } from '../../components/CaptureContext.jsx';
import LyricsEditor from '../editor/LyricsEditor.jsx';
import BeatLoop from '../../components/BeatLoop.jsx';
import MelodyBar, { melodyOf, selectedTake } from '../editor/MelodyBar.jsx';
import { SpuntoCard, VibePicker, spuntoText } from '../../components/Vibe.jsx';
import { atmoOf, vibeLabel } from '../../lib/spunti.js';
import { useProfile } from '../../lib/profile.js';
import ShareSheet from '../messaggi/ShareSheet.jsx';
import { MapCard } from '../ispirazione/ParliamonePage.jsx';
import IdeaCard from '../taccuino/IdeaCard.jsx';
import IdeaSheet from '../taccuino/IdeaSheet.jsx';
import BeatStep from './BeatStep.jsx';
import { takeLabels } from '../studio/voices.js';
import { Link } from 'react-router-dom';

function TrackDetails({ track, projects }) {
  const [form, setForm] = useState({
    title: track.title || '',
    status: track.status || 'idea',
    bpm: track.bpm ?? '',
    projectId: track.projectId || '',
    notes: track.notes || '',
  });
  const status = useAutosave(form, (v) =>
    updateTrack(track.id, { ...v, bpm: v.bpm === '' ? null : Number(v.bpm), projectId: v.projectId || null })
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const tap = useTapTempo((bpm) => set('bpm', bpm));

  return (
    <div className="stack">
      <div className="row between">
        <span className="field-label">Dettagli traccia</span>
        <SaveStatus status={status} />
      </div>
      <label className="field">
        <span className="field-label">Titolo</span>
        <input className="input title-input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Titolo della traccia" />
      </label>
      <div className="field">
        <span className="field-label">Stato</span>
        <div className="status-grid">
          {STATUSES.map((s) => (
            <button key={s.id} className={`chip status${form.status === s.id ? ' on' : ''}`} style={{ '--c': s.color }} onClick={() => set('status', s.id)}>
              <span className="dot" /> {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">BPM</span>
        <div className="row">
          <input
            className="input bpm-input"
            type="number"
            inputMode="numeric"
            min="40"
            max="250"
            value={form.bpm}
            onChange={(e) => set('bpm', e.target.value)}
            placeholder="90"
          />
          <button className="btn tap" onClick={tap}>
            Tap a tempo
          </button>
        </div>
      </div>
      <label className="field">
        <span className="field-label">Progetto</span>
        <select className="input" value={form.projectId} onChange={(e) => set('projectId', e.target.value)}>
          <option value="">— Nessun progetto —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Note</span>
        <textarea className="input" rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Riferimenti, beat, featuring, idee per il flow…" />
      </label>
    </div>
  );
}

// Le registrazioni dello studio: ascolto (solo voce) ed eliminazione
function TrackTakes({ track }) {
  const takes = useDbQuery(() => db.takes.where('trackId').equals(track.id).reverse().sortBy('createdAt'), [track.id], []) || [];
  const labels = takeLabels(takes);
  const remove = async (t) => {
    if (confirm(`Eliminare "${labels.get(t.id)}"?`)) await deleteTake(t.id);
  };
  return (
    <div className="stack">
      <div className="row between">
        <span className="field-label">Registrazioni ({takes.length}) · voce originale</span>
        <Link to={`/studio/${track.id}`} className="see-all">
          Apri lo studio
        </Link>
      </div>
      {takes.length === 0 && <p className="muted small">Nessuna registrazione. Apri lo Studio e premi il tasto rosso.</p>}
      {takes.map((t) => (
        <div key={t.id} className={`card stack take-card${t.included === false ? ' off' : ''}`}>
          <div className="row between">
            <div className="min0">
              <span className="reco-title">{labels.get(t.id)}</span>
              <div className="muted small">
                {formatTime(t.duration)} · {formatDate(t.createdAt)} {t.included === false ? '· spenta nel mix' : ''}
              </div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className={`btn sm${t.included !== false ? ' primary' : ''}`} onClick={() => updateTake(t.id, { included: t.included === false })}>
                {t.included !== false ? 'ON' : 'OFF'}
              </button>
              <button className="icon-btn sm" onClick={() => remove(t)} aria-label="Elimina registrazione">
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>
          <AudioPlayer audioId={t.audioId} duration={t.duration} />
        </div>
      ))}
    </div>
  );
}

function TrackIdeas({ track, onEditLyricsAfter }) {
  const ideas = useDbQuery(() => db.ideas.where('trackId').equals(track.id).reverse().sortBy('createdAt'), [track.id]) || [];
  const unlinked = useDbQuery(() => db.ideas.filter((i) => !i.trackId).reverse().sortBy('createdAt'), []) || [];
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(null);
  const { openCapture } = useCapture();

  const insertInLyrics = async (idea) => {
    const sections = [...(track.sections || [])];
    const last = sections.at(-1);
    if (!last) return;
    const sep = last.text && !last.text.endsWith('\n') ? '\n' : '';
    sections[sections.length - 1] = { ...last, text: last.text + sep + idea.text };
    await updateTrack(track.id, { sections });
    onEditLyricsAfter();
  };

  return (
    <div className="stack">
      <div className="row">
        <button className="btn primary grow" onClick={() => openCapture({ trackId: track.id })}>
          <Icon name="plus" size={20} /> Nuova idea
        </button>
        <button className="btn grow" onClick={() => setPicking(true)} disabled={!unlinked.length}>
          <Icon name="link" size={20} /> Collega
        </button>
      </div>
      {ideas.length === 0 && <p className="muted empty">Nessuna idea collegata a questa traccia.</p>}
      <div className="list">
        {ideas.map((i) => (
          <IdeaCard
            key={i.id}
            idea={i}
            onClick={() => setEditing(i)}
            actions={
              i.type === 'text' && i.text ? (
                <button className="btn ghost sm" onClick={() => insertInLyrics(i)}>
                  <Icon name="pen" size={16} /> Aggiungi al testo
                </button>
              ) : null
            }
          />
        ))}
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Collega un'idea">
        <div className="list">
          {unlinked.map((i) => (
            <IdeaCard
              key={i.id}
              idea={i}
              onClick={async () => {
                await updateIdea(i.id, { trackId: track.id });
                setPicking(false);
              }}
            />
          ))}
        </div>
      </Sheet>
      {editing && <IdeaSheet idea={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// I 3 passi del lavoro su una traccia
function Steps({ step, setStep, track, takeCount, onStudio }) {
  const lines = (track.sections || []).reduce((n, s) => n + s.text.split('\n').filter((l) => l.trim()).length, 0);
  const items = [
    { id: 'beat', n: 1, label: 'Beat', done: !!track.beatId },
    { id: 'testo', n: 2, label: 'Testo', done: lines > 0 },
    { id: 'studio', n: 3, label: 'Registra', done: takeCount > 0 },
  ];
  return (
    <div className="steps">
      {items.map((it) => (
        <button key={it.id} className={`step${step === it.id ? ' on' : ''}${it.done ? ' done' : ''}`} onClick={() => (it.id === 'studio' ? onStudio() : setStep(it.id))}>
          <span className="step-n">{it.done && step !== it.id ? '✓' : it.n}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// Intenzione · genere · atmosfera della traccia, con gli spunti
function VibeBar({ track }) {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const v = track.vibe || {};
  const a = atmoOf(v.atmo);
  const label = vibeLabel(v);
  if (!label && !profile) return null;
  return (
    <>
      <button className="vibe-bar" onClick={() => setOpen(true)} style={a ? { background: `linear-gradient(90deg, ${a.color[0]}, ${a.color[1]})` } : undefined}>
        <span className="grow ellipsis">{label || "Dai un'intenzione e un'atmosfera al pezzo"}</span>
        <span>💡</span>
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Il colore del pezzo">
          <div className="stack">
            <SpuntoCard vibe={v} onUse={(sp) => addIdea({ type: 'text', text: spuntoText(sp), tags: ['spunto'], trackId: track.id })} />
            <VibePicker value={v} onChange={(nv) => updateTrack(track.id, { vibe: nv })} />
          </div>
        </Sheet>
      )}
    </>
  );
}

// ② Testo: il beat in alto (scegli col dito il pezzo da sentire in loop) e sotto il testo.
// La zona scelta mentre scrivi una sezione resta legata a quella sezione (e allo studio: "parte qui").
function WriteOnBeat({ track }) {
  const beat = useDbQuery(() => (track.beatId ? db.beats.get(track.beatId).then((b) => b ?? null) : Promise.resolve(null)), [track.beatId], undefined);
  const [active, setActive] = useState(null);
  const [free, setFree] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [pauseSig, setPauseSig] = useState(0);
  const st = track.studio || {};
  const loops = st.loops || {};
  const region = (active && loops[active]) || free;
  const labels = useMemo(() => {
    const tot = {};
    const seen = {};
    for (const s of track.sections || []) tot[s.type] = (tot[s.type] || 0) + 1;
    return Object.fromEntries((track.sections || []).map((s) => {
      seen[s.type] = (seen[s.type] || 0) + 1;
      return [s.id, `${sectionLabel(s.type)}${tot[s.type] > 1 ? ` ${seen[s.type]}` : ''}`];
    }));
  }, [track.sections]);
  const onRegion = (r) => {
    setFree(r);
    if (!active) return;
    const nextLoops = { ...loops };
    const starts = { ...(st.starts || {}) };
    if (r) {
      nextLoops[active] = r;
      starts[active] = r.from;
    } else {
      delete nextLoops[active];
      delete starts[active];
    }
    updateTrack(track.id, { studio: { ...st, loops: nextLoops, starts } });
  };
  // sillabe delle frasi del nanana → accanto alle righe della sezione che stai scrivendo
  const mel = active ? selectedTake(melodyOf(track, active)) : null;
  const targets = mel ? { [active]: mel.phrases.map((p) => p.syllables) } : {};
  const marks = Object.entries(loops)
    .filter(([id]) => labels[id])
    .map(([id, r]) => ({ id, label: labels[id], from: r.from, to: r.to, active: id === active }));
  return (
    <>
      {beat && (
        <BeatLoop
          beat={beat}
          region={region}
          onRegion={onRegion}
          marks={marks}
          attack={st.attack ?? null}
          caption={active && labels[active] ? `Stai scrivendo: ${labels[active]}` : beat.title}
          overlay={overlay}
          pauseSignal={pauseSig}
        >
          <MelodyBar melody={melodyOf(track, active || '_')} onChange={(next) => updateTrack(track.id, { studio: { ...(track.studio || {}), melodies: { ...(track.studio?.melodies || {}), [active || '_']: next } } })} beat={beat} region={region} onOverlay={setOverlay} onPause={() => setPauseSig((n) => n + 1)} />
        </BeatLoop>
      )}
      <LyricsEditor key={track.id} track={track} activeId={active} onFocusSection={setActive} targets={targets} />
    </>
  );
}

export default function TracciaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const track = useDbQuery(() => db.tracks.get(id), [id]);
  const projects = useDbQuery(() => db.projects.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))), []) || [];
  const ideaCount = useDbQuery(() => db.ideas.where('trackId').equals(id).count(), [id]) || 0;
  const takeCount = useDbQuery(() => db.takes.where('trackId').equals(id).count(), [id], 0) || 0;
  const [stepPick, setStep] = useState(null);
  const [info, setInfo] = useState(null); // menu ⋯: 'dettagli' | 'idee' | 'registrazioni'
  const [sharing, setSharing] = useState(false);
  const profile = useProfile();
  const project = useMemo(() => projects.find((p) => p.id === track?.projectId), [projects, track]);
  // il passo iniziale si decide una volta sola (poi cambia solo quando lo scegli tu)
  useEffect(() => {
    if (track && stepPick == null) setStep(track.beatId ? 'testo' : 'beat');
  }, [track, stepPick]);

  if (track === undefined) return <div className="page" />;
  if (!track) return <div className="page empty">Traccia non trovata.</div>;

  const step = stepPick ?? (track.beatId ? 'testo' : 'beat');
  const goStudio = () => navigate(`/studio/${track.id}`);
  const remove = async () => {
    if (!confirm(`Eliminare la traccia "${track.title}"? Le idee collegate restano nel taccuino.`)) return;
    await deleteTrack(id);
    navigate('/tracce');
  };

  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate('/tracce')} aria-label="Indietro">
          <Icon name="back" />
        </button>
        <div className="grow min0">
          <h1 className="ellipsis">{track.title || 'Senza titolo'}</h1>
          {project && <div className="muted small ellipsis">{project.name}</div>}
        </div>
        <button className="icon-btn" onClick={() => setInfo('dettagli')} aria-label="Dettagli, idee e registrazioni">
          <Icon name="altro" />
        </button>
      </header>

      <Steps step={step} setStep={setStep} track={track} takeCount={takeCount} onStudio={goStudio} />
      {track.mappa && (
        <details className="map-details">
          <summary>🧭 La mappa del pezzo</summary>
          <MapCard map={track.mappa} />
        </details>
      )}

      {step === 'beat' && <BeatStep track={track} onNext={() => setStep('testo')} />}
      {step === 'testo' && (
        <div className="wob">
          <WriteOnBeat track={track} />
          <button className="btn primary big" onClick={goStudio}>
            <Icon name="mic" /> Avanti: registra →
          </button>
        </div>
      )}

      {sharing && <ShareSheet kind="track" item={track} onClose={() => setSharing(false)} />}
      {info && (
        <Sheet open onClose={() => setInfo(null)} title={track.title || 'Traccia'}>
          <div className="tabs">
            {[
              ['dettagli', 'Dettagli'],
              ['idee', `Idee${ideaCount ? ` (${ideaCount})` : ''}`],
              ['registrazioni', `Voci${takeCount ? ` (${takeCount})` : ''}`],
            ].map(([k, label]) => (
              <button key={k} className={`tab${info === k ? ' on' : ''}`} onClick={() => setInfo(k)}>
                {label}
              </button>
            ))}
          </div>
          {info === 'dettagli' && (
            <>
              <TrackDetails key={track.id} track={track} projects={projects} />
              {profile && (
                <button className="btn" onClick={() => (setInfo(null), setSharing(true))}>
                  <Icon name="send" size={20} /> Manda a un socio
                </button>
              )}
              <button className="btn danger" onClick={remove}>
                <Icon name="trash" size={20} /> Elimina traccia
              </button>
            </>
          )}
          {info === 'idee' && (
            <TrackIdeas
              track={track}
              onEditLyricsAfter={() => {
                setInfo(null);
                setStep('testo');
              }}
            />
          )}
          {info === 'registrazioni' && <TrackTakes track={track} />}
        </Sheet>
      )}
    </div>
  );
}
