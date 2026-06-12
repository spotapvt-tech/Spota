import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, UserPlus, Plus, ThumbsUp, CheckSquare, Square, Info, Calendar, Sparkles } from 'lucide-react';
import TripInviteModal from '../components/TripInviteModal';
import SpotDetailsModal from '../components/SpotDetailsModal';
import TripRecapModal from '../components/TripRecapModal';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './TripBoardView.css';

// Fix for default Leaflet markers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function MapCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);
  return null;
}

export default function TripBoardView() {
  const { tripId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [members, setMembers] = useState([]);
  const [tripSpots, setTripSpots] = useState([]);
  const [votes, setVotes] = useState([]); // Array of { spot_id, user_id }
  const [allAvailableSpots, setAllAvailableSpots] = useState([]); // Spots not in trip yet
  
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddSpotDrawer, setShowAddSpotDrawer] = useState(false);
  const [showRecapModal, setShowRecapModal] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null); // For details modal
  const [mapCenter, setMapCenter] = useState([40.7128, -74.0060]); // Default

  // Fetch all collaborative trip board details
  const fetchTripData = useCallback(async () => {
    try {
      // 1. Fetch trip details
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single();

      if (tripError) throw tripError;
      setTrip(tripData);

      // 2. Fetch trip members
      const { data: membersData, error: membersError } = await supabase
        .from('trip_members')
        .select(`
          user_id,
          role,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq('trip_id', tripId);

      if (membersError) throw membersError;
      setMembers(membersData || []);

      // Verify active user is a member
      const isMember = membersData.some(m => m.user_id === user.id);
      if (!isMember) {
        alert('You are not a member of this trip board.');
        navigate('/trips');
        return;
      }

      // 3. Fetch trip spots
      const { data: tripSpotsData, error: tripSpotsError } = await supabase
        .from('trip_spots')
        .select(`
          trip_id,
          spot_id,
          added_by,
          visited,
          added_at,
          spots:spot_id (
            id,
            title,
            description,
            latitude,
            longitude,
            image_url,
            category
          )
        `)
        .eq('trip_id', tripId);

      if (tripSpotsError) throw tripSpotsError;
      
      const validTripSpots = (tripSpotsData || []).filter(item => item.spots !== null);
      setTripSpots(validTripSpots);

      if (validTripSpots.length > 0) {
        // Center on the last added spot
        const lastSpot = validTripSpots[validTripSpots.length - 1].spots;
        setMapCenter([lastSpot.latitude, lastSpot.longitude]);
      } else if (tripData.destination) {
        // Fallback geocoding mock or leave default center
      }

      // 4. Fetch spot votes
      const { data: votesData, error: votesError } = await supabase
        .from('trip_spot_votes')
        .select('spot_id, user_id')
        .eq('trip_id', tripId);

      if (votesError) throw votesError;
      setVotes(votesData || []);

      // 5. Fetch all database spots to allow adding to trip
      const { data: allSpots, error: allSpotsError } = await supabase
        .from('spots')
        .select('id, title, category, description, latitude, longitude, image_url')
        .eq('status', 'approved');

      if (allSpotsError) throw allSpotsError;

      // Filter out spots already in the trip
      const existingSpotIds = validTripSpots.map(ts => ts.spot_id);
      const available = (allSpots || []).filter(s => !existingSpotIds.includes(s.id));
      setAllAvailableSpots(available);

    } catch (err) {
      console.error('Error loading trip board:', err);
      alert('Failed to load trip board.');
      navigate('/trips');
    } finally {
      setLoading(false);
    }
  }, [tripId, user.id, navigate]);

  useEffect(() => {
    fetchTripData();

    // Set up Realtime Sync
    const channel = supabase.channel(`realtime-trip-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_spots', filter: `trip_id=eq.${tripId}` }, () => {
        fetchTripData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_spot_votes', filter: `trip_id=eq.${tripId}` }, () => {
        fetchTripData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${tripId}` }, () => {
        fetchTripData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, fetchTripData]);

  // Vote Actions
  const handleToggleVote = async (spotId) => {
    const hasVoted = votes.some(v => v.spot_id === spotId && v.user_id === user.id);
    
    // Optimistic UI updates
    if (hasVoted) {
      setVotes(prev => prev.filter(v => !(v.spot_id === spotId && v.user_id === user.id)));
      try {
        await supabase
          .from('trip_spot_votes')
          .delete()
          .eq('trip_id', tripId)
          .eq('spot_id', spotId)
          .eq('user_id', user.id);
      } catch (err) {
        console.error('Failed to delete vote:', err);
        fetchTripData();
      }
    } else {
      setVotes(prev => [...prev, { spot_id: spotId, user_id: user.id }]);
      try {
        await supabase
          .from('trip_spot_votes')
          .insert({
            trip_id: tripId,
            spot_id: spotId,
            user_id: user.id
          });
      } catch (err) {
        console.error('Failed to cast vote:', err);
        fetchTripData();
      }
    }
  };

  // Visited Toggle
  const handleToggleVisited = async (spotId, currentVisited) => {
    // Optimistic UI update
    setTripSpots(prev => 
      prev.map(ts => ts.spot_id === spotId ? { ...ts, visited: !currentVisited } : ts)
    );

    try {
      const { error } = await supabase
        .from('trip_spots')
        .update({ visited: !currentVisited })
        .eq('trip_id', tripId)
        .eq('spot_id', spotId);

      if (error) throw error;
    } catch (err) {
      console.error('Failed to toggle visited status:', err);
      fetchTripData();
    }
  };

  // Add Spot to Trip Board
  const handleAddSpotToTrip = async (spotId) => {
    try {
      const { error } = await supabase
        .from('trip_spots')
        .insert({
          trip_id: tripId,
          spot_id: spotId,
          added_by: user.id
        });

      if (error) throw error;
      setShowAddSpotDrawer(false);
      fetchTripData();
    } catch (err) {
      console.error('Failed to add spot to trip:', err);
      alert('Failed to add spot to trip.');
    }
  };

  // Remove Spot from Trip Board
  const handleRemoveSpotFromTrip = async (spotId) => {
    if (!confirm('Are you sure you want to remove this spot from the trip board?')) return;
    try {
      const { error } = await supabase
        .from('trip_spots')
        .delete()
        .eq('trip_id', tripId)
        .eq('spot_id', spotId);

      if (error) throw error;
      fetchTripData();
    } catch (err) {
      console.error('Failed to remove spot:', err);
      alert('Failed to remove spot.');
    }
  };

  const getSpotVotesCount = (spotId) => {
    return votes.filter(v => v.spot_id === spotId).length;
  };

  const userHasVoted = (spotId) => {
    return votes.some(v => v.spot_id === spotId && v.user_id === user.id);
  };

  if (loading) {
    return (
      <div className="trip-board-container loading-state">
        <p>Loading collaborative board...</p>
      </div>
    );
  }

  if (!trip) return null;

  return (
    <div className="trip-board-container animate-fade-in">
      {/* Top Banner Toolbar */}
      <div className="trip-board-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/trips')}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-info">
          <h2>{trip.name}</h2>
          <span className="destination-tag">{trip.destination || 'Flexible Route'}</span>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
          <button className="invite-action-btn" onClick={() => setShowRecapModal(true)} style={{ backgroundColor: 'rgba(221, 161, 94, 0.12)', color: '#DDA15E' }}>
            <Sparkles size={18} />
            <span>Recap</span>
          </button>
          <button className="invite-action-btn" onClick={() => setShowInviteModal(true)}>
            <UserPlus size={18} />
            <span>Invite</span>
          </button>
        </div>
      </div>

      {/* Split Screens Layout */}
      <div className="trip-board-body">
        {/* Map panel */}
        <div className="trip-board-map">
          <MapContainer 
            center={mapCenter} 
            zoom={13} 
            scrollWheelZoom={true} 
            zoomControl={false}
            className="trip-map"
          >
            <MapCenter position={mapCenter} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />

            {tripSpots.map((ts) => {
              const spot = ts.spots;
              const votesCount = getSpotVotesCount(spot.id);
              const customPin = L.divIcon({
                className: 'custom-trip-marker',
                html: `<div class="trip-gem-pin ${ts.visited ? 'visited' : ''}">
                  <span class="pin-votes">${votesCount > 0 ? `👍 ${votesCount}` : '💎'}</span>
                </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 36]
              });

              return (
                <Marker key={spot.id} position={[spot.latitude, spot.longitude]} icon={customPin}>
                  <Popup>
                    <div className="custom-popup">
                      {spot.image_url && <img src={spot.image_url} alt={spot.title} className="popup-image-mini" />}
                      <h3>{spot.title}</h3>
                      <p>{spot.description || spot.category}</p>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button className="popup-details-btn" onClick={() => setSelectedSpot(spot)} style={{ margin: 0, flex: 1 }}>
                          Details
                        </button>
                        <button 
                          onClick={() => handleToggleVote(spot.id)}
                          style={{
                            background: userHasVoted(spot.id) ? 'var(--color-accent)' : 'rgba(108,140,116,0.1)',
                            color: userHasVoted(spot.id) ? '#fff' : 'var(--color-accent)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            padding: '6px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          <ThumbsUp size={12} />
                          <span>{votesCount}</span>
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* Spot planning list drawer */}
        <div className="trip-board-sidebar glass-panel">
          <div className="sidebar-header">
            <h3>Pinned Locations ({tripSpots.length})</h3>
            <button className="add-spot-trigger" onClick={() => setShowAddSpotDrawer(true)}>
              <Plus size={16} />
              <span>Add Spot</span>
            </button>
          </div>

          <div className="sidebar-members">
            <span className="members-title">Collaborators:</span>
            <div className="members-avatars">
              {members.map((m, idx) => {
                const username = m.profiles?.username || 'Explorer';
                const avatarInitials = username.substring(0, 2).toUpperCase();
                return (
                  <div 
                    key={idx} 
                    className="member-avatar-circle" 
                    title={`${username} (${m.role})`}
                    style={{ zIndex: 10 - idx }}
                  >
                    {m.profiles?.avatar_url ? (
                      <img src={m.profiles.avatar_url} alt={username} />
                    ) : (
                      avatarInitials
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="trip-spots-list">
            {tripSpots.length === 0 ? (
              <div className="empty-spots">
                <Info size={24} />
                <p>No locations added yet.</p>
                <span>Click "Add Spot" above to pin items from the map database onto your group board!</span>
              </div>
            ) : (
              tripSpots
                .sort((a, b) => getSpotVotesCount(b.spot_id) - getSpotVotesCount(a.spot_id)) // Sort by upvotes count
                .map((ts) => {
                  const spot = ts.spots;
                  const votesCount = getSpotVotesCount(spot.id);
                  const isVoted = userHasVoted(spot.id);

                  return (
                    <div key={spot.id} className={`trip-spot-item ${ts.visited ? 'visited' : ''}`}>
                      <div className="item-main" onClick={() => setMapCenter([spot.latitude, spot.longitude])}>
                        {spot.image_url ? (
                          <img src={spot.image_url} alt={spot.title} className="item-thumbnail" />
                        ) : (
                          <div className="item-thumbnail placeholder">💎</div>
                        )}
                        <div className="item-info">
                          <h4>{spot.title}</h4>
                          <span className="item-cat">{spot.category}</span>
                        </div>
                      </div>

                      <div className="item-actions">
                        <button 
                          className={`vote-btn ${isVoted ? 'active' : ''}`}
                          onClick={() => handleToggleVote(spot.id)}
                          title="Upvote Destination"
                        >
                          <ThumbsUp size={16} />
                          <span>{votesCount}</span>
                        </button>

                        <button 
                          className="visited-toggle-btn"
                          onClick={() => handleToggleVisited(spot.id, ts.visited)}
                          title={ts.visited ? 'Mark Unvisited' : 'Mark Visited'}
                        >
                          {ts.visited ? <CheckSquare size={18} color="var(--color-accent)" /> : <Square size={18} />}
                        </button>

                        <button 
                          className="remove-btn"
                          onClick={() => handleRemoveSpotFromTrip(spot.id)}
                          title="Remove Spot"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* ADD SPOT DRAWER MODAL OVERLAY */}
      {showAddSpotDrawer && (
        <div className="add-spot-drawer-backdrop" onClick={() => setShowAddSpotDrawer(false)}>
          <div className="add-spot-drawer glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Add Spot to Trip</h3>
              <button className="drawer-close" onClick={() => setShowAddSpotDrawer(false)}>×</button>
            </div>
            <div className="available-spots-list">
              {allAvailableSpots.length === 0 ? (
                <p className="no-spots-msg">All approved map spots are already added to this trip board!</p>
              ) : (
                allAvailableSpots.map((spot) => (
                  <div key={spot.id} className="available-spot-card">
                    {spot.image_url ? (
                      <img src={spot.image_url} alt={spot.title} className="avail-thumb" />
                    ) : (
                      <div className="avail-thumb placeholder">💎</div>
                    )}
                    <div className="avail-info">
                      <h4>{spot.title}</h4>
                      <p>{spot.category} · {spot.description || 'No desc'}</p>
                    </div>
                    <button className="add-to-trip-btn" onClick={() => handleAddSpotToTrip(spot.id)}>
                      + Pin
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <TripInviteModal 
          inviteCode={trip.invite_code} 
          tripName={trip.name} 
          onClose={() => setShowInviteModal(false)} 
        />
      )}

      {showRecapModal && (
        <TripRecapModal 
          trip={trip} 
          tripSpots={tripSpots} 
          members={members} 
          votes={votes} 
          onClose={() => setShowRecapModal(false)} 
        />
      )}

      {selectedSpot && (
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
      )}
    </div>
  );
}
