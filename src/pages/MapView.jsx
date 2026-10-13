import { useState, useEffect, useRef } from 'react';
import { GoogleMap, Circle, InfoWindow } from '@react-google-maps/api';
import { supabase } from '../lib/supabaseClient';
import { Search, Camera, Sparkles, Download, WifiOff, MapPin } from 'lucide-react';
import { haversineDistance, adjustOverlappingCoordinates } from '../lib/utils';
import { searchPlaces } from '../lib/geocoding';
import SpotDetailsModal from '../components/SpotDetailsModal';
import ARView from './ARView';
import AIVibeMatcher from '../components/AIVibeMatcher';
import OfflineModal from '../components/OfflineModal';
import useOfflineSpots from '../hooks/useOfflineSpots';
import { categories } from '../lib/categoryConfig';
import { useSpotaGoogleMaps, DEFAULT_MAP_OPTIONS } from '../lib/googleMaps';
import GemMarkerOverlay from '../components/map/GemMarkerOverlay';
import './MapView.css';

export default function MapView() {
  const { isLoaded } = useSpotaGoogleMaps();
  const [spots, setSpots] = useState([]);
  const [center, setCenter] = useState([28.6139, 77.2090]); // Default Delhi, India
  const [userLocation, setUserLocation] = useState(null);
  const [selectedRange, setSelectedRange] = useState('5'); // default 5 km, options: 'All', 1, 5, 10, 25
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [showAR, setShowAR] = useState(false);
  const [showAiMatcher, setShowAiMatcher] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [openPopupSpotId, setOpenPopupSpotId] = useState(null);
  const [showUserPopup, setShowUserPopup] = useState(false);

  // Place search — jump the map to an area, state, or place name (as
  // distinct from filtering the pins already on screen by title/tag below)
  const [placeResults, setPlaceResults] = useState([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [showPlaceDropdown, setShowPlaceDropdown] = useState(false);
  const placeAbortRef = useRef(null);
  const searchContainerRef = useRef(null);

  const mapRef = useRef(null);

  const { isOffline, offlineSpots, refreshCache } = useOfflineSpots();

  // Fetch spots on mount
  useEffect(() => {
    async function fetchSpots() {
      try {
        const { data, error } = await supabase.from('spots').select('*').neq('status', 'deleted');
        if (error) throw error;

        if (data && data.length > 0) {
          setSpots(data);
          // Default center on the most recently added spot
          setCenter([data[data.length - 1].latitude, data[data.length - 1].longitude]);
        }
      } catch (error) {
        console.error('Error fetching map spots:', error);
      }
    }

    if (!isOffline) {
      fetchSpots();
    }

    // Center on user's browser location if available
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latLng = [position.coords.latitude, position.coords.longitude];
          setCenter(latLng);
          setUserLocation(latLng);
        },
        (err) => console.log('Geolocation centered bypassed:', err)
      );
    }
  }, [isOffline]);

  // Center map on last offline spot if offline mode becomes active
  useEffect(() => {
    if (isOffline && offlineSpots.length > 0) {
      setTimeout(() => {
        setCenter([offlineSpots[offlineSpots.length - 1].latitude, offlineSpots[offlineSpots.length - 1].longitude]);
      }, 0);
    }
  }, [isOffline, offlineSpots]);

  // Pan the map whenever `center` changes (mirrors the old Leaflet MapCenter helper)
  useEffect(() => {
    if (center && mapRef.current) {
      mapRef.current.panTo({ lat: center[0], lng: center[1] });
    }
  }, [center]);

  // Debounced place search — matches areas, states, cities, and named
  // places (not just spots already on the map)
  useEffect(() => {
    if (searchQuery.trim().length < 3) return; // results are hidden while the query is short (see render)
    const t = setTimeout(async () => {
      if (placeAbortRef.current) placeAbortRef.current.abort();
      placeAbortRef.current = new AbortController();
      setIsSearchingPlaces(true);
      const results = await searchPlaces(searchQuery, placeAbortRef.current.signal);
      if (results !== null) {
        setPlaceResults(results || []);
        setShowPlaceDropdown(true);
      }
      setIsSearchingPlaces(false);
    }, 380);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Click outside the search bar closes the place dropdown
  useEffect(() => {
    const handler = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowPlaceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectPlace = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (isNaN(lat) || isNaN(lng)) return;
    setCenter([lat, lng]);
    if (mapRef.current) mapRef.current.setZoom(13);
    // Clear the text filter so pins near the searched place aren't hidden
    // by a title/tag match against the full place name.
    setSearchQuery('');
    setPlaceResults([]);
    setShowPlaceDropdown(false);
  };

  // Listen to realtime or local updates to update likes and shares instantly on map markers
  useEffect(() => {
    const handleSpotUpdate = (e) => {
      const { id, reactions, share_count } = e.detail;
      setSpots((prevSpots) =>
        prevSpots.map((spot) =>
          spot.id === id
            ? {
                ...spot,
                reactions: reactions !== undefined ? reactions : spot.reactions,
                share_count: share_count !== undefined ? share_count : spot.share_count
              }
            : spot
        )
      );

      // Also update currently selected spot details if open
      setSelectedSpot((current) => {
        if (current && current.id === id) {
          return {
            ...current,
            reactions: reactions !== undefined ? reactions : current.reactions,
            share_count: share_count !== undefined ? share_count : current.share_count
          };
        }
        return current;
      });
    };

    window.addEventListener('spota_spot_updated', handleSpotUpdate);
    return () => window.removeEventListener('spota_spot_updated', handleSpotUpdate);
  }, []);

  // Compute popularity score
  const getPopularity = (spot) => {
    let reactionCount = 0;
    if (spot.reactions) {
      reactionCount = Object.values(spot.reactions).reduce((a, b) => a + b, 0);
    }
    return (reactionCount * 2) + ((spot.share_count || 0) * 3);
  };

  // Get reference coordinates for range calculations (handles remote testing fallback)
  const getReferenceCoords = () => {
    let coords = userLocation || center;
    if (userLocation && center) {
      const distFromCenter = haversineDistance(userLocation[0], userLocation[1], center[0], center[1]);
      if (distFromCenter > 100) {
        coords = center;
      }
    }
    return coords;
  };

  const displaySpots = adjustOverlappingCoordinates(isOffline ? offlineSpots : spots);

  // Filter map pins based on search query, range distance, and selected category
  const filteredSpots = displaySpots.filter((spot) => {
    // Show all spots except deleted or flagged ones
    if (spot.status === 'deleted' || spot.status === 'flagged') return false;

    // 1. Range proximity filter
    if (selectedRange !== 'All') {
      const refCoords = getReferenceCoords();
      if (refCoords) {
        const distance = haversineDistance(refCoords[0], refCoords[1], spot.latitude, spot.longitude);
        if (distance > Number(selectedRange)) return false;
      }
    }

    // 2. Category filter
    if (selectedCategory !== 'all') {
      if (spot.category !== selectedCategory) return false;
    }

    // 3. Search query filter
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const cleanQuery = query.replace(/#/g, '');
    const tagMatch = spot.tags && Array.isArray(spot.tags) && spot.tags.some(tag => tag.toLowerCase().includes(cleanQuery));
    return (
      spot.title?.toLowerCase().includes(query) ||
      spot.description?.toLowerCase().includes(query) ||
      spot.category?.toLowerCase().includes(query) ||
      tagMatch
    );
  });

  const referenceCoords = getReferenceCoords();

  return (
    <div className="map-container-wrapper">
      {/* Offline Status Banner */}
      {isOffline && (
        <div className="offline-banner animate-fade-in">
          <WifiOff size={14} />
          <span>Offline Mode — Caching Active</span>
        </div>
      )}

      {/* AR Mode Trigger Button */}
      <button
        className="map-ar-trigger-btn glass-panel animate-fade-in"
        onClick={() => setShowAR(true)}
        title="Open AR Finder"
      >
        <Camera size={22} />
      </button>

      {/* Offline Download Trigger Button */}
      {!isOffline && (
        <button
          className="map-download-trigger-btn glass-panel animate-fade-in"
          onClick={() => setShowOfflineModal(true)}
          title="Download Map Area Offline"
        >
          <Download size={22} />
        </button>
      )}

      {/* Floating Explore Nearby AR CTA */}
      <button
        className="map-explore-cta glass-panel animate-pulse-glow"
        onClick={() => setShowAR(true)}
        title="Explore Nearby in Augmented Reality"
      >
        <Camera size={18} className="cta-icon" />
        <span>Explore Nearby (AR)</span>
      </button>

      {/* Vibe & Spot Search Overlay */}
      <div className="map-search-overlay" ref={searchContainerRef}>
        <Search size={18} className="map-search-icon" />
        <input
          type="text"
          placeholder="Search an area, state, place, or your spots..."
          className="map-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => placeResults.length > 0 && setShowPlaceDropdown(true)}
        />
        <button
          type="button"
          className="map-ai-search-trigger"
          onClick={() => setShowAiMatcher(true)}
          title="Ask Spota Vibe AI"
        >
          <Sparkles size={18} />
        </button>

        {showPlaceDropdown && searchQuery.trim().length >= 3 && (placeResults.length > 0 || isSearchingPlaces) && (
          <div className="map-search-dropdown glass-panel">
            {isSearchingPlaces ? (
              <div className="map-search-loading">Searching places… 🗺️</div>
            ) : (
              placeResults.map((item, idx) => {
                const parts = (item.display_name || '').split(',');
                return (
                  <div key={item.place_id || idx} className="map-search-result" onClick={() => handleSelectPlace(item)}>
                    <MapPin size={14} className="map-result-icon" />
                    <div>
                      <div className="map-result-main">{parts[0]}</div>
                      {parts[1] && <div className="map-result-sub">{parts.slice(1, 3).join(', ')}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Range Filter Overlay */}
      <div className="map-range-overlay">
        <span className="range-label">Range:</span>
        <div className="range-chips">
          {['All', '1', '5', '10', '25'].map((rangeVal) => (
            <button
              key={rangeVal}
              className={`range-chip ${selectedRange === rangeVal ? 'active' : ''}`}
              onClick={() => {
                setSelectedRange(rangeVal);
              }}
            >
              {rangeVal === 'All' ? 'All' : `${rangeVal} km`}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter Chips Overlay */}
      <div className="map-category-overlay">
        <div className="category-chips">
          <button
            className={`category-chip ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            💎 All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`category-chip ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                '--cat-color': cat.color
              }}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoaded && (
        <GoogleMap
          mapContainerClassName="full-screen-map"
          center={{ lat: center[0], lng: center[1] }}
          zoom={13}
          options={DEFAULT_MAP_OPTIONS}
          onLoad={(map) => { mapRef.current = map; }}
        >
          {/* User Location Pulse Marker */}
          {userLocation && (
            <>
              <GemMarkerOverlay
                position={{ lat: userLocation[0], lng: userLocation[1] }}
                width={18}
                height={18}
                zIndex={5}
                onClick={() => setShowUserPopup(true)}
              >
                <div className="user-location-dot" />
              </GemMarkerOverlay>
              {showUserPopup && (
                <InfoWindow
                  position={{ lat: userLocation[0], lng: userLocation[1] }}
                  onCloseClick={() => setShowUserPopup(false)}
                >
                  <div style={{ color: '#2C3531', fontWeight: 600 }}>Your Location</div>
                </InfoWindow>
              )}
            </>
          )}

          {/* Visual Range Circle Overlay */}
          {selectedRange !== 'All' && referenceCoords && (
            <Circle
              center={{ lat: referenceCoords[0], lng: referenceCoords[1] }}
              radius={Number(selectedRange) * 1000}
              options={{
                fillColor: '#6C8C74',
                fillOpacity: 0.08,
                strokeColor: '#6C8C74',
                strokeWeight: 1.5,
                clickable: false,
              }}
            />
          )}

          {filteredSpots.map((spot) => {
            const popularity = getPopularity(spot);
            const isTrending = popularity >= 5;
            const isPending = spot.status === 'pending';
            const position = { lat: spot.latitude, lng: spot.longitude };

            return (
              <div key={spot.id}>
                <GemMarkerOverlay
                  position={position}
                  width={32}
                  height={32}
                  onClick={() => setOpenPopupSpotId(spot.id)}
                >
                  <div className={`marker-gem-pin ${isTrending ? 'trending' : ''} ${isPending ? 'pending' : ''}`}>
                    {isPending ? '⏳' : (isTrending ? '🔥' : '💎')}
                  </div>
                </GemMarkerOverlay>

                {openPopupSpotId === spot.id && (
                  <InfoWindow position={position} onCloseClick={() => setOpenPopupSpotId(null)}>
                    <div className="custom-popup">
                      {isPending && <span className="popup-pending-tag" style={{ color: '#E07A5F', fontWeight: '700', fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>⏳ Pending Review</span>}
                      {isTrending && !isPending && <span className="popup-trending-tag">🔥 Trending</span>}
                      {spot.image_url && (
                        <img src={spot.image_url} alt={spot.title} className="popup-image-mini" />
                      )}
                      <h3>{spot.title}</h3>
                      <p>{spot.description || spot.category}</p>
                      {spot.tags && Array.isArray(spot.tags) && spot.tags.length > 0 && (
                        <div className="popup-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '4px 0 8px 0' }}>
                          {spot.tags.map((tag, idx) => (
                            <span key={idx} style={{ backgroundColor: 'rgba(108,140,116,0.1)', color: 'var(--color-accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 600 }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        className="popup-details-btn"
                        onClick={() => setSelectedSpot(spot)}
                      >
                        View Details
                      </button>
                    </div>
                  </InfoWindow>
                )}
              </div>
            );
          })}
        </GoogleMap>
      )}

      {selectedSpot && (
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
      )}

      {showAiMatcher && (
        <AIVibeMatcher
          onClose={() => setShowAiMatcher(false)}
          onSelectSpot={(spot) => {
            setShowAiMatcher(false);
            setSelectedSpot(spot);
          }}
        />
      )}

      {showAR && (
        <ARView
          spots={displaySpots}
          userLocation={userLocation}
          onClose={() => setShowAR(false)}
          onSelectSpot={(spot) => {
            setShowAR(false);
            setSelectedSpot(spot);
          }}
        />
      )}

      {showOfflineModal && (
        <OfflineModal
          center={center}
          spots={spots}
          onClose={() => setShowOfflineModal(false)}
          onSuccess={() => {
            refreshCache();
          }}
        />
      )}
    </div>
  );
}
