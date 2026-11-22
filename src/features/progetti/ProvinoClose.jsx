import { useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import { getMeta, setMeta, updateTrack } from '../../db/db.js';
import { addProvino, levelOf, provinoMana, weekStats } from '../../lib/progress.js';
import { sendScore } from '../../lib/cloud.js';
import { loadRank } from '../../lib/rimario.js';

// "Chiudi il provino": +1 livello e mana in base a quanto sono tecniche strofe e melodia
export default function ProvinoClose({ track, takeCount }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!track.closedAt && !takeCount && !result) return null;

  const close = async () => {
    if (!confirm('Chiudere il provino? Sali di livello e prendi il mana per questo pezzo (una volta sola).')) return;
    setBusy(true);
    let rank = null;
    try {
      rank = await loadRank();
    } catch {
      /* senza lista parole va bene lo stesso */
    }
    const mana = provinoMana(track, { rank });
    const progress = addProvino(await getMeta('progress'), track, mana);
    await setMeta('progress', progress);
    await updateTrack(track.id, { closedAt: Date.now(), closedMana: mana.total, ...(track.status === 'finita' ? {} : { status: 'registrata' }) });
    setResult({ mana, level: levelOf(progress), total: progress.mana });
    sendScore(weekStats(progress)).catch(() => {}); // la classifica tra soci si aggiorna (se sei online)
    setBusy(false);
  };

  return (
    <>
      {track.closedAt ? (
        <div className="provino-done">
          ✓ Provino chiuso · <b>+{track.closedMana || 0} mana</b>
        </div>
      ) : (
        <button className="btn provino-btn" onClick={close} disabled={busy}>
          ✓ Chiudi il provino
        </button>
      )}
      {result && (
        <Sheet open onClose={() => setResult(null)} title="Provino chiuso">
          <div className="levelup">
            <div className="lv-kicker">Sei salito al</div>
            <div className="lv-num">Livello {result.level}</div>
            <div className="lv-mana">+{result.mana.total} mana</div>
            <div className="lv-rows">
              <div>
                <span>Provino chiuso</span>
                <b>+{result.mana.base}</b>
              </div>
              <div>
                <span>
                  Strofe · {result.mana.quartine} {result.mana.quartine === 1 ? 'quartina' : 'quartine'}
                  {result.mana.fuoco.length > 0 && <small> (fuoco {result.mana.fuoco.join(' · ')})</small>}
                </span>
                <b>+{result.mana.strofe}</b>
              </div>
              <div>
                <span>Melodia</span>
                <b>+{result.mana.melodia}</b>
              </div>
            </div>
            <div className="muted small">Mana totale: {result.total}</div>
            <button className="btn primary big" onClick={() => setResult(null)}>
              Avanti
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
