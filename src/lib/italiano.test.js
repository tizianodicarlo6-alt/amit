import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWordSyllables, countLineSyllables, rhymeKey, rhymeColors, assonanceKey, analyzeRhymes } from './italiano.js';

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

test('assonanze', () => {
  const ass = (a, b) => assert.equal(assonanceKey(a), assonanceKey(b), `${a} / ${b}`);
  ass('notte', 'molle');
  ass('amore', 'sole');
  ass('strada', 'casa');
  ass('città', 'là');
  assert.notEqual(assonanceKey('casa'), assonanceKey('cose'));
  const a = analyzeRhymes('la notte\nle rotte\nil sole', 'assonanze');
  assert.equal(a.stats.rime, 1); // notte / rotte
  assert.equal(a.stats.assonanze, 1); // gruppo "oe": otte + ole
  assert.ok(a.colors.has('oe'));
  assert.ok(a.exact.has(rhymeKey('notte')));
  assert.ok(!a.exact.has(rhymeKey('sole')));
});

test('vocali delle sillabe e multisillabiche', async () => {
  const { vowelSeq, multiKeys, multiColors, tokenizeLine } = await import('./italiano.js');
  assert.deepEqual(vowelSeq('fantasma'), ['a', 'a', 'a']);
  assert.deepEqual(vowelSeq('ciao'), ['a', 'o']);
  assert.deepEqual(vowelSeq('aiuto'), ['a', 'u', 'o']);
  // "sotto casa" e "molto rara" non rimano perfette ma hanno le stesse vocali: (o)-o-a-a
  const k1 = multiKeys(tokenizeLine('ci vediamo sotto casa')).at(-1);
  const k2 = multiKeys(tokenizeLine('una cosa molto rara')).at(-1);
  assert.equal(k1.mkey, k2.mkey);
  assert.equal(tokenizeLine('ci vediamo sotto casa')[k1.from].text, 'sotto'); // la rima parte da "sotto"
  assert.equal(multiColors('ci vediamo sotto casa\nuna cosa molto rara\nniente').size, 1);
});
