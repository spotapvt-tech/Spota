import { useState } from 'react';
import { X, Copy, Check, QrCode } from 'lucide-react';
import './TripInviteModal.css';

export default function TripInviteModal({ inviteCode, tripName, onClose }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteLink = `${window.location.origin}/trips?join=${inviteCode}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="invite-modal-backdrop">
      <div className="invite-modal-content glass-panel animate-fade-in">
        <div className="invite-modal-header">
          <h3>Invite Collaborators</h3>
          <button className="invite-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="invite-modal-body">
          <p className="invite-subtitle">
            Invite friends to plan <strong>{tripName}</strong> with you. They'll be able to pin locations and vote in real-time!
          </p>

          {/* QR Code Container */}
          <div className="qr-container">
            <div className="qr-box">
              <QrCode size={120} strokeWidth={1.5} color="var(--color-text-primary)" />
              <div className="qr-center-logo">💎</div>
            </div>
            <span>Scan to Join Board</span>
          </div>

          {/* Invite Code Block */}
          <div className="invite-field-group">
            <label>Invite Code</label>
            <div className="invite-input-wrapper">
              <span className="code-display">{inviteCode}</span>
              <button 
                className={`copy-icon-btn ${copiedCode ? 'success' : ''}`}
                onClick={handleCopyCode}
                title="Copy Code"
              >
                {copiedCode ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          {/* Invite Link Block */}
          <div className="invite-field-group">
            <label>Direct Join Link</label>
            <div className="invite-input-wrapper link-wrapper">
              <span className="link-display">{inviteLink}</span>
              <button 
                className={`copy-icon-btn ${copiedLink ? 'success' : ''}`}
                onClick={handleCopyLink}
                title="Copy Link"
              >
                {copiedLink ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
