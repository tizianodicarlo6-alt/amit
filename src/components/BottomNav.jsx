import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useCapture } from './CaptureContext.jsx';

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
  if (pathname.startsWith('/studio')) return null; // lo studio usa tutto lo schermo
  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      <Item to="/home" icon="home" label="Home" />
      <Item to="/taccuino" icon="taccuino" label="Taccuino" />
      <button className="nav-capture" onClick={() => openCapture()} aria-label="Nuova idea">
        <Icon name="plus" size={32} stroke={2.6} />
      </button>
      <Item to="/tracce" icon="tracce" label="Tracce" also={['/progett', '/traccia']} />
      <Item to="/beat" icon="beat" label="Beat" />
    </nav>
  );
}
