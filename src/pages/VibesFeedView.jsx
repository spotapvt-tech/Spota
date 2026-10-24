import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import SpotVibeCard from '../components/SpotVibeCard';
import { Info } from 'lucide-react';
import './VibesFeedView.css';

export default function VibesFeedView() {
  const navigate = useNavigate();
  const [spots, setSpots] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const feedRef = useRef(null);

  // Fetch approved spots
  const fetchSpots = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('*')
        .neq('status', 'deleted')
        .neq('status', 'flagged')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSpots(data || []);
    } catch (err) {
      console.error('Error fetching vibes feed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSpots(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchSpots]);

  // Native scroll-snap does the swiping; we only track which card is on screen
  // (drives video play/pause and which neighbours get rendered).
  useEffect(() => {
    const root = feedRef.current;
    if (!root || spots.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActiveIndex(Number(entry.target.dataset.index));
      });
    }, { root, threshold: 0.6 });
    root.querySelectorAll('.vibe-slide-item').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [spots]);

  if (loading) {
    return (
      <div className="vibes-feed-container loading-state" role="status" aria-busy="true">
        <div className="sp-skeleton" style={{ width: "calc(100% - 32px)", height: "70%", borderRadius: "var(--radius-lg)" }} />
        <span className="sp-visually-hidden">Loading community vibes</span>
      </div>
    );
  }

  if (spots.length === 0) {
    return (
      <div className="vibes-feed-container empty-state-wrapper">
        <div className="empty-vibes-card glass-panel">
          <Info size={40} color="var(--color-accent)" />
          <h3>No Video Vibes Yet</h3>
          <p>Be the first traveler to drop a gem with a video vibe in Spota!</p>
          <button className="submit-trip-btn" onClick={() => navigate('/add')}>
            Drop a Gem
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={feedRef}
      className="vibes-feed-container"
      tabIndex={0}
      aria-label="Community vibes feed"
    >
      {spots.map((spot, idx) => (
        <div key={spot.id} className="vibe-slide-item" data-index={idx}>
          {/* ponytail: windowed render, all slide shells still mount; paginate the fetch if the feed grows past a few thousand */}
          {Math.abs(idx - activeIndex) <= 2 && (
            <SpotVibeCard spot={spot} isActive={idx === activeIndex} />
          )}
        </div>
      ))}
    </div>
  );
}
