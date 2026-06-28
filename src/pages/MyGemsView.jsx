import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { ArrowLeft, Eye, Heart, Share, Award, TrendingUp, Sparkles, AlertCircle } from 'lucide-react';
import './MyGemsView.css';

export default function MyGemsView() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [spots, setSpots] = useState([]);
  const [viewsMap, setViewsMap] = useState({}); // { [spotId]: count }
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    if (!user || user.isGuest) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch user's spots
      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'deleted');

      if (spotsError) throw spotsError;
      setSpots(spotsData || []);

      if (spotsData && spotsData.length > 0) {
        const spotIds = spotsData.map(s => s.id);
        
        // 2. Fetch view counts for all these spots from spot_views
        const { data: viewsData, error: viewsError } = await supabase
          .from('spot_views')
          .select('spot_id')
          .in('spot_id', spotIds);

        if (viewsError) throw viewsError;

        // Group views by spot_id
        const counts = {};
        viewsData.forEach(v => {
          counts[v.spot_id] = (counts[v.spot_id] || 0) + 1;
        });
        setViewsMap(counts);
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setTimeout(() => {
      fetchAnalytics();
    }, 0);
  }, [fetchAnalytics]);

  // Aggregate stats calculations
  const totalSpots = spots.length;
  const totalShares = spots.reduce((sum, spot) => sum + (spot.share_count || 0), 0);
  
  const totalReactions = spots.reduce((sum, spot) => {
    const reacts = spot.reactions 
      ? Object.values(spot.reactions).reduce((a, b) => a + b, 0)
      : 0;
    return sum + reacts;
  }, 0);

  const totalViews = Object.values(viewsMap).reduce((a, b) => a + b, 0);
  
  // Saves estimate baseline
  const totalSaves = spots.reduce((sum, spot) => {
    const reacts = spot.reactions ? Object.values(spot.reactions).reduce((a, b) => a + b, 0) : 0;
    const computedSaves = Math.max(0, (reacts * 3) + ((spot.share_count || 0) * 2));
    return sum + computedSaves;
  }, 0);

  const creatorImpactScore = (totalViews * 1) + (totalSaves * 5) + (totalShares * 10) + (totalReactions * 3);

  // Helper to compute individual spot score
  const getSpotScore = (spot) => {
    const views = viewsMap[spot.id] || 0;
    const reacts = spot.reactions ? Object.values(spot.reactions).reduce((a, b) => a + b, 0) : 0;
    const saves = Math.max(0, (reacts * 3) + ((spot.share_count || 0) * 2));
    return (views * 1) + (saves * 5) + ((spot.share_count || 0) * 10) + (reacts * 3);
  };

  if (user?.isGuest) {
    return (
      <div className="analytics-container guest animate-fade-in">
        <div className="guest-card glass-panel">
          <TrendingUp size={48} className="guest-icon" />
          <h3>Creator Analytics</h3>
          <p>Sign up to track views, reactions, saves, and overall reach of the gems you drop on the map.</p>
          <button className="submit-auth-btn" onClick={() => navigate('/profile')}>
            Sign Up / Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-container animate-fade-in">
      <div className="analytics-header">
        <button className="back-btn" onClick={() => navigate('/profile')}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2>Gem Impact Stats</h2>
          <p>Track the reach and engagement of your contributions</p>
        </div>
      </div>

      {loading ? (
        <p className="loading-text">Analyzing your gem impact...</p>
      ) : totalSpots === 0 ? (
        <div className="empty-analytics-state glass-panel">
          <AlertCircle size={40} color="var(--color-accent)" />
          <h4>No data to analyze</h4>
          <p>You haven't dropped any gems on the map yet. Go explore the outdoors and drop your first spot to begin tracking stats!</p>
          <button className="submit-trip-btn" onClick={() => navigate('/add')} style={{ maxWidth: '200px' }}>
            Drop a Gem
          </button>
        </div>
      ) : (
        <div className="analytics-content">
          {/* Creator Impact Scorecard */}
          <div className="creator-reputation-card glass-panel">
            <div className="reputation-text">
              <Sparkles size={20} color="#DDA15E" />
              <span>CREATOR REPUTATION SCORE</span>
              <h2>{creatorImpactScore}</h2>
            </div>
            <div className="reputation-help-text">
              Calculated based on spot views, shares, bookmarks, and Zen ratings by the traveler community.
            </div>
          </div>

          {/* Core metrics grid */}
          <div className="metrics-grid">
            <div className="metric-card glass-panel">
              <div className="metric-icon-row views">
                <Eye size={20} />
                <span>Views</span>
              </div>
              <span className="metric-val">{totalViews}</span>
              <span className="metric-desc">Page opens across all gems</span>
            </div>

            <div className="metric-card glass-panel">
              <div className="metric-icon-row saves">
                <Heart size={20} />
                <span>Saves</span>
              </div>
              <span className="metric-val">{totalSaves}</span>
              <span className="metric-desc">Bookmarks by other travelers</span>
            </div>

            <div className="metric-card glass-panel">
              <div className="metric-icon-row shares">
                <Share size={20} />
                <span>Shares</span>
              </div>
              <span className="metric-val">{totalShares}</span>
              <span className="metric-desc">Visual card downloads & copies</span>
            </div>

            <div className="metric-card glass-panel">
              <div className="metric-icon-row reactions">
                <Award size={20} />
                <span>Reactions</span>
              </div>
              <span className="metric-val">{totalReactions}</span>
              <span className="metric-desc">Zen, Lit, Love & Gem reactions</span>
            </div>
          </div>

          {/* Spots Rankings List */}
          <div className="spots-ranking-section">
            <h3>Top Performing Gems</h3>
            <div className="spots-rankings-list">
              {spots
                .sort((a, b) => getSpotScore(b) - getSpotScore(a)) // Sort descending by spot score
                .map((spot, idx) => {
                  const score = getSpotScore(spot);
                  const views = viewsMap[spot.id] || 0;
                  const reacts = spot.reactions ? Object.values(spot.reactions).reduce((sum, val) => sum + val, 0) : 0;
                  const saves = Math.max(0, (reacts * 3) + ((spot.share_count || 0) * 2));

                  return (
                    <div key={spot.id} className="spot-rank-card glass-panel">
                      <div className="rank-badge-number">#{idx + 1}</div>
                      
                      {spot.image_url ? (
                        <img src={spot.image_url} alt={spot.title} className="rank-thumbnail" />
                      ) : (
                        <div className="rank-thumbnail placeholder">💎</div>
                      )}

                      <div className="rank-spot-info">
                        <h4>{spot.title}</h4>
                        <span className="rank-spot-cat">{spot.category}</span>
                        
                        <div className="rank-spot-stats">
                          <span>👁️ {views}</span>
                          <span>❤️ {saves}</span>
                          <span>📤 {spot.share_count || 0}</span>
                          <span>🌟 {reacts}</span>
                        </div>
                      </div>

                      <div className="rank-score-badge">
                        <span className="score-label">Impact</span>
                        <span className="score-num">{score}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
