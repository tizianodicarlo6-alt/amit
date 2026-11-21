import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBeatName, computePeaks } from './audio.js';

test('nome beat → titolo, produttore, bpm', () => {
  assert.deepEqual(parseBeatName('Notte Fonda (prod. Kid Beats).mp3'), { title: 'Notte Fonda', producer: 'Kid Beats', bpm: null });
  assert.deepEqual(parseBeatName('Kid Beats - Notte Fonda 140bpm.wav'), { title: 'Notte Fonda', producer: 'Kid Beats', bpm: 140 });
  assert.deepEqual(parseBeatName('dark_trap_beat.mp3'), { title: 'dark trap beat', producer: '', bpm: null });
  assert.deepEqual(parseBeatName('Sole [Prod by Mario] 92 BPM.m4a'), { title: 'Sole', producer: 'Mario', bpm: 92 });
});

test('picchi normalizzati', () => {
  const ch = new Float32Array(1600).map((_, i) => (i < 800 ? 0.5 : -0.25));
  const p = computePeaks(ch, 4);
  assert.deepEqual(p, [1, 1, 0.5, 0.5]);
});
