// Importa uno o più file beat: forma d'onda, BPM, tonalità e nome dal file.
import { addBeat } from '../db/db.js';
import { analyzeAudio, guessMime, parseBeatName } from './audio.js';

/** Ritorna { ids: [id dei beat creati], failed: [messaggi] }. onProgress(testo) per mostrare a che punto è. */
export async function importBeatFiles(files, onProgress = () => {}) {
  const ids = [];
  const failed = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress(`${i + 1} di ${files.length} · Analizzo BPM e tonalità: ${f.name}`);
    try {
      const a = await analyzeAudio(f);
      const info = parseBeatName(f.name);
      const mime = guessMime(f);
      const blob = f.type ? f : new Blob([f], { type: mime });
      ids.push(
        await addBeat({
          blob,
          mime,
          title: info.title,
          producer: info.producer,
          bpm: info.bpm ?? a.bpm ?? null,
          key: a.key || '',
          auto: { bpm: info.bpm == null && a.bpm != null, key: !!a.key },
          duration: a.duration,
          peaks: a.peaks,
        })
      );
    } catch (err) {
      failed.push(`${f.name}: formato non supportato o file danneggiato`);
      console.error(err);
    }
  }
  onProgress('');
  return { ids, failed };
}
