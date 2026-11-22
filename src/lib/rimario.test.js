import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, suggest, wordAt } from './rimario.js';

const words = readFileSync(new URL('../../public/words-it.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
const index = buildIndex(words);

test('rimario: rime, assonanze e multisillabiche', () => {
  const s = suggest(index, 'amore');
  assert.ok(s.rime.includes('cuore'));
  assert.ok(s.rime.includes('dolore'));
  assert.ok(!s.rime.includes('amore'));
  assert.ok(s.assonanze.length > 10);
  const m = suggest(index, 'casa', 'sotto');
  assert.equal(m.target, 'o·a·a');
  assert.ok(m.multi.length > 5);
});

test('parola sotto il cursore', () => {
  const t = 'prima riga\nci vediamo sotto casa';
  assert.deepEqual(wordAt(t, t.length), { word: 'casa', prev: 'sotto' });
  assert.deepEqual(wordAt(t, 2), { word: 'prima', prev: '' });
});
