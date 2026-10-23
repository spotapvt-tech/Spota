import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineDistance } from '../lib/utils';

/**
 * Continuous location via watchPosition (unlike the one-shot useGeolocation),
 * for surfaces that must follow the explorer while they move: the map's
 * "you are here" dot and the AR finder.
 *   status: 'locating' | 'granted' | 'denied' | 'unavailable'
 * Fixes closer than `minMoveMeters` to the last one are dropped so GPS jitter
 * doesn't re-render the page every second.
 */
export default function useLiveLocation({ enabled = true, highAccuracy = false, minMoveMeters = 5 } = {}) {
  const [coords, setCoords] = useState(null); // [lat, lng]
  const [accuracy, setAccuracy] = useState(null); // metres
  const [status, setStatus] = useState(() => ('geolocation' in navigator ? 'locating' : 'unavailable'));
  const [attempt, setAttempt] = useState(0);
  const lastRef = useRef(null);

  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return undefined;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const next = [pos.coords.latitude, pos.coords.longitude];
        const last = lastRef.current;
        setStatus('granted');
        setAccuracy(pos.coords.accuracy ?? null);
        if (last && haversineDistance(last[0], last[1], next[0], next[1]) * 1000 < minMoveMeters) return;
        lastRef.current = next;
        setCoords(next);
      },
      (err) => setStatus(err && err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: highAccuracy ? 5000 : 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, highAccuracy, minMoveMeters, attempt]);

  // Re-subscribe (e.g. after the user re-enables location in settings).
  const retry = useCallback(() => {
    setStatus('geolocation' in navigator ? 'locating' : 'unavailable');
    setAttempt((n) => n + 1);
  }, []);

  return { coords, accuracy, status, retry };
}
