import { useEffect, useState } from 'react';
import { getExpeditionStats } from '../lib/leaderboardService';
import './ExpeditionMode.css';

const CHECK_LABEL = {
  geofence: 'Reached endpoint',
  route: 'On route',
  photo: 'Summit photo',
  movement: 'Movement',
  elevation: 'Altitude'
};

function Stat({ label, value, hint }) {
  return (
    <div className="xstat">
      <span className="xstat-val">{value ?? '–'}</span>
      <span className="xstat-lbl">{label}</span>
      {hint && <span className="xstat-hint">{hint}</span>}
    </div>
  );
}

/**
 * Admin: beta tuning view. What share of attempts verify on their own, which
 * check fails most, review-queue health, and the start → verified funnel.
 */
export default function ExpeditionStatsPanel() {
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    getExpeditionStats(days)
      .then((data) => { if (!cancelled) setState({ loading: false, data }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message }); });
    return () => { cancelled = true; };
  }, [days]);

  const d = state.data;
  const checks = Object.entries(d?.check_pass_pct || {}).sort((a, b) => a[1] - b[1]);
  const f = d?.funnel || {};
  const pct = (n, of) => (of ? `${Math.round((100 * n) / of)}%` : '–');

  return (
    <section className="xstats glass-panel" data-testid="expedition-stats">
      <header className="xstats-head">
        <strong>Beta health</strong>
        <div className="lb-window xstats-window">
          {[7, 30, 90].map((n) => (
            <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>{n}d</button>
          ))}
        </div>
      </header>

      {state.loading && <p className="expedition-hint">Loading…</p>}
      {state.error && <p className="expedition-hint">{state.error}</p>}

      {d && (
        <>
          <div className="xstat-grid">
            <Stat label="attempts" value={d.attempts} hint={`${d.engagement?.trekkers ?? 0} trekkers`} />
            <Stat label="auto-verified" value={d.auto_verified_pct != null ? `${d.auto_verified_pct}%` : '–'} hint="target > 70%" />
            <Stat label="pending now" value={d.review?.pending_now} hint={d.review?.oldest_pending_hours != null ? `oldest ${d.review.oldest_pending_hours} h` : 'queue empty'} />
            <Stat label="avg review" value={d.review?.avg_review_hours != null ? `${d.review.avg_review_hours} h` : '–'} hint="SLA < 48 h" />
          </div>

          <div className="xstats-block">
            <span className="expedition-profile-label">Funnel</span>
            <div className="xfunnel">
              <span>Started <strong>{f.started}</strong></span>
              <span>→ Completed <strong>{f.completed}</strong> <em>{pct(f.completed, f.started)}</em></span>
              <span>→ Submitted <strong>{f.submitted}</strong></span>
              <span>→ Verified <strong>{f.verified}</strong> <em>{pct(f.verified, f.submitted)}</em></span>
            </div>
          </div>

          <div className="xstats-block">
            <span className="expedition-profile-label">Check pass rate (weakest first)</span>
            {checks.length === 0 && <p className="expedition-hint">No judged attempts yet.</p>}
            {checks.map(([k, v]) => (
              <div key={k} className="xbar">
                <span>{CHECK_LABEL[k] || k}</span>
                <div className="xbar-track"><span style={{ width: `${Math.min(100, v)}%` }} className={v < 60 ? 'low' : v < 85 ? 'mid' : ''} /></div>
                <span className="xbar-val">{v}%</span>
              </div>
            ))}
          </div>

          <div className="xstats-block xstats-row">
            <span>Scores: <strong>{d.score_buckets?.auto_75_100}</strong> auto · <strong>{d.score_buckets?.review_40_74}</strong> review · <strong>{d.score_buckets?.rejected_0_39}</strong> rejected</span>
            <span>Flags: <strong>{d.flags?.vehicle_or_jump}</strong> vehicle/jump · <strong>{d.flags?.mock_location}</strong> mock GPS</span>
            <span>Reviews: <strong>{d.review?.approved_after_review}</strong>/<strong>{d.review?.reviewed}</strong> approved · <strong>{d.review?.appeals}</strong> appeals</span>
            <span>Engagement: <strong>{d.engagement?.leaderboard_views}</strong> board views · <strong>{d.engagement?.rank_shares}</strong> shares · <strong>{d.engagement?.tier_ups}</strong> tier-ups · <strong>{d.engagement?.opt_outs}</strong> opt-outs</span>
          </div>

          {d.top_adventures?.length > 0 && (
            <div className="xstats-block">
              <span className="expedition-profile-label">By adventure</span>
              {d.top_adventures.map((a) => (
                <div key={a.name} className="xadv">
                  <span>{a.name}</span>
                  <span>{a.verified}/{a.attempts} verified · avg {a.avg_score ?? '–'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
