import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import useOfflineSpots from './useOfflineSpots';

/**
 * Shared read of the public spots list for discovery surfaces (Home).
 * - online: Supabase `spots` (excluding deleted/flagged)
 * - offline: the IndexedDB zone cache (useOfflineSpots)
 * Keeps reactions/share counts live via the existing `spota_spot_updated`
 * window event that SpotDetailsModal dispatches.
 */
export default function useSpots() {
  const { isOffline, offlineSpots, loadingCache } = useOfflineSpots();
  const [spots, setSpots] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const { data, error: err } = await supabase.from('spots').select('*').neq('status', 'deleted');
      if (err) throw err;
      setSpots((data || []).filter((s) => s.status !== 'flagged'));
      setStatus('ready');
    } catch (e) {
      console.error('useSpots: fetch failed', e);
      setError(e?.message || 'Could not reach Spota');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (isOffline) return undefined;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [isOffline, load]);

  useEffect(() => {
    const onUpdate = (e) => {
      const { id, reactions, share_count } = e.detail || {};
      setSpots((prev) => prev.map((s) => (s.id === id
        ? { ...s, reactions: reactions ?? s.reactions, share_count: share_count ?? s.share_count }
        : s)));
    };
    window.addEventListener('spota_spot_updated', onUpdate);
    return () => window.removeEventListener('spota_spot_updated', onUpdate);
  }, []);

  if (isOffline) {
    return { spots: offlineSpots, status: loadingCache ? 'loading' : 'ready', error: null, isOffline, reload: load };
  }
  return { spots, status, error, isOffline, reload: load };
}

/** Popularity used across the app: reactions ×2 + shares ×3 (same as MapView). */
export function spotPopularity(spot) {
  const reactions = spot?.reactions ? Object.values(spot.reactions).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  return reactions * 2 + (spot?.share_count || 0) * 3;
}
