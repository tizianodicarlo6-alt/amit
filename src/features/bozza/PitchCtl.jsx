// Pitch di una parte: semitoni e ottave
export default function PitchCtl({ value = 0, onChange }) {
  const set = (v) => onChange(Math.max(-24, Math.min(24, v)));
  return (
    <div className="pitch-ctl">
      <span className="fx-label">Pitch</span>
      <button className="btn sm" onClick={() => set(value - 12)} aria-label="Ottava giù">
        −8va
      </button>
      <button className="btn sm" onClick={() => set(value - 1)} aria-label="Semitono giù">
        −
      </button>
      <span className="mono pitch-val">
        {value > 0 ? '+' : ''}
        {value} st
      </span>
      <button className="btn sm" onClick={() => set(value + 1)} aria-label="Semitono su">
        +
      </button>
      <button className="btn sm" onClick={() => set(value + 12)} aria-label="Ottava su">
        +8va
      </button>
    </div>
  );
}

