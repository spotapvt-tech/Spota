import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabaseClient';
import { haversineDistance } from '../lib/utils';
import SpotDetailsModal from '../components/SpotDetailsModal';

const NotificationContext = createContext(null);

function ToastPortal({ spot, onClick, onClose }) {
  return createPortal(
    <div className="toast-notification glass-panel" onClick={onClick}>
      {spot.image_url ? (
        <img src={spot.image_url} alt={spot.title} className="toast-image" />
      ) : (
        <div className="toast-image" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor: 'var(--color-accent)', 
          color: 'white', 
          fontSize: '1.2rem',
          borderRadius: 'var(--radius-sm)'
        }}>
          💎
        </div>
      )}
      <div className="toast-body">
        <span className="toast-badge">New Gem Nearby!</span>
        <h4 className="toast-title">{spot.title}</h4>
        <p className="toast-desc">{spot.description || spot.vibe || "Tap to view details"}</p>
      </div>
      <button className="toast-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
    </div>,
    document.body
  );
}

export function NotificationProvider({ children }) {
  const [toastSpot, setToastSpot] = useState(null);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [userLocation, setUserLocation] = useState(null);

  // Load persistent notifications from LocalStorage
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('spota_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  // Save notifications to LocalStorage on changes
  useEffect(() => {
    localStorage.setItem('spota_notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Request user location on mount for proximity filtering
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        (error) => {
          console.error('Error getting user location for notifications:', error);
        }
      );
    }
  }, []);

  const showToast = useCallback((spot) => {
    setToastSpot(spot);
    // Clear toast automatically after 5 seconds
    setTimeout(() => {
      setToastSpot((current) => current && current.id === spot.id ? null : current);
    }, 5000);
  }, []);

  const addNotification = useCallback((spot) => {
    // Only notify if within 10 km
    if (userLocation) {
      const distance = haversineDistance(userLocation.lat, userLocation.lng, spot.latitude, spot.longitude);
      if (distance > 10) return; // ignore distant spots
    }
    setNotifications((prev) => [
      {
        id: spot.id || Date.now(),
        title: spot.title,
        message: `${spot.title} was just dropped!`,
        image_url: spot.image_url,
        description: spot.description || spot.vibe,
        category: spot.category,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      },
      ...prev,
    ]);
  }, [userLocation]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const channel = supabase
      .channel('spots-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'spots' },
        (payload) => {
          console.log('REALTIME PAYLOAD:', payload);
          const newSpot = payload.new;
          if (!newSpot || !newSpot.title) return;

          // Check proximity
          let isNearby = true;
          if (userLocation) {
            const distance = haversineDistance(userLocation.lat, userLocation.lng, newSpot.latitude, newSpot.longitude);
            isNearby = distance <= 10;
          }

          if (isNearby) {
            showToast(newSpot);
            addNotification(newSpot);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'spots' },
        (payload) => {
          console.log('REALTIME UPDATE PAYLOAD:', payload);
          const updatedSpot = payload.new;
          if (updatedSpot) {
            window.dispatchEvent(new CustomEvent('spota_spot_updated', { 
              detail: { 
                id: updatedSpot.id, 
                reactions: updatedSpot.reactions, 
                share_count: updatedSpot.share_count 
              } 
            }));
          }
        }
      )
      .subscribe((status) => {
        console.log('REALTIME STATUS:', status);
        setConnectionStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showToast, addNotification, userLocation]);

  return (
    <NotificationContext.Provider value={{
      unreadCount,
      notifications,
      clearNotifications,
      markAllRead,
      removeNotification,
      showToast,
      addNotification,
      connectionStatus,
    }}>
      {children}
      {toastSpot && (
        <ToastPortal 
          spot={toastSpot} 
          onClick={() => {
            setSelectedSpot(toastSpot);
            setToastSpot(null);
          }} 
          onClose={() => setToastSpot(null)} 
        />
      )}
      {selectedSpot && createPortal(
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />,
        document.body
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return ctx;
}
