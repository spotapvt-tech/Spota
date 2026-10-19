import { useCallback, useEffect, useState } from 'react';

/**
 * One-shot browser/WebView location with an explicit permission state, so
 * screens can explain *why* they want location before (or after) asking.
 *   status: 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable'
 * `auto` asks immediately only when permission was already granted — we never
 * pop the OS prompt on first paint without context.
 */
export default function useGeolocation({ auto = true } = {}) {
  const [coords, setCoords] = useState(null); // [lat, lng]
  const [status, setStatus] = useState('idle');

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.latitude, pos.coords.longitude]);
        setStatus('granted');
      },
      (err) => setStatus(err && err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 }
    );
  }, []);

  useEffect(() => {
    if (!auto) return undefined;
    let cancelled = false;
    const kick = () => { if (!cancelled) request(); };
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((p) => {
          if (p.state === 'granted') kick();
          else if (p.state === 'denied' && !cancelled) setStatus('denied');
        })
        .catch(() => {});
    } else {
      // Capacitor Android WebView: the native layer already holds the
      // permission decision, so asking here is equivalent to the old behaviour.
      kick();
    }
    return () => { cancelled = true; };
  }, [auto, request]);

  return { coords, status, request };
}
