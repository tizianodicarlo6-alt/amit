import { createContext, useCallback, useContext, useState } from 'react';
import QuickCapture from '../features/taccuino/QuickCapture.jsx';

// Permette di aprire "Nuova idea" da qualunque pagina.
const Ctx = createContext({ openCapture: () => {} });
export const useCapture = () => useContext(Ctx);

export function CaptureProvider({ children }) {
  const [opts, setOpts] = useState(null); // null = chiuso
  const openCapture = useCallback((o = {}) => setOpts(o), []);
  const close = useCallback(() => setOpts(null), []);
  return (
    <Ctx.Provider value={{ openCapture }}>
      {children}
      {opts && <QuickCapture {...opts} onClose={close} />}
    </Ctx.Provider>
  );
}
