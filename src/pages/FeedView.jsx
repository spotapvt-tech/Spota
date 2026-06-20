import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, Flame, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SpotDetailsModal from '../components/SpotDetailsModal';
import { haversineDistance } from '../lib/utils';
import AIVibeMatcher from '../components/AIVibeMatcher';
import './FeedView.css';

export default function FeedView() {
  const { user } = useAuth();
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [showAiMatcher, setShowAiMatcher] = useState(false);
  const [visibleCount, setVisibleCount] = useState(15);

  // Reset pagination when filter or search changes
  useEffect(() => {
    setVisibleCount(15);
  }, [searchQuery, activeFilter]);

  // Fetch user location for distance calculations
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (err) => console.log('Geolocation bypass in feed:', err),
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    }
  }, []);

  useEffect(() => {
    async function fetchSpots() {
      try {
        const { data, error } = await supabase
          .from('spots')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSpots(data || []);
      } catch (error) {
        console.error('Error fetching spots:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchSpots();
  }, []);

  // Listen to realtime or local updates to update likes and shares instantly in the list
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

  // Filter and search logic
  const filteredSpots = spots
    .filter((spot) => {
      // Show all spots except deleted or flagged ones
      if (spot.status === 'deleted' || spot.status === 'flagged') return false;

      // 1. Search Query Filter
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const cleanQuery = query.replace(/#/g, '');
        const titleMatch = spot.title?.toLowerCase().includes(query);
        const descMatch = spot.description?.toLowerCase().includes(query) || spot.vibe?.toLowerCase().includes(query);
        const catMatch = spot.category?.toLowerCase().includes(query);
        const tagMatch = spot.tags && Array.isArray(spot.tags) && spot.tags.some(tag => tag.toLowerCase().includes(cleanQuery));
        if (!titleMatch && !descMatch && !catMatch && !tagMatch) return false;
      }

      // 2. Chip Category Filter
      if (activeFilter === 'cafes') {
        return spot.category === 'cafe';
      }
      if (activeFilter === 'events') {
        return spot.category === 'event' || spot.category === 'viewpoint';
      }
      if (activeFilter === 'trending') {
        return getPopularity(spot) >= 5;
      }
      return true; // activeFilter === 'all'
    })
    .sort((a, b) => {
      // If trending filter is active, sort by popularity score descending
      if (activeFilter === 'trending') {
        return getPopularity(b) - getPopularity(a);
      }
      return 0; // maintain default descending created_at sort order
    });

  return (
    <div className="feed-container">
      <div className="feed-header">
        <h2>Nearby Spots</h2>
        
        {/* Vibe & Spot Search Input */}
        <div className="feed-search-container">
          <Search size={18} className="search-icon-inside" />
          <input 
            type="text" 
            placeholder="Search by name, category, or vibe..." 
            className="feed-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button 
            type="button" 
            className="ai-search-trigger"
            onClick={() => setShowAiMatcher(true)}
            title="Ask Spota Vibe AI"
          >
            <Sparkles size={18} />
          </button>
        </div>

        {/* Dynamic Filters */}
        <div className="feed-filters">
          <button 
            className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All
          </button>
          <button 
            className={`filter-chip ${activeFilter === 'trending' ? 'active' : ''}`}
            onClick={() => setActiveFilter('trending')}
          >
            🔥 Trending
          </button>
          <button 
            className={`filter-chip ${activeFilter === 'cafes' ? 'active' : ''}`}
            onClick={() => setActiveFilter('cafes')}
          >
            Cafes
          </button>
          <button 
            className={`filter-chip ${activeFilter === 'events' ? 'active' : ''}`}
            onClick={() => setActiveFilter('events')}
          >
            Events
          </button>
        </div>
      </div>
      
      <div className="feed-list">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginTop: '20px' }}>Loading vibes...</p>
        ) : filteredSpots.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginTop: '20px' }}>
            No spots found matching your search.
          </p>
        ) : (
          filteredSpots.slice(0, visibleCount).map((spot) => {
            const popularity = getPopularity(spot);
            const isTrending = popularity >= 5;
            
            // Calculate reference distance for feed display
            let distText = '--';
            if (spots.length > 0) {
              let refCoords = userLocation;
              if (userLocation) {
                // Remote testing fallback: if user is > 100km from the latest spot, reference latest spot coords
                const latestSpot = spots[0];
                const distFromLatest = haversineDistance(userLocation[0], userLocation[1], latestSpot.latitude, latestSpot.longitude);
                if (distFromLatest > 100) {
                  refCoords = [latestSpot.latitude, latestSpot.longitude];
                }
              } else {
                // Fallback to latest spot coords if user location not loaded/granted
                refCoords = [spots[0].latitude, spots[0].longitude];
              }

              if (refCoords) {
                const distVal = haversineDistance(refCoords[0], refCoords[1], spot.latitude, spot.longitude);
                distText = `${distVal.toFixed(1)} km`;
              }
            }

            return (
              <div 
                key={spot.id} 
                className="spot-card clickable animate-fade-in"
                onClick={() => setSelectedSpot(spot)}
              >
                <div className="spot-image-wrapper">
                  {isTrending && (
                    <span className="trending-badge">
                      <Flame size={12} fill="currentColor" />
                      Trending
                    </span>
                  )}
                  {spot.image_url ? (
                    <img src={spot.image_url} alt={spot.title} loading="lazy" />
                  ) : (
                    <div className="spot-image-placeholder"></div>
                  )}
                </div>
                <div className="spot-info">
                  <div className="spot-title-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <h3 style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', margin: 0 }}>
                        {spot.title}
                      </h3>
                      {spot.status === 'pending' && (
                        <span style={{ backgroundColor: 'rgba(224, 122, 95, 0.15)', color: '#E07A5F', fontSize: '10px', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600, flexShrink: 0 }}>
                          Pending
                        </span>
                      )}
                    </div>
                    <span className="spot-distance">{distText}</span>
                  </div>
                  <p className="spot-vibe">
                    {spot.category.toUpperCase()} · {spot.description || "No vibe description"}
                  </p>
                  {spot.tags && Array.isArray(spot.tags) && spot.tags.length > 0 && (
                    <div className="spot-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                      {spot.tags.map((tag, idx) => (
                        <span key={idx} className="tag-pill" style={{ backgroundColor: 'rgba(108,140,116,0.08)', color: 'var(--color-accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {visibleCount < filteredSpots.length && (
          <div className="load-more-container" style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 12px 0' }}>
            <button 
              className="load-more-btn"
              onClick={() => setVisibleCount(prev => prev + 15)}
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              Load More Spots
            </button>
          </div>
        )}
      </div>

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
    </div>
  );
}
