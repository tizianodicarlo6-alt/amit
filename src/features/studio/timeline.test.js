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

test('punch-in: la take più nuova sostituisce solo la parte che ha registrato', async () => {
  const { mainIntervals } = await import('./timeline.js');
  const m = mainIntervals([
    { id: 'tutta', start: 8, end: 60, createdAt: 1 },
    { id: 'strofa2', start: 30, end: 45, createdAt: 2 },
    { id: 'pezzetto', start: 40, end: 50, createdAt: 3 },
  ]);
  assert.deepEqual(m.get('pezzetto'), [[40, 50]]);
  assert.deepEqual(m.get('strofa2'), [[30, 40]]);
  assert.deepEqual(m.get('tutta'), [[8, 30], [50, 60]]);
});

test('voci: ritardo per modalità, ruoli e take spente', async () => {
  const { buildVoices } = await import('./voices.js');
  const buf = { duration: 10 };
  const takes = [
    { id: 'v1', role: 'main', mode: 'speaker', offset: 5, duration: 10, voiceStart: 1, voiceEnd: 9, createdAt: 1, buffer: buf },
    { id: 'd1', role: 'double', mode: 'headphones', offset: 5, duration: 10, createdAt: 2, buffer: buf },
    { id: 'd2', role: 'double', mode: 'headphones', offset: 5, duration: 10, createdAt: 3, buffer: buf },
    { id: 'off', role: 'adlib', offset: 5, duration: 10, createdAt: 4, included: false, buffer: buf },
  ];
  const v = buildVoices(takes, { lat: { speaker: 0.2 } });
  assert.equal(v.length, 3); // la take spenta non suona
  assert.equal(v[0].pos, 4.8); // 5 - 0.2 (senza cuffie, misurato)
  assert.deepEqual(v[0].active, [[5.8, 13.8]]);
  assert.equal(v[1].pos, 4.96); // 5 - 0.04 (cuffie, valore di partenza)
  assert.deepEqual([v[1].pan, v[2].pan], [-0.35, 0.35]); // doppie aperte
  assert.ok(v[1].gain < v[0].gain);
});
