import { useEffect, useRef, useState } from 'react';
import { readOrientation } from '../lib/arMath';

// iOS 13+ gates motion sensors behind DeviceOrientationEvent.requestPermission(),
// which must be called from a user gesture (the AR button tap in MapView).
// Everywhere else the sensors are simply available.
const needsIosPermission = typeof window !== 'undefined'
  && typeof window.DeviceOrientationEvent !== 'undefined'
  && typeof window.DeviceOrientationEvent.requestPermission === 'function';

let permissionState = needsIosPermission ? 'prompt' : 'granted'; // prompt | granted | denied
const permissionListeners = new Set();

export function requestOrientationPermission() {
  if (permissionState !== 'prompt') return Promise.resolve(permissionState);
  return window.DeviceOrientationEvent.requestPermission()
    .then((result) => {
      permissionState = result === 'granted' ? 'granted' : 'denied';
      permissionListeners.forEach((fn) => fn(permissionState));
      return permissionState;
    })
    // Thrown when not called from a gesture — stay in 'prompt' so the AR
    // view's own "Enable compass" button can ask again.
    .catch(() => permissionState);
}

/**
 * Compass heading + pitch of the rear camera, written to a ref (not state) so
 * 60 Hz sensor events never re-render React. Callers read `sensorRef.current`
 * from their own animation loop.
 *   status: 'pending' | 'active' | 'needs-permission' | 'unavailable'
 * 'unavailable' (denied, or no trustworthy absolute reading within timeoutMs)
 * is the signal to fall back to manual drag-to-look.
 */
export default function useDeviceHeading({ timeoutMs = 1500 } = {}) {
  const sensorRef = useRef({ heading: null, pitch: 0 });
  const [permission, setPermission] = useState(permissionState);
  const [hasData, setHasData] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    permissionListeners.add(setPermission);
    return () => { permissionListeners.delete(setPermission); };
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return undefined;
    // Prefer the absolute event (Android Chrome/WebView). Plain
    // `deviceorientation` is only used where it carries an absolute or iOS
    // compass reading — never both listeners at once.
    const isAbsoluteEvent = 'ondeviceorientationabsolute' in window;
    const type = isAbsoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation';
    let received = false;

    const onOrientation = (e) => {
      const reading = readOrientation(e, isAbsoluteEvent);
      if (!reading) return;
      sensorRef.current = {
        // Keep the last heading while the phone is held flat (undefined heading)
        heading: reading.heading ?? sensorRef.current.heading,
        pitch: reading.pitch,
      };
      if (!received && sensorRef.current.heading != null) {
        received = true;
        setHasData(true);
      }
    };

    window.addEventListener(type, onOrientation);
    const timer = setTimeout(() => { if (!received) setTimedOut(true); }, timeoutMs);
    return () => {
      window.removeEventListener(type, onOrientation);
      clearTimeout(timer);
    };
  }, [permission, timeoutMs]);

  let status = 'pending';
  if (hasData) status = 'active';
  else if (permission === 'prompt') status = 'needs-permission';
  else if (permission === 'denied' || timedOut) status = 'unavailable';

  return { sensorRef, status, requestPermission: requestOrientationPermission };
}
