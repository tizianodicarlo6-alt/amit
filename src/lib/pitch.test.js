import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pitchShift } from './pitch.js';

const SR = 22050;
// frequenza stimata contando i passaggi per lo zero (sulla parte centrale)
function freqOf(x) {
  const a = Math.floor(x.length * 0.2);
  const b = Math.floor(x.length * 0.8);
  let n = 0;
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return n / ((b - a) / SR);
}
const sine = (f, secs) => Float32Array.from({ length: SR * secs }, (_, i) => Math.sin((2 * Math.PI * f * i) / SR) * 0.5);

test('pitch: +12 raddoppia, −12 dimezza, durata uguale', () => {
  const x = sine(220, 2);
  const up = pitchShift(x, SR, 12);
  const down = pitchShift(x, SR, -12);
  assert.equal(up.length, x.length);
  assert.equal(down.length, x.length);
  assert.ok(Math.abs(freqOf(up) - 440) < 8, `su: ${freqOf(up)}`);
  assert.ok(Math.abs(freqOf(down) - 110) < 4, `giù: ${freqOf(down)}`);
  const fifth = pitchShift(x, SR, 7);
  assert.ok(Math.abs(freqOf(fifth) - 220 * 2 ** (7 / 12)) < 6, `quinta: ${freqOf(fifth)}`);
  assert.equal(pitchShift(x, SR, 0), x); // 0 = nessuna modifica
});
