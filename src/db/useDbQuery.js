import { useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getEpoch, isRecoverable, recoverDb, subscribeEpoch } from './db.js';

/**
 * Come useLiveQuery, ma se Safari "stacca" il database non manda in errore l'app:
 * restituisce `fallback`, ricollega il database e ripete la lettura.
 */
export function useDbQuery(querier, deps = [], fallback) {
  const epoch = useSyncExternalStore(subscribeEpoch, getEpoch);
  return useLiveQuery(
    async () => {
      try {
        return await querier();
      } catch (e) {
        if (!isRecoverable(e)) throw e;
        setTimeout(() => recoverDb().catch(() => {}), 0);
        return fallback;
      }
    },
    [...deps, epoch],
    fallback
  );
}
