import { test } from 'node:test';
import assert from 'node:assert/strict';

test('catena: come chiude la riga', async () => {
  // il componente importa React: prendo solo la funzione pura passando dal modulo compilato da node
  const { closesOn } = await import('./catenaLogic.js');
  assert.equal(closesOn('torno a casa', 'casa'), 'stessa');
  assert.equal(closesOn('in mezzo alla massa', 'casa'), 'rima');
  assert.equal(closesOn('una vita da fantasma', 'casa'), 'assonanza');
  assert.equal(closesOn('ho perso la strada', 'lontano'), null);
  assert.equal(closesOn('mi hanno mandato in canada', 'salita'), null);
  assert.equal(closesOn('sotto casa', 'molto rara'.split(' ')[1]), 'assonanza');
});
