// File MIDI della bozza: lo apre qualunque programma (FL Studio, Logic, Ableton…).
// Tracce separate: Batteria (canale 10), Melodia, Accordi, 808. Con BPM, tonalità e 4/4.
import { DRUMS, chordNotes, normalizeSketch, scaleOf } from './music.js';

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
export function sketchToMidi(raw, { loops = 2 } = {}) {
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
  for (let rep = 0; rep < loops; rep++) {
    const base = rep * loopSteps * STEP;
    for (let step = 0; step < loopSteps; step++) {
      for (const d of DRUMS) {
        const v = s.drums[d.id][step % s.drumSteps];
        if (!v) continue;
        const hits = d.roll && v > 1 ? v : 1;
        for (let h = 0; h < hits; h++) drums.push(...note(9, d.gm, base + step * STEP + swingTicks(step) + Math.round((h * STEP) / hits), Math.round(STEP / hits / 2), hits > 1 ? 80 : 105));
      }
    }
    for (const n of s.notes.melody) if (n.start < loopSteps) melody.push(...note(0, n.pitch + (s.partPitch.melody || 0), base + n.start * STEP + swingTicks(n.start), n.len * STEP - 2, 100));
    for (const n of s.notes.bass) if (n.start < loopSteps) bass.push(...note(2, n.pitch + (s.partPitch.bass || 0), base + n.start * STEP + swingTicks(n.start), n.len * STEP - 2, 110));
    for (let bar = 0; bar < s.bars; bar++) {
      const deg = s.chords[bar];
      if (deg == null) continue;
      for (const m of chordNotes(s.key, deg, 48)) chords.push(...note(1, m + (s.partPitch.chords || 0), base + bar * 16 * STEP, 16 * STEP - 4, 80));
    }
  }
  const tracks = [track(meta, `${s.title || 'Bozza'} · ${s.bpm} BPM · ${s.key}`), track(drums, 'Batteria'), track(melody, 'Melodia'), track(chords, 'Accordi'), track(bass, '808')];
  const header = [...str('MThd'), 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...header, ...tracks.flat()]);
}
