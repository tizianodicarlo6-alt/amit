import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatMap } from './beatMap.js';

// beat finto a 120 BPM: intro (solo melodia) 4 · strofa 8 · rit (più pieno) 8 · strofa 8 · rit 8 · outro 4
function fakeBeat(sr) {
  const bar = 2; // secondi
  const plan = [['intro', 4], ['strofa', 8], ['rit', 8], ['strofa', 8], ['rit', 8], ['outro', 4]];
  const total = plan.reduce((s, [, n]) => s + n, 0) * bar;
  const x = new Float32Array(Math.round(total * sr));
  let t0 = 0;
  for (const [kind, n] of plan) {
    for (let i = Math.round(t0 * sr); i < Math.round((t0 + n * bar) * sr); i++) {
      const t = i / sr;
      const beatPh = (t % 0.5) / 0.5;
      const melody = 0.12 * Math.sin(2 * Math.PI * 440 * t);
      const kick = kind === 'intro' || kind === 'outro' ? 0 : 0.5 * Math.exp(-beatPh * 12) * Math.sin(2 * Math.PI * 55 * t);
      const extra = kind === 'rit' ? 0.25 * Math.sin(2 * Math.PI * 660 * t) + 0.2 * Math.sin(2 * Math.PI * 60 * t) : 0;
      x[i] = melody + kick + extra;
    }
    t0 += n * bar;
  }
  return x;
}

test('mappa del beat: intro, strofe, ritornelli, outro', () => {
  const sr = 8000;
  const m = beatMap(fakeBeat(sr), sr, { bpm: 120, anchor: 0 });
  assert.deepEqual(m.map((s) => s.kind), ['intro', 'strofa', 'rit', 'strofa', 'rit', 'outro']);
  assert.equal(m[2].start, 24);
  assert.equal(m[2].label, 'Rit 1');
});
