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

  // Fetch user's trips
  const fetchTrips = useCallback(async () => {
    if (!user || user.isGuest) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
      setTripsData(data || []);
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

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

      <div className="trips-content">
        {loading ? (
          <p className="loading-text">Loading trip boards...</p>
        ) : tripsData.length === 0 ? (
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
