import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GoogleMap, Circle } from '@react-google-maps/api';
import {
  Search, Camera, Sparkles, Download, WifiOff, MapPin, LocateFixed, List, Map as MapIcon,
  SlidersHorizontal, X, Navigation, ArrowUpRight, Flame, Clock, RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { haversineDistance, adjustOverlappingCoordinates } from '../lib/utils';
import useSheetDrag from '../hooks/useSheetDrag';
import { searchPlaces } from '../lib/geocoding';
import SpotDetailsModal from '../components/SpotDetailsModal';
import ARView from './ARView';
import AIVibeMatcher from '../components/AIVibeMatcher';
import OfflineModal from '../components/OfflineModal';
import useOfflineSpots from '../hooks/useOfflineSpots';
import { spotPopularity } from '../hooks/useSpots';
import { categories, getCategoryById } from '../lib/categoryConfig';
import { formatDistance } from '../lib/format';
import { useSpotaGoogleMaps, DEFAULT_MAP_OPTIONS } from '../lib/googleMaps';
import GemMarkerOverlay from '../components/map/GemMarkerOverlay';
import SpotMarker from '../components/ui/SpotMarker';
import CategoryGlyph, { CategoryIcon } from '../components/ui/CategoryGlyph';
import './MapView.css';

const RANGES = ['All', '1', '5', '10', '25'];

export default function MapView() {
  const { isLoaded, loadError } = useSpotaGoogleMaps();
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = location.state || {};

  const [spots, setSpots] = useState([]);
  const [fetchState, setFetchState] = useState('loading'); // loading | ready | error
  const [center, setCenter] = useState([28.6139, 77.2090]); // Default Delhi, India
  const [userLocation, setUserLocation] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | locating | granted | denied | unavailable
  const [selectedRange, setSelectedRange] = useState(incoming.focusSpotId ? 'All' : '5');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpot, setSelectedSpot] = useState(null); // full details modal
  const [activeSpotId, setActiveSpotId] = useState(incoming.focusSpotId ?? null); // preview sheet
  const [showAR, setShowAR] = useState(false);
  const [showAiMatcher, setShowAiMatcher] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { sheetRef: filterSheetRef, handleProps: filterHandleProps } = useSheetDrag(() => setShowFilters(false));
  const [selectedCategory, setSelectedCategory] = useState(incoming.category || 'all');
  const [viewMode, setViewMode] = useState('map'); // map | list

  // Place search — jump the map to an area, state, or place name (as
  // distinct from filtering the pins already on screen by title/tag below)
  const [placeResults, setPlaceResults] = useState([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [showPlaceDropdown, setShowPlaceDropdown] = useState(false);
  const placeAbortRef = useRef(null);
  const searchContainerRef = useRef(null);
  const mapRef = useRef(null);
  const focusAppliedRef = useRef(false);
  // A deep link ("Take me there" from Home) owns the initial camera; GPS
  // must not yank the map away from it.
  const skipAutoCenterRef = useRef(Boolean(incoming.focusSpotId));

  const { isOffline, offlineSpots, refreshCache } = useOfflineSpots();

  // Clear router state so a refresh / back doesn't re-apply the deep link.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const fetchSpots = useCallback(async () => {
    setFetchState('loading');
    try {
      const { data, error } = await supabase.from('spots').select('*').neq('status', 'deleted');
      if (error) throw error;
      setSpots(data || []);
      setFetchState('ready');
      if (data && data.length > 0 && !skipAutoCenterRef.current) {
        // Default center on the most recently added spot (until GPS answers)
        setCenter((c) => (c[0] === 28.6139 && c[1] === 77.2090 ? [data[data.length - 1].latitude, data[data.length - 1].longitude] : c));
      }
    } catch (error) {
      console.error('Error fetching map spots:', error);
      setFetchState('error');
    }
  }, []);

  const locate = useCallback((recenter = true) => {
    if (!('geolocation' in navigator)) { setGeoStatus('unavailable'); return; }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latLng = [position.coords.latitude, position.coords.longitude];
        setUserLocation(latLng);
        setGeoStatus('granted');
        if (recenter && !skipAutoCenterRef.current) setCenter(latLng);
      },
      (err) => setGeoStatus(err && err.code === 1 ? 'denied' : 'unavailable'),
      { timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  // Fetch spots + center on the user (the map is an explicit "where am I" surface)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!isOffline) fetchSpots();
      locate(true);
    }, 0);
    return () => clearTimeout(t);
  }, [isOffline, fetchSpots, locate]);

  // Center map on last offline spot if offline mode becomes active
  useEffect(() => {
    if (isOffline && offlineSpots.length > 0) {
      const t = setTimeout(() => {
        setCenter([offlineSpots[offlineSpots.length - 1].latitude, offlineSpots[offlineSpots.length - 1].longitude]);
      }, 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOffline, offlineSpots]);

  // Pan the map whenever `center` changes
  useEffect(() => {
    if (center && mapRef.current) {
      mapRef.current.panTo({ lat: center[0], lng: center[1] });
    }
  }, [center]);

  // Debounced place search — matches areas, states, cities, and named places
  useEffect(() => {
    if (searchQuery.trim().length < 3) return undefined;
    const t = setTimeout(async () => {
      if (placeAbortRef.current) placeAbortRef.current.abort();
      placeAbortRef.current = new AbortController();
      setIsSearchingPlaces(true);
      const results = await searchPlaces(searchQuery, placeAbortRef.current.signal);
      if (results !== null) {
        setPlaceResults(results || []);
        setShowPlaceDropdown(true);
      }
      setIsSearchingPlaces(false);
    }, 380);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Click outside the search bar closes the place dropdown
  useEffect(() => {
    const handler = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowPlaceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectPlace = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (isNaN(lat) || isNaN(lng)) return;
    setCenter([lat, lng]);
    setSelectedRange('All');
    if (mapRef.current) mapRef.current.setZoom(13);
    setSearchQuery('');
    setPlaceResults([]);
    setShowPlaceDropdown(false);
  };

  // Live reactions / shares from SpotDetailsModal
  useEffect(() => {
    const handleSpotUpdate = (e) => {
      const { id, reactions, share_count } = e.detail;
      const patch = (s) => (s && s.id === id
        ? { ...s, reactions: reactions !== undefined ? reactions : s.reactions, share_count: share_count !== undefined ? share_count : s.share_count }
        : s);
      setSpots((prev) => prev.map(patch));
      setSelectedSpot(patch);
    };
    window.addEventListener('spota_spot_updated', handleSpotUpdate);
    return () => window.removeEventListener('spota_spot_updated', handleSpotUpdate);
  }, []);

  // Reference point for range filtering (falls back to map centre when the
  // device is far away — e.g. browsing another state)
  const referenceCoords = useMemo(() => {
    let coords = userLocation || center;
    if (userLocation && center) {
      const d = haversineDistance(userLocation[0], userLocation[1], center[0], center[1]);
      if (d > 100) coords = center;
    }
    return coords;
  }, [userLocation, center]);

  const displaySpots = useMemo(
    () => adjustOverlappingCoordinates(isOffline ? offlineSpots : spots),
    [isOffline, offlineSpots, spots]
  );

  const filteredSpots = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const cleanQuery = query.replace(/#/g, '');
    return displaySpots
      .filter((spot) => spot.status !== 'deleted' && spot.status !== 'flagged')
      .map((spot) => ({
        ...spot,
        _km: referenceCoords ? haversineDistance(referenceCoords[0], referenceCoords[1], spot.latitude, spot.longitude) : null,
      }))
      .filter((spot) => selectedRange === 'All' || spot._km == null || spot._km <= Number(selectedRange))
      .filter((spot) => selectedCategory === 'all' || spot.category === selectedCategory)
      .filter((spot) => {
        if (!query) return true;
        const tagMatch = Array.isArray(spot.tags) && spot.tags.some((tag) => tag.toLowerCase().includes(cleanQuery));
        return (
          spot.title?.toLowerCase().includes(query) ||
          spot.description?.toLowerCase().includes(query) ||
          spot.category?.toLowerCase().includes(query) ||
          tagMatch
        );
      })
      .sort((a, b) => (a._km ?? 0) - (b._km ?? 0));
  }, [displaySpots, referenceCoords, selectedRange, selectedCategory, searchQuery]);

  // Only the single closest approved SPOTA within 300 m of the explorer gets the
  // "nearby" pulse: motion guides attention to one place, not every pin.
  const nearbySpotId = useMemo(() => {
    if (!userLocation) return null;
    let best = null;
    for (const s of filteredSpots) {
      if (s.status === 'pending') continue;
      const km = haversineDistance(userLocation[0], userLocation[1], s.latitude, s.longitude);
      if (km <= 0.3 && (!best || km < best.km)) best = { id: s.id, km };
    }
    return best ? best.id : null;
  }, [filteredSpots, userLocation]);

  const activeSpot = useMemo(() => {
    if (activeSpotId == null) return null;
    const s = displaySpots.find((x) => x.id === activeSpotId);
    if (!s) return null;
    return {
      ...s,
      _km: userLocation ? haversineDistance(userLocation[0], userLocation[1], s.latitude, s.longitude) : null,
    };
  }, [activeSpotId, displaySpots, userLocation]);

  // Deep link from Home ("Take me there"): centre on the spot once loaded.
  useEffect(() => {
    if (focusAppliedRef.current || activeSpotId == null) return;
    const s = displaySpots.find((x) => x.id === activeSpotId);
    if (!s) return;
    focusAppliedRef.current = true;
    const t = setTimeout(() => {
      setCenter([s.latitude, s.longitude]);
      if (mapRef.current) mapRef.current.setZoom(14);
    }, 0);
    return () => clearTimeout(t);
  }, [activeSpotId, displaySpots]);

  const selectOnMap = (spot) => {
    setActiveSpotId(spot.id);
    setViewMode('map');
    setCenter([spot.latitude, spot.longitude]);
  };

  const recenterOnMe = () => {
    if (userLocation) {
      setCenter([userLocation[0], userLocation[1]]);
      if (mapRef.current) mapRef.current.setZoom(14);
    } else {
      skipAutoCenterRef.current = false;
      locate(true);
    }
  };

  const mapUnavailable = Boolean(loadError) || (!isLoaded && !navigator.onLine);
  const effectiveView = mapUnavailable ? 'list' : viewMode;

  return (
    <div className={`explore ${effectiveView === 'list' ? 'is-list' : ''}`}>
      {/* ---------- Map canvas ---------- */}
      <div className="explore-map" aria-hidden={effectiveView === 'list'}>
        {!isLoaded && !loadError && <div className="explore-map__placeholder"><span className="sp-eyebrow">Loading terrain…</span></div>}
        {isLoaded && (
          <GoogleMap
            mapContainerClassName="full-screen-map"
            center={{ lat: center[0], lng: center[1] }}
            zoom={13}
            options={DEFAULT_MAP_OPTIONS}
            onLoad={(map) => { mapRef.current = map; }}
            onClick={() => setActiveSpotId(null)}
          >
            {userLocation && (
              <GemMarkerOverlay position={{ lat: userLocation[0], lng: userLocation[1] }} width={18} height={18} zIndex={5}>
                <div className="user-location-dot" title="You are here" />
              </GemMarkerOverlay>
            )}

            {selectedRange !== 'All' && referenceCoords && (
              <Circle
                center={{ lat: referenceCoords[0], lng: referenceCoords[1] }}
                radius={Number(selectedRange) * 1000}
                options={{
                  fillColor: '#C3D29F',
                  fillOpacity: 0.04,
                  strokeColor: '#C3D29F',
                  strokeOpacity: 0.45,
                  strokeWeight: 1.2,
                  clickable: false,
                }}
              />
            )}

            {filteredSpots.map((spot) => (
              <GemMarkerOverlay
                key={spot.id}
                position={{ lat: spot.latitude, lng: spot.longitude }}
                width={40}
                height={48}
                zIndex={spot.id === activeSpotId ? 20 : 1}
                onClick={(e) => { e?.stopPropagation?.(); setActiveSpotId(spot.id); }}
              >
                <SpotMarker
                  category={spot.category}
                  selected={spot.id === activeSpotId}
                  trending={spotPopularity(spot) >= 5}
                  nearby={spot.id === nearbySpotId}
                  pending={spot.status === 'pending'}
                  label={spot.title}
                />
              </GemMarkerOverlay>
            ))}
          </GoogleMap>
        )}
      </div>

      {/* ---------- Top controls ---------- */}
      <div className="explore-top">
        {isOffline && (
          <div className="explore-offline" role="status">
            <WifiOff size={13} /> Offline — showing downloaded zones
          </div>
        )}

        <div className="explore-search sp-glass" ref={searchContainerRef}>
          <Search size={18} className="explore-search__icon" aria-hidden="true" />
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Search places or SPOTAs"
            placeholder="Search a place, trail or #tag"
            className="explore-search__input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => placeResults.length > 0 && setShowPlaceDropdown(true)}
          />
          {searchQuery && (
            <button type="button" className="explore-search__clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
          <button type="button" className="explore-search__ai" onClick={() => setShowAiMatcher(true)} aria-label="Ask Spota AI for a match" title="Vibe match">
            <Sparkles size={17} />
          </button>

          {showPlaceDropdown && searchQuery.trim().length >= 3 && (placeResults.length > 0 || isSearchingPlaces) && (
            <div className="explore-dropdown sp-glass sp-glass--thick" role="listbox">
              {isSearchingPlaces ? (
                <div className="explore-dropdown__loading"><span className="explore-spinner" /> Searching places…</div>
              ) : (
                placeResults.map((item, idx) => {
                  const parts = (item.display_name || '').split(',');
                  return (
                    <button key={item.place_id || idx} className="explore-dropdown__row" onClick={() => handleSelectPlace(item)} role="option">
                      <MapPin size={15} />
                      <span>
                        <strong>{parts[0]}</strong>
                        {parts[1] && <small>{parts.slice(1, 3).join(', ')}</small>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="explore-chips sp-rail" role="toolbar" aria-label="Filter by category">
          <button
            className="sp-chip explore-filter-btn"
            onClick={() => setShowFilters(true)}
            aria-label="Distance filter"
          >
            <SlidersHorizontal size={14} />
            {selectedRange === 'All' ? 'Any distance' : `≤ ${selectedRange} km`}
          </button>
          <button className="sp-chip" aria-pressed={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="sp-chip"
              aria-pressed={selectedCategory === cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)}
              style={{ '--cat-color': cat.color }}
            >
              <span className="explore-chip-icon"><CategoryIcon category={cat.id} size={14} /></span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Side controls ---------- */}
      {effectiveView === 'map' && (
        <div className={`explore-fabs ${activeSpot ? 'is-raised' : ''}`}>
          <button className="explore-fab sp-glass" onClick={recenterOnMe} aria-label="Center on my location" title="My location">
            <LocateFixed size={20} className={geoStatus === 'locating' ? 'animate-pulse' : ''} />
          </button>
          <button className="explore-fab sp-glass" onClick={() => setShowAR(true)} aria-label="Open AR finder" title="AR finder">
            <Camera size={20} />
          </button>
          {!isOffline && (
            <button className="explore-fab sp-glass" onClick={() => setShowOfflineModal(true)} aria-label="Download this area for offline use" title="Save area offline">
              <Download size={20} />
            </button>
          )}
        </div>
      )}

      {/* ---------- Location denied hint ---------- */}
      {geoStatus === 'denied' && effectiveView === 'map' && !activeSpot && (
        <div className="explore-hint sp-glass" role="status">
          <LocateFixed size={14} /> Location is off — distances use the map centre. Enable it in device settings.
        </div>
      )}

      {/* ---------- List view ---------- */}
      {effectiveView === 'list' && (
        <section className="explore-list" aria-label="SPOTAs list">
          {mapUnavailable && (
            <div className="explore-list__notice"><WifiOff size={14} /> Map unavailable right now — showing the list instead.</div>
          )}
          {fetchState === 'loading' && !isOffline && filteredSpots.length === 0 ? (
            [0, 1, 2, 3].map((i) => <div key={i} className="sp-skeleton explore-list__skel" />)
          ) : fetchState === 'error' && !isOffline ? (
            <div className="sp-state">
              <div className="sp-state__icon"><WifiOff size={22} /></div>
              <h3>Couldn&apos;t load SPOTAs</h3>
              <p>Check your connection and try again.</p>
              <button className="sp-btn sp-btn--secondary sp-btn--sm" onClick={fetchSpots}><RefreshCw size={14} /> Retry</button>
            </div>
          ) : filteredSpots.length === 0 ? (
            <EmptyResults onReset={() => { setSelectedCategory('all'); setSelectedRange('All'); setSearchQuery(''); }} />
          ) : (
            <ul>
              {filteredSpots.map((spot) => (
                <li key={spot.id}>
                  <ListRow spot={spot} onOpen={() => setSelectedSpot(spot)} onMap={mapUnavailable ? null : () => selectOnMap(spot)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------- Bottom: preview sheet or results bar ---------- */}
      {effectiveView === 'map' && activeSpot ? (
        <SpotPreviewSheet
          spot={activeSpot}
          onClose={() => setActiveSpotId(null)}
          onOpen={() => setSelectedSpot(activeSpot)}
        />
      ) : (
        <div className="explore-bar sp-glass">
          <span className="explore-bar__count">
            {fetchState === 'loading' && !isOffline && spots.length === 0
              ? <span className="sp-mono">Scanning…</span>
              : <><strong className="sp-mono">{filteredSpots.length}</strong> {filteredSpots.length === 1 ? 'SPOTA' : 'SPOTAs'}{selectedRange !== 'All' ? ` within ${selectedRange} km` : ''}</>}
          </span>
          {!mapUnavailable && (
            <button className="explore-bar__toggle" onClick={() => setViewMode(effectiveView === 'map' ? 'list' : 'map')}>
              {effectiveView === 'map' ? <><List size={16} /> List</> : <><MapIcon size={16} /> Map</>}
            </button>
          )}
        </div>
      )}

      {/* Empty overlay on the map itself */}
      {effectiveView === 'map' && fetchState === 'ready' && filteredSpots.length === 0 && !activeSpot && (
        <div className="explore-empty-float sp-glass sp-glass--thick">
          <EmptyResults compact onReset={() => { setSelectedCategory('all'); setSelectedRange('All'); setSearchQuery(''); }} />
        </div>
      )}

      {/* ---------- Distance filter sheet ---------- */}
      {showFilters && (
        <div className="sp-sheet-backdrop" onClick={() => setShowFilters(false)}>
          <div className="sp-sheet sp-glass sp-glass--thick" ref={filterSheetRef} role="dialog" aria-label="Distance" onClick={(e) => e.stopPropagation()}>
            <div className="sp-sheet__grabber" {...filterHandleProps} />
            <div className="explore-sheet-head">
              <h3>How far will you go?</h3>
              <button className="sp-icon-btn" onClick={() => setShowFilters(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="explore-sheet-sub">Measured from {userLocation ? 'your location' : 'the map centre'}.</p>
            <div className="explore-seg" role="radiogroup" aria-label="Distance">
              {RANGES.map((r) => (
                <button key={r} role="radio" aria-checked={selectedRange === r} className={selectedRange === r ? 'is-on' : ''} onClick={() => setSelectedRange(r)}>
                  {r === 'All' ? 'Any' : `${r} km`}
                </button>
              ))}
            </div>
            <button className="sp-btn sp-btn--primary sp-btn--block" style={{ marginTop: 20 }} onClick={() => setShowFilters(false)}>
              Show {filteredSpots.length} {filteredSpots.length === 1 ? 'SPOTA' : 'SPOTAs'}
            </button>
          </div>
        </div>
      )}

      {selectedSpot && <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />}

      {showAiMatcher && (
        <AIVibeMatcher
          onClose={() => setShowAiMatcher(false)}
          onSelectSpot={(spot) => {
            setShowAiMatcher(false);
            setSelectedSpot(spot);
          }}
        />
      )}

      {showAR && (
        <ARView
          spots={displaySpots}
          userLocation={userLocation}
          onClose={() => setShowAR(false)}
          onSelectSpot={(spot) => {
            setShowAR(false);
            setSelectedSpot(spot);
          }}
        />
      )}

      {showOfflineModal && (
        <OfflineModal
          center={center}
          spots={spots}
          onClose={() => setShowOfflineModal(false)}
          onSuccess={() => refreshCache()}
        />
      )}
    </div>
  );
}

function directionsUrl(spot) {
  return `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}`;
}

function SpotPreviewSheet({ spot, onClose, onOpen }) {
  const { sheetRef, handleProps } = useSheetDrag(onClose);
  const cat = getCategoryById(spot.category);
  const hot = spotPopularity(spot) >= 5;
  const pending = spot.status === 'pending';
  return (
    <article className="explore-preview sp-glass sp-glass--thick" ref={sheetRef} aria-label={`${spot.title} preview`}>
      <div className="sp-sheet__grabber explore-preview__grabber" {...handleProps} />
      <button className="explore-preview__close" onClick={onClose} aria-label="Close preview"><X size={16} /></button>
      <button className="explore-preview__main" onClick={onOpen}>
        {spot.image_url
          ? <img src={spot.image_url} alt="" className="explore-preview__img" />
          : <span className="explore-preview__img explore-preview__img--empty"><CategoryIcon category={spot.category} size={28} /></span>}
        <span className="explore-preview__body">
          <span className="explore-preview__meta">
            <span style={{ color: cat.color }}><CategoryIcon category={spot.category} size={12} /> {cat.label}</span>
            {spot._km != null && <span className="sp-mono">{formatDistance(spot._km)} away</span>}
          </span>
          <strong className="explore-preview__title">{spot.title}</strong>
          {pending
            ? <span className="explore-preview__flag explore-preview__flag--pending"><Clock size={12} /> Awaiting community review</span>
            : hot
              ? <span className="explore-preview__flag"><Flame size={12} /> Getting lots of love</span>
              : spot.description
                ? <span className="explore-preview__desc">{spot.description}</span>
                : null}
        </span>
      </button>
      <div className="explore-preview__actions">
        <button className="sp-btn sp-btn--primary sp-btn--sm" onClick={onOpen}>
          View SPOTA <ArrowUpRight size={15} />
        </button>
        <a className="sp-btn sp-btn--secondary sp-btn--sm" href={directionsUrl(spot)} target="_blank" rel="noopener noreferrer">
          <Navigation size={15} /> Directions
        </a>
      </div>
    </article>
  );
}

function ListRow({ spot, onOpen, onMap }) {
  const cat = getCategoryById(spot.category);
  return (
    <div className="explore-row">
      <button className="explore-row__main" onClick={onOpen}>
        {spot.image_url
          ? <img src={spot.image_url} alt="" loading="lazy" className="explore-row__img" />
          : <CategoryGlyph category={spot.category} size={64} className="explore-row__img" />}
        <span className="explore-row__body">
          <span className="explore-row__cat" style={{ color: cat.color }}><CategoryIcon category={spot.category} size={12} /> {cat.label}</span>
          <strong>{spot.title}</strong>
          <span className="explore-row__desc">{spot.status === 'pending' ? 'Awaiting community review' : (spot.description || spot.address || '')}</span>
        </span>
      </button>
      <span className="explore-row__side">
        {spot._km != null && <span className="sp-mono">{formatDistance(spot._km)}</span>}
        {onMap && (
          <button className="sp-icon-btn sp-icon-btn--filled" onClick={onMap} aria-label={`Show ${spot.title} on map`}>
            <MapPin size={16} />
          </button>
        )}
      </span>
    </div>
  );
}

function EmptyResults({ onReset, compact = false }) {
  return (
    <div className={`sp-state ${compact ? 'explore-empty--compact' : ''}`}>
      {!compact && <div className="sp-state__icon"><Search size={22} /></div>}
      <h3>Nothing out here — yet</h3>
      <p>Widen the distance or clear filters. Or be the first to drop a SPOTA here.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="sp-btn sp-btn--secondary sp-btn--sm" onClick={onReset}>Clear filters</button>
        <Link className="sp-btn sp-btn--primary sp-btn--sm" to="/add">Drop one</Link>
      </div>
    </div>
  );
}
