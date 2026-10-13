import { OverlayView } from '@react-google-maps/api';

// Renders arbitrary HTML (an emoji pin, a vote-count badge, a day-number
// badge, ...) anchored to a lat/lng — the Google Maps equivalent of
// Leaflet's L.divIcon, so the existing marker CSS (marker-gem-pin,
// trip-gem-pin, marker-badge, ...) can be reused as-is.
export default function GemMarkerOverlay({ position, width, height, onClick, children, zIndex }) {
  const getPixelPositionOffset = (w, h) => ({ x: -(w / 2), y: -h });

  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => getPixelPositionOffset(width, height)}
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
