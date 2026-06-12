import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Calendar, MapPin, Plus, Compass, Trash2, ArrowRight } from 'lucide-react';
import './MyTripsView.css';

export default function MyTripsView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tripsData, setTripsData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals visibility
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState({ name: '', destination: '', startDate: '', endDate: '' });
  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [viewMode, setViewMode] = useState('my-boards');
  const [packages, setPackages] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const categories = ['All', 'Trek', 'Adventure', 'Campsite', 'Sightseeing'];

  // Fetch public marketplace trip packages
  const fetchPackages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select(`
          id,
          name,
          destination,
          start_date,
          end_date,
          package_price,
          package_description,
          agency_id
        `)
        .eq('is_public_package', true);
      
      if (error) throw error;

      // Hydrate agency details (since the nested select might fail without remote relations setup)
      const hydratedData = [];
      for (const t of (data || [])) {
        let agencyProfile = null;
        try {
          const { data: agencyData } = await supabase
            .from('agency_profiles')
            .select('company_name, logo_url')
            .eq('id', t.agency_id)
            .maybeSingle();
          if (agencyData) agencyProfile = agencyData;
        } catch (e) {}

        if (!agencyProfile && t.agency_id) {
          const localKeys = Object.keys(localStorage);
          for (const key of localKeys) {
            if (key.startsWith('spota_agency_')) {
              const val = JSON.parse(localStorage.getItem(key));
              if (val && val.id === t.agency_id) {
                agencyProfile = { company_name: val.company_name, logo_url: val.logo_url };
                break;
              }
            }
          }
        }

        hydratedData.push({
          ...t,
          agency_profiles: agencyProfile
        });
      }
      setPackages(hydratedData);
    } catch (err) {
      console.warn('DB error fetching packages, using local storage cache fallback');
    }

    // Fallback assembly
    setPackages(prev => {
      if (prev.length > 0) return prev;
      const allPackages = [];
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('spota_agency_trips_')) {
          const trips = JSON.parse(localStorage.getItem(key) || '[]');
          trips.forEach(t => {
            if (t.is_public_package) {
              const creatorId = t.creator_id;
              let companyName = 'Verified Tour Operator';
              const agencyProfileStr = localStorage.getItem(`spota_agency_${creatorId}`);
              if (agencyProfileStr) {
                companyName = JSON.parse(agencyProfileStr).company_name;
              }
              allPackages.push({
                ...t,
                package_price: parseFloat(t.package_price) || 199.00,
                agency_profiles: { company_name: companyName }
              });
            }
          });
        }
      });
      return allPackages;
    });
  }, []);

  // Fetch user's trips
  const fetchTrips = useCallback(async () => {
    if (!user || user.isGuest) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let tripsList = [];
    try {
      const { data, error } = await supabase
        .from('trip_members')
        .select(`
          trip_id,
          role,
          trips:trip_id (
            id,
            name,
            destination,
            start_date,
            end_date,
            invite_code,
            creator_id
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      tripsList = data || [];
    } catch (err) {
      console.warn('Error fetching trips from database, using LocalStorage fallback');
    }

    // LocalStorage fallback check
    if (tripsList.length === 0) {
      const localTrips = [];
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('spota_trip_members_')) {
          const membersArray = JSON.parse(localStorage.getItem(key) || '[]');
          const myMember = membersArray.find(m => m.user_id === user.id);
          if (myMember) {
            const tripId = key.replace('spota_trip_members_', '');
            const tripDetailStr = localStorage.getItem(`spota_trip_${tripId}`);
            if (tripDetailStr) {
              const tripDetail = JSON.parse(tripDetailStr);
              localTrips.push({
                trip_id: tripId,
                role: myMember.role || 'member',
                trips: tripDetail
              });
            }
          }
        }
      });
      tripsList = localTrips;
    }

    setTripsData(tripsList);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTrips();
    fetchPackages();
  }, [fetchTrips, fetchPackages]);

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (!user || user.isGuest) return;
    if (!createForm.name.trim()) {
      alert('Please provide a trip name.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Generate unique 8-character invite code
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      // 2. Insert into trips table
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .insert({
          name: createForm.name.trim(),
          destination: createForm.destination.trim() || null,
          start_date: createForm.startDate || null,
          end_date: createForm.endDate || null,
          invite_code: inviteCode,
          creator_id: user.id
        })
        .select()
        .single();

      if (tripError) throw tripError;

      // 3. Add active user as creator in trip_members
      const { error: memberError } = await supabase
        .from('trip_members')
        .insert({
          trip_id: tripData.id,
          user_id: user.id,
          role: 'creator'
        });

      if (memberError) throw memberError;

      // Save details locally for sandbox fallback
      localStorage.setItem(`spota_trip_${tripData.id}`, JSON.stringify(tripData));
      localStorage.setItem(`spota_trip_members_${tripData.id}`, JSON.stringify([
        { user_id: user.id, role: 'creator', profiles: { username: user.username || user.email || 'Creator' } }
      ]));

      alert(`Trip "${createForm.name}" created successfully! Invite Code: ${inviteCode}`);
      setCreateForm({ name: '', destination: '', startDate: '', endDate: '' });
      setShowCreateModal(false);
      fetchTrips();
      navigate(`/trips/${tripData.id}`);
    } catch (err) {
      console.error('Error creating trip:', err);
      alert('Failed to create trip: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinTrip = async (e) => {
    e.preventDefault();
    if (!user || user.isGuest) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      alert('Please enter a join code.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Fetch trip by invite code
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('id, name')
        .eq('invite_code', code)
        .single();

      if (tripError || !tripData) {
        throw new Error('Trip not found. Please verify the invite code.');
      }

      // 2. Insert membership
      const { error: memberError } = await supabase
        .from('trip_members')
        .insert({
          trip_id: tripData.id,
          user_id: user.id,
          role: 'member'
        });

      // Handle duplicate membership code gracefully
      if (memberError && memberError.code !== '23505') {
        throw memberError;
      }

      // Cache details locally for fallback
      localStorage.setItem(`spota_trip_${tripData.id}`, JSON.stringify(tripData));
      const localMembersKey = `spota_trip_members_${tripData.id}`;
      const existingMembers = JSON.parse(localStorage.getItem(localMembersKey) || '[]');
      if (!existingMembers.some(m => m.user_id === user.id)) {
        localStorage.setItem(localMembersKey, JSON.stringify([
          ...existingMembers,
          { user_id: user.id, role: 'member', profiles: { username: user.username || user.email || 'Member' } }
        ]));
      }

      alert(`Successfully joined "${tripData.name}"!`);
      setJoinCode('');
      setShowJoinModal(false);
      fetchTrips();
      navigate(`/trips/${tripData.id}`);
    } catch (err) {
      console.error('Error joining trip:', err);
      alert(err.message || 'Failed to join trip.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTrip = async (e, tripId, role, name) => {
    e.stopPropagation();
    const isCreator = role === 'creator';
    const msg = isCreator 
      ? `Are you sure you want to delete "${name}"? This will delete the trip board for all members.`
      : `Are you sure you want to leave "${name}"?`;

    if (!confirm(msg)) return;

    try {
      if (isCreator) {
        const { error } = await supabase
          .from('trips')
          .delete()
          .eq('id', tripId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trip_members')
          .delete()
          .eq('trip_id', tripId)
          .eq('user_id', user.id);
        if (error) throw error;
      }
      fetchTrips();
    } catch (err) {
      console.error('Error removing trip:', err);
      alert('Failed to remove trip: ' + err.message);
    }
  };

  const formatDateRange = (start, end) => {
    if (!start) return 'Flexible Dates';
    const sDate = new Date(start).toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (!end) return sDate;
    const eDate = new Date(end).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return `${sDate} - ${eDate}`;
  };

  const filteredPackages = packages.filter(pkg => {
    if (selectedCategory === 'All') return true;
    const text = `${pkg.name} ${pkg.package_description || ''} ${pkg.destination || ''}`.toLowerCase();
    return text.includes(selectedCategory.toLowerCase());
  });

  if (user?.isGuest) {
    return (
      <div className="trips-container guest-state animate-fade-in">
        <div className="guest-card glass-panel">
          <Compass size={48} className="guest-icon" />
          <h3>Plan Group Trips</h3>
          <p>Create shared trip maps, drop spots together, and vote on destinations in real-time with friends.</p>
          <button className="submit-auth-btn" onClick={() => navigate('/profile')}>
            Sign Up / Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="trips-container animate-fade-in">
      <div className="trips-header">
        <div>
          <h2>Group Trips</h2>
          <p>Coordinate boards and vote on spots with your friends</p>
        </div>
        <div className="trips-actions">
          <button className="trips-btn secondary" onClick={() => setShowJoinModal(true)}>
            Join Trip
          </button>
          <button className="trips-btn primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            <span>New Trip</span>
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="trips-mode-selector">
        <button 
          className={`tab-btn ${viewMode === 'my-boards' ? 'active' : ''}`}
          onClick={() => setViewMode('my-boards')}
        >
          My Group Boards
        </button>
        <button 
          className={`tab-btn ${viewMode === 'discover' ? 'active' : ''}`}
          onClick={() => {
            setViewMode('discover');
            fetchPackages();
          }}
        >
          Discover Packages
        </button>
      </div>

      {viewMode === 'discover' && (
        <div className="category-scroll-chips">
          {categories.map(cat => (
            <button
              key={cat}
              className={`chip-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="trips-content">
        {loading ? (
          <p className="loading-text">Loading trip boards...</p>
        ) : viewMode === 'my-boards' ? (
          tripsData.length === 0 ? (
            <div className="empty-trips-state glass-panel">
              <Compass size={40} className="empty-icon" />
              <h4>No trip boards yet</h4>
              <p>Create a trip board or join an existing one using an invite code from friends to start pinning spots together!</p>
            </div>
          ) : (
            <div className="trips-grid">
              {tripsData.map(({ role, trips: trip }) => {
                if (!trip) return null;
                return (
                  <div 
                    key={trip.id} 
                    className="trip-card glass-panel animate-fade-in"
                    onClick={() => navigate(`/trips/${trip.id}`)}
                  >
                    <div className="trip-card-header">
                      <h3>{trip.name}</h3>
                      <button 
                        className="trip-delete-btn" 
                        onClick={(e) => handleDeleteTrip(e, trip.id, role, trip.name)}
                        title={role === 'creator' ? 'Delete Trip' : 'Leave Trip'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    {trip.destination && (
                      <div className="trip-info-row">
                        <MapPin size={14} />
                        <span>{trip.destination}</span>
                      </div>
                    )}

                    <div className="trip-info-row">
                      <Calendar size={14} />
                      <span>{formatDateRange(trip.start_date, trip.end_date)}</span>
                    </div>

                    <div className="trip-card-footer">
                      <span className="role-tag">{role === 'creator' ? '👑 Creator' : '👤 Member'}</span>
                      <span className="go-btn">
                        <span>Enter Board</span>
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          filteredPackages.length === 0 ? (
            <div className="empty-trips-state glass-panel">
              <Compass size={40} className="empty-icon" />
              <h4>No Marketplace Packages yet</h4>
              <p>Agencies have not published any travel packages yet. Check back soon for curated tours!</p>
            </div>
          ) : (
            <div className="trips-grid">
              {filteredPackages.map((pkg) => (
                <div 
                  key={pkg.id} 
                  className="trip-card glass-panel animate-fade-in"
                  onClick={() => navigate(`/trips/preview/${pkg.id}`)}
                  style={{ cursor: 'pointer', borderLeft: '4px solid #8e44ad' }}
                >
                  <div className="trip-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{pkg.name}</h3>
                    <span className="package-price-badge" style={{ 
                      backgroundColor: 'rgba(142,68,173,0.12)', 
                      color: '#8e44ad', 
                      fontSize: '13px', 
                      fontWeight: 800, 
                      padding: '4px 10px', 
                      borderRadius: '8px',
                      whiteSpace: 'nowrap'
                    }}>
                      ${pkg.package_price}
                    </span>
                  </div>
                  
                  {pkg.destination && (
                    <div className="trip-info-row" style={{ marginTop: '8px' }}>
                      <MapPin size={14} />
                      <span>{pkg.destination}</span>
                    </div>
                  )}

                  {pkg.package_description && (
                    <p style={{ 
                      fontSize: '12px', 
                      color: 'var(--color-text-secondary)', 
                      margin: '10px 0', 
                      display: '-webkit-box', 
                      WebkitLineClamp: 2, 
                      WebkitBoxOrient: 'vertical', 
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: '1.4'
                    }}>
                      {pkg.package_description}
                    </p>
                  )}

                  <div className="trip-card-footer" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <span className="role-tag" style={{ color: '#8e44ad', fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      👑 {pkg.agency_profiles?.company_name || 'Verified Agency'}
                    </span>
                    <span className="go-btn" style={{ color: '#8e44ad' }}>
                      <span>Preview & Book</span>
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* CREATE TRIP MODAL */}
      {showCreateModal && (
        <div className="trips-modal-backdrop">
          <div className="trips-modal glass-panel animate-fade-in">
            <div className="trips-modal-header">
              <h3>Create Trip Board</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateTrip}>
              <div className="form-group">
                <label>Trip Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Kasol Summer Trek" 
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="zen-input"
                  required
                />
              </div>
              <div className="form-group">
                <label>Destination</label>
                <input 
                  type="text" 
                  placeholder="e.g. Parvati Valley, HP" 
                  value={createForm.destination}
                  onChange={(e) => setCreateForm({ ...createForm, destination: e.target.value })}
                  className="zen-input"
                />
              </div>
              <div className="dates-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input 
                    type="date" 
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="zen-input"
                  />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input 
                    type="date" 
                    value={createForm.endDate}
                    onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                    className="zen-input"
                  />
                </div>
              </div>
              <button type="submit" className="submit-trip-btn" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Board'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* JOIN TRIP MODAL */}
      {showJoinModal && (
        <div className="trips-modal-backdrop">
          <div className="trips-modal glass-panel animate-fade-in">
            <div className="trips-modal-header">
              <h3>Join Trip Board</h3>
              <button className="modal-close" onClick={() => setShowJoinModal(false)}>×</button>
            </div>
            <form onSubmit={handleJoinTrip}>
              <div className="form-group">
                <label>Invite Code</label>
                <input 
                  type="text" 
                  placeholder="e.g. AB12CD34" 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="zen-input uppercase-input"
                  maxLength={10}
                  required
                />
              </div>
              <p className="join-help">Enter the 8-character invite code shared by the trip creator to join the planning board.</p>
              <button type="submit" className="submit-trip-btn" disabled={submitting}>
                {submitting ? 'Joining...' : 'Join Board'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
