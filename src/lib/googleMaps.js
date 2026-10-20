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

// Light mint basemap — matches the app's frosted-glass surfaces (src/index.css).
// Parks and water carry soft green/blue; roads recede; POI noise is hidden so
// SPOTA markers own the map.
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#EEF6F0' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4C6A59' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F6FBF7' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#C5DCCB' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#2E4F40' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#E6F2E9' }] },
  { featureType: 'landscape.natural.terrain', elementType: 'geometry', stylers: [{ color: '#DCEBE0' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#E2EFE6' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#CFE7D6' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#DCEBE0' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6B8878' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F6FBF7' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BFDDE0' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4F7F86' }] },
];

export const DEFAULT_MAP_OPTIONS = {
  styles: MAP_STYLE,
  disableDefaultUI: true,
  zoomControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
  backgroundColor: '#EEF6F0',
};
