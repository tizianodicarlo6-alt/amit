// Messaggi tra soci: il "postino" online (Supabase). Serve internet; il resto dell'app no.
// La libreria si carica solo per i soci, quando serve.
import { useEffect, useSyncExternalStore } from 'react';
import { CLOUD } from '../config.js';
import { getProfile } from './profile.js';

let clientP = null;
export function cloud() {
  if (!clientP)
    clientP = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'amit.cloud' } })
    );
  return clientP;
}

export const memberName = (id) => CLOUD.members.find((m) => m.id === id)?.name || id;
export const otherMembers = (me) => CLOUD.members.filter((m) => m.id !== me);

// ---- stato condiviso: chi è connesso e quanti messaggi non letti ----
const state = { user: null, ready: false, unread: 0 };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const set = (c) => {
  Object.assign(state, c);
  snapshot = { ...state };
  emit();
};
let snapshot = { ...state };

/** { user: 'kraken' | null, ready, unread } */
export function useCloud() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot
  );
}

const idOfEmail = (email) => (email && email.endsWith(`@${CLOUD.domain}`) ? email.split('@')[0] : null);

let started = false;
let channel = null;
/** Avvio (solo per i soci): ripristino la sessione e ascolto i messaggi in arrivo. */
export async function startCloud() {
  if (started || !getProfile()) return;
  started = true;
  try {
    const sb = await cloud();
    const { data } = await sb.auth.getSession();
    const id = idOfEmail(data.session?.user?.email);
    set({ user: id, ready: true });
    sb.auth.onAuthStateChange((_e, session) => {
      const uid = idOfEmail(session?.user?.email);
      if (uid !== state.user) {
        set({ user: uid });
        listen();
      }
    });
    listen();
  } catch {
    set({ ready: true });
    started = false;
  }
}

async function listen() {
  const sb = await cloud();
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }
  if (!state.user) return set({ unread: 0 });
  refreshUnread();
  channel = sb
    .channel('in-arrivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `to_user=eq.${state.user}` }, (p) => {
      refreshUnread();
      inbox.forEach((l) => l(p));
    })
    .subscribe();
}

const inbox = new Set();
/** Chiamato a ogni messaggio nuovo/cambiato per me (per aggiornare la chat aperta). */
export function useInbox(fn) {
  useEffect(() => {
    inbox.add(fn);
    return () => inbox.delete(fn);
  }, [fn]);
}

export async function refreshUnread() {
  if (!state.user) return;
  try {
    const sb = await cloud();
    const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('to_user', state.user).is('read_at', null).neq('kind', 'score');
    set({ unread: count || 0 });
  } catch {
    /* offline */
  }
}

export async function login(id, password) {
  const sb = await cloud();
  const { error } = await sb.auth.signInWithPassword({ email: `${id}@${CLOUD.domain}`, password });
  if (error) throw new Error(error.message.includes('Invalid') ? 'Password sbagliata.' : error.message);
  started = true;
  set({ user: id, ready: true });
  listen();
}

export async function cloudLogout() {
  const sb = await cloud();
  await sb.auth.signOut();
  set({ user: null, unread: 0 });
}

// ---- messaggi ----

/** Conversazione tra me e `other` (dal più vecchio al più nuovo). */
export async function loadChat(other, limit = 200) {
  const sb = await cloud();
  const me = state.user;
  const { data, error } = await sb
    .from('messages')
    .select('*')
    .or(`and(from_user.eq.${me},to_user.eq.${other}),and(from_user.eq.${other},to_user.eq.${me})`)
    .neq('kind', 'score')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.reverse();
}

export async function markRead(other) {
  const sb = await cloud();
  await sb.from('messages').update({ read_at: new Date().toISOString() }).eq('to_user', state.user).eq('from_user', other).is('read_at', null);
  refreshUnread();
}

/** Carica un file per un messaggio e ritorna il percorso. */
async function upload(blob, ext) {
  const sb = await cloud();
  const path = `${state.user}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('files').upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) throw error;
  return path;
}

const extOf = (mime = '') => (mime.includes('wav') ? 'wav' : mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'm4a' : mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'mp3');

/**
 * Manda un messaggio. kind: 'text' | 'idea' | 'track' | 'beat' | 'audio'
 * file: { blob, mime } facoltativo (beat, nota vocale, provino).
 */
export async function sendMessage(to, { kind = 'text', body = '', payload = null, file = null }) {
  const sb = await cloud();
  let file_path = null;
  if (file?.blob) file_path = await upload(file.blob, extOf(file.mime || file.blob.type));
  const { data, error } = await sb.from('messages').insert({ from_user: state.user, to_user: to, kind, body, payload, file_path }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMessage(id) {
  const sb = await cloud();
  const { error } = await sb.from('messages').delete().eq('id', id);
  if (error) throw error;
}

const fileCache = new Map();
/** Scarica il file di un messaggio (Blob). */
export async function downloadFile(path) {
  if (!fileCache.has(path))
    fileCache.set(
      path,
      cloud()
        .then((sb) => sb.storage.from('files').download(path))
        .then(({ data, error }) => {
          if (error) throw error;
          return data;
        })
        .catch((e) => {
          fileCache.delete(path);
          throw e;
        })
    );
  return fileCache.get(path);
}

/** Chiama una funzione online (es. l'assistente "parliamone"). */
export async function callFunction(name, body) {
  const sb = await cloud();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context?.json?.();
      if (j?.error) msg = j.error;
    } catch {
      /* ignorato */
    }
    throw new Error(msg);
  }
  return data;
}

// ---- classifica tra soci: i numeri della settimana viaggiano come messaggi "score" (non si vedono in chat)

/** Manda i miei numeri della settimana agli altri soci. */
export async function sendScore(stats) {
  if (!state.user) return;
  const others = CLOUD.members.filter((m) => m.id !== state.user);
  for (const m of others) await sendMessage(m.id, { kind: 'score', body: '', payload: stats });
}

/** Gli ultimi numeri arrivati da ogni socio: { shower: { week, provini, mana, level, totalMana, at } } */
export async function loadScores() {
  if (!state.user) return {};
  const sb = await cloud();
  const { data, error } = await sb.from('messages').select('from_user,payload,created_at').eq('to_user', state.user).eq('kind', 'score').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  const out = {};
  for (const r of data) if (!out[r.from_user]) out[r.from_user] = { ...r.payload, at: r.created_at };
  return out;
}
