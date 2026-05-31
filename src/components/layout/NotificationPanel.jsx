import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Gem } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import SpotDetailsModal from '../SpotDetailsModal';
import './NotificationPanel.css';

export default function NotificationPanel({ isOpen, onClose }) {
  const { notifications, clearNotifications, removeNotification, markAllRead } = useNotification();
  const [selectedSpot, setSelectedSpot] = useState(null);

  // Mark all as read when panel opens
  useEffect(() => {
    if (isOpen) {
      markAllRead();
    }
  }, [isOpen, markAllRead]);

  if (!isOpen) return null;

  return (
    <div className="notification-overlay" onClick={onClose}>
      <div className="notification-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3>Notifications</h3>
          <div className="panel-actions">
            {notifications.length > 0 && (
              <button className="clear-all-btn" onClick={clearNotifications}>
                <Trash2 size={16} />
                Clear All
              </button>
            )}
            <button className="close-panel-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="panel-body">
          {notifications.length === 0 ? (
            <div className="empty-notifications">
              <Gem size={40} strokeWidth={1.5} color="var(--color-text-secondary)" />
              <p>No notifications yet</p>
              <span>When someone drops a gem nearby, you'll see it here.</span>
            </div>
          ) : (
            <ul className="notification-list">
              {notifications.map((notif) => (
                <li 
                  key={notif.id} 
                  className={`notification-item clickable ${notif.read ? '' : 'unread'}`}
                  onClick={() => setSelectedSpot(notif)}
                >
                  <div className="notif-icon">💎</div>
                  <div className="notif-content">
                    <p className="notif-message">{notif.message}</p>
                    {notif.image_url && (
                      <img src={notif.image_url} alt="Spot" className="notif-image" />
                    )}
                    {notif.description && (
                      <p className="notif-description">{notif.description}</p>
                    )}
                    <span className="notif-time">{notif.time}</span>
                  </div>
                  <button 
                    className="remove-notif-btn" 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      removeNotification(notif.id); 
                    }}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {selectedSpot && createPortal(
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />,
        document.body
      )}
    </div>
  );
}
