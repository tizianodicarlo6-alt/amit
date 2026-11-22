import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignRange, beatMap, labelMap, setMapKind, splitMap } from './beatMap.js';

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

// beat più realistico: ritornello con lo STESSO volume della strofa, ma più brillante (hi-hat fitti, melodia in alto)
function synth({ bpm = 140, sr = 22050, plan, seed = 1, sameLoud = true }) {
  let r = seed; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647) - 0.5;
  const beat = 60 / bpm, bar = beat * 4;
  const total = plan.reduce((s, [, n]) => s + n, 0);
  const x = new Float32Array(Math.ceil(total * bar * sr));
  let b0 = 0;
  for (const [kind, n] of plan) {
    const s0 = Math.round(b0 * bar * sr), s1 = Math.round((b0 + n) * bar * sr);
    const seg = new Float32Array(s1 - s0);
    const L = seg.length;
    const add = (t, f) => { const i = Math.round(t * sr); for (let k = 0; i + k < L && k < sr * 0.4; k++) seg[i + k] += f(k / sr); };
    for (let bb = 0; bb < n; bb++) {
      const tb = bb * bar;
      // pad (accordo) sempre, tranne nello stacco
      if (kind !== 'break') for (let k = Math.round(tb * sr); k < Math.round((tb + bar) * sr) && k < L; k++) { const t = k / sr; seg[k] += 0.08 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277 * t) + Math.sin(2 * Math.PI * 330 * t)); }
      const drums = kind === 'verse' || kind === 'chorus';
      if (drums) for (let q = 0; q < 4; q++) {
        const t = tb + q * beat;
        if (q % 2 === 0) add(t, (u) => Math.exp(-u * 8) * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-u * 30)) * u) * 0.9);
        else add(t, (u) => Math.exp(-u * 25) * rnd() * 0.7);
        const hats = kind === 'chorus' ? 4 : 2;
        for (let h = 0; h < hats; h++) add(t + (h * beat) / hats, (u) => (u < 0.03 ? Math.exp(-u * 150) * rnd() * 0.35 : 0));
      }
      if (kind === 'chorus') for (let q = 0; q < 8; q++) { const t = tb + q * beat / 2, f = [880, 988, 1175, 1319][(bb + q) % 4]; add(t, (u) => (u < beat / 2 ? 0.12 * Math.sign(Math.sin(2 * Math.PI * f * u)) * Math.exp(-u * 4) : 0)); }
      if (kind === 'break') for (let k = Math.round(tb * sr); k < Math.round((tb + bar) * sr) && k < L; k++) seg[k] += 0.05 * Math.sin(2 * Math.PI * 440 * k / sr);
    }
    if (sameLoud && (kind === 'verse' || kind === 'chorus')) { let e = 0; for (const v of seg) e += v * v; const g = 0.25 / Math.sqrt(e / L); for (let k = 0; k < L; k++) seg[k] *= g; }
    x.set(seg, s0);
    b0 += n;
  }
  return { x, sr, bpm };
}

test('mappa: ritornello riconosciuto anche se ha lo stesso volume della strofa', () => {
  const plan = [['intro', 8], ['verse', 16], ['chorus', 8], ['verse', 16], ['chorus', 8]];
  for (const bpm of [80, 140, 160]) {
    const { x, sr } = synth({ plan, bpm, sr: 16000, seed: 5 });
    const m = beatMap(x, sr, { bpm });
    assert.deepEqual(m.map((s) => s.kind), ['intro', 'strofa', 'rit', 'strofa', 'rit'], `${bpm} BPM`);
    assert.deepEqual(m.slice(0, 4).map((s) => s.bars), [8, 16, 8, 16]);
  }
  const { x, sr } = synth({ plan: [['verse', 32]], bpm: 140, sr: 16000 });
  assert.deepEqual(beatMap(x, sr, { bpm: 140 }).map((s) => s.kind), ['strofa']);
});

test('mappa: correzioni a mano', () => {
  const m = labelMap([
    { start: 0, end: 8, kind: 'intro', bars: 4 },
    { start: 8, end: 40, kind: 'strofa', bars: 16 },
    { start: 40, end: 56, kind: 'rit', bars: 8 },
  ]);
  const s = splitMap(m, 1, 2);
  assert.deepEqual(s.map((x) => [x.kind, x.start, x.bars]), [['intro', 0, 4], ['strofa', 8, 8], ['rit', 24, 8], ['rit', 40, 8]].map(([k, st, b]) => [k, st, b]).slice(0, 4));
  const k = setMapKind(m, 0, 'strofa');
  assert.deepEqual(k.map((x) => [x.kind, x.bars]), [['strofa', 20], ['rit', 8]]);
});

test('mappa: un pezzo lungo e pieno non è un ritornello', () => {
  const plan = [['intro', 4], ['verse', 4], ['chorus', 40]];
  const { x, sr } = synth({ plan, bpm: 140, sr: 16000 });
  assert.ok(!beatMap(x, sr, { bpm: 140 }).some((s) => s.kind === 'rit'));
});

test('mappa: scegli un pezzo col dito e dici cos\'è', () => {
  const m = labelMap([
    { start: 0, end: 8, kind: 'intro', bars: 4 },
    { start: 8, end: 72, kind: 'rit', bars: 32 },
  ]);
  const a = assignRange(m, 8, 40, 'strofa', 2);
  assert.deepEqual(a.map((s) => [s.kind, s.start, s.end, s.bars]), [['intro', 0, 8, 4], ['strofa', 8, 40, 16], ['rit', 40, 72, 16]]);
  const b = assignRange(a, 56, 72, 'strofa', 2);
  assert.deepEqual(b.map((s) => s.label), ['Intro', 'Strofa 1', 'Rit', 'Strofa 2']);
});
