// Teoria musicale e "forma" di una bozza di beat. Logica pura (testabile senza browser).
import { PITCH, parseKeyId } from '../../lib/analysis.js';

export const MAX_STEPS = 32; // batteria: fino a 2 battute di passi (16 per battuta)

// Righe della drum machine (come il Channel Rack di FL Studio). gm = nota MIDI General MIDI
export const DRUMS = [
  { id: 'kick', label: 'Cassa', gm: 36 },
  { id: 'snare', label: 'Rullante', gm: 38 },
  { id: 'clap', label: 'Clap', gm: 39 },
  { id: 'hat', label: 'Hi-hat', gm: 42, roll: true },
  { id: 'ohat', label: 'Open hat', gm: 46 },
  { id: 'perc', label: 'Perc', gm: 37 },
];

export const INSTRUMENTS = [
  { id: 'piano', label: 'Piano' },
  { id: 'pluck', label: 'Pluck' },
  { id: 'pad', label: 'Pad' },
  { id: 'bell', label: 'Campane' },
  { id: 'flute', label: 'Flauto' },
  { id: 'bass808', label: '808' },
];

// Le parti della bozza (righe del mixer)
export const PARTS = [
  { id: 'drums', label: 'Batteria' },
  { id: 'melody', label: 'Melodia' },
  { id: 'chords', label: 'Accordi' },
  { id: 'bass', label: '808 / Basso' },
];

const emptyPattern = () => Object.fromEntries(DRUMS.map((d) => [d.id, Array(MAX_STEPS).fill(0)]));

export function newSketchData({ bpm = 140, key = 'Am', bars = 4 } = {}) {
  return {
    bpm,
    key,
    bars, // lunghezza del loop in battute
    drumSteps: 16, // 16 = pattern di 1 battuta, 32 = 2 battute
    swing: 0, // 0–60 %
    drums: emptyPattern(),
    notes: { melody: [], bass: [] }, // { pitch (MIDI), start (in sedicesimi), len (sedicesimi), vel }
    chords: [], // per battuta: grado della scala (0–6) oppure null
    instruments: { melody: 'piano', chords: 'pad', bass: 'bass808' },
    mix: Object.fromEntries(PARTS.map((p) => [p.id, { vol: p.id === 'drums' ? 0.9 : 0.75, mute: false }])),
  };
}

/** Completa una bozza salvata con i campi mancanti (bozze vecchie restano valide). */
export function normalizeSketch(s) {
  const base = newSketchData();
  const out = { ...base, ...s };
  out.drums = { ...base.drums, ...(s.drums || {}) };
  for (const d of DRUMS) {
    const row = out.drums[d.id] || [];
    out.drums[d.id] = Array.from({ length: MAX_STEPS }, (_, i) => row[i] || 0);
  }
  out.notes = { ...base.notes, ...(s.notes || {}) };
  out.instruments = { ...base.instruments, ...(s.instruments || {}) };
  out.mix = { ...base.mix, ...(s.mix || {}) };
  return out;
}

// ---------- Tonalità e scale ----------
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]; // minore naturale

export function scaleOf(keyId) {
  const k = parseKeyId(keyId) || parseKeyId('Am');
  const root = PITCH.indexOf(k.id.replace('m', ''));
  const minor = k.id.endsWith('m');
  return { root, minor, steps: minor ? MINOR_STEPS : MAJOR_STEPS };
}

/** Note MIDI della scala tra `low` e `high` (comprese). */
export function scaleNotes(keyId, low, high) {
  const { root, steps } = scaleOf(keyId);
  const out = [];
  for (let m = low; m <= high; m++) if (steps.includes((((m - root) % 12) + 12) % 12)) out.push(m);
  return out;
}

