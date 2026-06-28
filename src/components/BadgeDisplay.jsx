import { useState, useEffect, useCallback } from 'react';
import { BADGE_DEFS, getBadgesProgress } from '../lib/badgeEngine';
import { Lock, Award, Sparkles, X, Share2 } from 'lucide-react';
import './BadgeDisplay.css';

export default function BadgeDisplay({ user }) {
  const [badgeProgress, setBadgeProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState(null);

  const fetchProgress = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { progress } = await getBadgesProgress(user);
      setBadgeProgress(progress);
    } catch (err) {
      console.error('Failed to load badge progress:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProgress();
    }, 0);
    
    // Add event listener to reload badges if a new spot/rating/trek is dropped/completed
    const reloadBadges = () => {
      fetchProgress();
    };
    window.addEventListener('spota_spot_updated', reloadBadges);
    window.addEventListener('spota_daily_scratch_completed', reloadBadges);
    window.addEventListener('spota_saves_updated', reloadBadges);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('spota_spot_updated', reloadBadges);
      window.removeEventListener('spota_daily_scratch_completed', reloadBadges);
      window.removeEventListener('spota_saves_updated', reloadBadges);
    };
  }, [fetchProgress]);

  const handleShareBadge = async (badge) => {
    const shareData = {
      title: `Spota Achievement — ${badge.name}`,
      text: `I just unlocked the ${badge.name} badge on Spota! ${badge.description}`,
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`I just unlocked the ${badge.name} badge on Spota! ${badge.description}`);
        alert('Badge achievement link copied to clipboard!');
      }
    } catch (e) {
      console.warn('Failed sharing badge:', e);
    }
  };

  if (loading) {
    return <div className="badge-shelf-loading">Loading achievements shelf...</div>;
  }

  if (!badgeProgress) return null;

  return (
    <div className="badge-shelf-wrapper glass-panel">
      <div className="badge-shelf-header">
        <Award size={18} className="badge-shelf-icon" />
        <h3>Pioneer Badges Shelf</h3>
      </div>
      <p className="badge-shelf-subtitle">Complete quests to level up your traveler reputation.</p>

      <div className="badge-grid">
        {Object.keys(BADGE_DEFS).map((id) => {
          const badge = BADGE_DEFS[id];
          const progress = badgeProgress[id] || { current: 0, target: badge.target, earned: false };
          const percent = Math.min(100, Math.floor((progress.current / progress.target) * 100));

          return (
            <div 
              key={badge.id} 
              className={`badge-card ${progress.earned ? 'earned' : 'locked'}`}
              onClick={() => setSelectedBadge({ ...badge, progress, percent })}
            >
              <div className="badge-emoji-wrapper">
                <span className="badge-emoji">{badge.emoji}</span>
                {!progress.earned && <Lock size={12} className="badge-lock-overlay" />}
              </div>
              <span className="badge-name">{badge.name}</span>
              
              {!progress.earned && (
                <div className="badge-progress-bar-container">
                  <div className="badge-progress-bar" style={{ width: `${percent}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedBadge && (
        <div className="badge-detail-backdrop" onClick={() => setSelectedBadge(null)}>
          <div className="badge-detail-modal glass-panel animate-bounce-in" onClick={(e) => e.stopPropagation()}>
            <button className="badge-detail-close" onClick={() => setSelectedBadge(null)}>
              <X size={18} />
            </button>

            <div className="badge-detail-content">
              <div className="large-emoji-orb">
                <span className="large-emoji">{selectedBadge.emoji}</span>
                {selectedBadge.progress.earned && <Sparkles className="sparkle-effect animate-pulse" size={24} />}
              </div>

              <h3>{selectedBadge.name} Badge</h3>
              <p className="badge-detail-desc">{selectedBadge.description}</p>

              {selectedBadge.progress.earned ? (
                <div className="badge-status-unlocked">
                  <span className="unlocked-text">🏆 Unlocked & Earned</span>
                  <button className="badge-share-btn" onClick={() => handleShareBadge(selectedBadge)}>
                    <Share2 size={14} />
                    <span>Share Achievement</span>
                  </button>
                </div>
              ) : (
                <div className="badge-status-locked">
                  <div className="locked-header">
                    <span>Locked Quest Progress</span>
                    <span>{selectedBadge.progress.current} / {selectedBadge.progress.target}</span>
                  </div>
                  <div className="large-progress-track">
                    <div className="large-progress-fill" style={{ width: `${selectedBadge.percent}%` }} />
                  </div>
                  <span className="badge-instructions">
                    Unlock this badge by completing {selectedBadge.progress.target - selectedBadge.progress.current} more actions of this type.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
