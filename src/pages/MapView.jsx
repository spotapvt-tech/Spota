import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, CircleMarker } from 'react-leaflet';
import { supabase } from '../lib/supabaseClient';
import { Search, Camera, Sparkles, Download, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { haversineDistance } from '../lib/utils';
import SpotDetailsModal from '../components/SpotDetailsModal';
import ARView from './ARView';
import AIVibeMatcher from '../components/AIVibeMatcher';
import OfflineModal from '../components/OfflineModal';
import useOfflineSpots from '../hooks/useOfflineSpots';
import { categories } from '../lib/categoryConfig';
import 'leaflet/dist/leaflet.css';
import './MapView.css';

// Fix for default Leaflet marker icons in React
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper component to center map dynamically
function MapCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);
  return null;
}

export default function MapView() {
  const { user } = useAuth();
  const [spots, setSpots] = useState([]);
  const [center, setCenter] = useState([40.7128, -74.0060]); // Default NY
  const [userLocation, setUserLocation] = useState(null);
  const [selectedRange, setSelectedRange] = useState('5'); // default 5 km, options: 'All', 1, 5, 10, 25
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [showAR, setShowAR] = useState(false);
  const [showAiMatcher, setShowAiMatcher] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

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
      setCenter([offlineSpots[offlineSpots.length - 1].latitude, offlineSpots[offlineSpots.length - 1].longitude]);
    }
  }, [isOffline, offlineSpots]);

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

  const displaySpots = isOffline ? offlineSpots : spots;

  // Filter map pins based on search query, range distance, and selected category
  const filteredSpots = displaySpots.filter((spot) => {
    // Only show approved spots, or pending spots owned by the current user
    const isOwner = user && spot.user_id === user.id;
    if (spot.status !== 'approved' && !isOwner) return false;

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
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 10,
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-primary)',
          color: 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          transition: 'all 0.2s ease'
        }}
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
      <div className="map-search-overlay">
        <Search size={18} className="map-search-icon" />
        <input 
          type="text" 
          placeholder="Search map spots, category, or vibe..." 
          className="map-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button 
          type="button" 
          className="map-ai-search-trigger"
          onClick={() => setShowAiMatcher(true)}
          title="Ask Spota Vibe AI"
        >
          <Sparkles size={18} />
        </button>
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

      <MapContainer 
        center={center} 
        zoom={13} 
        scrollWheelZoom={true} 
        zoomControl={false}
        className="full-screen-map"
      >
        <MapCenter position={center} />
        
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}{r}.png"
        />

        {/* User Location Pulse Marker */}
        {userLocation && (
          <CircleMarker
            center={userLocation}
            radius={8}
            pathOptions={{
              fillColor: '#4A90E2',
              fillOpacity: 0.9,
              color: '#ffffff',
              weight: 2
            }}
          >
            <Popup>
              <div style={{ color: '#2C3531', fontWeight: 600 }}>Your Location</div>
            </Popup>
          </CircleMarker>
        )}

        {/* Visual Range Circle Overlay */}
        {selectedRange !== 'All' && getReferenceCoords() && (
          <Circle
            center={getReferenceCoords()}
            radius={Number(selectedRange) * 1000}
            pathOptions={{
              fillColor: 'var(--color-accent)',
              fillOpacity: 0.08,
              color: 'var(--color-accent)',
              weight: 1.5,
              dashArray: '5, 5'
            }}
          />
        )}
        
        {filteredSpots.map((spot) => {
          const popularity = getPopularity(spot);
          const isTrending = popularity >= 5;
          const isPending = spot.status === 'pending';
          
          const spotIcon = L.divIcon({
            className: 'custom-gem-marker',
            html: `<div class="marker-gem-pin ${isTrending ? 'trending' : ''} ${isPending ? 'pending' : ''}">
              ${isPending ? '⏳' : (isTrending ? '🔥' : '💎')}
            </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          });

          return (
            <Marker key={spot.id} position={[spot.latitude, spot.longitude]} icon={spotIcon}>
              <Popup>
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
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

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
          onSuccess={(zoneName, count) => {
            refreshCache();
          }} 
        />
      )}
    </div>
  );
}
