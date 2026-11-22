import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useState } from 'react';
import { useCapture } from './CaptureContext.jsx';
import { useProfile } from '../lib/profile.js';
import InspirationSheet from '../features/ispirazione/InspirationSheet.jsx';

const Item = ({ to, icon, label, also = [] }) => {
  const { pathname } = useLocation();
  const extra = also.some((p) => pathname.startsWith(p));
  return (
  <NavLink to={to} className={({ isActive }) => `nav-item${isActive || extra ? ' active' : ''}`}>
    <Icon name={icon} size={24} />
    <span>{label}</span>
  </NavLink>
  );
};

export default function BottomNav() {
  const { openCapture } = useCapture();
  const { pathname } = useLocation();
  const profile = useProfile();
  const [insp, setInsp] = useState(false);
  if (pathname.startsWith('/studio') || pathname.startsWith('/bozza') || pathname.startsWith('/messaggi') || pathname.startsWith('/parliamone') || pathname.startsWith('/nanana') || pathname.startsWith('/allenamento') || pathname.startsWith('/butta')) return null; // lo studio usa tutto lo schermo
  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      <Item to="/home" icon="home" label="Home" />
      <Item to="/taccuino" icon="taccuino" label="Note" />
      {profile ? (
        <button className="nav-sphere" onClick={() => setInsp(true)} aria-label="Ispirazione">
          <span className="sphere" />
          <span className="sphere-lab">Ispirazione</span>
        </button>
      ) : (
        <button className="nav-capture" onClick={() => openCapture()} aria-label="Nuova idea">
          <Icon name="plus" size={32} stroke={2.6} />
        </button>
      )}
      <Item to="/tracce" icon="tracce" label="Tracce" also={['/progett', '/traccia', '/finite']} />
      <Item to="/beat" icon="beat" label="Beat" also={['/bozza']} />
      {insp && <InspirationSheet onClose={() => setInsp(false)} openCapture={openCapture} />}
    </nav>
  );
}
