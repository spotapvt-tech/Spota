import { useEffect, useRef } from 'react';
import { X, Download, Sparkles } from 'lucide-react';
import { drawTripRecapCanvas } from '../lib/recapGenerator';
import './TripRecapModal.css';

export default function TripRecapModal({ trip, tripSpots, members, votes, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && trip) {
      drawTripRecapCanvas(canvasRef.current, { trip, tripSpots, members, votes });
    }
  }, [trip, tripSpots, members, votes]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spota_${trip.name.toLowerCase().replace(/\s+/g, '_')}_wrapped.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="recap-modal-backdrop" onClick={onClose}>
      <div className="recap-modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="recap-modal-header">
          <div className="title-row">
            <Sparkles size={18} color="#DDA15E" className="animate-pulse" />
            <h3>Trip Wrapped</h3>
          </div>
          <button className="recap-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="recap-modal-body">
          <p className="recap-desc">Export your trip's analytics card styled for Instagram and TikTok Stories.</p>
          
          {/* Scrollable Canvas Preview Container */}
          <div className="recap-preview-box">
            <canvas 
              ref={canvasRef} 
              width={1080} 
              height={1920} 
              className="recap-preview-canvas"
            />
          </div>

          <button className="recap-download-btn" onClick={handleDownload}>
            <Download size={18} />
            <span>Download Story Card</span>
          </button>
        </div>
      </div>
    </div>
  );
}
