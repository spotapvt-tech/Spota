import { NavLink } from 'react-router-dom';
import { Map, List, PlusCircle, User, MessageSquare } from 'lucide-react';
import './BottomNav.css';

export default function BottomNav() {
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
      
      <NavLink to="/feed" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        {({ isActive }) => (
          <>
            <List size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span>Feed</span>
          </>
        )}
      </NavLink>
      
      <NavLink to="/add" className="nav-item add-btn">
        <div className="add-icon-wrapper">
          <PlusCircle size={28} strokeWidth={2.5} color="var(--color-bg-primary)" />
        </div>
      </NavLink>

      <NavLink to="/chat" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        {({ isActive }) => (
          <>
            <MessageSquare size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span>Chat</span>
          </>
        )}
      </NavLink>
      
      <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
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
