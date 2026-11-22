import test from 'node:test';
import assert from 'node:assert/strict';
import { headerType, parseLyrics, sectionsToText, sectionAtLine } from './sezioni.js';

test('riconosce i titoli', () => {
  for (const [l, t] of [['Ritornello', 'ritornello'], ['[Rit]', 'ritornello'], ['Strofa 2', 'strofa'], ['STROFA II:', 'strofa'], ['Hook', 'ritornello'], ['intro', 'intro'], ['(Bridge)', 'bridge']]) assert.equal(headerType(l), t, l);
  for (const l of ['ritorno a casa', 'la mia strofa migliore', '', 'Rit e poi basta']) assert.equal(headerType(l), null, l);
});

test('testo → sezioni con id stabili', () => {
  let n = 0;
  const mk = () => `n${++n}`;
  const txt = 'prima barra\nseconda\n\nRitornello\nrit uno\nrit due\n\nStrofa 2\nterza';
  const a = parseLyrics(txt, [], mk);
  assert.deepEqual(a.map((s) => [s.type, s.text]), [['strofa', 'prima barra\nseconda'], ['ritornello', 'rit uno\nrit due'], ['strofa', 'terza']]);
  const b = parseLyrics(txt.replace('terza', 'terza\nquarta'), a, mk);
  assert.deepEqual(b.map((s) => s.id), a.map((s) => s.id));
  assert.equal(sectionAtLine(a, 4).type, 'ritornello');
  assert.equal(sectionAtLine(a, 0).type, 'strofa');
});

test('sezioni → testo → sezioni', () => {
  const secs = [{ id: 'a', type: 'ritornello', text: 'uno\ndue' }, { id: 'b', type: 'strofa', text: 'tre' }];
  const back = parseLyrics(sectionsToText(secs), secs);
  assert.deepEqual(back.map(({ id, type, text }) => ({ id, type, text })), secs);
  assert.equal(sectionsToText([{ id: 'x', type: 'strofa', text: 'solo testo' }]), 'solo testo');
});
