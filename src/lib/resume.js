// "Riprendi da dove eri": l'ultimo pezzo aperto (traccia o nota) e il punto in cui eri.
const KEY = 'amit.resume';

export function setResume(r) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...r, at: Date.now() }));
  } catch {
    /* ignorato */
  }
}

export function getResume() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}
