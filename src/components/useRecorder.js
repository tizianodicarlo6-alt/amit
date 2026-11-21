import { useCallback, useEffect, useRef, useState } from 'react';

// Formato audio: mp4 prima (iPhone e Chrome recenti, si riascolta ovunque), poi webm.
function pickMime() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const options = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  try {
    return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  } catch {
    return '';
  }
}

export function micErrorMessage(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permesso microfono negato. Su iPhone: Impostazioni → Safari → Microfono → Consenti, poi riprova.';
    case 'NotFoundError':
      return 'Nessun microfono trovato.';
    case 'NotReadableError':
      return 'Il microfono è usato da un\'altra app (es. una chiamata). Chiudila e riprova.';
    default:
      return `Non riesco a registrare (${e?.name || 'errore'}: ${e?.message || e}).`;
  }
}

export function useRecorder() {
  const [state, setState] = useState('idle'); // idle | starting | recording | done
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState(null); // { blob, mime, duration }
  const [error, setError] = useState('');
  const rec = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);
  const startedAt = useRef(0);
  const alive = useRef(true);

  const cleanup = () => {
    clearInterval(timer.current);
    timer.current = null;
    try {
      stream.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignorato */
    }
    stream.current = null;
  };

  const fail = (msg) => {
    cleanup();
    rec.current = null;
    if (!alive.current) return;
    setError(msg);
    setState('idle');
  };

  const start = useCallback(async () => {
    if (rec.current) return; // già in corso
    setError('');
    setResult(null);
    if (!window.isSecureContext) return fail('La registrazione funziona solo con un indirizzo https.');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return fail('Questo browser non permette di registrare audio. Su iPhone usa Safari aggiornato.');
    }
    setState('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      return fail(micErrorMessage(e));
    }
    if (!alive.current) return cleanup();

    let r;
    const mime = pickMime();
    try {
      r = mime ? new MediaRecorder(stream.current, { mimeType: mime }) : new MediaRecorder(stream.current);
    } catch {
      try {
        r = new MediaRecorder(stream.current);
      } catch (e) {
        return fail(micErrorMessage(e));
      }
    }

    const chunks = [];
    r.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    r.onerror = (e) => fail(micErrorMessage(e.error || e));
    r.onstop = () => {
      const type = (r.mimeType || mime || 'audio/mp4').split(';')[0];
      const duration = (Date.now() - startedAt.current) / 1000;
      cleanup();
      rec.current = null;
      if (!alive.current) return;
      if (!chunks.length) return fail('La registrazione è vuota. Riprova tenendo lo schermo acceso.');
      setResult({ blob: new Blob(chunks, { type }), mime: type, duration });
      setState('done');
    };

    try {
      rec.current = r;
      startedAt.current = Date.now();
      setSeconds(0);
      r.start(); // senza timeslice: più affidabile su Safari
      setState('recording');
      timer.current = setInterval(() => setSeconds((Date.now() - startedAt.current) / 1000), 250);
    } catch (e) {
      fail(micErrorMessage(e));
    }
  }, []);

  const stop = useCallback(() => {
    try {
      if (rec.current?.state === 'recording') rec.current.stop();
    } catch (e) {
      fail(micErrorMessage(e));
    }
  }, []);

  const reset = useCallback(() => {
    const r = rec.current;
    if (r) {
      r.onstop = null;
      r.ondataavailable = null;
      try {
        if (r.state === 'recording') r.stop();
      } catch {
        /* ignorato */
      }
    }
    rec.current = null;
    cleanup();
    if (!alive.current) return;
    setResult(null);
    setSeconds(0);
    setState('idle');
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      reset();
    };
  }, [reset]);

  return { state, seconds, result, error, start, stop, reset };
}
