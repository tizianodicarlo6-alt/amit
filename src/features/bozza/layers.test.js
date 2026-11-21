import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioRuns, fitLoop, guessLoopBars, makeChoir, trimStart } from './layers.js';
import { normalizeSketch, newSection, sectionLabels, songBars, CLASSIC_STRUCTURE } from './music.js';

const sr = 8000;
function clicks(bpm, beats, len) {
  const x = new Float32Array(Math.round(len * sr));
  for (let k = 0; k < beats; k++) {
    const a = Math.round(((k * 60) / bpm) * sr);
    for (let i = 0; i < 200 && a + i < x.length; i++) x[a + i] = Math.sin(i * 0.9) * Math.exp(-i / 40) * (k % 4 ? 0.5 : 1);
  }
  return x;
}

test('loop: riconosco le battute e lo metto a tempo', () => {
  const x = clicks(90, 16, (16 * 60) / 90); // 4 battute a 90 BPM
  const g = guessLoopBars(x, sr, 140);
  assert.equal(g.bars, 4);
  const y = fitLoop(x, sr, { bpm: 140, bars: g.bars });
  assert.equal(y.length, Math.round(((4 * 240) / 140) * sr)); // 4 battute a 140
});

test('silenzio iniziale tolto', () => {
  const x = new Float32Array(sr);
  x.fill(0.5, sr / 2);
  assert.ok(Math.abs(trimStart(x, sr).length - sr / 2) < sr * 0.01);
});

test('coro: stessa durata, stereo, non più forte della voce', () => {
  const x = new Float32Array(sr).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr));
  for (const fx of ['coro', 'armonie']) {
    const { L, R } = makeChoir(x, sr, fx);
    assert.equal(L.length, x.length);
    assert.ok(Math.max(...L.map(Math.abs)) <= 0.5001);
    assert.notDeepEqual(L, R);
  }
});

test('struttura: battute del brano e pezzi audio', () => {
  const sk = normalizeSketch({ bars: 4, structure: CLASSIC_STRUCTURE.map(newSection) });
  assert.deepEqual(sectionLabels(sk.structure), ['Intro', 'Strofa 1', 'Ritornello 1', 'Strofa 2', 'Ritornello 2', 'Bridge', 'Ritornello 3', 'Outro']);
  const bars = songBars(sk);
  assert.equal(bars.length, 4 + 16 + 8 + 16 + 8 + 8 + 8 + 4);
  assert.equal(bars[4].patternBar, 0); // la strofa riparte dalla battuta 1 del loop
  assert.equal(bars[0].parts.drums, false); // intro senza batteria
  // voce (loop di 4 battute) solo nei ritornelli e nel bridge
  const runs = audioRuns(bars.map((b) => ({ on: b.parts.voce, loopBar: b.patternBar })), 4);
  assert.equal(runs[0].bar, 20);
  assert.equal(runs[0].offsetBars, 0);
  assert.equal(runs[0].lenBars, 4);
});
