import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useCapture } from './CaptureContext.jsx';

const Item = ({ to, icon, label }) => (
  <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
    <Icon name={icon} size={24} />
    <span>{label}</span>
  </NavLink>
);

export default function BottomNav() {
  const { openCapture } = useCapture();
  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      <Item to="/home" icon="home" label="Home" />
      <Item to="/taccuino" icon="taccuino" label="Taccuino" />
      <button className="nav-capture" onClick={() => openCapture()} aria-label="Nuova idea">
        <Icon name="plus" size={32} stroke={2.6} />
      </button>
      <Item to="/tracce" icon="tracce" label="Tracce" />
      <Item to="/progetti" icon="progetti" label="Progetti" />
    </nav>
  );
}
