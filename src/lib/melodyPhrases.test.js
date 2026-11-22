import { test } from 'node:test';
import assert from 'node:assert/strict';
import { melodyPhrases } from './melodyPhrases.js';

// "na na na…": sillabe da 0,18 s con una consonante (calo di volume) in mezzo
function nanana(sr, plan) {
  const parts = [];
  for (const step of plan) {
    const n = Math.round(step.dur * sr);
    const a = new Float32Array(n);
    if (step.syl) {
      const sylLen = n / step.syl;
      for (let i = 0; i < n; i++) {
        const ph = (i % sylLen) / sylLen; // posizione nella sillaba
        const env = ph < 0.15 ? 0.15 + ph * 4 : 0.75 + 0.25 * Math.cos(ph * Math.PI); // "n" poi "a"
        a[i] = 0.4 * env * Math.sin((2 * Math.PI * 220 * i) / sr) + (Math.random() - 0.5) * 0.002;
      }
    } else for (let i = 0; i < n; i++) a[i] = (Math.random() - 0.5) * 0.002;
    parts.push(a);
  }
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

test('nanana: frasi e sillabe', () => {
  const sr = 16000;
  const x = nanana(sr, [{ dur: 0.3 }, { dur: 7 * 0.2, syl: 7 }, { dur: 0.45 }, { dur: 5 * 0.2, syl: 5 }, { dur: 0.5 }, { dur: 4 * 0.25, syl: 4 }, { dur: 0.3 }]);
  const ph = melodyPhrases(x, sr);
  assert.equal(ph.length, 3);
  assert.deepEqual(ph.map((p) => p.syllables), [7, 5, 4]);
  assert.ok(Math.abs(ph[0].start - 0.3) < 0.08);
});
