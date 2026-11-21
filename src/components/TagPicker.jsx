import { useState } from 'react';
import { useDbQuery } from '../db/useDbQuery.js';
import { db } from '../db/db.js';
import { DEFAULT_TAGS } from '../constants.js';

export function useAllTags() {
  return (
    useDbQuery(async () => {
      const ideas = await db.ideas.toArray();
      return [...new Set([...DEFAULT_TAGS, ...ideas.flatMap((i) => i.tags || [])])];
    }, [], DEFAULT_TAGS) || DEFAULT_TAGS
  );
}

export default function TagPicker({ value, onChange }) {
  const all = useAllTags();
  const [custom, setCustom] = useState('');
  const tags = [...new Set([...all, ...value])];
  const toggle = (t) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const addCustom = () => {
    const t = custom.trim().toLowerCase().replace(/^#/, '');
    if (t && !value.includes(t)) onChange([...value, t]);
    setCustom('');
  };
  return (
    <div className="tag-picker">
      <div className="chips">
        {tags.map((t) => (
          <button key={t} type="button" className={`chip${value.includes(t) ? ' on' : ''}`} onClick={() => toggle(t)}>
            #{t}
          </button>
        ))}
      </div>
      <div className="row">
        <input
          className="input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
          placeholder="Nuovo tag…"
          enterKeyHint="done"
        />
        <button type="button" className="btn" onClick={addCustom} disabled={!custom.trim()}>
          Aggiungi
        </button>
      </div>
    </div>
  );
}
