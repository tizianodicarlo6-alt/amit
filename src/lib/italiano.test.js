import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWordSyllables, countLineSyllables, rhymeKey, rhymeColors } from './italiano.js';

test('sillabe parole', () => {
  const casi = { casa: 2, paese: 3, poeta: 3, aiuto: 3, mai: 1, tuoi: 1, ritrovai: 3, giorno: 2, chiesa: 2, ciao: 2, strada: 2, rap: 1, io: 1, scuola: 2, amore: 3 };
  for (const [w, n] of Object.entries(casi)) assert.equal(countWordSyllables(w), n, w);
});

test('sillabe righe con sinalefe', () => {
  assert.equal(countLineSyllables('Nel mezzo del cammin di nostra vita'), 11);
  assert.equal(countLineSyllables('mi ritrovai per una selva oscura'), 11);
  assert.equal(countLineSyllables('la vita e la morte'), 6);
  assert.equal(countLineSyllables(''), 0);
});

test('chiavi di rima', () => {
  const rima = (a, b) => assert.equal(rhymeKey(a), rhymeKey(b), `${a} / ${b}`);
  const noRima = (a, b) => assert.notEqual(rhymeKey(a), rhymeKey(b), `${a} / ${b}`);
  rima('notte', 'rotte');
  rima('amore', 'cuore');
  rima('giorno', 'ritorno');
  rima('città', 'già');
  rima('strada', 'contrada');
  rima('piede', 'sede');
  rima('amor', 'cuor');
  rima('fatto', 'piatto');
  noRima('casa', 'cose');
  noRima('mare', 'muro');
  assert.equal(rhymeKey('il'), null);
  assert.equal(rhymeKey('che'), null);
});

test('colori solo per rime ripetute', () => {
  const m = rhymeColors('Corro nella notte\nle strade sono rotte\nil sole');
  assert.ok(m.has(rhymeKey('notte')));
  assert.ok(!m.has(rhymeKey('sole')));
});
