import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rootOf } from './samples.js';

test('808 caricato: trovo la sua nota', () => {
  const sr = 44100;
  // 808 in F1 (MIDI 29 → 43.65 Hz) con attacco che scende e un po' di distorsione
  const f = 440 * 2 ** ((29 - 69) / 12);
  let ph = 0;
  const x = Float32Array.from({ length: sr * 1.5 }, (_, i) => {
    const t = i / sr;
    const fr = f * (1 + Math.exp(-t / 0.02));
    ph += (2 * Math.PI * fr) / sr;
    return Math.tanh(2.5 * Math.sin(ph)) * Math.exp(-t / 0.9) * 0.8;
  });
  assert.equal(rootOf(x, sr), 29);
});
