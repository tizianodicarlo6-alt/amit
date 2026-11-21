export const STATUSES = [
  { id: 'idea', label: 'Idea', color: '#8b919c' },
  { id: 'scrittura', label: 'In scrittura', color: '#f5a524' },
  { id: 'scritta', label: 'Scritta', color: '#4c9aff' },
  { id: 'registrata', label: 'Registrata', color: '#b26cf5' },
  { id: 'finita', label: 'Finita', color: '#35c46a' },
];
export const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

export const SECTION_TYPES = [
  { id: 'intro', label: 'Intro' },
  { id: 'strofa', label: 'Strofa' },
  { id: 'ritornello', label: 'Ritornello' },
  { id: 'bridge', label: 'Bridge' },
  { id: 'outro', label: 'Outro' },
];
export const sectionLabel = (id) => SECTION_TYPES.find((s) => s.id === id)?.label || 'Sezione';

export const PROJECT_KINDS = [
  { id: 'album', label: 'Album' },
  { id: 'ep', label: 'EP' },
  { id: 'singolo', label: 'Singolo' },
  { id: 'mixtape', label: 'Mixtape' },
];
export const kindLabel = (id) => PROJECT_KINDS.find((k) => k.id === id)?.label || 'Progetto';

export const DEFAULT_TAGS = ['barra', 'ritornello', 'immagine', 'titolo'];

// Colori per le rime (leggibili su sfondo scuro).
export const RHYME_COLORS = [
  '#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#e599f7', '#ff922b',
  '#3bc9db', '#f783ac', '#a9e34b', '#9775fa', '#ffc078', '#63e6be',
];

export function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `oggi ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'ieri';
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export const formatTime = (sec) => {
  if (!Number.isFinite(sec)) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const BEAT_TAGS = ['trap', 'drill', 'boom bap', 'r&b', 'lo-fi', 'afro', 'melodico', 'dark'];

const NOTES = ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const INTL = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const KEYS = NOTES.flatMap((n, i) => [
  { id: `${INTL[i]}m`, label: `${n} minore (${INTL[i]}m)` },
  { id: INTL[i], label: `${n} maggiore (${INTL[i]})` },
]);