/** Porta una nota MIDI (anche con decimali) alla nota della scala più vicina. */
export function snapToScale(midi, keyId) {
  const { root, steps } = scaleOf(keyId);
  let best = Math.round(midi);
  let bestD = Infinity;
  for (let m = Math.floor(midi) - 2; m <= Math.ceil(midi) + 2; m++) {
    if (!steps.includes((((m - root) % 12) + 12) % 12)) continue;
    const d = Math.abs(m - midi);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

// ---------- Accordi ----------
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

/** Triade del grado `degree` (0–6) nella tonalità, intorno all'ottava `base` (MIDI della tonica). */
export function chordNotes(keyId, degree, base = 48) {
  const { root, steps } = scaleOf(keyId);
  const tonic = base + ((root - (base % 12) + 12) % 12);
  return [0, 2, 4].map((k) => {
    const i = degree + k;
    return tonic + steps[i % 7] + 12 * Math.floor(i / 7);
  });
}

export function chordLabel(keyId, degree) {
  if (degree == null) return '—';
  const { root, minor, steps } = scaleOf(keyId);
  const pc = (root + steps[degree]) % 12;
  const roman = (minor ? ROMAN_MINOR : ROMAN_MAJOR)[degree];
  const quality = roman.includes('°') ? 'dim' : roman === roman.toLowerCase() ? 'm' : '';
  return `${NAMES[pc]}${quality}`;
}

// Giri di accordi pronti (gradi della scala), pensati per il rap
export const PROGRESSIONS = {
  minor: [
    { id: 'dark', label: 'Dark', degrees: [0, 5, 2, 6] }, // i–VI–III–VII
    { id: 'triste', label: 'Triste', degrees: [0, 3, 5, 4] }, // i–iv–VI–v
    { id: 'epico', label: 'Epico', degrees: [0, 5, 3, 6] }, // i–VI–iv–VII
    { id: 'drill', label: 'Drill', degrees: [0, 0, 5, 6] }, // i–i–VI–VII
    { id: 'notte', label: 'Notte', degrees: [0, 3, 0, 4] }, // i–iv–i–v
  ],
  major: [
    { id: 'pop', label: 'Solare', degrees: [0, 4, 5, 3] }, // I–V–vi–IV
    { id: 'soul', label: 'Soul', degrees: [3, 4, 2, 5] }, // IV–V–iii–vi
    { id: 'chill', label: 'Chill', degrees: [0, 5, 3, 4] }, // I–vi–IV–V
  ],
};

// ---------- Groove pronti per stile (16 passi = 1 battuta) ----------
const P = (str) => [...str.replace(/\s/g, '')].map((c) => (c === 'x' ? 1 : c === '.' ? 0 : Number(c)));
export const STYLES = {
  trap: {
    label: 'Trap',
    bpm: 140,
    drums: {
      kick: P('x... .... ..x. ....'),
      clap: P('.... .... x... ....'),
      snare: P('.... .... x... ....'),
      hat: P('x.x. x.x. x.x. x3x4'),
      ohat: P('.... .... .... ..x.'),
      perc: P('.... ..x. .... ....'),
    },
    bassRhythm: [0, 10],
  },
  drill: {
    label: 'Drill',
    bpm: 142,
    drums: {
      kick: P('x... .... .x.. ....'),
      snare: P('.... .... x... ....'),
      clap: P('.... .... x... ....'),
      hat: P('x..x ..x. x..x ..x3'),
      ohat: P('.... .... .... ....'),
      perc: P('...x .... ...x ....'),
    },
    bassRhythm: [0, 6, 10],
  },
  boombap: {
    label: 'Boom bap',
    bpm: 90,
    swing: 30,
    drums: {
      kick: P('x... ...x ..x. ....'),
      snare: P('.... x... .... x...'),
      clap: P('.... .... .... ....'),
      hat: P('x.x. x.x. x.x. x.x.'),
      ohat: P('.... .... .... ..x.'),
      perc: P('.... .... .... ....'),
    },
    bassRhythm: [0, 7, 10],
  },
  rnb: {
    label: 'R&B',
    bpm: 75,
    swing: 15,
    drums: {
      kick: P('x... .... ..x. ....'),
      snare: P('.... x... .... x...'),
      clap: P('.... x... .... x...'),
      hat: P('xxxx xxxx xxxx xxxx'),
      ohat: P('.... .... .... ....'),
      perc: P('.... ...x .... ....'),
    },
    bassRhythm: [0, 10],
  },
  lofi: {
    label: 'Lo-fi',
    bpm: 82,
    swing: 40,
    drums: {
      kick: P('x... .... .x.. ....'),
      snare: P('.... x... .... x...'),
      clap: P('.... .... .... ....'),
      hat: P('x.x. x.x. x.x. x.x.'),
      ohat: P('.... .... .... ....'),
      perc: P('.... .... .... ..x.'),
    },
    bassRhythm: [0, 8],
  },
};
export const STYLE_ORDER = ['trap', 'drill', 'boombap', 'rnb', 'lofi'];

/** Applica il groove di uno stile alla batteria (1 battuta, ripetuta). */
export function drumsFromStyle(styleId) {
  const st = STYLES[styleId];
  return Object.fromEntries(DRUMS.map((d) => [d.id, Array.from({ length: MAX_STEPS }, (_, i) => (st.drums[d.id] || [])[i % 16] || 0)]));
}

/** 808 / basso che segue gli accordi, col ritmo tipico dello stile (note lunghe fino al colpo dopo). */
export function bassFromChords(sketch, styleId = 'trap') {
  const rhythm = STYLES[styleId]?.bassRhythm || [0, 8];
  const { root, steps } = scaleOf(sketch.key);
  const out = [];
  let last = null;
  for (let bar = 0; bar < sketch.bars; bar++) {
    const deg = sketch.chords[bar] ?? last;
    if (deg == null) continue;
    last = deg;
    // tonica dell'accordo nell'ottava bassa (tra E1 e D#2: zona da 808)
    let m = 24 + ((root + steps[deg]) % 12);
    if (m < 28) m += 12;
    rhythm.forEach((r, k) => {
      const next = k + 1 < rhythm.length ? rhythm[k + 1] : 16;
      out.push({ pitch: m, start: bar * 16 + r, len: next - r, vel: 1 });
    });
  }
  return out;
}

/** Giro di accordi ripetuto su tutte le battute del loop. */
export function chordsFromProgression(degrees, bars) {
  return Array.from({ length: bars }, (_, i) => degrees[i % degrees.length]);
}

/**
 * Accordi che "stanno sotto" la melodia: per ogni battuta scelgo il grado della scala
 * il cui accordo contiene di più le note cantate (pesate per durata).
 */
export function chordsForMelody(melody, keyId, bars, styleId = 'trap') {
  const { root, minor, steps } = scaleOf(keyId);
  const usable = minor ? [0, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5]; // niente accordi diminuiti
  const fallback = (minor ? PROGRESSIONS.minor : PROGRESSIONS.major)[styleId === 'drill' ? 3 : 0].degrees;
  const out = [];
  for (let bar = 0; bar < bars; bar++) {
    const inBar = melody.filter((n) => n.start < (bar + 1) * 16 && n.start + n.len > bar * 16);
    if (!inBar.length) {
      out.push(fallback[bar % fallback.length]);
      continue;
    }
    let best = 0;
    let bestScore = -Infinity;
    for (const deg of usable) {
      const tones = [0, 2, 4].map((k) => (root + steps[(deg + k) % 7]) % 12);
      let score = 0;
      for (const n of inBar) {
        const pc = ((n.pitch % 12) + 12) % 12;
        const dur = Math.min(n.start + n.len, (bar + 1) * 16) - Math.max(n.start, bar * 16);
        if (pc === tones[0]) score += dur * 1.3;
        else if (tones.includes(pc)) score += dur;
        else score -= dur * 0.4;
      }
      if (bar === 0 && deg === 0) score += 1.5; // si parte volentieri dalla tonica
      if (out.length && out[out.length - 1] === deg) score -= 0.8; // un po' di movimento
      if (score > bestScore) {
        bestScore = score;
        best = deg;
      }
    }
    out.push(best);
  }
  return out;
}

/** "Crea beat da questa melodia": accordi + batteria + 808 nello stile scelto. */
export function beatFromMelody(sketch, styleId) {
  const st = STYLES[styleId];
  const chords = chordsForMelody(sketch.notes.melody, sketch.key, sketch.bars, styleId);
  const withChords = { ...sketch, chords };
  return {
    chords,
    drums: drumsFromStyle(styleId),
    drumSteps: 16,
    swing: st.swing || 0,
    notes: { ...sketch.notes, bass: bassFromChords(withChords, styleId) },
    instruments: { ...sketch.instruments, chords: styleId === 'lofi' || styleId === 'rnb' ? 'piano' : 'pad' },
  };
}
