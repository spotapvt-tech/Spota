import { useState, useEffect, useRef } from 'react';
import { X, Navigation, Compass, CameraOff } from 'lucide-react';
import { haversineDistance } from '../lib/utils';
import './ARView.css';

// Helper to compute bearing from user (lat1, lon1) to spot (lat2, lon2)
function getBearing(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export default function ARView({ spots, userLocation, onClose, onSelectSpot }) {
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(false);
  const [heading, setHeading] = useState(0); // 0 = North, 90 = East, etc.
  const [dragOffset, setDragOffset] = useState(0); // Manual look offset for desktop drag
  const [isDragging, setIsDragging] = useState(false);
  const startDragX = useRef(0);
  const videoRef = useRef(null);

  // Field of View in degrees
  const FOV = 60;

  // 1. Initialize Camera
  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Camera access error:', err);
        setCameraError(true);
      }
    }
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 2. Track Orientation Sensor
  useEffect(() => {
    const handleOrientation = (e) => {
      // Use absolute compass heading if available (alpha/webkitCompassHeading)
      let currentHeading = e.alpha;
      if (e.webkitCompassHeading) {
        currentHeading = e.webkitCompassHeading;
      }
      if (currentHeading !== null && currentHeading !== undefined) {
        // webkitCompassHeading is already aligned to magnetic north. 
        // Standard alpha is normally counter-clockwise, compass heading is clockwise.
        setHeading(360 - currentHeading);
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    // iOS absolute event
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
    };
  }, []);

  // 3. Desktop Drag to look handlers
  const handleMouseDown = (e) => {
    setIsDragging(true);
    startDragX.current = e.clientX;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startDragX.current;
    // Map screen movement to degrees offset (e.g. 1px = 0.25deg)
    setDragOffset((prev) => (prev - deltaX * 0.25 + 360) % 360);
    startDragX.current = e.clientX;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 4. Calculate positions of visible spots
  const effectiveHeading = (heading + dragOffset + 360) % 360;

  // Mock a user location if browser geolocation was denied (for testing/deskop)
  const userCoords = userLocation || [40.7128, -74.006]; // Default to NY

  const visibleSpots = spots
    .map((spot) => {
      const distance = haversineDistance(
        userCoords[0],
        userCoords[1],
        spot.latitude,
        spot.longitude
      );
      
      const bearing = getBearing(
        userCoords[0],
        userCoords[1],
        spot.latitude,
        spot.longitude
      );

      // Angle relative to our heading
      let diff = bearing - effectiveHeading;
      // Normalise to [-180, 180]
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      return {
        ...spot,
        distance,
        bearing,
        relativeAngle: diff,
        visible: Math.abs(diff) < FOV / 2
      };
    })
    .filter((spot) => spot.visible);

  return (
    <div 
      className="ar-view-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={(e) => handleMouseDown({ clientX: e.touches[0].clientX })}
      onTouchMove={(e) => handleMouseMove({ clientX: e.touches[0].clientX })}
      onTouchEnd={handleMouseUp}
    >
      {/* Full-Screen Camera Feed */}
      {!cameraError ? (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="ar-camera-feed"
        />
      ) : (
        <div className="ar-camera-fallback">
          <CameraOff size={48} />
          <h3>Camera Feed Unavailable</h3>
          <p>Please check camera permissions. Drag left/right to look around the virtual radar.</p>
        </div>
      )}

      {/* Compass HUD */}
      <div className="ar-hud">
        <div className="hud-heading">
          <Compass size={18} className="hud-icon" />
          <span>{Math.round(effectiveHeading)}° {getCompassDirection(effectiveHeading)}</span>
        </div>
        <div className="hud-helper">
          <Navigation size={12} />
          <span>Drag screen left/right to rotate camera manually</span>
        </div>
      </div>

      <button className="ar-close-btn glass-panel" onClick={onClose}>
        <X size={24} />
      </button>

      {/* Floating Spot Labels Container */}
      <div className="ar-overlay">
        {visibleSpots.map((spot) => {
          // Horizontal offset percent (from -50% to +50%)
          const xPercent = (spot.relativeAngle / (FOV / 2)) * 50 + 50; 
          
          // Vertical offset scales based on distance (closer = lower/bigger, further = higher/smaller)
          const scale = Math.max(0.6, Math.min(1.2, 1 / (spot.distance + 0.1)));
          const yOffset = 150 + spot.distance * 80; // Distance shifts spot lower

          return (
            <div
              key={spot.id}
              className="ar-spot-marker clickable"
              onClick={() => onSelectSpot(spot)}
              style={{
                left: `${xPercent}%`,
                top: `${Math.min(yOffset, window.innerHeight - 200)}px`,
                transform: `translate(-50%, -50%) scale(${scale})`,
                zIndex: Math.round(100 - spot.distance * 10)
              }}
            >
              <div className="ar-marker-card glass-panel">
                <span className="ar-marker-emoji">
                  {spot.category === 'cafe' ? '☕' : (spot.category === 'viewpoint' ? '🌅' : '💎')}
                </span>
                <div className="ar-marker-details">
                  <h4>{spot.title}</h4>
                  <span>{spot.distance.toFixed(2)} km away</span>
                </div>
              </div>
            </div>
          );
        })}

        {visibleSpots.length === 0 && (
          <div className="ar-no-spots animate-pulse">
            <span>Scan around for nearby spots...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Compass direction labels
function getCompassDirection(deg) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((deg % 360) / 45)) % 8;
  return directions[index];
}
