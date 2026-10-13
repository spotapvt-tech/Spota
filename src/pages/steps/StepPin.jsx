import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { Search, X } from 'lucide-react';
import { reverseGeocode, searchPlaces } from '../../lib/geocoding';
import { useSpotaGoogleMaps, DEFAULT_MAP_OPTIONS } from '../../lib/googleMaps';
import './StepPin.css';

export default function StepPin({ location, setLocation, photoGps }) {
  const { isLoaded } = useSpotaGoogleMaps();
  // idle | loading | success | denied | photo. Initial value mirrors what the
  // step-entry effect below is about to do, so the effect needn't set it synchronously.
  const [gpsStatus, setGpsStatus] = useState(() => {
    if (location?.lat) return location.source === 'exif' ? 'photo' : 'success';
    if (photoGps?.lat && photoGps?.lng) return 'loading';
    if (!('geolocation' in navigator) || !navigator.onLine) return 'denied';
    return 'loading';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const abortRef = useRef(null);
  const searchContainerRef = useRef(null);
  const mapRef = useRef(null);

  const mapCenter = location?.lat ? { lat: location.lat, lng: location.lng } : { lat: 28.6139, lng: 77.2090 };

  // Pan/zoom the map whenever the pinned location changes
  useEffect(() => {
    if (location?.lat && mapRef.current) {
      mapRef.current.panTo({ lat: location.lat, lng: location.lng });
      if (mapRef.current.getZoom() < 14) mapRef.current.setZoom(14);
    }
  }, [location?.lat, location?.lng]);

  // Auto GPS on step entry
  // Ask the device for a position (status updates happen in the async callbacks)
  const requestDevicePosition = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const { name, address } = await reverseGeocode(lat, lng);
        setLocation({ lat, lng, placeName: name, address, source: 'gps' });
        setGpsStatus('success');
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
    );
  }, [setLocation]);

  // Retry button: show the loading state, then request
  const detectGPS = useCallback(() => {
    if (!('geolocation' in navigator) || !navigator.onLine) { setGpsStatus('denied'); return; }
    setGpsStatus('loading');
    requestDevicePosition();
  }, [requestDevicePosition]);

  useEffect(() => {
    // Already have a location: initial gpsStatus already reflects it
    if (location?.lat) return;
    if (photoGps?.lat && photoGps?.lng) {
      // EXIF GPS found in the photo — use it, then reverse-geocode for place name
      reverseGeocode(photoGps.lat, photoGps.lng).then(({ name, address }) => {
        setLocation({
          lat: photoGps.lat,
          lng: photoGps.lng,
          placeName: name,
          address,
          source: 'exif',
        });
        setGpsStatus('photo');
      }).catch(() => {
        // reverse geocode failed but we still have coords
        setLocation({ lat: photoGps.lat, lng: photoGps.lng, source: 'exif' });
        setGpsStatus('photo');
      });
    } else if ('geolocation' in navigator && navigator.onLine) {
      // No EXIF GPS: fall back to device GPS (initial status is already 'loading')
      requestDevicePosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reverse geocode when map-tapped location changes
  useEffect(() => {
    if (location?.source === 'map' && location.lat) {
      reverseGeocode(location.lat, location.lng).then(({ name, address }) => {
        setLocation(prev => ({ ...prev, placeName: name, address }));
      });
    }
  }, [location?.lat, location?.lng, location?.source, setLocation]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 3) return; // results are hidden while the query is short (see below)
    const t = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setIsSearching(true);
      const results = await searchPlaces(searchQuery, abortRef.current.signal);
      if (results !== null) {
        setSearchResults(results || []);
        setShowDropdown(true);
      }
      setIsSearching(false);
    }, 380);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Click outside to close dropdown
  useEffect(() => {
    const handler = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectResult = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (isNaN(lat) || isNaN(lng)) return;
    const parts = (item.display_name || '').split(',');
    setLocation({ lat, lng, placeName: parts[0]?.trim() || '', address: item.display_name || '', source: 'search' });
    setSearchQuery(item.display_name || '');
    setShowDropdown(false);
    setSearchResults([]);
    setGpsStatus('success');
  };

  const handleMapClick = (e) => {
    setLocation(prev => ({ ...prev, lat: e.latLng.lat(), lng: e.latLng.lng(), source: 'map' }));
  };

  const handleMarkerDragEnd = (e) => {
    setLocation(prev => ({ ...prev, lat: e.latLng.lat(), lng: e.latLng.lng(), source: 'map' }));
  };

  return (
    <div className="step-pin wizard-step">
      <div className="step-header">
        <h2>Drop the Pin 📍</h2>
        <p>Confirm where this gem lives.</p>
      </div>

      {/* GPS Banner */}
      <div className={`gps-banner ${gpsStatus}`}>
        {gpsStatus === 'loading' && (
          <>
            <span className="gps-spinner">⏳</span>
            <span>Detecting location…</span>
          </>
        )}

        {/* ── Photo EXIF GPS banner */}
        {gpsStatus === 'photo' && (
          <>
            <div className="gps-banner-info">
              <span className="gps-place-name">📸 Location from your photo</span>
              {location?.placeName && (
                <span className="gps-address">{location.placeName}{location.address ? ` · ${location.address.split(',').slice(0,2).join(', ')}` : ''}</span>
              )}
            </div>
            <button
              type="button"
              className="gps-switch-btn"
              onClick={() => { setGpsStatus('idle'); setLocation(null); detectGPS(); }}
              title="Use your current device GPS instead"
            >
              ↻ Use my GPS
            </button>
          </>
        )}

        {gpsStatus === 'success' && location?.source !== 'exif' && location?.placeName && (
          <>
            <div className="gps-banner-info">
              <span className="gps-place-name">📡 {location.placeName}</span>
              {location.address && <span className="gps-address">{location.address.split(',').slice(0,3).join(', ')}</span>}
            </div>
            <button type="button" className="gps-refresh-btn" onClick={detectGPS}>↻ GPS</button>
          </>
        )}
        {gpsStatus === 'success' && location?.source !== 'exif' && !location?.placeName && (
          <>
            <span>📡 Location pinned</span>
            <button type="button" className="gps-refresh-btn" onClick={detectGPS}>↻ GPS</button>
          </>
        )}
        {gpsStatus === 'denied' && (
          <>
            <span>⚠️ GPS unavailable — search or tap the map</span>
            <button type="button" className="gps-refresh-btn" onClick={detectGPS}>↻ Retry</button>
          </>
        )}
        {gpsStatus === 'idle' && (
          <button type="button" className="gps-detect-btn" onClick={detectGPS}>
            📡 Detect My Location
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="pin-search-container" ref={searchContainerRef}>
        <div className="pin-search-wrap">
          <Search size={15} className="pin-search-icon" />
          <input
            type="text"
            placeholder="Search a different place or address…"
            className="pin-search-input"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
          />
          {searchQuery && (
            <button type="button" className="pin-search-clear" onClick={() => { setSearchQuery(''); setShowDropdown(false); }}>
              <X size={13} />
            </button>
          )}
        </div>

        {showDropdown && searchQuery.trim().length >= 3 && (searchResults.length > 0 || isSearching) && (
          <div className="pin-search-dropdown glass-panel">
            {isSearching ? (
              <div className="pin-search-loading">Searching… 🗺️</div>
            ) : (
              searchResults.map((item, idx) => {
                const parts = (item.display_name || '').split(',');
                return (
                  <div key={item.place_id || idx} className="pin-search-result" onClick={() => handleSelectResult(item)}>
                    <span className="pin-result-icon">📍</span>
                    <div>
                      <div className="pin-result-main">{parts[0]}</div>
                      {parts[1] && <div className="pin-result-sub">{parts.slice(1,3).join(', ')}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="pin-map-wrapper">
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={{ height: '100%', width: '100%' }}
            center={mapCenter}
            zoom={14}
            options={DEFAULT_MAP_OPTIONS}
            onClick={handleMapClick}
            onLoad={(map) => { mapRef.current = map; }}
          >
            {location?.lat && (
              <Marker
                position={{ lat: location.lat, lng: location.lng }}
                draggable
                onDragEnd={handleMarkerDragEnd}
              />
            )}
          </GoogleMap>
        )}
        <div className="pin-map-hint">Tap map to move pin · Drag pin to fine-tune</div>
      </div>

      {/* Confirmed address */}
      {location?.address && (
        <div className="pin-address-card glass-panel">
          <span>📍</span>
          <div>
            <div className="pin-address-name">{location.placeName || 'Pinned Location'}</div>
            <div className="pin-address-full">{location.address}</div>
            {location.lat && (
              <div className="pin-address-coords">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
