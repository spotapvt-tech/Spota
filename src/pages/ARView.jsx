import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Navigation, Compass, CameraOff, LocateFixed } from 'lucide-react';
import useDeviceHeading from '../hooks/useDeviceHeading';
import useLiveLocation from '../hooks/useLiveLocation';
import { arCandidates, fieldOfView, layoutMarkers, lerpAngle, normalizeAngle, AR_RADIUS_KM } from '../lib/arMath';
import { formatDistance } from '../lib/format';
import { CategoryIcon } from '../components/ui/CategoryGlyph';
import './ARView.css';

const SMOOTHING = 0.2;   // low-pass factor per frame for heading/pitch
const DRAG_DEG_PER_PX = 0.25;

function isLandscapeNow() {
  return window.innerWidth > window.innerHeight;
}

export default function ARView({ spots, userLocation, onClose, onSelectSpot }) {
  const [cameraError, setCameraError] = useState(false);
  const [isLandscape, setIsLandscape] = useState(isLandscapeNow);
  const [anyVisible, setAnyVisible] = useState(true);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const headingTextRef = useRef(null);
  const markerNodes = useRef(new Map());

  const { sensorRef, status: sensorStatus, requestPermission } = useDeviceHeading();
  const live = useLiveLocation({ highAccuracy: true, minMoveMeters: 3 });
  // Live high-accuracy fix first; the map's last fix seeds it while GPS warms up.
  const coords = live.coords || userLocation;

  // Manual look-around is only a fallback when there's no usable compass
  // (desktop, sensor-less devices, denied permission) — on a phone with a
  // working compass a stray swipe must not skew every label permanently.
  const dragEnabled = sensorStatus === 'unavailable';
  const dragOffsetRef = useRef(0);
  const dragStartX = useRef(null);

  // 1. Camera — stream kept in a ref so cleanup always sees the live stream.
  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const start = async () => {
      if (streamRef.current || !navigator.mediaDevices?.getUserMedia) {
        if (!navigator.mediaDevices?.getUserMedia) setCameraError(true);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(false);
      } catch (err) {
        console.error('Camera access error:', err);
        if (!cancelled) setCameraError(true);
      }
    };

    // Release the camera when the app is backgrounded (also fires on
    // Capacitor/Android pause) and reacquire it on return.
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);

  useEffect(() => {
    const onResize = () => setIsLandscape(isLandscapeNow());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // 2. Distance/bearing computed once per location change — not per frame.
  const candidates = useMemo(() => arCandidates(spots, coords), [spots, coords]);

  // 3. Animation loop: smooth the sensor and write transforms straight to the
  // marker nodes. React only re-renders when the candidate set changes.
  useEffect(() => {
    const fov = fieldOfView(isLandscape);
    let frame;
    let heading = dragEnabled ? dragOffsetRef.current : (sensorRef.current.heading ?? 0);
    let pitch = sensorRef.current.pitch ?? 0;
    let lastHeading = null;
    let lastPitch = null;
    let lastLabel = '';
    let lastAnyVisible = null;

    const tick = () => {
      const sensor = sensorRef.current;
      const target = dragEnabled || sensor.heading == null
        ? dragOffsetRef.current
        : sensor.heading;
      const targetPitch = dragEnabled ? 0 : sensor.pitch;
      heading = lerpAngle(heading, target, SMOOTHING);
      pitch += (targetPitch - pitch) * SMOOTHING;

      const moved = lastHeading == null
        || Math.abs(heading - lastHeading) > 0.05
        || Math.abs(pitch - lastPitch) > 0.05;

      if (moved) {
        lastHeading = heading;
        lastPitch = pitch;
        const layout = layoutMarkers(candidates, {
          heading, pitch, width: window.innerWidth, height: window.innerHeight, fov,
        });
        let visibleCount = 0;
        layout.forEach((p, i) => {
          const node = markerNodes.current.get(candidates[i].spot.id);
          if (!node) return;
          if (!p.visible) {
            node.style.visibility = 'hidden';
            return;
          }
          visibleCount += 1;
          node.style.visibility = 'visible';
          node.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${p.scale.toFixed(3)})`;
          node.style.opacity = String(p.opacity);
          node.style.zIndex = String(p.zIndex);
        });

        const shown = normalizeAngle(Math.round(heading));
        const label = `${shown}° ${getCompassDirection(shown)}`;
        if (label !== lastLabel && headingTextRef.current) {
          headingTextRef.current.textContent = label;
          lastLabel = label;
        }
        const any = visibleCount > 0;
        if (any !== lastAnyVisible) {
          lastAnyVisible = any;
          setAnyVisible(any);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [candidates, isLandscape, dragEnabled, sensorRef]);

  // 4. Drag-to-look (fallback only)
  const onPointerDown = (e) => {
    if (!dragEnabled) return;
    dragStartX.current = e.clientX;
  };
  const onPointerMove = (e) => {
    if (!dragEnabled || dragStartX.current == null) return;
    const dx = e.clientX - dragStartX.current;
    dragOffsetRef.current = normalizeAngle(dragOffsetRef.current - dx * DRAG_DEG_PER_PX);
    dragStartX.current = e.clientX;
  };
  const onPointerUp = () => { dragStartX.current = null; };

  const setMarkerNode = useCallback((id, node) => {
    if (node) markerNodes.current.set(id, node);
    else markerNodes.current.delete(id);
  }, []);

  let helper = null;
  if (sensorStatus === 'needs-permission') helper = 'Compass access is needed to place SPOTAs around you';
  else if (sensorStatus === 'pending') helper = 'Calibrating compass…';
  else if (dragEnabled) helper = 'No compass found — drag left/right to look around';

  return (
    <div
      className={`ar-view-container ${dragEnabled ? 'is-draggable' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {!cameraError ? (
        <video ref={videoRef} autoPlay playsInline muted className="ar-camera-feed" />
      ) : (
        <div className="ar-camera-fallback">
          <CameraOff size={48} />
          <h3>Camera Feed Unavailable</h3>
          <p>Please check camera permissions. SPOTAs are still placed around you below.</p>
        </div>
      )}

      <div className="ar-hud">
        <div className="hud-heading">
          <Compass size={18} className="hud-icon" />
          <span ref={headingTextRef}>—</span>
        </div>
        {helper && (
          <div className="hud-helper">
            <Navigation size={12} />
            <span>{helper}</span>
          </div>
        )}
        {sensorStatus === 'needs-permission' && (
          <button
            className="sp-btn sp-btn--primary sp-btn--sm ar-permission-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={requestPermission}
          >
            <Compass size={14} /> Enable compass
          </button>
        )}
      </div>

      <button className="ar-close-btn" onClick={onClose} aria-label="Close AR finder">
        <X size={24} />
      </button>

      <div className="ar-overlay">
        {candidates.map(({ spot, distance }) => (
          <button
            key={spot.id}
            ref={(node) => setMarkerNode(spot.id, node)}
            className="ar-spot-marker"
            onClick={() => onSelectSpot(spot)}
            aria-label={`${spot.title}, ${formatDistance(distance)} away`}
          >
            <span className="ar-marker-card">
              <span className="ar-marker-icon"><CategoryIcon category={spot.category} size={18} /></span>
              <span className="ar-marker-details">
                <strong>{spot.title}</strong>
                <span className="sp-mono">{formatDistance(distance)} away</span>
              </span>
            </span>
          </button>
        ))}

        {!coords ? (
          <div className="ar-no-spots" role="status">
            <LocateFixed size={14} className="animate-pulse" /> Waiting for GPS…
          </div>
        ) : candidates.length === 0 ? (
          <div className="ar-no-spots" role="status">No SPOTAs within {AR_RADIUS_KM} km of you yet</div>
        ) : !anyVisible && (
          <div className="ar-no-spots animate-pulse" role="status">Scan around for nearby SPOTAs…</div>
        )}
      </div>
    </div>
  );
}

function getCompassDirection(deg) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(deg / 45) % 8];
}
