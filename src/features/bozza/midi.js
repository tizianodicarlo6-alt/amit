// File MIDI della bozza: lo apre qualunque programma (FL Studio, Logic, Ableton…).
// Tracce separate: Batteria (canale 10), Melodia, Accordi, 808. Con BPM, tonalità e 4/4.
import { DRUMS, chordNotes, normalizeSketch, scaleOf, sectionLabels, songBars } from './music.js';

const PPQ = 96; // tick per quarto
const STEP = PPQ / 4; // un sedicesimo

function varLen(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}
const str = (s) => [...new TextEncoder().encode(s)];

function track(events, name) {
  // events: { tick, data: [...] } — ordino, a parità di tempo prima i "note off"
  const sorted = [...events].sort((a, b) => a.tick - b.tick || (a.off ? -1 : 0) - (b.off ? -1 : 0));
  const body = [0x00, 0xff, 0x03, ...varLen(str(name).length), ...str(name)];
  let last = 0;
  for (const e of sorted) {
    body.push(...varLen(e.tick - last), ...e.data);
    last = e.tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00); // fine traccia
  return [...str('MTrk'), (body.length >>> 24) & 255, (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255, ...body];
}

const note = (ch, pitch, tick, len, vel = 100) => [
  { tick, data: [0x90 | ch, pitch, vel] },
  { tick: tick + Math.max(1, len), data: [0x80 | ch, pitch, 0], off: true },
];

/** Diesis/bemolle in chiave (−7…+7) per la tonalità. */
export function keySignature(keyId) {
  const { root, minor } = scaleOf(keyId);
  const majorRoot = minor ? (root + 3) % 12 : root;
  const SF = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5]; // C Db D Eb E F F# G Ab A Bb B
  return { sf: SF[majorRoot], minor };
}

/** Crea il file MIDI (Uint8Array). `loops` = quante volte ripetere il loop. */
export function sketchToMidi(raw, { loops = 2, song = false } = {}) {
  const s = normalizeSketch(raw);
  const loopSteps = s.bars * 16;
  const usPerQuarter = Math.round(60000000 / s.bpm);
  const { sf, minor } = keySignature(s.key);
  const meta = [
    { tick: 0, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255] },
    { tick: 0, data: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] },
    { tick: 0, data: [0xff, 0x59, 0x02, sf & 255, minor ? 1 : 0] },
  ];
  const drums = [];
  const melody = [];
  const chords = [];
  const bass = [];
  const swingTicks = (step) => (step % 2 === 1 ? Math.round((s.swing / 100) * STEP * 0.5) : 0);
  // battuta per battuta: il loop ripetuto, oppure tutto il brano con la struttura
  const allOn = { drums: true, melody: true, chords: true, bass: true };
  const bars = song && s.structure.length ? songBars(s) : Array.from({ length: s.bars * loops }, (_, i) => ({ patternBar: i % s.bars, parts: allOn }));
  bars.forEach((bar, bi) => {
    const base = bi * 16 * STEP;
    const pb = bar.patternBar;
    const on = bar.parts;
    if (on.drums)
      for (let k = 0; k < 16; k++) {
        const step = pb * 16 + k;
        for (const d of DRUMS) {
          const v = s.drums[d.id][step % s.drumSteps];
          if (!v) continue;
          const hits = d.roll && v > 1 ? v : 1;
          for (let h = 0; h < hits; h++) drums.push(...note(9, d.gm, base + k * STEP + swingTicks(step) + Math.round((h * STEP) / hits), Math.round(STEP / hits / 2), hits > 1 ? 80 : 105));
        }
      }
    const inBar = (n) => n.start >= pb * 16 && n.start < (pb + 1) * 16 && n.start < loopSteps;
    if (on.melody) for (const n of s.notes.melody) if (inBar(n)) melody.push(...note(0, n.pitch + (s.partPitch.melody || 0), base + (n.start - pb * 16) * STEP + swingTicks(n.start), n.len * STEP - 2, 100));
    if (on.bass) for (const n of s.notes.bass) if (inBar(n)) bass.push(...note(2, n.pitch + (s.partPitch.bass || 0), base + (n.start - pb * 16) * STEP + swingTicks(n.start), n.len * STEP - 2, 110));
    const deg = s.chords[pb];
    if (on.chords && deg != null) for (const m of chordNotes(s.key, deg, 48)) chords.push(...note(1, m + (s.partPitch.chords || 0), base, 16 * STEP - 4, 80));
  });
  // nomi delle sezioni come "marker" (in FL/Logic/Ableton si vedono sulla linea del tempo)
  if (song && s.structure.length) {
    const labels = sectionLabels(s.structure);
    let at = 0;
    s.structure.forEach((sec, i) => {
      meta.push({ tick: at * 16 * STEP, data: [0xff, 0x06, ...varLen(str(labels[i]).length), ...str(labels[i])] });
      at += sec.bars;
    });
  }
  const tracks = [track(meta, `${s.title || 'Bozza'} · ${s.bpm} BPM · ${s.key}`), track(drums, 'Batteria'), track(melody, 'Melodia'), track(chords, 'Accordi'), track(bass, '808')];
  const header = [...str('MThd'), 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...header, ...tracks.flat()]);
}
