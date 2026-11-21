import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBpm, detectKey, parseKeyId } from './analysis.js';

const SR = 11025;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Beat sintetico: cassa e rullante a tempo, hi-hat in ottavi (hats=2) o sedicesimi (hats=4).
function drums(bpm, secs = 30, hats = 2) {
  const out = new Float32Array(SR * secs);
  const beat = 60 / bpm;
  for (let t = 0, i = 0; t < secs; t += beat / hats, i++) {
    const s0 = Math.floor(t * SR);
    const isKick = i % (2 * hats) === 0;
    const isSnare = i % (2 * hats) === hats;
    for (let j = 0; j < SR * 0.12 && s0 + j < out.length; j++) {
      const tt = j / SR;
      let v = (Math.random() * 2 - 1) * Math.exp(-tt * 120) * 0.15; // hi-hat
      if (isKick) v += Math.sin(2 * Math.PI * 55 * tt) * Math.exp(-tt * 25);
      if (isSnare) v += (Math.random() * 2 - 1) * Math.exp(-tt * 30) * 0.6;
      out[s0 + j] += v;
    }
  }
  return out;
}

// Giro di accordi (triadi con armonici).
function chords(progression, secs = 24) {
  const out = new Float32Array(SR * secs);
  const per = secs / progression.length;
  progression.forEach((notes, c) => {
    const s0 = Math.floor(c * per * SR);
    for (let j = 0; j < per * SR; j++) {
      const t = j / SR;
      let v = 0;
      for (const n of notes) for (let h = 1; h <= 3; h++) v += Math.sin(2 * Math.PI * midi(n) * h * t) / (h * h);
      out[s0 + j] = v * 0.2;
    }
  });
  return out;
}

test('BPM: tempi tipici del rap', () => {
  for (const [bpm, hats] of [[80, 2], [85, 4], [92, 2], [100, 4], [128, 2], [140, 2], [140, 4], [145, 4], [150, 2]]) {
    const r = detectBpm(drums(bpm, 30, hats), SR);
    assert.ok(Math.abs(r.bpm - bpm) <= 1, `atteso ${bpm} (hats ${hats}), trovato ${r.bpm}`);
  }
});

test('BPM ambiguo: il valore giusto è tra le alternative (½ / ×2)', () => {
  const r = detectBpm(drums(160, 30, 4), SR);
  assert.ok(r.bpm === 160 || r.alternatives.includes(160), `trovato ${r.bpm} ${r.alternatives}`);
});

test('Tonalità: La minore e Do maggiore, Fa# minore', () => {
  // Am – F – C – G (in La minore)
  assert.equal(detectKey(chords([[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [52, 56, 59]]), SR).id, 'Am');
  // C – F – G – C (Do maggiore)
  assert.equal(detectKey(chords([[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55], [48, 52, 55]]), SR).id, 'C');
  // F#m – D – A – C#
  assert.equal(detectKey(chords([[54, 57, 61], [50, 54, 57], [57, 61, 64], [49, 53, 56], [54, 57, 61]]), SR).id, 'F#m');
});

test('Camelot e nomi in inglese', () => {
  assert.deepEqual(parseKeyId('Am'), { id: 'Am', label: 'A Minor', camelot: '8A' });
  assert.deepEqual(parseKeyId('C'), { id: 'C', label: 'C Major', camelot: '8B' });
  assert.deepEqual(parseKeyId('F#m'), { id: 'F#m', label: 'F# Minor', camelot: '11A' });
  assert.equal(parseKeyId('xyz'), null);
});

test('Attacco: intro senza batteria poi entra il beat', async () => {
  const { detectAttack } = await import('./analysis.js');
  const intro = chords([[57, 60, 64]], 8).map((v) => v * 0.5); // 8 s solo accordo
  const body = drums(90, 20);
  const all = new Float32Array(intro.length + body.length);
  all.set(intro);
  all.set(body, intro.length);
  for (let i = 0; i < body.length; i++) all[intro.length + i] += Math.sin((2 * Math.PI * 220 * i) / SR) * 0.1;
  const t = detectAttack(all, SR);
  assert.ok(Math.abs(t - 8) <= 0.3, `atteso ~8 s, trovato ${t}`);
  assert.equal(detectAttack(drums(90, 20), SR), 0); // beat che parte subito
  // intro con un "pad" che continua anche dopo (caso tipico)
  const pad = (n) => Array.from({ length: n }, (_, i) => 0.18 * Math.sin((2 * Math.PI * 220 * i) / SR) + 0.1 * Math.sin((2 * Math.PI * 261.6 * i) / SR));
  const b2 = drums(90, 24);
  const withPad = new Float32Array(SR * 8 + b2.length);
  withPad.set(pad(withPad.length));
  for (let i = 0; i < b2.length; i++) withPad[SR * 8 + i] += b2[i];
  const t2 = detectAttack(withPad, SR);
  assert.ok(Math.abs(t2 - 8) <= 0.3, `pad: atteso ~8 s, trovato ${t2}`);
});
