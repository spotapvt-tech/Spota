import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { getCategoryById } from '../lib/categoryConfig';
import { Heart, Share, Bookmark, Info, MessageSquare, Flame } from 'lucide-react';
import SpotDetailsModal from './SpotDetailsModal';
import './SpotVibeCard.css';

const REACTION_EMOJIS = ['🧘', '🔥', '❤️', '🌟'];

export default function SpotVibeCard({ spot, isActive }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const lastTap = useRef(0);

  const catInfo = getCategoryById(spot.category);

  // States
  const [reactions, setReactions] = useState({ '🧘': 0, '🔥': 0, '❤️': 0, '🌟': 0, ...(spot.reactions || {}) });
  const [userReactions, setUserReactions] = useState({});
  const [isSaved, setIsSaved] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState(null);
  
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [heartCoords, setHeartCoords] = useState({ x: 0, y: 0 });
  const [showReactionTray, setShowReactionTray] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Play/Pause Video on Active change
  useEffect(() => {
    if (videoRef.current) {
      if (isActive) {
        videoRef.current.muted = true;
        videoRef.current.play().catch(err => console.log('Video play blocked:', err));
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isActive]);

  // Fetch creator profile & states
  useEffect(() => {
    async function initCard() {
      // Saved state
      const saved = JSON.parse(localStorage.getItem('spota_saved_spots') || '[]');
      setIsSaved(saved.includes(spot.id));

      // User reactions
      const allUserReacts = JSON.parse(localStorage.getItem('spota_user_reactions') || '{}');
      setUserReactions(allUserReacts[spot.id] || {});

      // Creator details
      if (spot.user_id) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', spot.user_id)
            .single();
          if (!error && data) {
            setCreatorProfile(data);
          } else {
            setCreatorProfile({ username: 'Explorer', avatar_url: null });
          }
        } catch (err) {
          setCreatorProfile({ username: 'Explorer', avatar_url: null });
        }
      } else {
        setCreatorProfile({ username: 'Anonymous', avatar_url: null });
      }
    }

    initCard();
  }, [spot]);

  // Double Tap gesture
  const handleDoubleTap = (e) => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (now - lastTap.current < DOUBLE_PRESS_DELAY) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setHeartCoords({ x, y });
      setShowHeartAnimation(true);

      // Add '❤️' Love reaction
      triggerEmojiReaction('❤️');

      setTimeout(() => setShowHeartAnimation(false), 800);
    }
    lastTap.current = now;
  };

  // Toggle Reactions
  const triggerEmojiReaction = async (emoji) => {
    const nextReactions = { ...reactions };
    const nextUserReactions = { ...userReactions };
    const wasActive = nextUserReactions[emoji];

    if (wasActive) {
      nextReactions[emoji] = Math.max(0, (nextReactions[emoji] || 1) - 1);
      nextUserReactions[emoji] = false;
    } else {
      nextReactions[emoji] = (nextReactions[emoji] || 0) + 1;
      nextUserReactions[emoji] = true;
    }

    setReactions(nextReactions);
    setUserReactions(nextUserReactions);

    const allUserReacts = JSON.parse(localStorage.getItem('spota_user_reactions') || '{}');
    allUserReacts[spot.id] = nextUserReactions;
    localStorage.setItem('spota_user_reactions', JSON.stringify(allUserReacts));

    try {
      await supabase
        .from('spots')
        .update({ reactions: nextReactions })
        .eq('id', spot.id);

      window.dispatchEvent(new CustomEvent('spota_spot_updated', {
        detail: { id: spot.id, reactions: nextReactions }
      }));
    } catch (err) {
      console.warn('Failed to sync reactions:', err);
    }
  };

  // Toggle bookmark saves
  const handleToggleSave = () => {
    const saved = JSON.parse(localStorage.getItem('spota_saved_spots') || '[]');
    let updated;
    if (saved.includes(spot.id)) {
      updated = saved.filter(id => id !== spot.id);
      setIsSaved(false);
    } else {
      updated = [...saved, spot.id];
      setIsSaved(true);
    }
    localStorage.setItem('spota_saved_spots', JSON.stringify(updated));
    window.dispatchEvent(new Event('spota_saves_updated'));
  };

  const handleShare = async () => {
    const nextCount = (spot.share_count || 0) + 1;
    try {
      await supabase.from('spots').update({ share_count: nextCount }).eq('id', spot.id);
      window.dispatchEvent(new CustomEvent('spota_spot_updated', {
        detail: { id: spot.id, share_count: nextCount }
      }));
    } catch (e) {}

    if (navigator.share) {
      navigator.share({
        title: spot.title,
        text: `Check out this spot: ${spot.title}`,
        url: `${window.location.origin}/spot/${spot.id}`
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${window.location.origin}/spot/${spot.id}`);
      alert('Link copied to clipboard!');
    }
  };

  const startCreatorChat = () => {
    if (!user || user.isGuest) {
      alert('Log in to chat with other explorers.');
      return;
    }
    if (spot.user_id === user.id) return;
    navigate('/chat', { 
      state: { 
        startChatWith: { 
          id: spot.user_id, 
          username: creatorProfile?.username || 'Explorer', 
          avatar_url: creatorProfile?.avatar_url 
        } 
      } 
    });
  };

  const viewCreatorProfile = (e) => {
    e.stopPropagation();
    if (!spot.user_id) return;
    navigate('/profile', { state: { userId: spot.user_id, collaborator: creatorProfile } });
  };

  // Calculate total reactions for counters
  const totalReactionsCount = Object.values(reactions).reduce((a, b) => a + b, 0);

  return (
    <div className="spot-vibe-card-container" onClick={handleDoubleTap}>
      {/* Media Element: play video if available, else show image */}
      {spot.video_url ? (
        <video
          ref={videoRef}
          src={spot.video_url}
          loop
          muted
          playsInline
          autoPlay
          className="vibe-card-video"
        />
      ) : spot.image_url ? (
        <img 
          src={spot.image_url} 
          alt={spot.title} 
          className="vibe-card-image" 
        />
      ) : (
        <div className="vibe-card-fallback-gradient">
          <span>💎</span>
        </div>
      )}

      {/* Floating Center Heart Animation */}
      {showHeartAnimation && (
        <div 
          className="double-tap-heart"
          style={{ top: `${heartCoords.y}px`, left: `${heartCoords.x}px` }}
        >
          ❤️
        </div>
      )}

      {/* Floating Gradient Shaders */}
      <div className="card-top-shade"></div>
      <div className="card-bottom-shade"></div>

      {/* Left Bottom Metadata Info overlay */}
      <div className="card-info-overlay">
        <div className="info-badge-row">
          <span 
            className="vibe-category-badge"
            style={{ backgroundColor: catInfo.color }}
          >
            <span>{catInfo.emoji}</span>
            <span>{catInfo.label}</span>
          </span>
        </div>
        {creatorProfile && (
          <div className="vibe-creator-username" onClick={viewCreatorProfile}>
            @{creatorProfile.username || 'Anonymous'}
          </div>
        )}
        <h2 className="vibe-spot-title">{spot.title}</h2>
        <p className="vibe-spot-desc">{spot.description || 'No vibe description provided.'}</p>
      </div>

      {/* Right Sidebar Floating Actions Drawer */}
      <div className="card-actions-sidebar">
        {/* Creator avatar */}
        {spot.user_id && spot.user_id !== user?.id && (
          <div className="sidebar-action-item creator" onClick={startCreatorChat} title="Message Explorer">
            <div className="sidebar-avatar-wrapper">
              {creatorProfile?.avatar_url ? (
                <img src={creatorProfile.avatar_url} alt="Creator" />
              ) : (
                <span>{(creatorProfile?.username || 'E').substring(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="creator-add-badge">+</div>
          </div>
        )}

        {/* Reaction tray trigger */}
        <div className="sidebar-action-item" onClick={() => setShowReactionTray(!showReactionTray)}>
          <button className={`sidebar-icon-btn ${totalReactionsCount > 0 ? 'active' : ''}`}>
            <Flame size={24} />
          </button>
          <span className="action-count">{totalReactionsCount}</span>

          {showReactionTray && (
            <div className="floating-reaction-tray glass-panel" onClick={e => e.stopPropagation()}>
              {REACTION_EMOJIS.map((emoji) => {
                const isActive = userReactions[emoji] || false;
                return (
                  <button 
                    key={emoji} 
                    className={`tray-emoji-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      triggerEmojiReaction(emoji);
                      setShowReactionTray(false);
                    }}
                  >
                    <span className="emoji">{emoji}</span>
                    <span className="count">{reactions[emoji] || 0}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Save / Bookmark */}
        <div className="sidebar-action-item" onClick={handleToggleSave}>
          <button className={`sidebar-icon-btn ${isSaved ? 'active' : ''}`}>
            <Bookmark size={24} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
          <span className="action-count">Save</span>
        </div>

        {/* Share card */}
        <div className="sidebar-action-item" onClick={handleShare}>
          <button className="sidebar-icon-btn">
            <Share size={24} />
          </button>
          <span className="action-count">{spot.share_count || 0}</span>
        </div>

        {/* Info detail modal */}
        <div className="sidebar-action-item" onClick={() => setShowDetails(true)}>
          <button className="sidebar-icon-btn">
            <Info size={24} />
          </button>
          <span className="action-count">Info</span>
        </div>
      </div>

      {showDetails && (
        <SpotDetailsModal spot={spot} onClose={() => setShowDetails(false)} />
      )}
    </div>
  );
}
