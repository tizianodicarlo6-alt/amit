// Profili dei soci di Amit Studio. Chi non ha un codice vede l'app "pubblica".
// Il codice sblocca l'app personale su QUESTO telefono (resta salvato).
// Nota: è una porta, non una cassaforte: serve a personalizzare, non a proteggere segreti.
import { useSyncExternalStore } from 'react';

// sha256("amit:" + codice) → profilo
const MEMBERS = {
  fbf8b13522a0b0e5adf37168834e39b02916952ebf864bfd8a9dfbe276ab98f4: {
    id: 'kraken',
    name: 'Kraken',
    role: 'Scrive e registra',
    // il suo modo di scrivere (servirà anche all'assistente)
    style: 'Parte quasi sempre dal ritornello, melodico, trovando la melodia col nanana sul beat. Strofe più rappate, con multisillabiche e incastri.',
  },
  '3d25e2821f94d38c72959500e11b21fe760a07fec631a8b6fce271214c6d1b9a': {
    id: 'shower',
    name: 'Shower',
    role: 'Socio',
    style: '',
  },
};

const KEY = 'amit.profile';
const listeners = new Set();
let current = read();

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && v.id ? v : null;
  } catch {
    return null;
  }
}
function write(v) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignorato */
  }
  current = v;
  listeners.forEach((l) => l());
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Prova il codice: ritorna il profilo (e lo attiva) oppure null. */
export async function enterCode(code) {
  const h = await sha256(`amit:${code.trim().toLowerCase()}`);
  const m = MEMBERS[h];
  if (!m) return null;
  write({ ...m, prefs: read()?.id === m.id ? read().prefs : {} });
  return current;
}

export function logout() {
  write(null);
}

/** Preferenze del socio (es. ultima atmosfera scelta per il colore della sfera). */
export function setPrefs(changes) {
  if (!current) return;
  write({ ...current, prefs: { ...(current.prefs || {}), ...changes } });
}

export const getProfile = () => current;

/** Hook: il profilo attivo (null = app pubblica). */
export function useProfile() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null
  );
}

/** Saluto che cambia con l'ora e col giorno, tono amichevole. */
export function personalGreeting(name, d = new Date()) {
  const h = d.getHours();
  const day = d.getDay(); // 0 domenica
  const hello = h < 5 ? 'Ancora sveglio' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const lines = {
    night: ['La notte porta le barre migliori.', 'A quest\'ora escono le cose vere.', 'Tutti dormono, tu scrivi.'],
    morning: ['Caffè e una strofa?', 'Mente fresca, barre fresche.', 'Partiamo col piede giusto.'],
    afternoon: ['Il beat ti aspetta.', 'Un ritornello prima di cena?', 'Che storia raccontiamo oggi?'],
    evening: ['Serata giusta per scrivere.', 'Cuffie in testa e via.', 'Facciamo uscire qualcosa di forte.'],
  };
  const slot = h < 5 ? 'night' : h < 13 ? 'morning' : h < 18 ? 'afternoon' : h < 23 ? 'evening' : 'night';
  const special = day === 5 && h >= 18 ? 'È venerdì sera: scrivi la hit del weekend.' : day === 0 ? 'Domenica: giorno buono per tirare le fila.' : day === 1 && h < 13 ? 'Lunedì: si riparte, si scrive.' : null;
  const pool = lines[slot];
  const sub = special || pool[(d.getDate() + h) % pool.length];
  return { hello: `${hello} ${name}${h < 5 ? '?' : ','}`, question: 'cosa vuoi scrivere oggi?', sub };
}
