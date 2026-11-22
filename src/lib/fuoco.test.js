import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatLines, sectionFire } from './fuoco.js';

test('fuoco: le righe forti scaldano più di quelle deboli', () => {
  const forte = heatLines(['ci vediamo sotto casa', 'una cosa molto rara', 'la mia vita è una salita', 'ogni ferita mi ha dato la grinta']);
  const debole = heatLines(['io vado a casa', 'tu mangi la mela', 'oggi è lunedì', 'yeah bro tipo yeah']);
  const s = (h) => h.reduce((a, x) => a + x.score, 0);
  assert.ok(s(forte) > s(debole) + 4, `${s(forte)} vs ${s(debole)}`);
  assert.ok(forte[1].why.includes('multisillabica'));
  assert.ok(sectionFire(forte) > sectionFire(debole));
  assert.equal(heatLines(['', 'ciao'])[0].level, 0);
});
