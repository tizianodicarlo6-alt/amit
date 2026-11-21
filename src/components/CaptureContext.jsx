import { createContext, useCallback, useContext, useState } from 'react';
import QuickCapture from '../features/taccuino/QuickCapture.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

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
      {opts && (
        <ErrorBoundary onReset={close}>
          <QuickCapture {...opts} onClose={close} />
        </ErrorBoundary>
      )}
    </Ctx.Provider>
  );
}
