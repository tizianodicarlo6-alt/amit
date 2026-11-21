import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessKey, pitchTrack, quantizeNotes, segmentNotes, yin } from './pitchTrack.js';
import { noteName } from './music.js';

const SR = 22050;
let seed = 3;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// "voce" finta: note con vibrato, armonici, attacco morbido, pause e rumore
function sing(notes, bpm) {
  const step = 60 / bpm / 4;
  const total = Math.max(...notes.map(([, s, l]) => s + l)) * step + 0.5;
  const x = new Float32Array(Math.ceil(total * SR));
  let ph = 0;
  for (const [m, s, l] of notes) {
    const a = Math.floor(s * step * SR);
    const n = Math.floor(l * step * 0.85 * SR); // stacco tra le note
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = mtof(m) * 2 ** ((Math.sin(2 * Math.PI * 5.5 * t) * 0.35) / 12); // vibrato ±35 cent
      ph += (2 * Math.PI * f) / SR;
      const envl = Math.min(1, t / 0.03) * Math.min(1, (n - i) / SR / 0.03);
      x[a + i] += (Math.sin(ph) * 0.5 + Math.sin(2 * ph) * 0.2 + Math.sin(3 * ph) * 0.08) * envl * 0.6;
    }
  }
  for (let i = 0; i < x.length; i++) x[i] += (rnd() - 0.5) * 0.01;
  return x;
}

test('YIN: trova la frequenza', () => {
  const f = 220;
  const fr = Float32Array.from({ length: 1000 }, (_, i) => Math.sin((2 * Math.PI * f * i) / SR) + 0.3 * Math.sin((4 * Math.PI * f * i) / SR));
  const r = yin(fr, SR);
  assert.ok(Math.abs(r.freq - f) < 1, `${r.freq}`);
  assert.ok(r.clarity > 0.9);
});

test('canticchiato → note a tempo e nella tonalità', () => {
  // melodia in La minore a 90 BPM (passi da 1/16): A4 C5 D5 E5 – D5 C5 A4
  const mel = [
    [69, 0, 4],
    [72, 4, 2],
    [74, 6, 2],
    [76, 8, 6],
    [74, 16, 2],
    [72, 18, 2],
    [69, 20, 8],
  ];
  const x = sing(mel, 90);
  const segs = segmentNotes(pitchTrack(x, SR));
  assert.equal(segs.length, mel.length, segs.map((s) => s.pitch.toFixed(1)).join(' '));
  const q = quantizeNotes(segs, { bpm: 90, key: 'Am', bars: 2 });
  assert.deepEqual(q.map((n) => noteName(n.pitch)), ['A4', 'C5', 'D5', 'E5', 'D5', 'C5', 'A4']);
  assert.deepEqual(q.map((n) => n.start), [0, 4, 6, 8, 16, 18, 20]);
  assert.equal(guessKey(q), 'Am');
});

test('cantato un\'ottava sotto (voce grave): la melodia torna nella sua zona', () => {
  const x = sing([[45, 0, 4], [48, 4, 4], [52, 8, 8]], 100); // A2 C3 E3
  const q = quantizeNotes(segmentNotes(pitchTrack(x, SR)), { bpm: 100, key: 'Am', bars: 1 });
  assert.deepEqual(q.map((n) => noteName(n.pitch)), ['A4', 'C5', 'E5']);
});
