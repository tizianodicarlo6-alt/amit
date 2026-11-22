import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '../../lib/profile.js';

const POS_KEY = 'amit.nanana.ball';
const readPos = () => {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY)) || null;
  } catch {
    return null;
  }
};
const HIDE = ['/nanana', '/studio', '/bozza', '/messaggi', '/parliamone', '/allenamento', '/butta'];

// La pallina dei nanana: sempre a portata di dito. Si sposta trascinandola.
export default function NananaBall() {
  const profile = useProfile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [pos, setPos] = useState(readPos); // { x, y } in px dall'angolo in basso a destra
  const drag = useRef(null);
  if (!profile || HIDE.some((p) => pathname.startsWith(p))) return null;

  const p = pos || { x: 16, y: 150 };
  const down = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x0: e.clientX, y0: e.clientY, p, moved: false };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (Math.abs(dx) + Math.abs(dy) > 8) d.moved = true;
    if (!d.moved) return;
    const x = Math.max(6, Math.min(window.innerWidth - 62, d.p.x - dx));
    const y = Math.max(90, Math.min(window.innerHeight - 70, d.p.y - dy));
    setPos({ x, y });
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {
        /* ignorato */
      }
    } else navigate('/nanana');
  };

  return (
    <button className="nn-ball" style={{ right: p.x, bottom: p.y }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => (drag.current = null)} aria-label="Nanana: cerca la melodia sul beat">
      <span>na</span>
      <span>na</span>
    </button>
  );
}
