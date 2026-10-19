import { NavLink, useLocation } from 'react-router-dom';
import { House, Map, Plus, Mountain, User } from 'lucide-react';
import './BottomNav.css';

// Routes that belong to the "Adventures" tab so it stays lit while the
// explorer is inside any part of the expedition / trip / safety toolkit.
const ADVENTURE_PATHS = ['/expeditions', '/trips', '/safe-trek', '/leaderboard'];

function Tab({ to, icon: Icon, label, end, forceActive }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item ${isActive || forceActive ? 'active' : ''}`}
    >
      {({ isActive }) => {
        const on = isActive || forceActive;
        return (
          <>
            <span className="nav-item__icon"><Icon size={22} strokeWidth={on ? 2.4 : 1.9} /></span>
            <span className="nav-item__label">{label}</span>
          </>
        );
      }}
    </NavLink>
  );
}

export default function BottomNav() {
  const location = useLocation();
  const path = location.pathname;

  // Hidden on full-screen flows that own their own bottom bar: trip boards,
  // package previews and the drop wizard (no unsaved-changes guard there, so
  // a stray tap on the nav would silently discard an in-progress SPOTA).
  const isTripBoard = /\/trips\/[^/]+$/.test(path);
  const isPreviewPage = path.includes('/trips/preview/');
  const isAddGemWizard = path === '/add';
  if (isTripBoard || isPreviewPage || isAddGemWizard) return null;

  const inAdventures = ADVENTURE_PATHS.some((p) => path.startsWith(p));

  return (
    <nav className="bottom-nav sp-glass sp-glass--thick" aria-label="Primary">
      <Tab to="/" icon={House} label="Home" end />
      <Tab to="/explore" icon={Map} label="Explore" />
      <NavLink to="/add" className="nav-drop" aria-label="Drop a SPOTA">
        <span className="nav-drop__btn"><Plus size={26} strokeWidth={2.6} /></span>
        <span className="nav-item__label">Drop</span>
      </NavLink>
      <Tab to="/expeditions" icon={Mountain} label="Adventures" forceActive={inAdventures} />
      <Tab to="/profile" icon={User} label="Profile" />
    </nav>
  );
}
