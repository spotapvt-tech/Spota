import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { LogOut, Award, CheckCircle, Heart, Gem, Shield, ShieldAlert, Trash2, TrendingUp, ArrowLeft } from 'lucide-react';
import SpotDetailsModal from '../components/SpotDetailsModal';
import { getActiveTrekLocal } from '../lib/safeTrekTimer';
import BadgeDisplay from '../components/BadgeDisplay';
import './ProfileView.css';

export default function ProfileView() {
  const { user: currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const targetUserId = location.state?.userId || currentUser?.id;
  const isOwnProfile = targetUserId === currentUser?.id;

  const [profileUser, setProfileUser] = useState(null);
  const [activeTab, setActiveTab] = useState('my-gems');
  const [myGems, setMyGems] = useState([]);
  const [savedGems, setSavedGems] = useState([]);
  const [activeTrek, setActiveTrek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [agency, setAgency] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Fetch spots and profiles from Supabase
  const fetchData = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      // 1. Fetch Profile Info
      if (isOwnProfile) {
        setProfileUser({
          id: currentUser.id,
          username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'Explorer',
          created_at: currentUser.created_at,
          isGuest: currentUser.isGuest,
          email: currentUser.email,
        });
      } else {
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', targetUserId)
          .single();
        if (!profileErr && profile) {
          setProfileUser({
            id: profile.id,
            username: profile.username || 'Explorer',
            created_at: profile.created_at || new Date().toISOString(),
            isGuest: false,
            avatar_url: profile.avatar_url,
          });
        } else {
          // Check if collaborator details are passed via state fallback
          const stateCollaborator = location.state?.collaborator;
          const collabUsername = stateCollaborator?.profiles?.username || stateCollaborator?.username || 'Explorer';
          const collabAvatar = stateCollaborator?.profiles?.avatar_url || stateCollaborator?.avatar_url || null;
          setProfileUser({
            id: targetUserId,
            username: collabUsername,
            created_at: new Date().toISOString(),
            isGuest: false,
            avatar_url: collabAvatar,
          });
        }
      }

      // Fetch Agency Profile Info
      try {
        const { data: agencyData } = await supabase
          .from('agency_profiles')
          .select('*')
          .eq('profile_id', targetUserId)
          .maybeSingle();
        if (agencyData) {
          setAgency(agencyData);
        } else {
          const localAgency = localStorage.getItem(`spota_agency_${targetUserId}`);
          if (localAgency) {
            setAgency(JSON.parse(localAgency));
          } else {
            setAgency(null);
          }
        }
      } catch (err) {
        // Fallback for local storage check or direct mock if tables don't exist yet
        console.warn('DB error fetching agency profile:', err);
        const localAgency = localStorage.getItem(`spota_agency_${targetUserId}`);
        if (localAgency) {
          setAgency(JSON.parse(localAgency));
        } else {
          setAgency(null);
        }
      }

      // 2. Fetch user's own spots
      let mySpots = [];
      if (isOwnProfile && currentUser?.isGuest) {
        const localCreated = JSON.parse(localStorage.getItem('spota_created_spots') || '[]');
        const localCreatedIds = localCreated.map(s => s.id).filter(Boolean);
        if (localCreatedIds.length > 0) {
          const { data, error } = await supabase
            .from('spots')
            .select('*')
            .in('id', localCreatedIds)
            .neq('status', 'deleted')
            .order('created_at', { ascending: false });
          if (!error && data) mySpots = data;
        }
      } else {
        const { data, error } = await supabase
          .from('spots')
          .select('*')
          .eq('user_id', targetUserId)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false });
        if (!error && data) mySpots = data;
      }
      setMyGems(mySpots);

      // 3. Fetch saved spots (only show saved gems if viewing own profile)
      if (isOwnProfile) {
        const savedIds = JSON.parse(localStorage.getItem('spota_saved_spots') || '[]');
        if (savedIds.length > 0) {
          const { data: allSpots, error: spotsErr } = await supabase
            .from('spots')
            .select('*')
            .neq('status', 'deleted');
          
          if (!spotsErr && allSpots) {
            const filtered = allSpots.filter(spot => savedIds.includes(spot.id));
            setSavedGems(filtered);
          }
        } else {
          setSavedGems([]);
        }
      } else {
        setSavedGems([]);
      }

      // 4. Fetch active safe trek if own profile
      if (isOwnProfile) {
        if (currentUser.isGuest) {
          const localTrek = getActiveTrekLocal();
          setActiveTrek(localTrek);
        } else {
          try {
            const { data: treks, error: trekErr } = await supabase
              .from('safe_treks')
              .select('*')
              .eq('user_id', currentUser.id)
              .in('status', ['active', 'overdue'])
              .order('started_at', { ascending: false })
              .limit(1);
            
            if (!trekErr && treks && treks.length > 0) {
              setActiveTrek(treks[0]);
            } else {
              setActiveTrek(null);
            }
          } catch (err) {
            console.error('Error fetching active trek for profile:', err);
          }
        }
      }
    } catch (err) {
      console.error('Error loading profile data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser, targetUserId, isOwnProfile, location.state]);

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
    setTimeout(() => {
      fetchData();
    }, 0);

    // Listen for custom saves updated event to reload list
    const handleSavesUpdate = () => {
      setTimeout(() => {
        fetchData();
      }, 0);
    };
    window.addEventListener('spota_saves_updated', handleSavesUpdate);

    return () => {
      window.removeEventListener('spota_saves_updated', handleSavesUpdate);
    };
  }, [fetchData]);

  if (!currentUser) return null;

  // Calculate dynamic reputation score
  const myGemsCount = myGems.length;
  const savedGemsCount = savedGems.length;
  const totalReputation = (myGemsCount * 10) + (isOwnProfile ? savedGemsCount * 5 : 0);
  const isVerified = totalReputation >= 50;
  const isAdmin = isOwnProfile && (currentUser.email?.endsWith('@spota.local') || currentUser.email?.includes('admin'));

  // Initials for avatar
  const username = profileUser?.username || 'Explorer';
  const initials = username.substring(0, 2).toUpperCase();

  // Joined date string
  const joinedDate = profileUser?.isGuest
    ? 'Guest Explorer'
    : profileUser?.created_at
      ? new Date(profileUser.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' })
      : 'Explorer';

  return (
    <div className="profile-container animate-fade-in">
      <div className="profile-card glass-panel">
        {isOwnProfile ? (
          <button className="logout-btn-top" onClick={() => setShowLogoutConfirm(true)} title="Sign Out">
            <LogOut size={20} />
          </button>
        ) : (
          <button className="logout-btn-top" style={{ left: '16px', right: 'auto' }} onClick={() => navigate(-1)} title="Back">
            <ArrowLeft size={20} />
          </button>
        )}

        <div className="avatar-large">
          {profileUser?.avatar_url ? (
            <img src={profileUser.avatar_url} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            initials
          )}
        </div>

        <div className="profile-info">
          <div className="username-row">
            <h2>{username}</h2>
            {agency && (
              <span className="verified-badge agency" title={`Verified Agency: ${agency.company_name}`} style={{ color: '#8e44ad' }}>
                <CheckCircle size={18} fill="currentColor" color="var(--color-bg-primary)" />
              </span>
            )}
            {isVerified && !agency && (
              <span className="verified-badge" title="Verified Contributor">
                <CheckCircle size={18} fill="currentColor" color="var(--color-bg-primary)" />
              </span>
            )}
            {profileUser?.isGuest && (
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
              <Award size={18} color={agency ? '#8e44ad' : isVerified ? 'var(--color-accent)' : 'var(--color-text-secondary)'} />
              {agency ? 'Agency Partner' : isVerified ? 'Verified' : 'Explorer'}
            </span>
            <span className="score-label">Contributor Rank</span>
          </div>
        </div>

        {profileUser && <BadgeDisplay user={profileUser} />}

        {isOwnProfile && currentUser && (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '10px', marginTop: '16px' }}>
            {!currentUser.isGuest && (
              <>
                <button 
                  className="submit-auth-btn" 
                  style={{ margin: 0, gap: '8px', height: 'auto', display: 'inline-flex', backgroundColor: 'rgba(142, 68, 173, 0.12)', color: '#8e44ad', border: 'none' }} 
                  onClick={() => navigate('/agency-dashboard')}
                >
                  <Award size={16} />
                  {agency ? 'Agency Portal' : 'List Your Agency'}
                </button>
                <button 
                  className="submit-auth-btn" 
                  style={{ margin: 0, gap: '8px', height: 'auto', display: 'inline-flex', backgroundColor: 'rgba(108, 140, 116, 0.12)', color: 'var(--color-accent)', border: 'none' }} 
                  onClick={() => navigate('/profile/analytics')}
                >
                  <TrendingUp size={16} />
                  Creator Analytics
                </button>
              </>
            )}
            <button 
              className="submit-auth-btn" 
              style={{ margin: 0, gap: '8px', height: 'auto', display: 'inline-flex', backgroundColor: 'rgba(108, 140, 116, 0.12)', color: 'var(--color-accent)', border: 'none' }} 
              onClick={() => navigate('/safe-trek')}
            >
              <Shield size={16} />
              Safe Trek Mode
            </button>
          </div>
        )}

        {isOwnProfile && isAdmin && (
          <button 
            className="submit-auth-btn" 
            style={{ marginTop: '16px', gap: '8px', height: 'auto', display: 'inline-flex' }} 
            onClick={() => navigate('/admin')}
          >
            <Shield size={16} />
            Admin Dashboard
          </button>
        )}

        {isOwnProfile && activeTrek && (
          <div 
            className="active-trek-banner-profile glass-panel animate-pulse" 
            style={{ 
              marginTop: '16px', 
              width: '100%', 
              padding: '12px', 
              borderRadius: 'var(--radius-md)', 
              border: activeTrek.status === 'overdue' ? '1px solid rgba(224, 122, 95, 0.5)' : '1px solid rgba(108, 140, 116, 0.3)', 
              background: activeTrek.status === 'overdue' ? 'rgba(224, 122, 95, 0.15)' : 'rgba(108, 140, 116, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
            onClick={() => navigate('/safe-trek')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} color={activeTrek.status === 'overdue' ? '#e07a5f' : 'var(--color-accent)'} />
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: activeTrek.status === 'overdue' ? '#e07a5f' : 'var(--color-accent)', display: 'block', lineHeight: 1.2 }}>
                  {activeTrek.status === 'overdue' ? 'TREK OVERDUE ALERT' : 'ACTIVE TREK RUNNING'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                  Destination: {activeTrek.destination_name}
                </span>
              </div>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 600, color: activeTrek.status === 'overdue' ? '#e07a5f' : 'var(--color-accent)', background: activeTrek.status === 'overdue' ? 'rgba(224, 122, 95, 0.12)' : 'rgba(108, 140, 116, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>VIEW</span>
          </div>
        )}
      </div>

      {isOwnProfile ? (
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
      ) : (
        <h3 style={{ marginTop: '24px', marginBottom: '16px', color: 'var(--color-text-primary)' }}>
          Gems Dropped ({myGemsCount})
        </h3>
      )}

      <div className="tab-content">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginTop: '20px' }}>Loading list...</p>
        ) : !isOwnProfile || activeTab === 'my-gems' ? (
          <div className="spot-grid">
            {myGems.length === 0 ? (
              <div className="empty-state glass-panel">
                <Gem size={32} strokeWidth={1.5} />
                <p>No gems dropped yet</p>
                {isOwnProfile && <span>Tap "Add" in the navigation bar to drop your first spot!</span>}
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
                      {isOwnProfile && (
                        <button 
                          className="profile-delete-btn" 
                          onClick={(e) => handleDeleteSpot(e, spot.id)}
                          title="Delete Gem"
                          style={{ background: 'none', border: 'none', color: '#c94a4a', cursor: 'pointer', padding: '2px 0 2px 8px', display: 'flex', alignItems: 'center' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
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

      {showLogoutConfirm && (
        <div className="logout-modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="logout-confirm-modal glass-panel animate-fade-in" style={{ padding: '24px', borderRadius: 'var(--radius-md)', maxWidth: '360px', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)' }}>🚪 Log Out?</h3>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to log out of Spota? You will need to log back in to drop and save gems.
            </p>
            <div className="logout-modal-actions" style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button 
                type="button" 
                onClick={() => setShowLogoutConfirm(false)} 
                className="submit-trip-btn" 
                style={{ flex: 1, margin: 0, backgroundColor: 'rgba(44, 53, 49, 0.08)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setShowLogoutConfirm(false);
                  signOut();
                }} 
                className="submit-trip-btn" 
                style={{ flex: 1, margin: 0, backgroundColor: 'var(--color-live)', color: 'white' }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
