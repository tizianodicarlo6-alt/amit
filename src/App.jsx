import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import BottomNav from './components/BottomNav.jsx';
import { CaptureProvider } from './components/CaptureContext.jsx';
import TaccuinoPage from './features/taccuino/TaccuinoPage.jsx';
import TraccePage from './features/progetti/TraccePage.jsx';
import TracciaPage from './features/progetti/TracciaPage.jsx';
import ProgettiPage from './features/progetti/ProgettiPage.jsx';
import ProgettoPage from './features/progetti/ProgettoPage.jsx';
import AltroPage from './features/altro/AltroPage.jsx';
import HomePage from './features/home/HomePage.jsx';
import BeatPage from './features/beat/BeatPage.jsx';
import StudioPage from './features/studio/StudioPage.jsx';
import SketchPage from './features/bozza/SketchPage.jsx';
import MessaggiPage from './features/messaggi/MessaggiPage.jsx';
import ParliamonePage from './features/ispirazione/ParliamonePage.jsx';
import NananaPage from './features/nanana/NananaPage.jsx';
import CatenaPage from './features/ispirazione/CatenaPage.jsx';
import ButtaPage from './features/nanana/ButtaPage.jsx';
import NananaBall from './features/nanana/NananaBall.jsx';
import { useEffect } from 'react';
import { useProfile } from './lib/profile.js';
import { startCloud } from './lib/cloud.js';

// per i soci: messaggi in arrivo anche quando non sei nella pagina messaggi
function CloudBoot() {
  const profile = useProfile();
  useEffect(() => {
    if (profile) startCloud();
  }, [profile]);
  return null;
}
import ErrorBoundary, { ErrorToast } from './components/ErrorBoundary.jsx';

// HashRouter (indirizzi con #) funziona senza configurazioni su GitHub Pages.
export default function App() {
  return (
    <HashRouter>
      <CaptureProvider>
        <main className="app">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/taccuino" element={<TaccuinoPage />} />
              <Route path="/tracce" element={<TraccePage />} />
              <Route path="/traccia/:id" element={<TracciaPage />} />
              <Route path="/progetti" element={<ProgettiPage />} />
              <Route path="/progetto/:id" element={<ProgettoPage />} />
              <Route path="/altro" element={<AltroPage />} />
              <Route path="/beat" element={<BeatPage />} />
              <Route path="/studio/:id" element={<StudioPage />} />
              <Route path="/bozza/:id" element={<SketchPage />} />
              <Route path="/messaggi" element={<MessaggiPage />} />
              <Route path="/parliamone" element={<ParliamonePage />} />
              <Route path="/nanana" element={<NananaPage />} />
              <Route path="/allenamento/catena" element={<CatenaPage />} />
              <Route path="/butta" element={<ButtaPage />} />
              {/* Prossimamente: /allenamento */}
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
        <BottomNav />
        <CloudBoot />
        <NananaBall />
        <ErrorToast />
      </CaptureProvider>
    </HashRouter>
  );
}
