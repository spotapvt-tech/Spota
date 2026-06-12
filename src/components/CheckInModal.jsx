import React from 'react';
import { ShieldAlert, Check } from 'lucide-react';
import './CheckInModal.css';

export default function CheckInModal({ onCheckIn, onClose, timeRemainingStr, isOverdue }) {
  return (
    <div className="check-in-modal-overlay" onClick={onClose}>
      <div className="check-in-modal-content glass-panel animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className={`alert-icon-pulse ${isOverdue ? 'overdue-pulse' : ''}`}>
          <ShieldAlert size={40} color={isOverdue ? '#e07a5f' : '#f4a261'} />
        </div>
        
        <h2>{isOverdue ? "Trek Overdue!" : "Check-in Required"}</h2>
        <p>
          {isOverdue 
            ? "Your check-in window has closed. Please check in immediately to prevent alerting your emergency contact." 
            : "Please check in to let your emergency contact know you are safe."}
        </p>
        
        {!isOverdue && <div className="time-remaining-badge">{timeRemainingStr}</div>}
        
        <div className="modal-buttons">
          <button className="check-in-action-btn" onClick={onCheckIn}>
            <Check size={18} />
            I'm Safe - Check In
          </button>
          
          <button className="dismiss-btn" onClick={onClose}>
            Remind Me Later
          </button>
        </div>
      </div>
    </div>
  );
}
