import { analyzeSamples } from './analysis.js';

// Gira in background: l'app resta fluida durante l'analisi.
self.onmessage = (e) => {
  const { samples, sr } = e.data;
  try {
    self.postMessage({ ok: true, result: analyzeSamples(samples, sr) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};
