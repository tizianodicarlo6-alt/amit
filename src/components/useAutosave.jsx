import { useEffect, useRef, useState } from 'react';

/**
 * Salva automaticamente `value` dopo `delay` ms senza modifiche.
 * Salva subito anche quando si esce dalla pagina o l'app va in background.
 */
export function useAutosave(value, save, delay = 600) {
  const [status, setStatus] = useState('saved'); // saved | pending | saving
  const latest = useRef(value);
  const dirty = useRef(false);
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setStatus('saving');
    try {
      await saveRef.current(latest.current);
    } finally {
      setStatus(dirty.current ? 'pending' : 'saved');
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    latest.current = value;
    dirty.current = true;
    setStatus('pending');
    const t = setTimeout(() => flushRef.current(), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flushRef.current();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      flushRef.current(); // uscendo dalla pagina
    };
  }, []);

  return status;
}

export function SaveStatus({ status }) {
  const label = status === 'saved' ? 'Salvato' : 'Salvataggio…';
  return <span className={`save-status ${status}`}>{label}</span>;
}
