import { useState, useEffect } from 'react';
import { X, Heart, Share, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import './SpotDetailsModal.css';

const REACTION_EMOJIS = {
  '🧘': 'Zen',
  '🔥': 'Lit',
  '❤️': 'Love',
  '🌟': 'Gem'
};

export default function SpotDetailsModal({ spot, onClose }) {
  const { user } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [reactions, setReactions] = useState({ '🧘': 0, '🔥': 0, '❤️': 0, '🌟': 0 });
  const [userReactions, setUserReactions] = useState({});
  const [shareCount, setShareCount] = useState(0);

  const handleDelete = async () => {
    if (!user || user.isGuest) return;
    if (!confirm('Are you sure you want to delete this gem? It will be removed from all feeds and maps.')) return;

    try {
      const { error } = await supabase
        .from('spots')
        .update({ status: 'deleted' })
        .eq('id', spot.id);

      if (error) throw error;

      // Dispatch local event so list updates immediately
      window.dispatchEvent(new CustomEvent('spota_spot_updated', {
        detail: { id: spot.id, status: 'deleted' }
      }));
      window.dispatchEvent(new Event('spota_saves_updated')); // refresh ProfileView

      alert('Gem deleted successfully.');
      onClose();
    } catch (err) {
      console.error('Error deleting spot:', err);
      alert('Failed to delete gem: ' + err.message);
    }
  };

  useEffect(() => {
    if (!spot) return;
    
    // Check saved status
    const saved = JSON.parse(localStorage.getItem('spota_saved_spots') || '[]');
    setIsSaved(saved.includes(spot.id));

    // Reactions status
    const initialReactions = { '🧘': 0, '🔥': 0, '❤️': 0, '🌟': 0, ...(spot.reactions || {}) };
    setReactions(initialReactions);

    // User clicked reactions
    const allUserReacts = JSON.parse(localStorage.getItem('spota_user_reactions') || '{}');
    setUserReactions(allUserReacts[spot.id] || {});

    // Share count
    setShareCount(spot.share_count || 0);
  }, [spot]);

  // Listen to custom update events (like realtime updates)
  useEffect(() => {
    const handleSpotUpdate = (e) => {
      const { id, reactions: updatedReactions, share_count: updatedShareCount } = e.detail;
      if (spot && id === spot.id) {
        if (updatedReactions) setReactions(updatedReactions);
        if (updatedShareCount !== undefined) setShareCount(updatedShareCount);
      }
    };
    window.addEventListener('spota_spot_updated', handleSpotUpdate);
    return () => window.removeEventListener('spota_spot_updated', handleSpotUpdate);
  }, [spot]);

  if (!spot) return null;

  const toggleSave = () => {
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

  const toggleReaction = async (emoji) => {
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

    // Save state in local storage
    const allUserReacts = JSON.parse(localStorage.getItem('spota_user_reactions') || '{}');
    allUserReacts[spot.id] = nextUserReactions;
    localStorage.setItem('spota_user_reactions', JSON.stringify(allUserReacts));

    // Try updating database
    try {
      await supabase
        .from('spots')
        .update({ reactions: nextReactions })
        .eq('id', spot.id);
      
      // Dispatch local update
      window.dispatchEvent(new CustomEvent('spota_spot_updated', { 
        detail: { id: spot.id, reactions: nextReactions } 
      }));
    } catch (err) {
      console.warn('Could not sync reaction with database:', err);
    }
  };

  const handleShare = async () => {
    const nextShareCount = shareCount + 1;
    setShareCount(nextShareCount);

    try {
      await supabase
        .from('spots')
        .update({ share_count: nextShareCount })
        .eq('id', spot.id);
      
      window.dispatchEvent(new CustomEvent('spota_spot_updated', { 
        detail: { id: spot.id, share_count: nextShareCount } 
      }));
    } catch (err) {
      console.warn('Could not sync share count with database:', err);
    }

    if (navigator.share) {
      navigator.share({
        title: spot.title,
        text: `Check out this spot on Spota: ${spot.title}`,
        url: window.location.origin + `/spot/${spot.id}`,
      }).catch(err => console.log('Share failed:', err));
    } else {
      navigator.clipboard.writeText(`${window.location.origin}/spot/${spot.id}`);
      alert('Link copied to clipboard!');
    }
  };

  const handleReport = async () => {
    const nextReportCount = (spot.report_count || 0) + 1;
    let nextStatus = spot.status || 'approved';
    
    if (nextReportCount >= 3) {
      nextStatus = 'flagged';
    }

    try {
      await supabase
        .from('spots')
        .update({ report_count: nextReportCount, status: nextStatus })
        .eq('id', spot.id);
      
      // Notify other views
      window.dispatchEvent(new CustomEvent('spota_spot_updated', { 
        detail: { id: spot.id, report_count: nextReportCount, status: nextStatus } 
      }));

      if (nextStatus === 'flagged') {
        alert('This spot has been reported multiple times and has been hidden for review.');
        onClose();
      } else {
        alert('Thank you for reporting. Our moderators will review this spot.');
      }
    } catch (err) {
      console.warn('Could not sync report count:', err);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel">
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>
        
        <div className="spot-image-large">
          {spot.image_url && (
            <img src={spot.image_url} alt={spot.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        
        <div className="spot-details-body">
          {spot.status === 'pending' && (
            <div style={{ backgroundColor: 'rgba(224, 122, 95, 0.1)', color: '#E07A5F', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', marginBottom: '20px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(224, 122, 95, 0.2)' }}>
              <span>⏳</span>
              <span>This gem is pending moderation review and is only visible to you.</span>
            </div>
          )}
          
          <div className="title-row">
            <h2>{spot.title || "Unknown Spot"}</h2>
            <span className="category-badge">{spot.category || "General"}</span>
          </div>
          
          <p className="vibe-text">"{spot.description || spot.vibe || "No vibe description provided."}"</p>
          
          {/* Emoji Reactions Bar */}
          <div className="reactions-bar">
            {Object.keys(REACTION_EMOJIS).map((emoji) => {
              const count = reactions[emoji] || 0;
              const isActive = userReactions[emoji] || false;
              return (
                <button
                  key={emoji}
                  className={`reaction-emoji-btn ${isActive ? 'active' : ''}`}
                  onClick={() => toggleReaction(emoji)}
                >
                  <span className="reaction-emoji">{emoji}</span>
                  <span className="reaction-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="action-buttons">
            <button className={`action-btn ${isSaved ? 'active' : ''}`} onClick={toggleSave}>
              <Heart size={20} fill={isSaved ? "var(--color-live)" : "none"} color={isSaved ? "var(--color-live)" : "currentColor"} />
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>
            <button className="action-btn" onClick={handleShare}>
              <Share size={20} />
              <span>Share ({shareCount})</span>
            </button>
            {user && spot.user_id === user.id && !user.isGuest ? (
              <button className="action-btn delete-btn" onClick={handleDelete}>
                <Trash2 size={20} />
                <span>Delete</span>
              </button>
            ) : (
              <button className="action-btn report-btn" onClick={handleReport}>
                <AlertTriangle size={20} />
                <span>Report</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
