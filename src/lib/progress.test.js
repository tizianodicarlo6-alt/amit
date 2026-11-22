import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addProvino, levelOf, melodyMana, provinoMana } from './progress.js';

test('livello e mana', () => {
  const track = {
    id: 't1',
    title: 'Prova',
    sections: [{ text: 'ci vediamo sotto casa\nuna cosa molto rara\nla mia vita è una salita\nogni ferita mi ha dato la grinta' }],
    studio: { melodies: { s1: { sel: 'a', takes: [{ id: 'a', phrases: [{ start: 0, end: 1.4, syllables: 7 }, { start: 2, end: 3, syllables: 5 }] }] } } },
  };
  const m = provinoMana(track);
  assert.equal(m.quartine, 1);
  assert.ok(m.strofe >= 30);
  assert.equal(m.melodia, melodyMana(track.studio.melodies.s1.takes[0]));
  assert.ok(m.melodia > 0);
  assert.equal(m.total, 20 + m.strofe + m.melodia);
  const p = addProvino(null, track, m);
  assert.equal(levelOf(p), 2);
  assert.equal(p.mana, m.total);
  assert.equal(levelOf(null), 1);
});
