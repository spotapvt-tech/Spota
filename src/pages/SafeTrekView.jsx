import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
  Shield, ShieldAlert, Check, MapPin, Clock, Phone, User, 
  Mail, ArrowLeft, History, Play, Square, Navigation, AlertTriangle, Trophy, X
} from 'lucide-react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { useSpotaGoogleMaps, DEFAULT_MAP_OPTIONS } from '../lib/googleMaps';
import './SafeTrekView.css';

import { 
  calculateTimeRemaining, 
  formatCountdown, 
  isNearDeadline, 
  saveActiveTrekLocal, 
  getActiveTrekLocal, 
  clearActiveTrekLocal 
} from '../lib/safeTrekTimer';

import CheckInModal from '../components/CheckInModal';
import { checkBadges } from '../lib/badgeEngine';

// Spota Expeditions (docs/spota-expeditions-implementation-plan.md)
import ExpeditionPicker from '../components/ExpeditionPicker';
import ExpeditionTracker from '../components/ExpeditionTracker';
import ExpeditionCompleteModal from '../components/ExpeditionCompleteModal';
import { fetchAdventures } from '../lib/adventureCatalog';
import { track, flushEvents, registerAnalyticsAutoFlush } from '../lib/analytics';
import {
  startRecording,
  stopRecording,
  discardRecording,
  resumeActiveRecording,
  isRecording
} from '../lib/trackRecorder';
import {
  addSummitPhoto,
  completeAttempt,
  syncPendingAttempts,
  registerAutoSync
} from '../lib/expeditionService';

