import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Sparkles, Flame, MapPin, Lock, Share2, Award } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import './DailyVibeDropModal.css';

export default function DailyVibeDropModal({ onClose, onOpenSpot }) {
  const { user } = useAuth();
  
  // Game state
  const [spot, setSpot] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [intent, setIntent] = useState(null); // 'zen' | 'lit' | 'cafe' | 'trail'
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [streak, setStreak] = useState(0);
  
  // Countdown state
  const [timeLeft, setTimeLeft] = useState('');
  const [loading, setLoading] = useState(true);
  
  const canvasRef = useRef(null);

  // Calculate countdown to midnight
  const updateCountdown = useCallback(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const diffMs = midnight.getTime() - now.getTime();
    if (diffMs <= 0) return '00:00:00';
    
    const hours = Math.floor(diffMs / (3600 * 1000));
    const minutes = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
    const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }, []);

  // Sync state on load
  const fetchStreakAndLockStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const localScratchDate = localStorage.getItem('spota_last_scratch_date');
    const localStreak = Number(localStorage.getItem('spota_scratch_streak') || '0');
    const localBonusUsed = localStorage.getItem('spota_bonus_scratch_used') === 'true';
    const localBonusEarned = localStorage.getItem('spota_bonus_scratch_earned') === 'true';

    const todayStr = new Date().toISOString().split('T')[0];
    let scratchedToday = (localScratchDate === todayStr);

    if (user.isGuest) {
      setStreak(localStreak);
      setIsLocked(scratchedToday && !localBonusEarned);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('daily_vibe_streaks')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setStreak(data.streak_count);
        const dbScratchDate = data.last_scratch_date;
        const dbScratchedToday = (dbScratchDate === todayStr);
        
        scratchedToday = dbScratchedToday || scratchedToday;
        
        const hasBonus = (data.bonus_scratches_earned > data.bonus_scratches_used) || (localBonusEarned && !localBonusUsed);
        
        setIsLocked(scratchedToday && !hasBonus);
        
        localStorage.setItem('spota_scratch_streak', String(data.streak_count));
        if (dbScratchDate) {
          localStorage.setItem('spota_last_scratch_date', dbScratchDate);
        }
      } else {
        // Create initial record
        await supabase
          .from('daily_vibe_streaks')
          .insert({ user_id: user.id, streak_count: 0 })
          .maybeSingle();
          
        setStreak(0);
        setIsLocked(false);
      }
    } catch (err) {
      console.warn('DB error checking streaks, falling back to Local Storage:', err);
      setStreak(localStreak);
      setIsLocked(scratchedToday && !localBonusEarned);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load status
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStreakAndLockStatus();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchStreakAndLockStatus]);

  // Countdown timer loop
  useEffect(() => {
    if (!isLocked) return;
    const timer = setTimeout(() => {
      setTimeLeft(updateCountdown());
    }, 0);
    const interval = setInterval(() => {
      setTimeLeft(updateCountdown());
    }, 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isLocked, updateCountdown]);

  // Fetch curated spot on intent selected
  const handleSelectIntent = async (selectedIntent) => {
    setIntent(selectedIntent);
    try {
      let query = supabase
        .from('spots')
        .select('*')
        .neq('status', 'deleted')
        .neq('status', 'flagged');

      if (selectedIntent === 'zen') {
        query = query.contains('tags', ['zen']);
      } else if (selectedIntent === 'lit') {
        query = query.contains('tags', ['lively']);
      } else if (selectedIntent === 'cafe') {
        query = query.eq('category', 'cafe');
      } else if (selectedIntent === 'trail') {
        query = query.in('category', ['trail', 'campsite', 'waterfall', 'mountain']);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const randIdx = Math.floor(Math.random() * data.length);
        setSpot(data[randIdx]);
      } else {
        // general fallback
        const { data: fallbackData } = await supabase
          .from('spots')
          .select('*')
          .neq('status', 'deleted')
          .neq('status', 'flagged');
        if (fallbackData && fallbackData.length > 0) {
          const randIdx = Math.floor(Math.random() * fallbackData.length);
          setSpot(fallbackData[randIdx]);
        }
      }
    } catch (err) {
      console.error('Error fetching recommended spot:', err);
    }
  };

  // Draw scratch card cover
  useEffect(() => {
    if (!spot || !intent) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Draw Cover Gradient
    const gradient = ctx.createLinearGradient(0, 0, 340, 480);
    gradient.addColorStop(0, '#6C8C74');
    gradient.addColorStop(1, '#83C5BE');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 340, 480);

    // Draw scratch text/icon
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "bold 24px 'Outfit', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('✨ VIBE DROP ✨', 170, 220);

    ctx.font = "500 14px 'Outfit', sans-serif";
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText('Scratch here to reveal', 170, 260);
    ctx.fillText(`your curated ${intent.toUpperCase()} spot!`, 170, 280);

    ctx.font = "40px 'Outfit', sans-serif";
    ctx.fillText('💎', 170, 160);
  }, [spot, intent]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    if (isRevealed) return;
    setIsDrawing(true);
    scratchAt(e);
  };

  const draw = (e) => {
    if (!isDrawing || isRevealed) return;
    e.preventDefault();
    scratchAt(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const scratchAt = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();

    checkCleared();
  };

  const checkCleared = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, 340, 480);
    const pixels = imgData.data;
    let transparent = 0;
    
    for (let i = 0; i < pixels.length; i += 40) {
      if (pixels[i + 3] === 0) {
        transparent++;
      }
    }

    const totalCheck = pixels.length / 40;
    const ratio = transparent / totalCheck;

    if (ratio > 0.55 && !isRevealed) {
      handleScratchCompleted();
    }
  };

  const handleScratchCompleted = async () => {
    setIsRevealed(true);
    const todayStr = new Date().toISOString().split('T')[0];

    // Determine new streak
    const prevScratchDate = localStorage.getItem('spota_last_scratch_date');
    const localStreak = Number(localStorage.getItem('spota_scratch_streak') || '0');
    let newStreak = localStreak;

    if (prevScratchDate) {
      const prevDateObj = new Date(prevScratchDate);
      const todayDateObj = new Date(todayStr);
      const diffTime = Math.abs(todayDateObj - prevDateObj);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1; // reset broken streak
      }
    } else {
      newStreak = 1; // first scratch
    }

    setStreak(newStreak);

    // Save states locally
    localStorage.setItem('spota_last_scratch_date', todayStr);
    localStorage.setItem('spota_scratch_streak', String(newStreak));
    
    const wasBonus = localStorage.getItem('spota_bonus_scratch_earned') === 'true' && localStorage.getItem('spota_bonus_scratch_used') !== 'true';
    if (wasBonus) {
      localStorage.setItem('spota_bonus_scratch_used', 'true');
    }

    // Database Sync
    if (user && !user.isGuest) {
      try {
        if (wasBonus) {
          await supabase
            .from('daily_vibe_streaks')
            .update({
              streak_count: newStreak,
              last_scratch_date: todayStr,
              bonus_scratches_used: 1
            })
            .eq('user_id', user.id);
        } else {
          await supabase
            .from('daily_vibe_streaks')
            .update({
              streak_count: newStreak,
              last_scratch_date: todayStr
            })
            .eq('user_id', user.id);
        }
      } catch (err) {
        console.warn('Failed to update streak in DB, will retry next session:', err);
      }
    }

    // Dispatch event so achievement check triggers
    window.dispatchEvent(new CustomEvent('spota_daily_scratch_completed', {
      detail: { streak: newStreak }
    }));
  };

  const handleShareToUnlock = async () => {
    const shareData = {
      title: 'Spota — Hidden Gem Discovery',
      text: 'Planning weekend travel? Scratch your daily vibe card on Spota!',
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.origin);
        alert('Spota link copied to clipboard!');
      }

      // Mark bonus card unlocked locally
      localStorage.setItem('spota_bonus_scratch_earned', 'true');
      localStorage.setItem('spota_bonus_scratch_used', 'false');

      if (user && !user.isGuest) {
        await supabase
          .from('daily_vibe_streaks')
          .update({
            bonus_scratches_earned: 1,
            bonus_scratches_used: 0
          })
          .eq('user_id', user.id);
      }

      alert('Bonus card unlocked! Reload Daily Drop to scratch again!');
      setIsLocked(false);
    } catch (e) {
      console.warn('Failed sharing to unlock:', e);
    }
  };

  const handleOpenCuratedSpot = () => {
    if (spot && onOpenSpot) {
      onOpenSpot(spot);
      onClose();
    }
  };

  if (loading) {
    return (
      <div className="vibe-drop-backdrop">
        <div className="vibe-drop-content glass-panel loading-state">
          <Sparkles className="animate-spin" size={32} />
          <p>Syncing streak records...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vibe-drop-backdrop">
      <div className="vibe-drop-content glass-panel animate-fade-in">
        <button className="vibe-drop-close" onClick={onClose}>
          <X size={20} />
        </button>

        {/* Lock State Overlay */}
        {isLocked ? (
          <div className="daily-lock-overlay animate-fade-in">
            <Lock size={48} className="lock-icon" />
            <h3>Daily Drop Locked</h3>
            <p>You have scratched your vibe for today! Return tomorrow to build your streak.</p>
            
            <div className="streak-stats-row">
              <Flame size={20} color="orange" />
              <span>Current Streak: <strong>{streak} days</strong></span>
            </div>

            <div className="countdown-timer-box">
              <span className="countdown-label">Next Drop In</span>
              <span className="countdown-timer">{timeLeft}</span>
            </div>

            <button className="share-unlock-btn" onClick={handleShareToUnlock}>
              <Share2 size={16} />
              <span>Share App to Unlock Bonus Card</span>
            </button>
          </div>
        ) : !intent ? (
          // Intent Selection Overlay
          <div className="intent-selection-overlay animate-fade-in">
            <Award size={32} className="award-icon" />
            <h3>Select Your Today's Vibe</h3>
            <p>What kind of place are you looking for today? We'll curate your secret drop.</p>
            
            {streak > 0 && (
              <div className="streak-bubble">
                <Flame size={14} />
                <span>{streak} Day Streak!</span>
              </div>
            )}

            <div className="intent-grid">
              <button onClick={() => handleSelectIntent('cafe')} className="intent-btn glass-panel">
                <span className="intent-emoji">☕</span>
                <strong>Cozy Cafe</strong>
                <span>Work / Coffee / Chill</span>
              </button>
              <button onClick={() => handleSelectIntent('zen')} className="intent-btn glass-panel">
                <span className="intent-emoji">🧘</span>
                <strong>Zen Spot</strong>
                <span>Quiet / View / Nature</span>
              </button>
              <button onClick={() => handleSelectIntent('lit')} className="intent-btn glass-panel">
                <span className="intent-emoji">🔥</span>
                <strong>Lit Event</strong>
                <span>Lively / Music / Crowd</span>
              </button>
              <button onClick={() => handleSelectIntent('trail')} className="intent-btn glass-panel">
                <span className="intent-emoji">🥾</span>
                <strong>Outdoor Trail</strong>
                <span>Hike / Waterfall / Peak</span>
              </button>
            </div>
          </div>
        ) : (
          // Interactive Scratchcard
          <div className="scratchcard-container">
            {spot && (
              <div className="revealed-spot-card">
                <div className="revealed-image-wrapper">
                  {spot.image_url ? (
                    <img src={spot.image_url} alt={spot.title} />
                  ) : (
                    <div className="revealed-placeholder" />
                  )}
                  <span className="revealed-badge">
                    <Sparkles size={12} />
                    Curated Vibe
                  </span>
                </div>
                <div className="revealed-info">
                  <h3>{spot.title}</h3>
                  <span className="revealed-category">{spot.category.toUpperCase()}</span>
                  <p className="revealed-desc">"{spot.description || 'No vibe description available.'}"</p>
                  
                  {isRevealed && (
                    <button className="revealed-view-btn animate-bounce-in" onClick={handleOpenCuratedSpot}>
                      <MapPin size={16} />
                      Check Out Spot
                    </button>
                  )}
                </div>
              </div>
            )}

            {!isRevealed && (
              <canvas
                ref={canvasRef}
                width={340}
                height={480}
                className="scratch-canvas"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
