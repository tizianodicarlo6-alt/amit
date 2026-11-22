import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArchive, suggestGhost } from './ghost.js';

test('barra fantasma: propone una tua barra che rima e resta sul tema', () => {
  const archive = buildArchive({
    ideas: [
      { id: 'n1', type: 'text', text: 'ho visto la città bruciare di notte\nmangio una mela' },
      { id: 'n2', type: 'text', text: 'resto sveglio fino a tardi in mezzo alle botte' },
      { id: 'cur', type: 'text', text: 'scrivo sotto la luna' },
    ],
    tracks: [{ id: 't1', sections: [{ text: '[Strofa]\nla mia città mi ha cresciuto tra le rotte' }] }],
  });
  assert.ok(!archive.some((a) => a.text.startsWith('['))); // le righe di sezione non contano
  const lines = ['cammino solo dentro la città di notte', ''];
  const s = suggestGhost(archive, lines, 1, { exclude: 'cur' });
  assert.ok(s.length >= 2);
  assert.ok(/botte|rotte/.test(s[0].text), s[0].text); // rima con "notte"
  assert.ok(s[0].why.includes('rima'));
  assert.ok(!s.some((x) => x.text === 'cammino solo dentro la città di notte'));
  assert.ok(!s.some((x) => x.ref === 'cur'));
});

test('inserisco la barra fantasma nel posto giusto', async () => {
  const { insertGhostLine } = await import('../components/ghostInsert.js');
  assert.equal(insertGhostLine('uno\n', 1, 'due'), 'uno\ndue');
  assert.equal(insertGhostLine('uno\ntre', 0, 'due'), 'uno\ndue\ntre');
});
