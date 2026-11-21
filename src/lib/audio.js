// Utilità audio: lettura dei file beat, forma d'onda, nomi.

const EXT_MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', aif: 'audio/aiff', aiff: 'audio/aiff' };

export function guessMime(file) {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return EXT_MIME[ext] || 'audio/mpeg';
}

/**
 * Dal nome del file ricava titolo e produttore.
 * "Notte Fonda (prod. Kid Beats).mp3" → { title: "Notte Fonda", producer: "Kid Beats" }
 * "Kid Beats - Notte Fonda 140bpm.wav" → { title: "Notte Fonda", producer: "Kid Beats", bpm: 140 }
 */
export function parseBeatName(filename) {
  let name = filename.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').trim();
  let producer = '';
  let bpm = null;
  const bpmMatch = name.match(/(\d{2,3})\s*bpm/i);
  if (bpmMatch) {
    const n = Number(bpmMatch[1]);
    if (n >= 50 && n <= 220) bpm = n;
    name = name.replace(bpmMatch[0], ' ');
  }
  const prod = name.match(/[([]?\s*(?:prod(?:\.|uced)?(?: by)?|prodotto da)\s*[:.]?\s*([^)\]]+)[)\]]?/i);
  if (prod) {
    producer = prod[1].trim();
    name = name.replace(prod[0], ' ');
  } else if (/\s-\s/.test(name)) {
    const [a, ...rest] = name.split(/\s-\s/);
    producer = a.trim();
    name = rest.join(' - ');
  }
  const title = name.replace(/[([]\s*[)\]]/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s\-–|]+|[\s\-–|]+$/g, '').trim();
  return { title: title || filename, producer, bpm };
}

/** Riduce un canale audio a `n` picchi (0–1) per disegnare la forma d'onda. */
export function computePeaks(channel, n = 160) {
  const step = Math.max(1, Math.floor(channel.length / n));
  const peaks = [];
  let max = 0;
  for (let i = 0; i < n; i++) {
    let p = 0;
    const end = Math.min(channel.length, (i + 1) * step);
    for (let j = i * step; j < end; j += 16) {
      const v = Math.abs(channel[j]);
      if (v > p) p = v;
    }
    peaks.push(p);
    if (p > max) max = p;
  }
  return peaks.map((p) => Math.round((max ? p / max : 0) * 100) / 100);
}

/** Decodifica un file audio: durata e forma d'onda. */
export async function analyzeAudio(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return { duration: 0, peaks: [] };
  const ctx = new Ctx();
  try {
    const buf = await blob.arrayBuffer();
    // forma "a callback" per compatibilità con Safari più vecchi
    const audio = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(buf, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
    return { duration: audio.duration, peaks: computePeaks(audio.getChannelData(0)) };
  } finally {
    try {
      await ctx.close();
    } catch {
      /* ignorato */
    }
  }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}
