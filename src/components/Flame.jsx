import { useEffect, useRef, useState } from 'react';

/** Il fuoco della strofa: cresce e si agita quando stai spaccando. value 0-1 */
export default function Flame({ value }) {
  const prev = useRef(value);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (value >= 0.75 && prev.current < 0.75) setBurst((n) => n + 1); // appena entri nella zona calda: fiammata
    prev.current = value;
  }, [value]);
  return (
    <span key={burst} className={`flame${burst ? ' burst' : ''}`} style={{ '--f': value.toFixed(2) }} aria-label={`Fuoco ${Math.round(value * 100)}%`} role="img">
      <span className="fl outer" />
      <span className="fl inner" />
    </span>
  );
}
