import { useCallback } from 'react';
import { OverlayView } from '@react-google-maps/api';
import './mapChrome.css';

// Renders arbitrary HTML (an emoji pin, a vote-count badge, a day-number
// badge, ...) anchored to a lat/lng — the Google Maps equivalent of
// Leaflet's L.divIcon, so the existing marker CSS (marker-gem-pin,
// trip-gem-pin, marker-badge, ...) can be reused as-is.
// anchor: 'bottom' (pin tip on the point) | 'center' (badge centred on it).
// Pass a memoised `position` — a new object each render forces a redraw.
export default function GemMarkerOverlay({ position, width, height, onClick, children, zIndex, anchor = 'bottom' }) {
  const getPixelPositionOffset = useCallback(
    () => ({ x: -(width / 2), y: anchor === 'center' ? -(height / 2) : -height }),
    [width, height, anchor]
  );

  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={getPixelPositionOffset}
    >
      <div
        style={{ width, height, cursor: 'pointer', zIndex }}
        onClick={onClick}
      >
        {children}
      </div>
    </OverlayView>
  );
}
