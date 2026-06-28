import { useState, useEffect, useCallback } from 'react';
import { getCachedSpots, checkAndExpireCache } from '../lib/offlineCache';

export default function useOfflineSpots() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [offlineSpots, setOfflineSpots] = useState([]);
  const [loadingCache, setLoadingCache] = useState(false);

  // Helper to load spots from IndexedDB
  const loadCachedSpots = useCallback(async () => {
    setLoadingCache(true);
    try {
      // Clean up expired entries first
      await checkAndExpireCache();
      const cached = await getCachedSpots();
      setOfflineSpots(cached);
    } catch (err) {
      console.error('Failed to load offline spots from cache:', err);
    } finally {
      setLoadingCache(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
      loadCachedSpots();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load if starting offline
    if (!navigator.onLine) {
      const timer = setTimeout(() => {
        loadCachedSpots();
      }, 0);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadCachedSpots]);

  return {
    isOffline,
    offlineSpots,
    loadingCache,
    refreshCache: loadCachedSpots
  };
}
