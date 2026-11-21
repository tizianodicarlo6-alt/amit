import { db, setMeta } from './db.js';

// Tabelle incluse nel backup (anche quelle della fase 2, così il formato resta valido).
const TABLES = ['ideas', 'audio', 'projects', 'tracks', 'beats', 'takes'];
const FORMAT = 'quaderno-backup';
const VERSION = 1;

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:([^;]*)/)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Converte ogni Blob dentro una riga in { __blob: "data:..." } e viceversa.
async function encodeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Blob ? { __blob: await blobToDataUrl(v) } : v;
  return out;
}
function decodeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v && typeof v === 'object' && typeof v.__blob === 'string' ? dataUrlToBlob(v.__blob) : v;
  return out;
}

/** Crea il file di backup (Blob JSON) con tutti i dati e gli audio. */
export async function createBackup() {
  const data = {};
  for (const t of TABLES) {
    const rows = await db.table(t).toArray();
    data[t] = await Promise.all(rows.map(encodeRow));
  }
  const json = JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data });
  const date = new Date().toISOString().slice(0, 10);
  return { blob: new Blob([json], { type: 'application/json' }), filename: `quaderno-backup-${date}.json` };
}

export async function markBackupDone() {
  await setMeta('lastBackupAt', Date.now());
}

/** Legge un file di backup e lo importa. replace=true cancella prima tutto. */
export async function importBackup(file, { replace = false } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Il file non è un backup valido.');
  }
  if (parsed?.format !== FORMAT || !parsed.data) throw new Error('Questo file non è un backup di Quaderno.');
  const tables = TABLES.map((t) => db.table(t));
  const counts = {};
  await db.transaction('rw', tables, async () => {
    for (const t of TABLES) {
      const rows = (parsed.data[t] || []).map(decodeRow);
      if (replace) await db.table(t).clear();
      if (rows.length) await db.table(t).bulkPut(rows);
      counts[t] = rows.length;
    }
  });
  return counts;
}
