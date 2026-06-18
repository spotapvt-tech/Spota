import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import './FrictionlessCheckIn.css';

// Helper: Haversine distance in meters
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function FrictionlessCheckIn({ spot, userId, onCheckInComplete }) {
  const [hasCheckedIn, setHasCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  const startPassiveBackgroundAudit = async (checkinId, spotLat, spotLng) => {
    let dwellCount = 0;
    
    // Passively track position every 30 seconds
    const interval = setInterval(() => {
      if (!navigator.geolocation) {
        clearInterval(interval);
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const dist = getDistance(pos.coords.latitude, pos.coords.longitude, spotLat, spotLng);
          
          if (dist <= 150) {
            dwellCount += 30; // user stayed inside geofence
          }
          
          // Verify check-in if they stay for 3 minutes (180 seconds)
          if (dwellCount >= 180) {
            clearInterval(interval);
            const { error } = await supabase
              .from('spot_checkins')
              .update({ 
                status: 'verified', 
                dwell_time_seconds: dwellCount 
              })
              .eq('id', checkinId);
              
            if (!error) {
              console.log(`Check-in ${checkinId} successfully verified passively.`);
            }
          }
        },
        () => {
          clearInterval(interval);
        },
        { enableHighAccuracy: true }
      );
    }, 30000);

    // Stop background check after 4 minutes maximum to prevent battery drain
    setTimeout(() => {
      clearInterval(interval);
    }, 240000);
  };

  const handleOneTapCheckIn = async () => {
    if (loading || hasCheckedIn) return;
    setLoading(true);
    
    // 1. Optimistic Update: Instantly confirm check-in to user
    setHasCheckedIn(true);
    if (onCheckInComplete) onCheckInComplete();

    // 2. Perform background geo-collection and database log
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          const distance = getDistance(userLat, userLng, spot.latitude, spot.longitude);
          const isMockLocation = position.coords.mocked || false;

          // Silent background insert
          const { data, error } = await supabase
            .from('spot_checkins')
            .insert({
              spot_id: spot.id,
              user_id: userId,
              user_latitude: userLat,
              user_longitude: userLng,
              distance_meters: distance,
              mock_location_detected: isMockLocation,
              status: (distance <= 150 && !isMockLocation) ? 'pending' : 'flagged'
            })
            .select()
            .single();

          if (!error && data && data.status === 'pending') {
            // Start silent dwell tracking
            startPassiveBackgroundAudit(data.id, spot.latitude, spot.longitude);
          }
        },
        (geoError) => {
          console.warn('Silent check-in geolocate failed:', geoError);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
    setLoading(false);
  };

  return (
    <div className="frictionless-checkin-wrapper">
      <button 
        onClick={handleOneTapCheckIn} 
        disabled={hasCheckedIn || loading}
        className={`frictionless-checkin-btn ${hasCheckedIn ? 'checked-in' : ''}`}
      >
        <span className="btn-icon">📍</span>
        <span className="btn-text">
          {hasCheckedIn ? 'Checked In' : "I'm Here"}
        </span>
      </button>
    </div>
  );
}
