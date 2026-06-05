import { useState } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import NotificationPanel from './NotificationPanel';
import DailyVibeDropModal from '../DailyVibeDropModal';
import SpotDetailsModal from '../SpotDetailsModal';
import './TopBar.css';

export default function TopBar() {
  const { unreadCount } = useNotification();
  const [showPanel, setShowPanel] = useState(false);
  const [showVibeDrop, setShowVibeDrop] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);

  return (
    <>
      <header className="top-bar glass-panel">
        <div className="brand">
          <span className="brand-dot animate-pulse"></span>
          <h1>Spota</h1>
        </div>
        
        <div className="top-bar-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Daily Vibe Drop Trigger */}
          <button 
            className="vibe-drop-trigger-btn" 
            onClick={() => setShowVibeDrop(true)}
            title="Daily Vibe Drop"
            style={{
              background: 'rgba(108, 140, 116, 0.12)',
              border: 'none',
              color: 'var(--color-accent)',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative'
            }}
          >
            <Sparkles size={20} />
          </button>

          {/* Notification Button */}
          <button className="notification-btn" aria-label="Notifications" onClick={() => setShowPanel(!showPanel)}>
            <Bell size={24} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
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
        <SpotDetailsModal 
          spot={selectedSpot} 
          onClose={() => setSelectedSpot(null)} 
        />
      )}
    </>
  );
}
