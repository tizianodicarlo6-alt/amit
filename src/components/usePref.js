import { useCallback, useState } from 'react';

// Preferenza salvata su questo telefono (es. ritardo cuffie, volumi).
export function usePref(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(`amit.${key}`);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        try {
          localStorage.setItem(`amit.${key}`, JSON.stringify(next));
        } catch {
          /* ignorato */
        }
        return next;
      });
    },
    [key]
  );
  return [value, set];
}
