import { useCallback, useEffect, useState } from 'react';
import { Check, X, RefreshCw } from 'lucide-react';
import { listAttemptsForReview, getPhotoUrls, reviewAttempt } from '../lib/leaderboardService';
import './ExpeditionMode.css';

const CHECKS = [
  ['geofence', 'Reached endpoint', 35],
  ['route', 'On route', 20],
  ['photo', 'Summit photo', 20],
  ['movement', 'Movement (no vehicle)', 15],
  ['elevation', 'Altitude', 10]
];

function Attempt({ a, onDone }) {
  const [photos, setPhotos] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const b = a.verification_breakdown || {};

  useEffect(() => {
    getPhotoUrls(a.photo_paths || []).then(setPhotos);
  }, [a.photo_paths]);

  const decide = async (decision) => {
    setBusy(true);
    setError(null);
    try {
      const res = await reviewAttempt(a.id, decision, note);
      onDone(a.id, res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <article className="review-card glass-panel" data-testid="review-card">
      <header>
        <div>
          <strong>{a.adventures?.name}</strong>
          <span>@{a.profiles?.username || 'unknown'} · {new Date(a.submitted_at).toLocaleString('en-IN')}</span>
        </div>
        <span className="review-score">{a.verification_score ?? '–'}<small>/100</small></span>
      </header>

      <ul className="review-checks">
        {CHECKS.map(([key, label, max]) => {
          const s = b[key]?.score ?? 0;
          return (
            <li key={key} className={s >= max ? 'ok' : s > 0 ? 'partial' : 'fail'}>
              <span>{label}</span><span>{s}/{max}</span>
            </li>
          );
        })}
      </ul>

      <p className="review-meta">
        {a.track_point_count} GPS points
        {b.movement?.fast_seconds > 0 && ` · ${b.movement.fast_seconds}s at vehicle speed`}
        {b.movement?.jump && ' · location jump'}
        {a.mock_point_count > 0 && <strong className="review-flag"> · {a.mock_point_count} mock-location fixes</strong>}
        {a.appeal_used && ' · appealed'}
        {a.is_guided && ' · guided'}
      </p>
      {b.attestation && (
        <p className="review-meta review-vouch">
          Vouched by @{b.attestation.by} ({b.attestation.role}) · +{b.attestation.score}
          {b.attestation.flags?.co_tracked && ' · they recorded the same trek'}
        </p>
      )}

      {photos.length > 0 && (
        <div className="review-photos">{photos.map((u) => <img key={u} src={u} alt="Summit" />)}</div>
      )}

      <input className="review-note" placeholder="Note to trekker (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="expedition-hint">{error}</p>}
      <div className="review-actions">
        <button className="review-approve" disabled={busy} onClick={() => decide('verified')}><Check size={16} /> Verify &amp; award AP</button>
        <button className="review-reject" disabled={busy} onClick={() => decide('rejected')}><X size={16} /> Reject</button>
      </div>
    </article>
  );
}

/** AdminView tab: pending expeditions (auto-check score 40–74, mock GPS, vehicle speed, appeals). */
export default function ExpeditionReviewPanel() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(0);

  const load = useCallback(() => {
    listAttemptsForReview()
      .then((list) => { setItems(list); setError(null); })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="review-panel">
      <div className="review-panel-head">
        <span>{items ? `${items.length} pending` : 'Loading…'}{done > 0 ? ` · ${done} reviewed` : ''}</span>
        <button onClick={load} aria-label="Refresh"><RefreshCw size={15} /></button>
      </div>
      {error && <p className="expedition-hint">{error}</p>}
      {items && items.length === 0 && <p className="expedition-hint">Nothing to review. 🎉</p>}
      {items?.map((a) => (
        <Attempt key={a.id} a={a} onDone={(id) => { setItems((l) => l.filter((x) => x.id !== id)); setDone((n) => n + 1); }} />
      ))}
    </div>
  );
}
