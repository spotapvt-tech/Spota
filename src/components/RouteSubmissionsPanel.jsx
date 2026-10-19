import { useCallback, useEffect, useState } from 'react';
import { Check, X, RefreshCw, MapPin, BadgeCheck } from 'lucide-react';
import { parsePoint } from '../lib/adventureCatalog';
import {
  listPendingRouteSubmissions,
  reviewRouteSubmission,
  listAgenciesForAdmin,
  setAgencyPartner
} from '../lib/communityService';
import './ExpeditionMode.css';

function Submission({ s, onDone }) {
  const [note, setNote] = useState('');
  const [radius, setRadius] = useState(150);
  const [coordsOk, setCoordsOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const end = parsePoint(s.endpoint);

  const decide = async (decision) => {
    setBusy(true);
    setError(null);
    try {
      await reviewRouteSubmission(s.id, decision, { note, coordsVerified: coordsOk, radiusM: Number(radius) || 150 });
      onDone(s.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <article className="review-card glass-panel" data-testid="route-review-card">
      <header>
        <div>
          <strong>{s.name}</strong>
          <span>@{s.profiles?.username || 'unknown'} · {s.terrain_region} · {s.state}</span>
        </div>
        <span className="review-score">G{s.grade}</span>
      </header>
      <p className="review-meta">
        {s.distance_km} km · {s.elevation_gain_m} m climb · {s.max_altitude_m} m max · {s.typical_days} day{s.typical_days > 1 ? 's' : ''}
      </p>
      {end && (
        <a className="route-map-link" href={`https://www.google.com/maps?q=${end.lat},${end.lng}`} target="_blank" rel="noreferrer">
          <MapPin size={13} /> {end.lat.toFixed(5)}, {end.lng.toFixed(5)} (check on map)
        </a>
      )}
      {s.notes && <p className="review-meta">“{s.notes}”</p>}
      <div className="route-review-opts">
        <label>Endpoint radius (m)
          <input type="number" min={50} max={1000} step={25} value={radius} onChange={(e) => setRadius(e.target.value)} />
        </label>
        <label className="route-check">
          <input type="checkbox" checked={coordsOk} onChange={(e) => setCoordsOk(e.target.checked)} /> Coordinates checked
        </label>
      </div>
      <input className="review-note" placeholder="Note to submitter (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="expedition-hint">{error}</p>}
      <div className="review-actions">
        <button className="review-approve" disabled={busy} onClick={() => decide('approved')}><Check size={16} /> Add to catalog</button>
        <button className="review-reject" disabled={busy} onClick={() => decide('rejected')}><X size={16} /> Reject</button>
      </div>
    </article>
  );
}

/** Admin: user-submitted routes waiting for review. */
export function RouteSubmissionsPanel() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    listPendingRouteSubmissions()
      .then((l) => { setItems(l); setError(null); })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="review-panel">
      <div className="review-panel-head">
        <span>Route suggestions · {items ? `${items.length} pending` : 'Loading…'}</span>
        <button onClick={load} aria-label="Refresh routes"><RefreshCw size={15} /></button>
      </div>
      {error && <p className="expedition-hint">{error}</p>}
      {items && items.length === 0 && <p className="expedition-hint">No route suggestions waiting.</p>}
      {items?.map((s) => <Submission key={s.id} s={s} onDone={(id) => setItems((l) => l.filter((x) => x.id !== id))} />)}
    </div>
  );
}

/** Admin: grant "Spota partner" so an agency can run challenges and vouch as a guide. */
export function AgencyPartnersPanel() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    listAgenciesForAdmin()
      .then((l) => { if (alive) setItems(l); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);

  const toggle = async (a) => {
    setBusy(a.id);
    setError(null);
    try {
      await setAgencyPartner(a.id, !a.partner);
      setItems((l) => l.map((x) => (x.id === a.id ? { ...x, partner: !a.partner } : x)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="review-panel">
      <div className="review-panel-head"><span>Agency partners · {items ? items.filter((a) => a.partner).length : '…'} active</span></div>
      <p className="expedition-hint">Partners can run challenges and vouch for treks as a guide. Agencies verify themselves at checkout, so check them before granting.</p>
      {error && <p className="expedition-hint">{error}</p>}
      {items && items.length === 0 && <p className="expedition-hint">No agencies yet.</p>}
      {items?.map((a) => (
        <div key={a.id} className="partner-row glass-panel">
          <div>
            <strong>{a.company_name}</strong>
            <span>@{a.username}{a.website_url ? ` · ${a.website_url}` : ''}</span>
          </div>
          <button type="button" className={a.partner ? 'partner-on' : 'partner-off'} disabled={busy === a.id} onClick={() => toggle(a)}>
            <BadgeCheck size={14} /> {a.partner ? 'Partner' : 'Make partner'}
          </button>
        </div>
      ))}
    </div>
  );
}
