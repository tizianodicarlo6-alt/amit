// Crea file WAV a 16 bit (il formato che ogni studio può aprire).

/** channels: array di Float32Array (1 = mono, 2 = stereo), stessa lunghezza. */
export function encodeWav(channels, sampleRate) {
  const numCh = channels.length;
  const len = channels[0]?.length || 0;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numCh * bytesPerSample, true);
  v.setUint16(32, numCh * bytesPerSample, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Unisce i pezzi registrati in un unico Float32Array. */
export function concatChunks(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Picco massimo (0–1) di un segnale. */
export function peakOf(samples) {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > p) p = a;
  }
  return p;
}

/**
 * Dove c'è davvero voce in una registrazione (secondi dall'inizio): salta il silenzio
 * e il respiro prima di attaccare. Ritorna { start, end }.
 */
export function voicedBounds(samples, sr) {
  const win = Math.max(1, Math.round(sr * 0.05));
  const rms = [];
  for (let i = 0; i < samples.length; i += win) {
    let s = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) s += samples[j] * samples[j];
    rms.push(Math.sqrt(s / (end - i)));
  }
  if (!rms.length) return { start: 0, end: 0 };
  const sorted = [...rms].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const thr = Math.max(0.015, p90 * 0.25);
  const first = rms.findIndex((v) => v > thr);
  if (first < 0) return { start: 0, end: 0 };
  let last = rms.length - 1;
  while (last > first && rms[last] <= thr) last--;
  const dur = samples.length / sr;
  return {
    start: Math.max(0, first * 0.05 - 0.15),
    end: Math.min(dur, (last + 1) * 0.05 + 0.3),
  };
}
