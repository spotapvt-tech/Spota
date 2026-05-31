import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import NotificationPanel from './NotificationPanel';
import './TopBar.css';

export default function TopBar() {
  const { unreadCount } = useNotification();
  const [showPanel, setShowPanel] = useState(false);

  return (
    <>
      <header className="top-bar glass-panel">
        <div className="brand">
          <span className="brand-dot animate-pulse"></span>
          <h1>Spota</h1>
        </div>
        <button className="notification-btn" aria-label="Notifications" onClick={() => setShowPanel(!showPanel)}>
          <Bell size={24} />
          {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        </button>
      </header>
      <NotificationPanel isOpen={showPanel} onClose={() => setShowPanel(false)} />
    </>
  );
}
