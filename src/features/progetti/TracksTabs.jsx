import { NavLink } from 'react-router-dom';

// Schede in alto: Tracce | Progetti | Finite
export default function TracksTabs() {
  return (
    <div className="tabs">
      <NavLink to="/tracce" className={({ isActive }) => `tab${isActive ? ' on' : ''}`}>
        Tracce
      </NavLink>
      <NavLink to="/progetti" className={({ isActive }) => `tab${isActive ? ' on' : ''}`}>
        Progetti
      </NavLink>
      <NavLink to="/finite" className={({ isActive }) => `tab${isActive ? ' on' : ''}`}>
        Finite
      </NavLink>
    </div>
  );
}
