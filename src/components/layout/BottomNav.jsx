import { NavLink, useLocation } from 'react-router-dom';
import { Map, PlusCircle, User, MessageSquare, Compass, Film } from 'lucide-react';
import './BottomNav.css';

export default function BottomNav() {
  const location = useLocation();

  // Hide BottomNav on active trip boards, package preview screens, and the
  // gem-drop wizard (which has its own Back/Next/Submit bar and no unsaved-
  // changes guard, so leaving it visible let a stray tap silently discard
  // an in-progress gem).
  const isTripBoard = location.pathname.match(/\/trips\/[^/]+$/);
  const isPreviewPage = location.pathname.includes('/trips/preview/');
  const isAddGemWizard = location.pathname === '/add';

  if (isTripBoard || isPreviewPage || isAddGemWizard) {
    return null;
  }

  return (
    <nav className="bottom-nav glass-panel">
      <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
        {({ isActive }) => (
          <>
            <Map size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span>Map</span>
          </>
        )}
      </NavLink>
      
      <NavLink to="/vibes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        {({ isActive }) => (
          <>
            <Film size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span>Vibes</span>
          </>
        )}
      </NavLink>
      
      <NavLink to="/add" className="nav-item add-btn">
        <div className="add-icon-wrapper">
          <PlusCircle size={28} strokeWidth={2.5} color="var(--color-bg-primary)" />
        </div>
      </NavLink>

      <NavLink to="/trips" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        {({ isActive }) => (
          <>
            <Compass size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span>Trips</span>
          </>
        )}
      </NavLink>

      <NavLink to="/chat" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        {({ isActive }) => (
          <>
            <MessageSquare size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span>Chat</span>
          </>
        )}
      </NavLink>
      
      <NavLink to="/profile" state={{ userId: null }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        {({ isActive }) => (
          <>
            <User size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span>Profile</span>
          </>
        )}
      </NavLink>
    </nav>
  );
}
