import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, moveRegion, regionFromDrag, regionLabel, resizeRegion } from './loopRegion.js';

// 120 BPM → battuta di 2 s, primo battito a 0,5 s, beat lungo 60 s
const g = makeGrid({ bpm: 120, anchor: 0.5, duration: 60 });

test('trascinando si sceglie una zona a battute intere', () => {
  assert.deepEqual(regionFromDrag(9.3, 3.1, g), { from: 2.5, to: 10.5 }); // dal dito indietro va bene uguale
  assert.equal(regionLabel({ from: 2.5, to: 10.5 }, g), 'Batt. 2–5 · 4 battute');
  assert.deepEqual(regionFromDrag(5, 5.1, g), { from: 4.5, to: 6.5 }); // un tocco = almeno 1 battuta
});

test('sposto e allargo la zona', () => {
  const r = { from: 2.5, to: 10.5 };
  assert.deepEqual(moveRegion(r, 7.2, g), { from: 10.5, to: 18.5 });
  assert.deepEqual(moveRegion(r, -30, g), { from: 0.5, to: 8.5 }); // non esce dal beat (parte dal primo battito)
  assert.deepEqual(resizeRegion(r, 'to', 26.6, g), { from: 2.5, to: 26.5 });
  assert.deepEqual(resizeRegion(r, 'from', 12, g), { from: 8.5, to: 10.5 }); // almeno 1 battuta
});

test('senza BPM: passi da mezzo secondo', () => {
  const g2 = makeGrid({ bpm: null, duration: 30 });
  assert.deepEqual(regionFromDrag(1.2, 3.7, g2), { from: 1, to: 4 });
  assert.equal(regionLabel({ from: 1, to: 4 }, g2), '0:01–0:04');
});
