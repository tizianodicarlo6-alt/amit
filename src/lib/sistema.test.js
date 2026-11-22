import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frasi, sistema } from './sistema.js';

test('sistema: frasi buone, coppie che rimano, temi', () => {
  const testo = 'notte\nla città non dorme mai di notte. ho le mani sporche\nfratelli persi nelle rotte\nla città mi ha dato tutto, la città mi ha tolto\nimpossibile';
  assert.ok(frasi(testo).length >= 5);
  const r = sistema(testo);
  assert.ok(r.buone.includes('la città non dorme mai di notte'));
  assert.ok(!r.buone.includes('notte')); // troppo corta per essere una barra
  assert.ok(r.coppie.some((g) => g.some((f) => f.endsWith('notte')) && g.some((f) => f.endsWith('rotte'))));
  assert.ok(r.temi.some((t) => t.parola === 'città'));
});
