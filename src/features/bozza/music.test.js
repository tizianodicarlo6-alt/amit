import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordLabel, chordNotes, drumsFromStyle, newSketchData, normalizeSketch, noteName, scaleNotes, snapToScale } from './music.js';

test('scale e note', () => {
  assert.deepEqual(scaleNotes('Am', 57, 69).map(noteName), ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
  assert.deepEqual(scaleNotes('C', 60, 72).length, 8);
  assert.equal(snapToScale(60.8, 'Am'), 60); // tra C e C# → C (in La minore)
  assert.equal(snapToScale(61.8, 'Am'), 62); // → D
  assert.equal(snapToScale(66, 'F#m'), 66);
});

test('accordi nella tonalità', () => {
  assert.deepEqual(chordNotes('Am', 0, 48).map(noteName), ['A3', 'C4', 'E4']);
  assert.deepEqual(chordNotes('Am', 5, 48).map(noteName), ['F4', 'A4', 'C5']);
  assert.deepEqual([0, 3, 5, 6].map((d) => chordLabel('Am', d)), ['Am', 'Dm', 'F', 'G']);
  assert.deepEqual([0, 4, 5].map((d) => chordLabel('C', d)), ['C', 'G', 'Am']);
});

test('groove e bozze', () => {
  const d = drumsFromStyle('trap');
  assert.equal(d.kick.length, 32);
  assert.equal(d.kick[0], 1);
  assert.equal(d.kick[16], 1); // ripetuto sulla seconda battuta
  assert.deepEqual([d.hat[13], d.hat[15]], [3, 4]); // rulli da 3 e da 4
  const old = normalizeSketch({ bpm: 90, drums: { kick: [1, 0, 1] } });
  assert.equal(old.drums.kick.length, 32);
  assert.equal(old.drums.snare.length, 32);
  assert.equal(old.bpm, 90);
  assert.equal(newSketchData().bars, 4);
});

test('808 dagli accordi e giri ripetuti', async () => {
  const { bassFromChords, chordsFromProgression, noteName } = await import('./music.js');
  const chords = chordsFromProgression([0, 5, 2, 6], 4);
  assert.deepEqual(chords, [0, 5, 2, 6]);
  const bass = bassFromChords({ key: 'Am', bars: 4, chords }, 'trap');
  assert.deepEqual(bass.slice(0, 2).map((n) => [noteName(n.pitch), n.start, n.len]), [['A1', 0, 10], ['A1', 10, 6]]);
  assert.equal(noteName(bass[2].pitch), 'F1'); // battuta 2: F
  assert.equal(chordsFromProgression([0, 3], 8).join(''), '03030303');
});

test('accordi scelti dalla melodia', async () => {
  const { chordsForMelody, beatFromMelody, chordLabel, newSketchData } = await import('./music.js');
  // battuta 1: A C E (Am) · battuta 2: F A C (F) · battuta 3: G B D (G) · battuta 4: vuota
  const mel = [
    { pitch: 69, start: 0, len: 4 }, { pitch: 72, start: 4, len: 4 }, { pitch: 76, start: 8, len: 8 },
    { pitch: 65, start: 16, len: 8 }, { pitch: 69, start: 24, len: 4 }, { pitch: 72, start: 28, len: 4 },
    { pitch: 67, start: 32, len: 8 }, { pitch: 71, start: 40, len: 4 }, { pitch: 74, start: 44, len: 4 },
  ];
  const ch = chordsForMelody(mel, 'Am', 4);
  assert.deepEqual(ch.slice(0, 3).map((d) => chordLabel('Am', d)), ['Am', 'F', 'G']);
  assert.ok(ch[3] != null); // la battuta vuota prende un accordo dal giro di base
  const sk = { ...newSketchData({ key: 'Am', bars: 4 }), notes: { melody: mel, bass: [] } };
  const b = beatFromMelody(sk, 'boombap');
  assert.equal(b.swing, 30);
  assert.ok(b.notes.bass.length >= 4);
  assert.equal(b.drums.snare[4], 1);
});
