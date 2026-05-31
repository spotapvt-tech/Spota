import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SpotDetailsModal from '../components/SpotDetailsModal';
import './FeedView.css';

export default function FeedView() {
  const { user } = useAuth();
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedSpot, setSelectedSpot] = useState(null);

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
      // Only show approved spots, or pending spots owned by the current user
      const isOwner = user && spot.user_id === user.id;
      if (spot.status !== 'approved' && !isOwner) return false;

      // 1. Search Query Filter
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const titleMatch = spot.title?.toLowerCase().includes(query);
        const descMatch = spot.description?.toLowerCase().includes(query) || spot.vibe?.toLowerCase().includes(query);
        const catMatch = spot.category?.toLowerCase().includes(query);
        if (!titleMatch && !descMatch && !catMatch) return false;
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
          filteredSpots.map((spot) => {
            const popularity = getPopularity(spot);
            const isTrending = popularity >= 5;
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
                    <img src={spot.image_url} alt={spot.title} />
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
                    <span className="spot-distance">--</span>
                  </div>
                  <p className="spot-vibe">
                    {spot.category.toUpperCase()} · {spot.description || "No vibe description"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedSpot && (
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
      )}
    </div>
  );
}
