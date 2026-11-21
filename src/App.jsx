import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import BottomNav from './components/BottomNav.jsx';
import { CaptureProvider } from './components/CaptureContext.jsx';
import TaccuinoPage from './features/taccuino/TaccuinoPage.jsx';
import TraccePage from './features/progetti/TraccePage.jsx';
import TracciaPage from './features/progetti/TracciaPage.jsx';
import ProgettiPage from './features/progetti/ProgettiPage.jsx';
import ProgettoPage from './features/progetti/ProgettoPage.jsx';
import AltroPage from './features/altro/AltroPage.jsx';
import ErrorBoundary, { ErrorToast } from './components/ErrorBoundary.jsx';

// HashRouter (indirizzi con #) funziona senza configurazioni su GitHub Pages.
export default function App() {
  return (
    <HashRouter>
      <CaptureProvider>
        <main className="app">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/taccuino" replace />} />
              <Route path="/taccuino" element={<TaccuinoPage />} />
              <Route path="/tracce" element={<TraccePage />} />
              <Route path="/traccia/:id" element={<TracciaPage />} />
              <Route path="/progetti" element={<ProgettiPage />} />
              <Route path="/progetto/:id" element={<ProgettoPage />} />
              <Route path="/altro" element={<AltroPage />} />
              {/* Fase 2-3: /beat, /studio, /allenamento */}
              <Route path="*" element={<Navigate to="/taccuino" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
        <BottomNav />
        <ErrorToast />
      </CaptureProvider>
    </HashRouter>
  );
}
