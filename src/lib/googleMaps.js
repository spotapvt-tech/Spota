// Google Maps loader — shared across every map in the app (MapView,
// StepPin, SafeTrekView, TripBoardView, TripPackagePreviewView).
//
// @react-google-maps/api's useJsApiLoader caches the underlying <script>
// load globally by `id`, so every page can call useSpotaGoogleMaps() safely
// — the script and its libraries are only ever fetched once. The libraries
// array must keep the exact same reference across renders/callers (hence
// the module-level constant) or the loader re-warns/re-inits.

import { useJsApiLoader } from '@react-google-maps/api';

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const GOOGLE_MAPS_LIBRARIES = ['places'];

export function useSpotaGoogleMaps() {
  return useJsApiLoader({
    id: 'spota-google-maps',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
}

// "Night Topo" basemap — matches the app's dark ink surfaces (src/index.css).
// Terrain/park greens stay faintly visible so trails, forests and water read
// as the hero; roads recede; POI noise is hidden so SPOTA markers own the map.
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#121915' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#87928a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f1512' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2a362f' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#cbd2c8' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#141c17' }] },
  { featureType: 'landscape.natural.terrain', elementType: 'geometry', stylers: [{ color: '#18221c' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#151d18' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#18261d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#212b25' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#18201b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6f7a73' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2b362f' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1a22' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4f6b78' }] },
];

export const DEFAULT_MAP_OPTIONS = {
  styles: MAP_STYLE,
  disableDefaultUI: true,
  zoomControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
  backgroundColor: '#121915',
};
