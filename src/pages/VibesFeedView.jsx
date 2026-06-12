import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import SpotVibeCard from '../components/SpotVibeCard';
import { Sparkles, Info } from 'lucide-react';
import './VibesFeedView.css';

export default function VibesFeedView() {
  const navigate = useNavigate();
  const [spots, setSpots] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const touchStart = useRef(0);
  const mouseDownY = useRef(0);
  const wheelCooldown = useRef(false);

  // Fetch approved spots
  const fetchSpots = useCallback(async () => {
    setLoading(true);
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
    fetchSpots();
  }, [fetchSpots]);

  // Slides navigation
  const nextSlide = () => {
    if (activeIndex < spots.length - 1) {
      setActiveIndex(prev => prev + 1);
    }
  };

  const prevSlide = () => {
    if (activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    }
  };

  // Touch Swipe Handlers
  const handleTouchStart = (e) => {
    touchStart.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchStart.current - touchEnd;
    if (diff > 50) {
      nextSlide();
    } else if (diff < -50) {
      prevSlide();
    }
  };

  // Mouse Drag Handlers (for desktop browser simulation)
  const handleMouseDown = (e) => {
    mouseDownY.current = e.clientY;
  };

  const handleMouseUp = (e) => {
    const diff = mouseDownY.current - e.clientY;
    if (diff > 50) {
      nextSlide();
    } else if (diff < -50) {
      prevSlide();
    }
  };

  // Mouse Wheel / Trackpad Scroll Handler
  const handleWheel = (e) => {
    if (wheelCooldown.current) return;
    
    if (e.deltaY > 30) {
      nextSlide();
      triggerCooldown();
    } else if (e.deltaY < -30) {
      prevSlide();
      triggerCooldown();
    }
  };

  const triggerCooldown = () => {
    wheelCooldown.current = true;
    setTimeout(() => {
      wheelCooldown.current = false;
    }, 450); // Cooldown to make swiping deliberate
  };

  if (loading) {
    return (
      <div className="vibes-feed-container loading-state">
        <Sparkles className="animate-spin vibes-spinner" size={36} />
        <p>Loading community video vibes...</p>
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
      className="vibes-feed-container"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      <div 
        className="vibes-slider"
        style={{ transform: `translateY(-${activeIndex * 100}%)` }}
      >
        {spots.map((spot, idx) => (
          <div key={spot.id} className="vibe-slide-item">
            <SpotVibeCard 
              spot={spot} 
              isActive={idx === activeIndex} 
            />
          </div>
        ))}
      </div>
    </div>
  );
}