export default function SafeTrekView() {
  const { isLoaded } = useSpotaGoogleMaps();
  const mapRef = useRef(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();

  // Active Trek State
  const [activeTrek, setActiveTrek] = useState(() => getActiveTrekLocal());
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isMuted] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  // Setup Form State
  const [destinationName, setDestinationName] = useState('');
  const [markerPosition, setMarkerPosition] = useState(null);
  const [mapCenter, setMapCenter] = useState([28.6139, 77.2090]); // Delhi Default
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyEmail, setEmergencyEmail] = useState('');
  const [intervalHours, setIntervalHours] = useState(4);
  const [isTestMode, setIsTestMode] = useState(false);

  // History State
  const [trekHistory, setTrekHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Expedition State
  const [adventuresState, setAdventures] = useState(null); // null = not loaded yet
  const [adventuresFromCache, setAdventuresFromCache] = useState(false);
  const [selectedAdventureId, setSelectedAdventureId] = useState('');
  const [isGuided, setIsGuided] = useState(false);
  const [lowPower, setLowPower] = useState(false); // battery saver: 60 s GPS sampling
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [expeditionResult, setExpeditionResult] = useState(null);
  const [expeditionError, setExpeditionError] = useState(null);

  const adventures = adventuresState ?? [];
  const adventuresLoading = adventuresState === null;

  // Audio warning reference
  const audioRef = useRef(null);

  // Fetch Trek History
  const fetchHistory = useCallback(async () => {
    if (!user || user.isGuest) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('safe_treks')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setTrekHistory(data || []);
    } catch (err) {
      console.error('Error fetching trek history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  // Load Active Trek from DB or Local Storage
  const loadActiveTrek = useCallback(async () => {
    if (!user) return;
    
    // Try local storage first
    let localTrek = getActiveTrekLocal();

    // Guest workflow bypasses database queries
    if (user.isGuest) {
      if (localTrek) {
        setActiveTrek(localTrek);
      } else {
        setActiveTrek(null);
      }
      return;
    }
    
    // Verify with DB to make sure it exists and is still active
    try {
      const { data, error } = await supabase
        .from('safe_treks')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'overdue'])
        .order('started_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const dbTrek = data[0];
        // Merge DB data with local test mode flag if applicable
        if (localTrek && localTrek.id === dbTrek.id) {
          const merged = {
            ...dbTrek,
            isTestMode: localTrek.isTestMode,
            expedition: localTrek.expedition // device-only: linked GPS recording
          };
          setActiveTrek(merged);
          saveActiveTrekLocal(merged);
        } else {
          setActiveTrek(dbTrek);
          saveActiveTrekLocal(dbTrek);
        }
      } else {
        // No active trek in DB
        setActiveTrek(null);
        clearActiveTrekLocal();
      }
    } catch (err) {
      console.error('Error loading active trek:', err);
      if (localTrek) {
        setActiveTrek(localTrek);
      }
    }
  }, [user]);

  // Auto trigger overdue in DB
  const handleTrekOverdue = useCallback(async () => {
    if (!activeTrek || activeTrek.status !== 'active') return;

    try {
      const updatedTrek = {
        ...activeTrek,
        status: 'overdue',
        // A missed check-in forfeits the Expedition safety bonus (BRD FR-4.1)
        expedition: activeTrek.expedition ? { ...activeTrek.expedition, missedCheckin: true } : activeTrek.expedition
      };
      setActiveTrek(updatedTrek);
      saveActiveTrekLocal(updatedTrek);

      if (!user.isGuest) {
        const { error } = await supabase
          .from('safe_treks')
          .update({ status: 'overdue' })
          .eq('id', activeTrek.id);

        if (error) throw error;
        fetchHistory();
      }
    } catch (err) {
      console.error('Error setting trek overdue:', err);
    }
  }, [activeTrek, user, fetchHistory]);

  // Initialize
  useEffect(() => {
    const timer = setTimeout(() => {
      loadActiveTrek();
      fetchHistory();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadActiveTrek, fetchHistory]);

  // Expeditions: load catalog, flush any offline-queued attempts, auto-sync on reconnect.
  // Keyed on the user id (not the user object, which AuthContext re-creates on every
  // session/profile refresh) so the catalog is fetched once per signed-in user.
  const expeditionUserId = user && !user.isGuest ? user.id : null;
  useEffect(() => {
    if (!expeditionUserId) return undefined;
    let cancelled = false;
    fetchAdventures().then(({ items, fromCache }) => {
      if (cancelled) return;
      setAdventures(items);
      setAdventuresFromCache(fromCache);
    });
    syncPendingAttempts();
    flushEvents();
    const cleanup = registerAutoSync();
    const cleanupAnalytics = registerAnalyticsAutoFlush();
    return () => {
      cancelled = true;
      cleanup();
      cleanupAnalytics();
    };
  }, [expeditionUserId]);

  // Expeditions: show the result banner (it sits above the form, usually off-screen after submit)
  // The banner only renders once the Safe Trek has ended (setup screen is back), so
  // scroll when both are true rather than when the result is first set.
  const expeditionResultRef = useRef(null);
  const showExpeditionResult = Boolean(expeditionResult) && !activeTrek;
  useEffect(() => {
    if (showExpeditionResult) expeditionResultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [showExpeditionResult]);

  // Expeditions: re-attach GPS after an app restart / kill mid-trek
  const expeditionAttemptId = activeTrek?.expedition?.clientAttemptId;
  useEffect(() => {
    if (!expeditionAttemptId || isRecording()) return;
    resumeActiveRecording().catch((err) => {
      setExpeditionError(`GPS recording could not resume: ${err.message}`);
    });
  }, [expeditionAttemptId]);

  // Arriving from /expeditions with { adventureId }: pre-select it once (adjusted at render time)
  const requestedAdventureId = routerLocation.state?.adventureId || null;
  const [appliedRequestedId, setAppliedRequestedId] = useState(null);
  if (requestedAdventureId && requestedAdventureId !== appliedRequestedId && !activeTrek && adventures.some((a) => a.id === requestedAdventureId)) {
    setAppliedRequestedId(requestedAdventureId);
    const adv = adventures.find((a) => a.id === requestedAdventureId);
    setSelectedAdventureId(adv.id);
    setDestinationName(adv.name);
    if (adv.endpointLat != null && adv.endpointLng != null) {
      setMarkerPosition([adv.endpointLat, adv.endpointLng]);
      setMapCenter([adv.endpointLat, adv.endpointLng]);
    }
  }

  const handleSelectAdventure = (id) => {
    setSelectedAdventureId(id);
    const adv = adventures.find((a) => a.id === id);
    if (!adv) return;
    setDestinationName(adv.name);
    if (adv.endpointLat != null && adv.endpointLng != null) {
      const coords = [adv.endpointLat, adv.endpointLng];
      setMarkerPosition(coords);
      setMapCenter(coords);
    }
  };

  // Pan the setup map whenever mapCenter changes
  useEffect(() => {
    if (mapCenter && mapRef.current) {
      mapRef.current.panTo({ lat: mapCenter[0], lng: mapCenter[1] });
    }
  }, [mapCenter]);

  // Map Centering Geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = [pos.coords.latitude, pos.coords.longitude];
          setMapCenter(coords);
          setMarkerPosition(prev => prev || coords);
        },
        (err) => console.log('Geolocation bypass:', err)
      );
    }
  }, []);

  // Countdown timer loop
  useEffect(() => {
    if (!activeTrek) return;

    const updateTimer = () => {
      let remaining;
      if (activeTrek.isTestMode) {
        // Test mode: 60 seconds from last check-in
        const lastCheck = new Date(activeTrek.last_checked_in).getTime();
        const diff = Date.now() - lastCheck;
        remaining = Math.max(0, 60 - Math.floor(diff / 1000));
      } else {
        remaining = calculateTimeRemaining(activeTrek.last_checked_in, activeTrek.check_in_interval_hours);
      }

      setTimeRemaining(remaining);

      // Trigger automatic DB overdue state if timer hits 0
      if (remaining <= 0 && activeTrek.status === 'active') {
        handleTrekOverdue();
      }
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [activeTrek, handleTrekOverdue]);

  // Alert and alarm sounds
  useEffect(() => {
    if (!activeTrek || timeRemaining <= 0) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    const testOrNear = activeTrek.isTestMode 
      ? timeRemaining <= 15  // Alert under 15 seconds in test mode
      : isNearDeadline(timeRemaining); // Alert under 30 minutes in normal mode

    if (testOrNear && !isMuted) {
      if (!audioRef.current) {
        // Create audio beep
        audioRef.current = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
        audioRef.current.loop = true;
      }
      // Simple alarm beep pattern or visual indicator
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  }, [timeRemaining, activeTrek, isMuted]);



  // Start Trek Handler
  const handleStartTrek = async (e) => {
    e.preventDefault();
    if (!destinationName.trim()) {
      alert('Please enter a destination name');
      return;
    }
    if (!emergencyName.trim()) {
      alert('Please enter an emergency contact name');
      return;
    }
    if (!emergencyPhone.trim() && !emergencyEmail.trim()) {
      alert('Please provide at least a phone number or email for your emergency contact');
      return;
    }

    setSubmitting(true);
    try {
      const lat = markerPosition ? markerPosition[0] : mapCenter[0];
      const lng = markerPosition ? markerPosition[1] : mapCenter[1];
      const nowStr = new Date().toISOString();

      const newTrekData = {
        user_id: user.id,
        destination_name: destinationName,
        destination_lat: lat,
        destination_lng: lng,
        emergency_contact_name: emergencyName,
        emergency_contact_phone: emergencyPhone || null,
        emergency_contact_email: emergencyEmail || null,
        check_in_interval_hours: isTestMode ? 1 : intervalHours, // DB gets 1 hour default if test mode
        last_checked_in: nowStr,
        status: 'active',
        started_at: nowStr
      };

      let activeData;

      if (user.isGuest) {
        activeData = {
          ...newTrekData,
          id: `guest_trek_${Math.random().toString(36).substr(2, 9)}`,
          isTestMode: isTestMode
        };
      } else {
        const { data, error } = await supabase
          .from('safe_treks')
          .insert(newTrekData)
          .select()
          .single();

        if (error) throw error;
        
        activeData = {
          ...data,
          isTestMode: isTestMode
        };
      }

      // Expeditions: start offline GPS recording linked to this Safe Trek
      const adventure = !user.isGuest ? adventures.find((a) => a.id === selectedAdventureId) : null;
      if (adventure) {
        try {
          const { clientAttemptId, sourceKind } = await startRecording({
            adventureId: adventure.id,
            adventureName: adventure.name,
            safeTrekId: typeof activeData.id === 'number' ? activeData.id : null,
            isGuided,
            lowPower
          });
          track('expedition_started', { adventure_id: adventure.id, source: sourceKind, guided: isGuided, low_power: lowPower });
          activeData = {
            ...activeData,
            expedition: {
              clientAttemptId,
              adventureId: adventure.id,
              adventureName: adventure.name,
              sourceKind,
              lowPower,
              missedCheckin: false
            }
          };
          setExpeditionError(null);
        } catch (err) {
          setExpeditionError(`Safe Trek started, but GPS recording could not start: ${err.message}`);
        }
      }

      setActiveTrek(activeData);
      saveActiveTrekLocal(activeData);
      
      // Reset form
      setDestinationName('');
      setEmergencyName('');
      setEmergencyPhone('');
      setEmergencyEmail('');
      setIsTestMode(false);
      setSelectedAdventureId('');
      setIsGuided(false);
      setLowPower(false);
      setExpeditionResult(null);

      if (!user.isGuest) {
        fetchHistory();
      }
    } catch (err) {
      console.error('Error starting trek:', err);
      alert('Failed to start trek: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Check In Handler
  const handleCheckIn = async () => {
    if (!activeTrek) return;

    try {
      const nowStr = new Date().toISOString();
      const updatedTrek = {
        ...activeTrek,
        last_checked_in: nowStr,
        status: 'active' // reset overdue if they check in
      };

      if (!user.isGuest) {
        const { error } = await supabase
          .from('safe_treks')
          .update({ 
            last_checked_in: nowStr,
            status: 'active'
          })
          .eq('id', activeTrek.id);

        if (error) throw error;
      }

      setActiveTrek(updatedTrek);
      saveActiveTrekLocal(updatedTrek);
      setShowAlertModal(false);
      alert("Check-in successful! Timer has been reset.");
      if (!user.isGuest) {
        fetchHistory();
      }
    } catch (err) {
      console.error('Error during check-in:', err);
      alert('Failed to check in: ' + err.message);
    }
  };

  // End Trek Handler
  const handleEndTrek = async () => {
    if (!activeTrek) return;
    // Expedition-linked trek: finish through the summit-photo flow instead
    if (activeTrek.expedition) {
      setShowCompleteModal(true);
      return;
    }
    if (!confirm('Are you sure you want to end this trek? Your emergency contacts will no longer be monitored.')) return;
    await finishSafeTrek();
  };

  // Expeditions: stop GPS → attach photo → submit (or queue offline) → end the Safe Trek
  const handleSubmitExpedition = async (photoFile) => {
    const exp = activeTrek?.expedition;
    if (!exp) return;
    if (isRecording()) await stopRecording();
    await addSummitPhoto(exp.clientAttemptId, photoFile);
    const result = await completeAttempt(exp.clientAttemptId, { checkinsOnTime: !exp.missedCheckin });
    track('expedition_completed', {
      adventure_id: exp.adventureId,
      delivery: result.status, // submitted now | queued offline
      server_status: result.attempt?.serverStatus || null,
      missed_checkin: Boolean(exp.missedCheckin)
    });
    detachExpedition();
    setShowCompleteModal(false);
    setExpeditionResult({
      name: exp.adventureName,
      status: result.status,
      serverStatus: result.attempt?.serverStatus || null,
      awardedAp: result.attempt?.awardedAp ?? null,
      error: result.error || null
    });
    await finishSafeTrek({ silent: true });
  };

  const handleDiscardExpedition = async () => {
    await discardRecording();
    track('expedition_discarded', { adventure_id: activeTrek?.expedition?.adventureId || null });
    detachExpedition();
    setShowCompleteModal(false);
    await finishSafeTrek({ silent: true });
  };

  // The expedition is handled (submitted/queued/discarded) even if ending the
  // Safe Trek row fails (e.g. offline), so unlink it to avoid a double submit.
  const detachExpedition = () => {
    setActiveTrek((prev) => {
      if (!prev) return prev;
      const next = { ...prev, expedition: null };
      saveActiveTrekLocal(next);
      return next;
    });
  };

  const finishSafeTrek = async ({ silent = false } = {}) => {
    try {
      if (!user.isGuest) {
        const { error } = await supabase
          .from('safe_treks')
          .update({ status: 'completed' })
          .eq('id', activeTrek.id);

        if (error) throw error;
      }

      const count = Number(localStorage.getItem('spota_completed_treks_count') || '0');
      localStorage.setItem('spota_completed_treks_count', String(count + 1));

      setActiveTrek(null);
      clearActiveTrekLocal();
      if (!silent) alert('Trek ended safely. Emergency mode deactivated.');
      if (!user.isGuest) {
        fetchHistory();
      }

      // Trigger badge check
      setTimeout(() => {
        if (user) {
          checkBadges(user);
        }
      }, 600);
    } catch (err) {
      console.error('Error ending trek:', err);
      alert('Failed to end trek: ' + err.message);
    }
  };

  // Map click helper — place the destination marker
  const handleMapClick = (e) => {
    setMarkerPosition([e.latLng.lat(), e.latLng.lng()]);
  };

  // Use current browser location
  const useCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = [pos.coords.latitude, pos.coords.longitude];
          setMapCenter(coords);
          setMarkerPosition(coords);
        },
        (err) => alert('Unable to retrieve location: ' + err.message)
      );
    }
  };

  // Circular progress calculations
  const totalDurationSeconds = activeTrek 
    ? (activeTrek.isTestMode ? 60 : activeTrek.check_in_interval_hours * 3600)
    : 3600;
  const progressRatio = activeTrek ? (timeRemaining / totalDurationSeconds) : 1;
  const strokeDashoffset = 502.65 - (progressRatio * 502.65);
  
  const isLowTime = activeTrek 
    ? (activeTrek.isTestMode ? timeRemaining <= 15 : isNearDeadline(timeRemaining))
    : false;

  const isOverdue = activeTrek ? activeTrek.status === 'overdue' : false;

  return (
    <div className="safe-trek-container animate-fade-in">
      {/* Header */}
      <div className="safe-trek-header">
        <button className="back-btn-circle" onClick={() => navigate('/profile')} title="Back to Profile">
          <ArrowLeft size={20} />
        </button>
        <div className="header-title-wrapper">
          <Shield className="shield-icon-active" size={24} />
          <h1>Safe Trek Mode</h1>
        </div>
      </div>

      {activeTrek ? (
        /* ACTIVE TREK COUNTDOWN STATE */
        <div className="active-trek-panel glass-panel">
          <div className={`countdown-wrapper ${isOverdue ? 'overdue' : isLowTime ? 'warning' : ''}`}>
            {/* SVG Radial Countdown */}
            <svg className="progress-ring" width="200" height="200">
              <circle
                className="progress-ring-bg"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="8"
                fill="transparent"
                r="80"
                cx="100"
                cy="100"
              />
              <circle
                className="progress-ring-fill"
                stroke={isOverdue ? '#FF6A4D' : isLowTime ? '#f4a261' : 'var(--color-accent)'}
                strokeWidth="8"
                fill="transparent"
                r="80"
                cx="100"
                cy="100"
                style={{
                  strokeDasharray: '502.65',
                  strokeDashoffset: strokeDashoffset,
                  transition: 'stroke-dashoffset 1s linear'
                }}
              />
            </svg>

            <div className="countdown-time-box">
              <span className="countdown-title">
                {isOverdue ? 'OVERDUE' : 'CHECK-IN IN'}
              </span>
              <span className="countdown-time">
                {isOverdue ? '00:00:00' : formatCountdown(timeRemaining)}
              </span>
              {activeTrek.isTestMode && <span className="test-badge">TEST MODE</span>}
            </div>
          </div>

          {activeTrek.expedition && (
            <ExpeditionTracker
              clientAttemptId={activeTrek.expedition.clientAttemptId}
              adventureName={activeTrek.expedition.adventureName}
              sourceKind={activeTrek.expedition.sourceKind}
              lowPower={Boolean(activeTrek.expedition.lowPower)}
            />
          )}

          {expeditionError && (
            <div className="warning-banner-trek">
              <AlertTriangle size={18} />
              <span>{expeditionError}</span>
            </div>
          )}

          <div className="trek-details-card glass-panel">
            <h3>{activeTrek.destination_name}</h3>
            <div className="detail-row">
              <MapPin size={16} />
              <span>
                Coordinates: {activeTrek.destination_lat?.toFixed(5)}, {activeTrek.destination_lng?.toFixed(5)}
              </span>
            </div>
            <div className="detail-row">
              <Clock size={16} />
              <span>Interval: {activeTrek.isTestMode ? '1 min (Test)' : `${activeTrek.check_in_interval_hours} hrs`}</span>
            </div>
            <div className="detail-row">
              <User size={16} />
              <span>Contact: {activeTrek.emergency_contact_name}</span>
            </div>
            {(activeTrek.emergency_contact_phone || activeTrek.emergency_contact_email) && (
              <div className="detail-row">
                <Phone size={16} />
                <span>
                  {activeTrek.emergency_contact_phone || activeTrek.emergency_contact_email}
                </span>
              </div>
            )}
          </div>

          {isLowTime && !isOverdue && (
            <div className="warning-banner-trek animate-pulse">
              <AlertTriangle size={18} />
              <span>Trek is nearing check-in limit! Check in to reset.</span>
            </div>
          )}

          {isOverdue && (
            <div className="danger-banner-trek animate-pulse">
              <ShieldAlert size={18} />
              <span>Trek Overdue! Emergency contacts have been notified.</span>
            </div>
          )}

          <div className="trek-actions">
            <button className="check-in-btn-primary" onClick={handleCheckIn}>
              <Check size={20} />
              I'm Safe - Check In
            </button>

            <button className="end-trek-btn-secondary" onClick={handleEndTrek}>
              <Square size={16} />
              {activeTrek.expedition ? 'Complete Expedition' : 'End Trek Safely'}
            </button>
          </div>
        </div>
      ) : (
        /* SETUP MODE STATE */
        <div className="setup-trek-panel">
          {expeditionResult && (
            <div className="expedition-result glass-panel" role="status" ref={expeditionResultRef}>
              <Trophy size={18} />
              <span>
                {expeditionResult.status !== 'submitted'
                  ? <><strong>{expeditionResult.name}</strong> saved on this device. It submits automatically when you're back online.{expeditionResult.error ? ` (${expeditionResult.error})` : ''}</>
                  : expeditionResult.serverStatus === 'verified'
                    ? <><strong>{expeditionResult.name}</strong> verified! <strong>+{expeditionResult.awardedAp ?? 0} AP</strong>. <button type="button" className="expedition-result-link" onClick={() => navigate('/leaderboard')}>See your rank →</button></>
                    : expeditionResult.serverStatus === 'pending'
                      ? <><strong>{expeditionResult.name}</strong> is under review. Your Adventure Points are added once it's approved.</>
                      : expeditionResult.serverStatus === 'rejected'
                        ? <><strong>{expeditionResult.name}</strong> couldn't be verified (endpoint or photo didn't match). You can appeal once from your profile.</>
                        : <><strong>{expeditionResult.name}</strong> submitted for verification.</>}
              </span>
              <button type="button" aria-label="Dismiss" onClick={() => setExpeditionResult(null)}>
                <X size={16} />
              </button>
            </div>
          )}

          <form className="trek-form glass-panel" onSubmit={handleStartTrek}>
            <h2 className="section-title">Configure Safe Trek</h2>

            <ExpeditionPicker
              adventures={adventures}
              loading={adventuresLoading}
              fromCache={adventuresFromCache}
              selectedId={selectedAdventureId}
              onSelect={handleSelectAdventure}
              isGuided={isGuided}
              lowPower={lowPower}
              onLowPowerChange={setLowPower}
              onGuidedChange={setIsGuided}
              isGuest={Boolean(user?.isGuest)}
              onBrowse={() => navigate('/expeditions')}
            />

            <div className="form-group">
              <label>Destination Name</label>
              <div className="input-with-icon">
                <MapPin size={18} className="input-icon" />
                <input 
                  type="text" 
                  placeholder="e.g. Mount Marcy Summit" 
                  value={destinationName} 
                  onChange={(e) => setDestinationName(e.target.value)}
                  required 
                />
              </div>
            </div>

            {/* Leaflet Selection Map */}
            <div className="form-group">
              <div className="map-label-row">
                <label>Pin Destination on Map</label>
                <button type="button" className="location-helper-btn" onClick={useCurrentLocation}>
                  <Navigation size={14} />
                  Use Current Location
                </button>
              </div>
              <div className="setup-map-container">
                {isLoaded && (
                  <GoogleMap
                    mapContainerStyle={{ height: '200px', width: '100%', borderRadius: '12px' }}
                    center={{ lat: mapCenter[0], lng: mapCenter[1] }}
                    zoom={13}
                    options={DEFAULT_MAP_OPTIONS}
                    onClick={handleMapClick}
                    onLoad={(map) => { mapRef.current = map; }}
                  >
                    {markerPosition && (
                      <Marker position={{ lat: markerPosition[0], lng: markerPosition[1] }} />
                    )}
                  </GoogleMap>
                )}
              </div>
              {markerPosition && (
                <span className="coords-helper">
                  Selected: {markerPosition[0].toFixed(5)}, {markerPosition[1].toFixed(5)}
                </span>
              )}
            </div>

            <div className="form-group">
              <label>Check-in Interval</label>
              <div className="interval-selectors">
                {[2, 4, 6, 8].map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`interval-btn ${intervalHours === h && !isTestMode ? 'active' : ''}`}
                    onClick={() => { setIntervalHours(h); setIsTestMode(false); }}
                  >
                    {h} hrs
                  </button>
                ))}
                <button
                  type="button"
                  className={`interval-btn test-mode-btn ${isTestMode ? 'active' : ''}`}
                  onClick={() => setIsTestMode(true)}
                >
                  1 min (Test)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Emergency Contact Name</label>
              <div className="input-with-icon">
                <User size={18} className="input-icon" />
                <input 
                  type="text" 
                  placeholder="e.g. Jane Doe" 
                  value={emergencyName} 
                  onChange={(e) => setEmergencyName(e.target.value)}
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label>Emergency Contact Phone</label>
              <div className="input-with-icon">
                <Phone size={18} className="input-icon" />
                <input 
                  type="tel" 
                  placeholder="e.g. +1 555-0199" 
                  value={emergencyPhone} 
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Emergency Contact Email</label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input 
                  type="email" 
                  placeholder="e.g. jane@example.com" 
                  value={emergencyEmail} 
                  onChange={(e) => setEmergencyEmail(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="start-trek-submit" disabled={submitting}>
              <Play size={16} />
              {submitting ? 'Initializing...' : 'Start Safe Trek'}
            </button>
          </form>
        </div>
      )}

      {/* HISTORIC SHELF */}
      <div className="trek-history-section">
        <div className="history-header">
          <History size={18} />
          <h2>Trek Log History</h2>
        </div>

        {loadingHistory ? (
          <p className="loading-history-text">Loading past treks...</p>
        ) : trekHistory.length === 0 ? (
          <div className="empty-history-card glass-panel">
            <Shield size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <p>No past treks logged yet</p>
          </div>
        ) : (
          <div className="history-list">
            {trekHistory.map((trek) => {
              const dateStr = new Date(trek.started_at).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div key={trek.id} className="history-item glass-panel">
                  <div className="history-info">
                    <h4>{trek.destination_name}</h4>
                    <span className="history-date">{dateStr}</span>
                    <span className="history-details">
                      Interval: {trek.check_in_interval_hours} hrs · Contact: {trek.emergency_contact_name}
                    </span>
                  </div>
                  <span className={`status-badge ${trek.status}`}>
                    {trek.status.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alert modal when user is in the view and countdown requires focus */}
      {showAlertModal && (
        <CheckInModal
          onCheckIn={handleCheckIn}
          onClose={() => setShowAlertModal(false)}
          timeRemainingStr={formatCountdown(timeRemaining)}
          isOverdue={isOverdue}
        />
      )}

      {showCompleteModal && activeTrek?.expedition && (
        <ExpeditionCompleteModal
          adventureName={activeTrek.expedition.adventureName}
          onSubmit={handleSubmitExpedition}
          onDiscard={handleDiscardExpedition}
          onCancel={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}
