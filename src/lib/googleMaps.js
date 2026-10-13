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

// Light, low-clutter map theme approximating the app's previous CARTO
// "light_all" basemap and its sage/neutral palette (see src/index.css).
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f7f9f6' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b615c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f9f6' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#c9cfc9' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e3ebe0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e5e9e3' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#eef1ea' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d7e3e5' }] },
];

export const DEFAULT_MAP_OPTIONS = {
  styles: MAP_STYLE,
  disableDefaultUI: true,
  zoomControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
};
