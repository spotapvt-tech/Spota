import { useEffect, useState } from 'react';
import { Flag, Gift, Users, WifiOff, CheckCircle2 } from 'lucide-react';
import { getChallenges, joinChallenge, challengeScopeLabel } from '../lib/communityService';
import { track } from '../lib/analytics';
import './ExpeditionMode.css';

function daysLeft(ends) {
  const d = Math.ceil((new Date(ends).getTime() - Date.now()) / 86400000);
  return d <= 0 ? 'Ends today' : d === 1 ? '1 day left' : `${d} days left`;
}

function startsIn(starts) {
  const d = Math.ceil((new Date(starts).getTime() - Date.now()) / 86400000);
  return d > 0 ? `Starts in ${d} day${d > 1 ? 's' : ''}` : null;
}

/** Agency / Spota challenges: list, join/leave, progress from verified treks. */
export default function ChallengesList({ signedIn }) {
  const [items, setItems] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getChallenges().then(({ items: list, fromCache: cached }) => {
      if (!alive) return;
      setItems(list);
      setFromCache(cached);
    });
    return () => { alive = false; };
  }, []);

  const toggle = async (c) => {
    setBusy(c.id);
    setError(null);
    try {
      await joinChallenge(c.id, !c.joined);
      track(c.joined ? 'challenge_left' : 'challenge_joined', { challenge_id: c.id });
      setItems((list) => list.map((x) => (x.id === c.id
        ? { ...x, joined: !c.joined, participants: Math.max(0, x.participants + (c.joined ? -1 : 1)) }
        : x)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (items === null) return <p className="lb-empty">Loading…</p>;

  return (
    <div className="chal-list" data-testid="challenges">
      {fromCache && <p className="lb-note"><WifiOff size={13} /> Offline: showing saved challenges</p>}
      {items.length === 0 && (
        <div className="lb-empty"><Flag size={28} /><p>No live challenges right now. Partner agencies post them here.</p></div>
      )}
      {error && <p className="expedition-hint">{error}</p>}
      {items.map((c) => {
        const pct = Math.min(100, Math.round(((c.progress || 0) / c.required_count) * 100));
        const done = c.progress >= c.required_count;
        const upcoming = startsIn(c.starts_at);
        return (
          <article key={c.id} className="chal-card glass-panel" data-testid="challenge-card">
            <header className="chal-head">
              {c.agency_logo
                ? <img className="chal-logo" src={c.agency_logo} alt="" />
                : <span className="chal-logo chal-logo-fallback"><Flag size={16} /></span>}
              <div>
                <h3>{c.title}</h3>
                <span className="chal-by">by {c.agency} · {upcoming || daysLeft(c.ends_at)}</span>
              </div>
            </header>
            {c.description && <p className="chal-desc">{c.description}</p>}
            <div className="chal-meta">
              <span><Flag size={13} /> {c.required_count} × {challengeScopeLabel(c)}</span>
              <span><Users size={13} /> {c.participants} joined</span>
            </div>
            {c.reward && <p className="chal-reward"><Gift size={14} /> {c.reward}</p>}
            {c.joined && (
              <div className="chal-progress" aria-label={`Progress ${c.progress} of ${c.required_count}`}>
                <div className="chal-bar"><span style={{ width: `${pct}%` }} /></div>
                <span>{done ? <><CheckCircle2 size={13} /> Completed</> : `${c.progress} / ${c.required_count} verified`}</span>
              </div>
            )}
            {signedIn ? (
              <button
                type="button"
                className={c.joined ? 'chal-leave' : 'exp-start'}
                disabled={busy === c.id}
                onClick={() => toggle(c)}
              >
                {c.joined ? 'Leave' : 'Join challenge'}
              </button>
            ) : (
              <p className="lb-note">Sign in to join.</p>
            )}
          </article>
        );
      })}
      <p className="lb-note">Only verified treks completed during the challenge count. Each adventure counts once.</p>
    </div>
  );
}
