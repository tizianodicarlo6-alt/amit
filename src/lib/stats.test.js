import { test } from 'node:test';
import assert from 'node:assert/strict';

test('contatori della prova', async () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  const { addBars, logEvent, trialNumbers, lastStall } = await import('./stats.js');
  addBars(3);
  addBars(2);
  logEvent('capture');
  logEvent('capture');
  logEvent('reuse');
  logEvent('stall');
  logEvent('unblock');
  const n = trialNumbers();
  assert.equal(n.daysWriting7, 1);
  assert.deepEqual([n.capture, n.reuse, n.stall, n.unblock], [2, 1, 1, 1]);
  assert.ok(lastStall() > 0);
});
