import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, CircleMarker } from 'react-leaflet';
import { supabase } from '../lib/supabaseClient';
import { Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { haversineDistance } from '../lib/utils';
import SpotDetailsModal from '../components/SpotDetailsModal';
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
  const [selectedRange, setSelectedRange] = useState('All'); // 'All', 1, 5, 10, 25 (in km)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpot, setSelectedSpot] = useState(null);

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
    
    fetchSpots();

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
  }, []);

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

  // Filter map pins based on search query and range distance
  const filteredSpots = spots.filter((spot) => {
    // Only show approved spots, or pending spots owned by the current user
    const isOwner = user && spot.user_id === user.id;
    if (spot.status !== 'approved' && !isOwner) return false;

    // 1. Range proximity filter
    if (selectedRange !== 'All' && userLocation) {
      const distance = haversineDistance(userLocation[0], userLocation[1], spot.latitude, spot.longitude);
      if (distance > Number(selectedRange)) return false;
    }

    // 2. Search query filter
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      spot.title?.toLowerCase().includes(query) ||
      spot.description?.toLowerCase().includes(query) ||
      spot.category?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="map-container-wrapper">
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
                if (rangeVal !== 'All' && !userLocation) {
                  alert('Please enable location access to filter by range.');
                  return;
                }
                setSelectedRange(rangeVal);
              }}
            >
              {rangeVal === 'All' ? 'All' : `${rangeVal} km`}
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
        {userLocation && selectedRange !== 'All' && (
          <Circle
            center={userLocation}
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
    </div>
  );
}
