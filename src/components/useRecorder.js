import { useCallback, useEffect, useRef, useState } from 'react';

// Sceglie un formato supportato (Chrome/Android: webm, iPhone: mp4).
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];
  return options.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

export function useRecorder() {
  const [state, setState] = useState('idle'); // idle | recording | done
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState(null); // { blob, mime, duration }
  const [error, setError] = useState('');
  const rec = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);
  const startedAt = useRef(0);

  const cleanup = () => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const start = useCallback(async () => {
    setError('');
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Questo browser non permette di registrare audio.');
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Permesso microfono negato. Abilitalo nelle impostazioni del browser.');
      return;
    }
    const mime = pickMime();
    const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const type = r.mimeType || mime || 'audio/webm';
      const duration = (Date.now() - startedAt.current) / 1000;
      setResult({ blob: new Blob(chunks, { type }), mime: type, duration });
      setState('done');
      cleanup();
    };
    rec.current = r;
    startedAt.current = Date.now();
    setSeconds(0);
    r.start(250);
    setState('recording');
    timer.current = setInterval(() => setSeconds((Date.now() - startedAt.current) / 1000), 200);
  }, []);

  const stop = useCallback(() => {
    if (rec.current?.state === 'recording') rec.current.stop();
  }, []);

  const reset = useCallback(() => {
    if (rec.current?.state === 'recording') {
      rec.current.onstop = null;
      rec.current.stop();
    }
    cleanup();
    setResult(null);
    setSeconds(0);
    setState('idle');
  }, []);

  useEffect(() => () => reset(), [reset]);

  return { state, seconds, result, error, start, stop, reset };
}
