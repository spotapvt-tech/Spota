import { useState } from 'react';
import { X, Download, Loader2, CheckCircle } from 'lucide-react';
import { saveOfflineZone } from '../lib/offlineCache';
import { haversineDistance } from '../lib/utils';
import './OfflineModal.css';

export default function OfflineModal({ center, spots, onClose, onSuccess }) {
  const [zoneName, setZoneName] = useState(`Zone ${center[0].toFixed(3)}, ${center[1].toFixed(3)}`);
  const [radius, setRadius] = useState(10); // default 10 km
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDownload = async () => {
    if (!zoneName.trim()) {
      alert('Please enter a name for the offline zone.');
      return;
    }

    setIsDownloading(true);
    setProgress(10);

    try {
      // 1. Filter spots within the selected radius
      const targetSpots = spots.filter((spot) => {
        const distance = haversineDistance(center[0], center[1], spot.latitude, spot.longitude);
        return distance <= radius;
      });

      setProgress(30);

      // 2. Perform the download and caching
      const result = await saveOfflineZone(zoneName.trim(), center, radius, targetSpots);
      
      setProgress(70);
      
      // Artificial delay for UI smoothing
      setTimeout(() => {
        setProgress(100);
        setTimeout(() => {
          setIsDownloading(false);
          onSuccess(zoneName.trim(), result.spotsCount);
          onClose();
        }, 500);
      }, 500);

    } catch (err) {
      console.error('Failed to download offline zone:', err);
      alert('Failed to save offline zone. Please try again.');
      setIsDownloading(false);
      setProgress(0);
    }
  };

  return (
    <div className="offline-modal-backdrop">
      <div className="offline-modal-content glass-panel animate-fade-in">
        <div className="offline-modal-header">
          <h3>Save Zone Offline</h3>
          <button className="offline-close-btn" onClick={onClose} disabled={isDownloading}>
            <X size={20} />
          </button>
        </div>

        <div className="offline-modal-body">
          {!isDownloading ? (
            <>
              <p className="offline-desc">
                Download this area's spots and images. You can view them on the map even without cellular coverage.
              </p>

              <div className="offline-form-group">
                <label>Zone Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kasol Area"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  className="zen-input"
                />
              </div>

              <div className="offline-form-group">
                <label>Radius (centered on map)</label>
                <div className="radius-chips">
                  {[5, 10, 25].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`radius-chip ${radius === val ? 'active' : ''}`}
                      onClick={() => setRadius(val)}
                    >
                      {val} km
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" className="download-action-btn" onClick={handleDownload}>
                <Download size={18} />
                <span>Download Cache</span>
              </button>
            </>
          ) : (
            <div className="download-progress-container">
              {progress < 100 ? (
                <>
                  <Loader2 className="animate-spin download-spinner" size={32} />
                  <h4>Saving spots and images...</h4>
                  <p>Converting visuals for offline use</p>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                  <span className="progress-text">{progress}%</span>
                </>
              ) : (
                <div className="download-success-state">
                  <CheckCircle size={48} color="var(--color-accent)" className="success-icon" />
                  <h4>Area Caching Complete!</h4>
                  <p>The map zones are now safe offline.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
