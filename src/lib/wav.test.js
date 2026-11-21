import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, concatChunks, peakOf } from './wav.js';

test('WAV: intestazione e campioni', async () => {
  const left = new Float32Array([0, 1, -1, 0.5]);
  const right = new Float32Array([0, -1, 1, -0.5]);
  const blob = encodeWav([left, right], 44100);
  const buf = new DataView(await blob.arrayBuffer());
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf.buffer, o, n));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(buf.getUint16(22, true), 2); // stereo
  assert.equal(buf.getUint32(24, true), 44100);
  assert.equal(buf.getUint32(40, true), 4 * 2 * 2);
  assert.equal(buf.getInt16(44 + 4, true), 32767); // L campione 1
  assert.equal(buf.getInt16(44 + 6, true), -32768); // R campione 1
  assert.equal(blob.size, 44 + 16);
});

test('unione pezzi e picco', () => {
  const all = concatChunks([new Float32Array([0.1, 0.2]), new Float32Array([-0.7])]);
  assert.deepEqual([...all].map((x) => Math.round(x * 10) / 10), [0.1, 0.2, -0.7]);
  assert.equal(Math.round(peakOf(all) * 10) / 10, 0.7);
});

test('dove c\'è voce: salta silenzio iniziale e finale', async () => {
  const { voicedBounds } = await import('./wav.js');
  const sr = 8000;
  const x = new Float32Array(sr * 6); // 6 s: voce da 2 a 4 s
  for (let i = sr * 2; i < sr * 4; i++) x[i] = Math.sin(i / 5) * 0.3;
  for (let i = 0; i < x.length; i++) x[i] += (Math.random() - 0.5) * 0.004; // rumore di fondo
  const b = voicedBounds(x, sr);
  assert.ok(Math.abs(b.start - 1.85) < 0.1, `inizio ${b.start}`);
  assert.ok(Math.abs(b.end - 4.3) < 0.1, `fine ${b.end}`);
});
