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
