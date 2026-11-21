import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';

// Menu a tendina per collegare qualcosa a una traccia.
export default function TrackPicker({ value, onChange, label = 'Collega a una traccia' }) {
  const tracks = useLiveQuery(() => db.tracks.orderBy('updatedAt').reverse().toArray(), []) || [];
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— Nessuna —</option>
        {tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title || 'Senza titolo'}
          </option>
        ))}
      </select>
    </label>
  );
}
