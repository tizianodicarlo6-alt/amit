import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, lineAt, nextBlockAfter, snapToBeat } from './timeline.js';

const sections = [
  { id: 's1', type: 'strofa', text: 'a\nb\nc\nd' },
  { id: 'r1', type: 'ritornello', text: 'rit 1\nrit 2' },
  { id: 'vuota', type: 'bridge', text: '   ' },
  { id: 's2', type: 'strofa', text: 'e\nf' },
];

test('mappa: intro, sezioni in fila e partenza segnata a mano', () => {
  const tl = buildTimeline(sections, { attack: 10, barDur: 2, starts: { s2: 40 } });
  assert.deepEqual(tl.blocks.map((b) => [b.label, b.start, b.explicit]), [
    ['Strofa 1', 10, false],
    ['Ritornello', 18, false],
    ['Strofa 2', 40, true],
  ]);
  assert.deepEqual(tl.lines.map((l) => l.time), [10, 12, 14, 16, 18, 20, 40, 42]);
});

test('riga corrente: niente durante intro e pause, giusta durante le sezioni', () => {
  const tl = buildTimeline(sections, { attack: 10, barDur: 2, starts: { s2: 40 } });
  assert.equal(lineAt(0, tl), -1); // intro del produttore
  assert.equal(lineAt(9.9, tl), -1);
  assert.equal(lineAt(10, tl), 0);
  assert.equal(lineAt(13, tl), 1);
  assert.equal(lineAt(21, tl), 5); // ultima riga del rit
  assert.equal(lineAt(30, tl), -1); // pausa prima della strofa 2
  assert.equal(lineAt(41, tl), 6);
  assert.equal(nextBlockAfter(30, tl).label, 'Strofa 2');
  assert.equal(nextBlockAfter(0, tl).label, 'Strofa 1');
});

test('aggancio al battito', () => {
  assert.equal(snapToBeat(10.62, 10, 0.5), 10.5);
  assert.equal(snapToBeat(10.8, 10, 0.5), 11);
});
