import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Gift, MessageCircle } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import NotificationPanel from './NotificationPanel';
import DailyVibeDropModal from '../DailyVibeDropModal';
import SpotDetailsModal from '../SpotDetailsModal';
import Wordmark from '../ui/Wordmark';
import './TopBar.css';

export default function TopBar() {
  const { unreadCount } = useNotification();
  const [showPanel, setShowPanel] = useState(false);
  const [showVibeDrop, setShowVibeDrop] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const { pathname } = useLocation();

  // Focus mode: the drop wizard owns the whole screen (own header + CTA bar).
  if (pathname === '/add') return null;

  return (
    <>
      <header className="top-bar">
        <Link to="/" className="top-bar__brand" aria-label="Spota home">
          <Wordmark size={19} />
        </Link>

        <div className="top-bar__actions">
          <button
            className="sp-icon-btn"
            onClick={() => setShowVibeDrop(true)}
            aria-label="Open today's Daily Drop"
            title="Daily Drop"
          >
            <Gift size={21} strokeWidth={2} />
          </button>
          <Link to="/chat" className="sp-icon-btn" aria-label="Messages" title="Messages">
            <MessageCircle size={21} strokeWidth={2} />
          </Link>
          <button
            className="sp-icon-btn"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-expanded={showPanel}
            onClick={() => setShowPanel(!showPanel)}
          >
            <Bell size={21} strokeWidth={2} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        </div>
      </header>
      <NotificationPanel isOpen={showPanel} onClose={() => setShowPanel(false)} />

      {showVibeDrop && (
        <DailyVibeDropModal
          onClose={() => setShowVibeDrop(false)}
          onOpenSpot={(spot) => setSelectedSpot(spot)}
        />
      )}

      {selectedSpot && (
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
      )}
    </>
  );
}
