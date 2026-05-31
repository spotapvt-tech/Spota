import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { LogOut, Award, CheckCircle, Heart, MapPin, Gem, Shield, Trash2 } from 'lucide-react';
import SpotDetailsModal from '../components/SpotDetailsModal';
import './ProfileView.css';

export default function ProfileView() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('my-gems');
  const [myGems, setMyGems] = useState([]);
  const [savedGems, setSavedGems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState(null);

  // Fetch spots from Supabase
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch user's own spots
      let mySpots = [];
      if (!user.isGuest) {
        const { data, error } = await supabase
          .from('spots')
          .select('*')
          .eq('user_id', user.id)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false });
        if (!error && data) mySpots = data;
      }
      setMyGems(mySpots);

      // 2. Fetch saved spots by matching IDs stored in localStorage
      const savedIds = JSON.parse(localStorage.getItem('spota_saved_spots') || '[]');
      if (savedIds.length > 0) {
        const { data, error } = await supabase
          .from('spots')
          .select('*')
          .neq('status', 'deleted');
        
        if (!error && data) {
          const filtered = data.filter(spot => savedIds.includes(spot.id));
          setSavedGems(filtered);
        }
      } else {
        setSavedGems([]);
      }
    } catch (err) {
      console.error('Error loading profile data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleDeleteSpot = async (e, spotId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this gem? It will be removed from all feeds and maps.')) return;
    
    try {
      const { error } = await supabase
        .from('spots')
        .update({ status: 'deleted' })
        .eq('id', spotId);

      if (error) throw error;

      // Dispatch local event so lists sync
      window.dispatchEvent(new CustomEvent('spota_spot_updated', {
        detail: { id: spotId, status: 'deleted' }
      }));
      window.dispatchEvent(new Event('spota_saves_updated')); // refresh ProfileView lists
      alert('Gem deleted successfully.');
    } catch (err) {
      console.error('Error deleting spot from profile:', err);
      alert('Failed to delete gem: ' + err.message);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen for custom saves updated event to reload list
    const handleSavesUpdate = () => {
      fetchData();
    };
    window.addEventListener('spota_saves_updated', handleSavesUpdate);

    return () => {
      window.removeEventListener('spota_saves_updated', handleSavesUpdate);
    };
  }, [fetchData]);

  if (!user) return null;

  // Calculate dynamic reputation score
  const myGemsCount = myGems.length;
  const savedGemsCount = savedGems.length;
  const totalReputation = (myGemsCount * 10) + (savedGemsCount * 5);
  const isVerified = totalReputation >= 50;
  const isAdmin = user.email?.endsWith('@spota.local') || user.email?.includes('admin');

  // Initials for avatar
  const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Explorer';
  const initials = username.substring(0, 2).toUpperCase();

  // Joined date string
  const joinedDate = user.created_at 
    ? new Date(user.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' })
    : 'Guest Explorer';

  return (
    <div className="profile-container animate-fade-in">
      <div className="profile-card glass-panel">
        <button className="logout-btn-top" onClick={signOut} title="Sign Out">
          <LogOut size={20} />
        </button>

        <div className="avatar-large">
          {initials}
        </div>

        <div className="profile-info">
          <div className="username-row">
            <h2>{username}</h2>
            {isVerified && (
              <span className="verified-badge" title="Verified Contributor">
                <CheckCircle size={18} fill="currentColor" color="var(--color-bg-primary)" />
              </span>
            )}
            {user.isGuest && (
              <span style={{ fontSize: '10px', background: 'rgba(108,140,116,0.15)', color: 'var(--color-accent)', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>GUEST</span>
            )}
          </div>
          <span className="joined-date">Joined {joinedDate}</span>
        </div>

        <div className="reputation-scorecard">
          <div className="score-stat">
            <span className="score-num">{totalReputation}</span>
            <span className="score-label">Reputation Points</span>
          </div>
          <div className="score-stat">
            <span className="score-num" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Award size={18} color={isVerified ? 'var(--color-accent)' : 'var(--color-text-secondary)'} />
              {isVerified ? 'Verified' : 'Explorer'}
            </span>
            <span className="score-label">Contributor Rank</span>
          </div>
        </div>

        {isAdmin && (
          <button 
            className="submit-auth-btn" 
            style={{ marginTop: '16px', gap: '8px', height: 'auto', display: 'inline-flex' }} 
            onClick={() => navigate('/admin')}
          >
            <Shield size={16} />
            Admin Dashboard
          </button>
        )}
      </div>

      <div className="profile-tabs">
        <button 
          className={`tab-btn ${activeTab === 'my-gems' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-gems')}
        >
          My Gems ({myGemsCount})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'saved-gems' ? 'active' : ''}`}
          onClick={() => setActiveTab('saved-gems')}
        >
          Saved Gems ({savedGemsCount})
        </button>
      </div>

      <div className="tab-content">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginTop: '20px' }}>Loading list...</p>
        ) : activeTab === 'my-gems' ? (
          <div className="spot-grid">
            {myGems.length === 0 ? (
              <div className="empty-state glass-panel">
                <Gem size={32} strokeWidth={1.5} />
                <p>No gems dropped yet</p>
                <span>Tap "Add" in the navigation bar to drop your first spot!</span>
              </div>
            ) : (
              myGems.map(spot => (
                <div key={spot.id} className="spot-mini-card glass-panel" onClick={() => setSelectedSpot(spot)}>
                  {spot.image_url ? (
                    <img src={spot.image_url} alt={spot.title} className="spot-mini-image" />
                  ) : (
                    <div className="spot-mini-image" style={{ backgroundColor: 'var(--color-accent)' }}></div>
                  )}
                  <div className="spot-mini-info">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 style={{ margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                        {spot.title}
                      </h4>
                      <button 
                        className="profile-delete-btn" 
                        onClick={(e) => handleDeleteSpot(e, spot.id)}
                        title="Delete Gem"
                        style={{ background: 'none', border: 'none', color: '#c94a4a', cursor: 'pointer', padding: '2px 0 2px 8px', display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <p>{spot.category} · {spot.description || "No vibe description"}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="spot-grid">
            {savedGems.length === 0 ? (
              <div className="empty-state glass-panel">
                <Heart size={32} strokeWidth={1.5} />
                <p>No saved gems yet</p>
                <span>Save cool spots from the Map or Feed to keep them here.</span>
              </div>
            ) : (
              savedGems.map(spot => (
                <div key={spot.id} className="spot-mini-card glass-panel" onClick={() => setSelectedSpot(spot)}>
                  {spot.image_url ? (
                    <img src={spot.image_url} alt={spot.title} className="spot-mini-image" />
                  ) : (
                    <div className="spot-mini-image" style={{ backgroundColor: 'var(--color-accent)' }}></div>
                  )}
                  <div className="spot-mini-info">
                    <h4>{spot.title}</h4>
                    <p>{spot.category} · {spot.description || "No vibe description"}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {selectedSpot && (
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
      )}
    </div>
  );
}
