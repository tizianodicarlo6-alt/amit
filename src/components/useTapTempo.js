import { useRef } from 'react';

// Calcola i BPM toccando a tempo (servono almeno 3 tocchi).
export function useTapTempo(onBpm) {
  const taps = useRef([]);
  return () => {
    const now = performance.now();
    taps.current = taps.current.filter((t) => now - t < 3000).concat(now);
    const t = taps.current;
    if (t.length >= 3) {
      const avg = (t.at(-1) - t[0]) / (t.length - 1);
      onBpm(Math.round(60000 / avg));
    }
  };
}
