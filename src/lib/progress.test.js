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

test('settimana e numeri della settimana', async () => {
  const { weekKey, weekStats } = await import('./progress.js');
  assert.equal(weekKey(new Date(2026, 10, 22, 15).getTime()), '2026-11-16'); // domenica → lunedì prima
  assert.equal(weekKey(new Date(2026, 10, 23, 1).getTime()), '2026-11-23'); // lunedì
  const now = new Date(2026, 10, 22, 15).getTime();
  const p = { provini: 3, mana: 200, log: [{ at: now - 86400000, mana: 60 }, { at: now - 10 * 86400000, mana: 80 }, { at: now, mana: 60 }] };
  const w = weekStats(p, now);
  assert.equal(w.provini, 2);
  assert.equal(w.mana, 120);
  assert.equal(w.level, 4);
});
