import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { LogOut, Award, CheckCircle, Heart, Gem, Shield, ShieldAlert, Trash2, TrendingUp, ArrowLeft, Grid3x3, Bookmark, ChevronRight } from 'lucide-react';
import SpotDetailsModal from '../components/SpotDetailsModal';
import { getActiveTrekLocal } from '../lib/safeTrekTimer';
import BadgeDisplay from '../components/BadgeDisplay';
import ExpeditionProfileCard from '../components/ExpeditionProfileCard';
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

  const [pendingDelete, setPendingDelete] = useState(null); // spot awaiting delete confirmation
  const [notice, setNotice] = useState(null); // { tone: 'ok' | 'error', text }

  const requestDeleteSpot = (e, spot) => {
    e.stopPropagation();
    setPendingDelete(spot);
  };

  const handleDeleteSpot = async (spotId) => {
    setPendingDelete(null);
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
      setNotice({ tone: 'ok', text: 'SPOTA removed from the map.' });
    } catch (err) {
      console.error('Error deleting spot from profile:', err);
      setNotice({ tone: 'error', text: `Couldn't delete: ${err.message || 'network error'}` });
    }
    setTimeout(() => setNotice(null), 3500);
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
  // Same server-set flag AdminView checks (profiles.is_admin), not the old email heuristic
  const isAdmin = isOwnProfile && currentUser?.user_metadata?.is_admin === true;

  // Initials for avatar
  const username = profileUser?.username || 'Explorer';
  const initials = username.substring(0, 2).toUpperCase();

  // Joined date string
  const joinedDate = profileUser?.isGuest
    ? 'Guest Explorer'
    : profileUser?.created_at
      ? new Date(profileUser.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' })
      : 'Explorer';

  const tierLabel = agency ? 'Agency partner' : isVerified ? 'Verified explorer' : 'Explorer';
  const grid = !isOwnProfile || activeTab === 'my-gems' ? myGems : savedGems;

  return (
    <div className="pf animate-fade-in">
      {/* ---------- Identity ---------- */}
      <header className="pf-hero">
        <div className="pf-hero__bar">
          {isOwnProfile ? (
            <span className="sp-eyebrow">Explorer record</span>
          ) : (
            <button className="sp-icon-btn sp-icon-btn--filled" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft size={18} />
            </button>
          )}
          {isOwnProfile && (
            <button className="sp-icon-btn sp-icon-btn--filled" onClick={() => setShowLogoutConfirm(true)} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          )}
        </div>

        <div className="pf-id">
          <div className={`pf-avatar ${isVerified || agency ? 'is-verified' : ''}`}>
            {profileUser?.avatar_url ? <img src={profileUser.avatar_url} alt="" /> : <span>{initials}</span>}
          </div>
          <div className="pf-id__text">
            <h1 className="pf-name">
              {username}
              {(agency || isVerified) && (
                <CheckCircle size={18} className="pf-verified" aria-label={agency ? `Verified agency: ${agency.company_name}` : 'Verified contributor'} />
              )}
            </h1>
            <div className="pf-sub">
              <span className={`pf-rank ${agency ? 'is-agency' : ''}`}><Award size={13} /> {tierLabel}</span>
              {profileUser?.isGuest ? <span className="pf-guest">Guest</span> : <span>Since {joinedDate}</span>}
            </div>
          </div>
        </div>

        <dl className="pf-stats">
          <div><dt>Dropped</dt><dd className="sp-mono">{myGemsCount}</dd></div>
          {isOwnProfile && <div><dt>Saved</dt><dd className="sp-mono">{savedGemsCount}</dd></div>}
          <div><dt>Reputation</dt><dd className="sp-mono">{totalReputation}</dd></div>
        </dl>
        {isOwnProfile && !isVerified && !agency && (
          <p className="pf-next">
            <span className="sp-mono">{Math.max(0, 50 - totalReputation)}</span> reputation to <strong>Verified explorer</strong> — every drop is worth 10.
          </p>
        )}
      </header>

      {/* ---------- Live trek ---------- */}
      {isOwnProfile && activeTrek && (
        <button className={`pf-trek ${activeTrek.status === 'overdue' ? 'is-overdue' : ''}`} onClick={() => navigate('/safe-trek')}>
          <ShieldAlert size={20} />
          <span className="pf-trek__text">
            <strong>{activeTrek.status === 'overdue' ? 'Check-in overdue' : 'Safe Trek running'}</strong>
            <small>{activeTrek.destination_name}</small>
          </span>
          <span className="pf-trek__cta">Open</span>
        </button>
      )}

      {/* ---------- Guest upgrade ---------- */}
      {isOwnProfile && currentUser?.isGuest && (
        <div className="pf-guest-card">
          <strong>Make this record permanent</strong>
          <p>Guest drops live on this device only. Create an account to keep your SPOTAs, earn Adventure Points and appear on the rankings.</p>
          <button className="sp-btn sp-btn--primary sp-btn--sm" onClick={signOut}>Create account</button>
        </div>
      )}

      {/* ---------- Expeditions + badges (existing components) ---------- */}
      {isOwnProfile && currentUser && !currentUser.isGuest && (
        <section className="pf-section"><ExpeditionProfileCard userId={currentUser.id} /></section>
      )}
      {profileUser && <section className="pf-section"><BadgeDisplay user={profileUser} /></section>}

      {/* ---------- Toolkit ---------- */}
      {isOwnProfile && currentUser && (
        <nav className="pf-menu" aria-label="Profile tools">
          <button onClick={() => navigate('/safe-trek')}><Shield size={18} /><span>Safe Trek mode</span><ChevronRight size={16} /></button>
          {!currentUser.isGuest && (
            <>
              <button onClick={() => navigate('/profile/analytics')}><TrendingUp size={18} /><span>Creator analytics</span><ChevronRight size={16} /></button>
              <button onClick={() => navigate('/agency-dashboard')}><Award size={18} /><span>{agency ? 'Agency portal' : 'List your agency'}</span><ChevronRight size={16} /></button>
            </>
          )}
          {isAdmin && (
            <button onClick={() => navigate('/admin')}><Shield size={18} /><span>Admin dashboard</span><ChevronRight size={16} /></button>
          )}
        </nav>
      )}

      {/* ---------- Collection ---------- */}
      <div className="pf-tabs" role="tablist">
        <button role="tab" aria-selected={!isOwnProfile || activeTab === 'my-gems'} className={!isOwnProfile || activeTab === 'my-gems' ? 'is-on' : ''} onClick={() => setActiveTab('my-gems')}>
          <Grid3x3 size={16} /> {isOwnProfile ? 'Dropped' : 'SPOTAs dropped'} <span className="sp-mono">{myGemsCount}</span>
        </button>
        {isOwnProfile && (
          <button role="tab" aria-selected={activeTab === 'saved-gems'} className={activeTab === 'saved-gems' ? 'is-on' : ''} onClick={() => setActiveTab('saved-gems')}>
            <Bookmark size={16} /> Saved <span className="sp-mono">{savedGemsCount}</span>
          </button>
        )}
      </div>

      <div className="pf-grid-wrap">
        {loading ? (
          <div className="pf-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="sp-skeleton pf-tile" />)}</div>
        ) : grid.length === 0 ? (
          <div className="sp-state">
            <div className="sp-state__icon">{!isOwnProfile || activeTab === 'my-gems' ? <Gem size={22} /> : <Heart size={22} />}</div>
            {!isOwnProfile || activeTab === 'my-gems' ? (
              <>
                <h3>{isOwnProfile ? 'Your map is blank — for now' : 'No SPOTAs yet'}</h3>
                {isOwnProfile && <p>Found a place worth the walk? Drop it so other explorers can find it too.</p>}
                {isOwnProfile && <button className="sp-btn sp-btn--primary sp-btn--sm" onClick={() => navigate('/add')}>Drop your first SPOTA</button>}
              </>
            ) : (
              <>
                <h3>Nothing saved yet</h3>
                <p>Tap Save on any SPOTA to keep it here for your next trip.</p>
                <button className="sp-btn sp-btn--secondary sp-btn--sm" onClick={() => navigate('/explore')}>Browse the map</button>
              </>
            )}
          </div>
        ) : (
          <div className="pf-grid">
            {grid.map((spot) => (
              <div
                key={spot.id}
                className="pf-tile"
                role="button"
                tabIndex={0}
                aria-label={`View ${spot.title}`}
                onClick={() => setSelectedSpot(spot)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSpot(spot); } }}
              >
                {spot.image_url
                  ? <img src={spot.image_url} alt="" loading="lazy" />
                  : <span className="pf-tile__empty"><Gem size={22} strokeWidth={1.5} /></span>}
                <span className="pf-tile__title">{spot.title}</span>
                {spot.status === 'pending' && <span className="pf-tile__status">In review</span>}
                {isOwnProfile && activeTab === 'my-gems' && (
                  <button className="pf-tile__delete" onClick={(e) => requestDeleteSpot(e, spot)} aria-label={`Delete ${spot.title}`}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {notice && <div className={`pf-notice ${notice.tone === 'error' ? 'is-error' : ''}`} role="status">{notice.text}</div>}

      {selectedSpot && (
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
      )}

      {pendingDelete && (
        <div className="sp-sheet-backdrop" onClick={() => setPendingDelete(null)}>
          <div className="sp-sheet" role="alertdialog" aria-label="Delete SPOTA" onClick={(e) => e.stopPropagation()}>
            <div className="sp-sheet__grabber" />
            <h3 className="pf-sheet-title">Delete “{pendingDelete.title}”?</h3>
            <p className="pf-sheet-text">It will be removed from the map and every feed. This can&apos;t be undone.</p>
            <div className="pf-sheet-actions">
              <button className="sp-btn sp-btn--secondary" onClick={() => setPendingDelete(null)}>Keep it</button>
              <button className="sp-btn sp-btn--danger" onClick={() => handleDeleteSpot(pendingDelete.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="sp-sheet-backdrop" onClick={() => setShowLogoutConfirm(false)}>
          <div className="sp-sheet" role="alertdialog" aria-label="Sign out" onClick={(e) => e.stopPropagation()}>
            <div className="sp-sheet__grabber" />
            <h3 className="pf-sheet-title">Sign out of Spota?</h3>
            <p className="pf-sheet-text">
              {currentUser?.isGuest
                ? 'Guest drops stay on this device, but you will need an account to keep exploring.'
                : 'You will need to sign back in to drop and save SPOTAs.'}
            </p>
            <div className="pf-sheet-actions">
              <button className="sp-btn sp-btn--secondary" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
              <button className="sp-btn sp-btn--danger" onClick={() => { setShowLogoutConfirm(false); signOut(); }}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
