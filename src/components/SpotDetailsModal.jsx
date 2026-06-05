import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Heart, Share, AlertTriangle, Trash2, Sparkles, Navigation, ListPlus, Film, Image as ImageIcon, MessageSquare } from 'lucide-react';
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [reactions, setReactions] = useState({ '🧘': 0, '🔥': 0, '❤️': 0, '🌟': 0 });
  const [userReactions, setUserReactions] = useState({});
  const [shareCount, setShareCount] = useState(0);

  // Media selection & playlist states
  const [mediaType, setMediaType] = useState(spot.video_url ? 'video' : 'image');
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [playlistsWithSpot, setPlaylistsWithSpot] = useState([]);
  const [showPlaylistDropdown, setShowPlaylistDropdown] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState(null);
  
  // Comments state
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Vibe Check Ratings state
  const [vibeAverages, setVibeAverages] = useState({
    cozy: 0,
    insta_worthy: 0,
    lively: 0,
    zen: 0,
    workspace: 0,
    totalCount: 0
  });
  const [userVibeRatings, setUserVibeRatings] = useState({
    cozy: 3,
    insta_worthy: 3,
    lively: 3,
    zen: 3,
    workspace: 3
  });
  const [isSubmittingVibes, setIsSubmittingVibes] = useState(false);
  const [hasRatedVibes, setHasRatedVibes] = useState(false);

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

  const fetchPlaylistsData = async () => {
    if (!user || user.isGuest) return;
    try {
      const { data: playlistsData, error: plError } = await supabase
        .from('playlists')
        .select('*')
        .eq('creator_id', user.id);
      
      if (plError) throw plError;
      
      if (playlistsData) {
        const { data: spotMatches, error: spotsError } = await supabase
          .from('playlist_spots')
          .select('playlist_id')
          .eq('spot_id', spot.id);
        
        if (spotsError) throw spotsError;
        
        const playlistIds = spotMatches ? spotMatches.map(sm => sm.playlist_id) : [];
        setUserPlaylists(playlistsData);
        setPlaylistsWithSpot(playlistIds);
      }
    } catch (err) {
      console.error('Error fetching playlists data:', err);
    }
  };

  const handleTogglePlaylist = async (playlistId) => {
    if (!user || user.isGuest) return;
    const isAdded = playlistsWithSpot.includes(playlistId);
    try {
      if (isAdded) {
        const { error } = await supabase
          .from('playlist_spots')
          .delete()
          .eq('playlist_id', playlistId)
          .eq('spot_id', spot.id);
        if (error) throw error;
        setPlaylistsWithSpot(prev => prev.filter(id => id !== playlistId));
      } else {
        const { error } = await supabase
          .from('playlist_spots')
          .insert({ playlist_id: playlistId, spot_id: spot.id });
        if (error) throw error;
        setPlaylistsWithSpot(prev => [...prev, playlistId]);
      }
    } catch (err) {
      console.error('Error toggling playlist spot:', err);
      alert('Failed to update playlist: ' + err.message);
    }
  };

  const handleDirections = () => {
    if (!spot || spot.latitude === undefined || spot.longitude === undefined) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}`;
    window.open(url, '_blank');
  };

  const fetchComments = async () => {
    if (!spot) return;
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id,
          content,
          created_at,
          user_id,
          guest_name,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq('spot_id', spot.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(data || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const fetchVibeRatings = async () => {
    if (!spot) return;
    try {
      const { data, error } = await supabase
        .from('vibe_ratings')
        .select('cozy, insta_worthy, lively, zen, workspace, user_id')
        .eq('spot_id', spot.id);
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        const count = data.length;
        const sums = data.reduce((acc, curr) => ({
          cozy: acc.cozy + curr.cozy,
          insta_worthy: acc.insta_worthy + curr.insta_worthy,
          lively: acc.lively + curr.lively,
          zen: acc.zen + curr.zen,
          workspace: acc.workspace + curr.workspace
        }), { cozy: 0, insta_worthy: 0, lively: 0, zen: 0, workspace: 0 });

        setVibeAverages({
          cozy: parseFloat((sums.cozy / count).toFixed(1)),
          insta_worthy: parseFloat((sums.insta_worthy / count).toFixed(1)),
          lively: parseFloat((sums.lively / count).toFixed(1)),
          zen: parseFloat((sums.zen / count).toFixed(1)),
          workspace: parseFloat((sums.workspace / count).toFixed(1)),
          totalCount: count
        });

        // Check if current user has already rated (exclude guests from preventing multiple rating reviews, or verify local key)
        if (user) {
          const userHasRated = data.some(r => r.user_id === user.id && r.user_id !== null);
          setHasRatedVibes(userHasRated);
        }
      } else {
        setVibeAverages({ cozy: 0, insta_worthy: 0, lively: 0, zen: 0, workspace: 0, totalCount: 0 });
        setHasRatedVibes(false);
      }
    } catch (err) {
      console.error('Error fetching vibe ratings:', err);
    }
  };

  const handlePostVibes = async (e) => {
    e.preventDefault();
    if (!user) {
      alert('Please log in to submit a Vibe Check.');
      return;
    }
    
    setIsSubmittingVibes(true);
    const isGuest = user.isGuest;

    try {
      const { error } = await supabase
        .from('vibe_ratings')
        .insert([
          {
            spot_id: spot.id,
            user_id: isGuest ? null : user.id,
            cozy: userVibeRatings.cozy,
            insta_worthy: userVibeRatings.insta_worthy,
            lively: userVibeRatings.lively,
            zen: userVibeRatings.zen,
            workspace: userVibeRatings.workspace
          }
        ]);

      if (error) throw error;
      
      alert('Vibe Check submitted successfully!');
      setHasRatedVibes(true);
      fetchVibeRatings(); // Reload averages
    } catch (err) {
      console.error('Error submitting Vibe Check:', err);
      alert('Failed to submit Vibe Check: ' + err.message);
    } finally {
      setIsSubmittingVibes(false);
    }
  };

  const handleExportShareCard = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    
    // 1. Draw Background Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 1200);
    gradient.addColorStop(0, '#2C3531'); // Dark aesthetic background
    gradient.addColorStop(1, '#111714');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 1200);

    // 2. Draw Decorative Glass Circles
    ctx.fillStyle = 'rgba(108, 140, 116, 0.15)'; 
    ctx.beginPath();
    ctx.arc(100, 200, 150, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(224, 122, 95, 0.1)'; 
    ctx.beginPath();
    ctx.arc(700, 900, 200, 0, Math.PI * 2);
    ctx.fill();

    // 3. Draw Header
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "bold 32px 'Outfit', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('💎 S P O T A', 400, 80);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = "500 16px 'Outfit', sans-serif";
    ctx.fillText('ZEN SOCIAL DISCOVERY', 400, 115);

    const drawDetails = () => {
      // 5. Draw Info Card panel (Glassmorphism effect)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      
      const x = 80, y = 620, w = 640, h = 480, r = 24;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Spot Title
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.font = "bold 38px 'Outfit', sans-serif";
      ctx.fillText(spot.title || 'Unknown Spot', 120, 685, 560);

      // Category Pill
      const catText = (spot.category || 'General').toUpperCase();
      ctx.fillStyle = '#6C8C74';
      const pillWidth = ctx.measureText(catText).width + 24;
      ctx.beginPath();
      ctx.roundRect(120, 715, pillWidth, 32, 16);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = "bold 13px 'Outfit', sans-serif";
      ctx.fillText(catText, 132, 736);

      // Creator attribution
      const creatorName = creatorProfile?.username || 'Explorer';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = "400 16px 'Outfit', sans-serif";
      ctx.fillText(`Dropped by: ${creatorName}`, 120 + pillWidth + 20, 737);

      // Description (Word Wrap)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = "italic 20px 'Outfit', sans-serif";
      const descText = `"${spot.description || spot.vibe || 'No description'}"`;
      
      const words = descText.split(' ');
      let line = '';
      let lineY = 790;
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > 520 && n > 0) {
          ctx.fillText(line, 120, lineY);
          line = words[n] + ' ';
          lineY += 28;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 120, lineY);

      // Vibe Check Ratings inside Share Card
      let ratingY = 880;
      const ratingColors = ['#E07A5F', '#E29578', '#DDA15E', '#6C8C74', '#4A90E2'];
      const ratingLabels = ['Cozy', 'Insta', 'Lively', 'Zen', 'Work'];
      const ratingKeys = ['cozy', 'insta_worthy', 'lively', 'zen', 'workspace'];

      ctx.font = "bold 15px 'Outfit', sans-serif";
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('VIBE CHECK PROFILE', 120, ratingY - 20);

      ratingKeys.forEach((key, idx) => {
        const val = vibeAverages[key] || 3.0; 
        const percent = (val / 5) * 400; 

        // Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = "500 14px 'Outfit', sans-serif";
        ctx.fillText(ratingLabels[idx], 120, ratingY + 4);

        // Value
        ctx.fillStyle = '#FFFFFF';
        ctx.font = "bold 14px 'Outfit', sans-serif";
        ctx.fillText(`${val}`, 180, ratingY + 4);

        // Progress bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.roundRect(220, ratingY - 8, 400, 10, 5);
        ctx.fill();

        // Progress bar fill
        ctx.fillStyle = ratingColors[idx];
        ctx.beginPath();
        ctx.roundRect(220, ratingY - 8, percent, 10, 5);
        ctx.fill();

        ratingY += 28;
      });

      // Footer branding & mock QR Code
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(590, 715, 80, 80, 8);
      ctx.fill();
      
      ctx.fillStyle = '#000000';
      ctx.fillRect(600, 725, 20, 20);
      ctx.fillRect(640, 725, 20, 20);
      ctx.fillRect(600, 765, 20, 20);
      ctx.fillRect(625, 745, 10, 10);
      ctx.fillRect(645, 755, 15, 15);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = "500 12px 'Outfit', sans-serif";
      ctx.fillText('SCAN TO DISCOVER', 560, 815);

      // 6. Trigger Download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spota_${spot.title.toLowerCase().replace(/\s+/g, '_')}_card.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    };

    if (spot.image_url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = spot.image_url;
      img.onload = () => {
        ctx.save();
        const rx = 80, ry = 150, rw = 640, rh = 440, rr = 24;
        ctx.beginPath();
        ctx.moveTo(rx + rr, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
        ctx.arcTo(rx, ry + rh, rx, ry, rr);
        ctx.arcTo(rx, ry, rx + rw, ry, rr);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, rx, ry, rw, rh);
        ctx.restore();
        
        drawDetails();
      };
      img.onerror = () => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(80, 150, 640, 440);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = "italic 20px 'Outfit', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText('💎 Spot Visual', 400, 370);
        
        drawDetails();
      };
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(80, 150, 640, 440);
      drawDetails();
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

    // Fetch creator profile if user_id exists
    async function fetchCreator() {
      if (spot.user_id) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('username, avatar_url, is_verified')
            .eq('id', spot.user_id)
            .single();
          if (!error && data) {
            setCreatorProfile(data);
          } else {
            setCreatorProfile({ username: 'Explorer', avatar_url: null, is_verified: false });
          }
        } catch (err) {
          console.error('Error fetching creator profile:', err);
          setCreatorProfile({ username: 'Explorer', avatar_url: null, is_verified: false });
        }
      } else {
        setCreatorProfile({ username: 'Anonymous Explorer', avatar_url: null, is_verified: false });
      }
    }
    
    fetchCreator();
    fetchComments();
    fetchVibeRatings();
    fetchPlaylistsData();
  }, [spot, user]);

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

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    if (!user) {
      alert('Please log in to post comments.');
      return;
    }

    const isGuest = user.isGuest;

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert([
          {
            spot_id: spot.id,
            user_id: isGuest ? null : user.id,
            guest_name: isGuest ? (user.user_metadata?.username || 'Guest Explorer') : null,
            content: commentText.trim()
          }
        ])
        .select(`
          id,
          content,
          created_at,
          user_id,
          guest_name,
          profiles:user_id (
            username,
            avatar_url
          )
        `);

      if (error) throw error;
      
      if (data && data.length > 0) {
        setComments(prev => [...prev, data[0]]);
      }
      setCommentText('');
    } catch (err) {
      console.error('Error posting comment:', err);
      alert('Failed to post comment: ' + err.message);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      console.error('Error deleting comment:', err);
      alert('Failed to delete comment: ' + err.message);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>
        
        <div className="spot-image-large" style={{ position: 'relative' }}>
          {mediaType === 'video' && spot.video_url ? (
            <video 
              src={spot.video_url} 
              autoPlay 
              muted 
              loop 
              playsInline 
              controls
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : spot.image_url ? (
            <img src={spot.image_url} alt={spot.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, rgba(108,140,116,0.1), rgba(108,140,116,0.3))' }} />
          )}

          {spot.video_url && (
            <div className="media-toggle-overlay">
              <button 
                type="button" 
                className={`media-toggle-btn ${mediaType === 'image' ? 'active' : ''}`}
                onClick={() => setMediaType('image')}
              >
                <ImageIcon size={12} />
                <span>Photo</span>
              </button>
              <button 
                type="button" 
                className={`media-toggle-btn ${mediaType === 'video' ? 'active' : ''}`}
                onClick={() => setMediaType('video')}
              >
                <Film size={12} />
                <span>Video Vibe</span>
              </button>
            </div>
          )}
        </div>
        
        <div className="spot-details-body">
          {spot.status === 'pending' && (
            <div style={{ backgroundColor: 'rgba(224, 122, 95, 0.1)', color: '#E07A5F', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', marginBottom: '20px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(224, 122, 95, 0.2)' }}>
              <span>⏳</span>
              <span>This gem is pending moderation review and is only visible to you.</span>
            </div>
          )}
          
          <div className="title-row" style={{ marginBottom: '8px' }}>
            <h2>{spot.title || "Unknown Spot"}</h2>
            <span className="category-badge">{spot.category || "General"}</span>
          </div>

          {spot.address && (
            <div className="spot-address-detail" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '14px', lineHeight: '1.4' }}>
              <span>📍</span>
              <span>{spot.address}</span>
            </div>
          )}

          {/* Creator Attribution */}
          {creatorProfile && (
            <div className="creator-attribution" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="creator-avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-accent)', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, overflow: 'hidden' }}>
                  {creatorProfile.avatar_url ? (
                    <img src={creatorProfile.avatar_url} alt={creatorProfile.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    creatorProfile.username.substring(0, 2).toUpperCase()
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', lineHeight: '1.2' }}>Dropped by</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{creatorProfile.username}</span>
                    {creatorProfile.is_verified && (
                      <span style={{ backgroundColor: 'rgba(108,140,116,0.15)', color: 'var(--color-accent)', padding: '1px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase' }} title="Verified Contributor">Verified</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Message Creator button */}
              {user && !user.isGuest && spot.user_id && spot.user_id !== user.id && (
                <button 
                  onClick={() => navigate('/chat', { state: { startChatWith: { id: spot.user_id, username: creatorProfile.username, avatar_url: creatorProfile.avatar_url } } })}
                  style={{
                    background: 'rgba(108, 140, 116, 0.12)',
                    border: 'none',
                    color: 'var(--color-accent)',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                  title="Send Message"
                >
                  <MessageSquare size={14} />
                  <span>Message</span>
                </button>
              )}
            </div>
          )}
          
          <p className="vibe-text">"{spot.description || spot.vibe || "No vibe description provided."}"</p>

          {/* Display Custom Vibe Tags */}
          {spot.tags && Array.isArray(spot.tags) && spot.tags.length > 0 && (
            <div className="detail-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '12px 0 16px 0' }}>
              {spot.tags.map((tag, idx) => (
                <span key={idx} className="tag-pill" style={{ backgroundColor: 'rgba(108,140,116,0.1)', color: 'var(--color-accent)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
          
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

          <div className="action-buttons" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <button className={`action-btn ${isSaved ? 'active' : ''}`} onClick={toggleSave}>
              <Heart size={20} fill={isSaved ? "var(--color-live)" : "none"} color={isSaved ? "var(--color-live)" : "currentColor"} />
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>
            <button className="action-btn" onClick={handleShare}>
              <Share size={20} />
              <span>Share ({shareCount})</span>
            </button>
            
            {spot.latitude !== undefined && spot.longitude !== undefined && (
              <button className="action-btn directions-btn" onClick={handleDirections} style={{ backgroundColor: 'rgba(108,140,116,0.1)', color: 'var(--color-accent)' }}>
                <Navigation size={20} />
                <span>Directions</span>
              </button>
            )}

            {!user?.isGuest && user && (
              <div className="playlist-dropdown-container">
                <button 
                  className={`action-btn playlist-btn ${showPlaylistDropdown ? 'active' : ''}`} 
                  onClick={() => setShowPlaylistDropdown(!showPlaylistDropdown)}
                  style={{ width: '100%' }}
                >
                  <ListPlus size={20} />
                  <span>Playlist</span>
                </button>
                {showPlaylistDropdown && (
                  <div className="playlist-select-dropdown glass-panel animate-fade-in" style={{ cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <h4>Add to Playlist</h4>
                    {userPlaylists.length === 0 ? (
                      <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '8px 0', display: 'block' }}>Create a playlist on Profile!</span>
                    ) : (
                      userPlaylists.map(pl => {
                        const inPlaylist = playlistsWithSpot.includes(pl.id);
                        return (
                          <label key={pl.id} className="playlist-dropdown-item">
                            <input 
                              type="checkbox" 
                              checked={inPlaylist}
                              onChange={() => handleTogglePlaylist(pl.id)}
                              style={{ accentColor: 'var(--color-accent)' }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            <button className="action-btn share-card-btn" onClick={handleExportShareCard} style={{ backgroundColor: 'rgba(108,140,116,0.1)', color: 'var(--color-accent)' }}>
              <Sparkles size={20} />
              <span>Share Card</span>
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

          {/* Vibe Checks Visualizer */}
          <div className="vibe-check-visuals" style={{ marginTop: '20px', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📊 Vibe Profile {vibeAverages.totalCount > 0 && `(${vibeAverages.totalCount} checks)`}
            </h3>
            
            {vibeAverages.totalCount === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontStyle: 'italic', margin: '4px 0 16px 0' }}>
                No vibe ratings submitted yet. Be the first to Vibe Check this spot!
              </p>
            ) : (
              <div className="vibe-metrics-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {[
                  { key: 'cozy', label: 'Cozy / Warm', color: 'linear-gradient(90deg, #E07A5F, #F4A261)' },
                  { key: 'insta_worthy', label: 'Insta-Worthy', color: 'linear-gradient(90deg, #E29578, #FFB5A7)' },
                  { key: 'lively', label: 'Lively / Buzzing', color: 'linear-gradient(90deg, #DDA15E, #E9C46A)' },
                  { key: 'zen', label: 'Zen / Quiet', color: 'linear-gradient(90deg, #6C8C74, #83C5BE)' },
                  { key: 'workspace', label: 'Workspace Friendly', color: 'linear-gradient(90deg, #4A90E2, #5C9EAD)' }
                ].map(({ key, label, color }) => {
                  const val = vibeAverages[key];
                  const percent = (val / 5) * 100;
                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                        <span style={{ color: 'var(--color-text-primary)' }}>{val} / 5</span>
                      </div>
                      <div style={{ height: '8px', width: '100%', backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${percent}%`, background: color, borderRadius: '4px', transition: 'width 0.8s ease-in-out' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Submit Vibe Check */}
            {user && !hasRatedVibes && (
              <details style={{ backgroundColor: 'rgba(108,140,116,0.04)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                <summary style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-accent)' }}>🎯 Submit a Vibe Check</summary>
                <form onSubmit={handlePostVibes} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px', cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                  {[
                    { key: 'cozy', label: 'Cozy / Warm' },
                    { key: 'insta_worthy', label: 'Insta-Worthy' },
                    { key: 'lively', label: 'Lively / Buzzing' },
                    { key: 'zen', label: 'Zen / Quiet' },
                    { key: 'workspace', label: 'Workspace Friendly' }
                  ].map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>{label}</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[1, 2, 3, 4, 5].map((val) => (
                          <button
                            type="button"
                            key={val}
                            onClick={() => setUserVibeRatings(prev => ({ ...prev, [key]: val }))}
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              border: '1px solid var(--color-border)',
                              backgroundColor: userVibeRatings[key] === val ? 'var(--color-accent)' : '#FFF',
                              color: userVibeRatings[key] === val ? '#FFF' : 'var(--color-text-secondary)',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="submit"
                    disabled={isSubmittingVibes}
                    style={{
                      marginTop: '8px',
                      padding: '10px',
                      backgroundColor: 'var(--color-accent)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {isSubmittingVibes ? 'Submitting Vibe Check...' : 'Post Vibe Check'}
                  </button>
                </form>
              </details>
            )}
          </div>

          {/* Comments Section */}
          <div className="comments-section" style={{ marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              💬 Community Tips ({comments.length})
            </h3>

            {/* Comment Thread */}
            <div className="comments-thread" style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', paddingRight: '4px' }}>
              {commentsLoading ? (
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center', display: 'block' }}>Loading comments...</span>
              ) : comments.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontStyle: 'italic', textAlign: 'center', display: 'block', padding: '10px 0' }}>No tips dropped yet. Be the first!</span>
              ) : (
                comments.map((comment) => {
                  const commentOwner = comment.profiles || { username: comment.guest_name || 'Guest Explorer', avatar_url: null };
                  const canDelete = user && user.id === comment.user_id;
                  const commentInitials = commentOwner.username ? commentOwner.username.substring(0, 2).toUpperCase() : 'EX';
                  const commentDate = new Date(comment.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                  return (
                    <div key={comment.id} className="comment-item" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', backgroundColor: 'rgba(0,0,0,0.02)', padding: '10px', borderRadius: 'var(--radius-md)' }}>
                      <div className="comment-avatar" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--color-text-secondary)', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, overflow: 'hidden', flexShrink: 0 }}>
                        {commentOwner.avatar_url ? (
                          <img src={commentOwner.avatar_url} alt={commentOwner.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          commentInitials
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>{commentOwner.username}</span>
                          <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{commentDate}</span>
                        </div>
                        <p style={{ fontSize: '12px', margin: 0, color: 'var(--color-text-primary)', wordBreak: 'break-word', lineHeight: '1.4' }}>{comment.content}</p>
                      </div>
                      {canDelete && (
                        <button 
                          onClick={() => handleDeleteComment(comment.id)}
                          style={{ background: 'none', border: 'none', color: '#c94a4a', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          title="Delete Tip"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Post Comment Form (Visible to both guest and authenticated users) */}
            {user ? (
              <form onSubmit={handlePostComment} style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="Ask a question or drop a tip..." 
                  className="zen-input"
                  style={{ flex: 1, padding: '10px 14px', fontSize: '13px' }}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={300}
                />
                <button 
                  type="submit" 
                  style={{ padding: '0 16px', backgroundColor: 'var(--color-accent)', color: '#FFF', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  Send
                </button>
              </form>
            ) : (
              <div style={{ textAlign: 'center', padding: '8px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface)' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  Sign in to participate in the discussion.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
