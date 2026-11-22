import { useEffect, useRef, useState } from 'react';
import { db } from '../db/db.js';
import { buildArchive, suggestGhost } from '../lib/ghost.js';
import { logEvent } from '../lib/stats.js';

// dopo quanto tempo fermo sulla stessa riga compare (secondi); si può cambiare per le prove
const delay = () => {
  try {
    return Number(localStorage.getItem('amit.ghost.delay')) || 180;
  } catch {
    return 180;
  }
};

/**
 * Tiene il tempo: se per ~3 minuti (con l'app aperta) non aggiungi righe nuove, prepara le barre fantasma.
 * lines = righe del testo, at = riga dove sei, exclude = id di questa nota/traccia.
 */
export function useGhost({ lines, at, exclude, enabled = true }) {
  const [list, setList] = useState(null);
  const [idx, setIdx] = useState(0);
  const idle = useRef(0);
  const filled = lines.filter((l) => l.trim()).length;
  const lastFilled = useRef(filled);
  const archive = useRef(null);
  const latest = useRef({ lines, at });
  const stalledAt = useRef(0);
  latest.current = { lines, at };

  // una riga nuova = sei ripartito: il fantasma sparisce e il tempo riparte
  useEffect(() => {
    if (filled > lastFilled.current) {
      idle.current = 0;
      setList(null);
      // ripartito entro 10 minuti dal blocco
      if (stalledAt.current && Date.now() - stalledAt.current < 600000) logEvent('unblock');
      stalledAt.current = 0;
    }
    lastFilled.current = filled;
  }, [filled]);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible' || list) return;
      idle.current += 5;
      if (idle.current < delay()) return;
      if (!latest.current.lines.some((l) => l.trim())) return; // pagina vuota: niente fantasmi
      if (!archive.current) archive.current = buildArchive({ ideas: await db.ideas.toArray(), tracks: await db.tracks.toArray() });
      const s = suggestGhost(archive.current, latest.current.lines, latest.current.at, { exclude });
      if (s.length) {
        setList(s);
        setIdx(0);
        stalledAt.current = Date.now();
        logEvent('stall');
      } else idle.current = 0;
    }, 5000);
    return () => clearInterval(t);
  }, [enabled, exclude, list]);

  const dismiss = () => {
    idle.current = 0;
    setList(null);
  };
  return { ghost: list ? list[idx % list.length] : null, count: list?.length || 0, next: () => setIdx((i) => i + 1), dismiss };
}

/** Il riquadro trasparente con la vecchia barra: Usa, Un'altra, chiudi. */
export default function GhostBar({ ghost, count, onUse, onNext, onClose }) {
  if (!ghost) return null;
  return (
    <div className="ghost-bar" role="status">
      <div className="ghost-kicker">
        Una tua barra · {ghost.from === 'traccia' ? 'da una traccia' : 'dalle note'}
        {ghost.title ? ` «${ghost.title}»` : ''}
        {ghost.why.length ? ` · ${ghost.why.join(', ')}` : ''}
      </div>
      <div className="ghost-text">{ghost.text}</div>
      <div className="ghost-actions">
        <button className="btn sm primary" onPointerDown={(e) => e.preventDefault()} onClick={() => onUse(ghost.text)}>
          Usa
        </button>
        {count > 1 && (
          <button className="btn sm" onPointerDown={(e) => e.preventDefault()} onClick={onNext}>
            Un'altra
          </button>
        )}
        <button className="btn sm ghost" onPointerDown={(e) => e.preventDefault()} onClick={onClose}>
          No grazie
        </button>
      </div>
    </div>
  );
}

export { insertGhostLine } from './ghostInsert.js';
