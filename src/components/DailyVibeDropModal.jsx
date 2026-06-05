import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Flame, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './DailyVibeDropModal.css';

export default function DailyVibeDropModal({ onClose, onOpenSpot }) {
  const [spot, setSpot] = useState(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    async function fetchSpot() {
      try {
        const { data, error } = await supabase
          .from('spots')
          .select('*')
          .eq('status', 'approved');

        if (error) throw error;
        if (data && data.length > 0) {
          const randIdx = Math.floor(Math.random() * data.length);
          setSpot(data[randIdx]);
        }
      } catch (err) {
        console.error('Error fetching recommended spot:', err);
      }
    }
    fetchSpot();
  }, []);

  useEffect(() => {
    if (!spot) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Draw Cover
    const gradient = ctx.createLinearGradient(0, 0, 340, 480);
    gradient.addColorStop(0, '#6C8C74'); // Spota accent color
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
    ctx.fillText('your curated spot!', 170, 280);

    ctx.font = "40px 'Outfit', sans-serif";
    ctx.fillText('💎', 170, 160);
  }, [spot]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Support both mouse and touch events
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
    
    // Check every 40th pixel to keep performance high
    for (let i = 0; i < pixels.length; i += 40) {
      if (pixels[i + 3] === 0) {
        transparent++;
      }
    }

    const totalCheck = pixels.length / 40;
    const ratio = transparent / totalCheck;

    if (ratio > 0.55 && !isRevealed) {
      setIsRevealed(true);
      ctx.clearRect(0, 0, 340, 480);
    }
  };

  const handleOpenCuratedSpot = () => {
    if (spot && onOpenSpot) {
      onOpenSpot(spot);
      onClose();
    }
  };

  return (
    <div className="vibe-drop-backdrop">
      <div className="vibe-drop-content glass-panel animate-fade-in">
        <button className="vibe-drop-close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="scratchcard-container">
          {/* Revealed Spot Content */}
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
                <p className="revealed-desc">"{spot.description || spot.vibe || 'No description'}"</p>
                
                {isRevealed && (
                  <button className="revealed-view-btn" onClick={handleOpenCuratedSpot}>
                    <MapPin size={16} />
                    Check Out Spot
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Interactive Scratch Canvas */}
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
      </div>
    </div>
  );
}
