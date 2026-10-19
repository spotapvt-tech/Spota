import { useEffect, useRef, useState } from 'react';
import { MapPin, Camera, Send } from 'lucide-react';
import { INDIA_STATES } from '../lib/indiaStates';
import { extractExifMeta } from '../lib/exifUtils';
import { submitRoute, validateRoute, listMyRouteSubmissions } from '../lib/communityService';
import { track } from '../lib/analytics';
import './ExpeditionMode.css';

const EMPTY = {
  name: '', state: '', region: '', grade: '2', distanceKm: '', gainM: '', maxAltM: '', days: '1',
  endLat: '', endLng: '', startLat: '', startLng: '', notes: ''
};
const STATUS = { pending: 'Under review', approved: 'Added to catalog', rejected: 'Not added' };
const fix = (n) => (Math.round(n * 1e5) / 1e5).toString();

/** Trekkers propose a new adventure; an admin approves it into the catalog. */
export default function SuggestRouteForm({ userId }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);
  const [mine, setMine] = useState([]);
  const photoRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    listMyRouteSubmissions(userId).then((l) => { if (alive) setMine(l); }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setSent(null); };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('Location is not available on this device'); return; }
    setLocBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((x) => ({ ...x, endLat: fix(pos.coords.latitude), endLng: fix(pos.coords.longitude) }));
        setLocBusy(false);
      },
      () => { setError('Could not get your location. Enter it manually.'); setLocBusy(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const fromPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    const meta = await extractExifMeta(file).catch(() => null);
    if (meta?.lat != null && meta?.lng != null) {
      setF((x) => ({ ...x, endLat: fix(meta.lat), endLng: fix(meta.lng) }));
    } else {
      setError('That photo has no location. Turn on camera location, or enter it manually.');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateRoute(f);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const row = await submitRoute(f);
      track('route_submitted', { state: f.state, grade: Number(f.grade) });
      setMine((l) => [row, ...l]);
      setSent(f.name.trim());
      setF(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!userId) return <p className="lb-empty">Sign in to suggest a route.</p>;

  return (
    <div className="route-wrap">
      <form className="route-form glass-panel" onSubmit={submit} data-testid="route-form">
        <p className="lb-intro">Know a trek that's missing? Suggest it. Once an admin checks it, anyone can earn AP on it.</p>

        <label>Route name<input value={f.name} onChange={set('name')} maxLength={80} placeholder="e.g. Prashar Lake" /></label>
        <div className="route-row">
          <label>State
            <select value={f.state} onChange={set('state')}>
              <option value="">Select</option>
              {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Region / valley<input value={f.region} onChange={set('region')} maxLength={60} placeholder="e.g. Kullu" /></label>
        </div>
        <div className="route-row route-row-4">
          <label>Grade
            <select value={f.grade} onChange={set('grade')}>
              {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>G{g}</option>)}
            </select>
          </label>
          <label>Distance (km)<input inputMode="decimal" value={f.distanceKm} onChange={set('distanceKm')} /></label>
          <label>Climb (m)<input inputMode="numeric" value={f.gainM} onChange={set('gainM')} /></label>
          <label>Max alt (m)<input inputMode="numeric" value={f.maxAltM} onChange={set('maxAltM')} /></label>
        </div>
        <label className="route-days">Typical days<input inputMode="numeric" value={f.days} onChange={set('days')} /></label>

        <fieldset className="route-loc">
          <legend><MapPin size={13} /> Summit / endpoint location</legend>
          <div className="route-row">
            <label>Latitude<input inputMode="decimal" value={f.endLat} onChange={set('endLat')} placeholder="32.2600" /></label>
            <label>Longitude<input inputMode="decimal" value={f.endLng} onChange={set('endLng')} placeholder="76.3537" /></label>
          </div>
          <div className="route-loc-actions">
            <button type="button" onClick={useMyLocation} disabled={locBusy}><MapPin size={14} /> {locBusy ? 'Locating…' : "I'm here now"}</button>
            <button type="button" onClick={() => photoRef.current?.click()}><Camera size={14} /> From a summit photo</button>
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={fromPhoto} />
          </div>
        </fieldset>

        <label>Notes for the reviewer<textarea value={f.notes} onChange={set('notes')} maxLength={1000} rows={3} placeholder="Trailhead, season, permits…" /></label>

        {error && <p className="expedition-hint">{error}</p>}
        {sent && <p className="route-sent">“{sent}” sent for review. You'll see the result below.</p>}
        <button type="submit" className="exp-start" disabled={busy}><Send size={14} /> {busy ? 'Sending…' : 'Submit route'}</button>
      </form>

      {mine.length > 0 && (
        <div className="route-mine glass-panel">
          <span className="expedition-profile-label">Your suggestions</span>
          {mine.map((r) => (
            <div key={r.id} className="expedition-attempt-row">
              <div>
                <strong>{r.name}</strong>
                <span>{r.terrain_region} · {r.state} · G{r.grade}</span>
                {r.review_note && <span>“{r.review_note}”</span>}
              </div>
              <span className={`expedition-status status-${r.status === 'approved' ? 'verified' : r.status}`}>{STATUS[r.status] || r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
