import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Mountain, MapPin, Eye, EyeOff, Check, UserCheck } from 'lucide-react';
import TierBadge from './TierBadge';
import { INDIA_STATES } from '../lib/indiaStates';
import {
  getMyExpeditionProfile,
  updateExpeditionSettings,
  appealAttempt,
  getLeaderboard
} from '../lib/leaderboardService';
import { track } from '../lib/analytics';
import { listVouches, canRequestVouch } from '../lib/communityService';
import { VouchRequestForm, VouchStatus, IncomingVouches } from './ExpeditionVouches';
import './ExpeditionMode.css';

const STATUS_LABEL = { verified: 'Verified', pending: 'Under review', rejected: 'Not verified', submitted: 'Checking' };

/** Profile section: tier + AP, ranks, home location, leaderboard visibility, recent expeditions. */
export default function ExpeditionProfileCard({ userId }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [rank, setRank] = useState(null);
  const [homeState, setHomeState] = useState('');
  const [homeRegion, setHomeRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [vouches, setVouches] = useState({ incoming: [], outgoing: [] });
  const [vouchFor, setVouchFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const { profile: p, attempts: a } = await getMyExpeditionProfile(userId);
      setProfile(p);
      setAttempts(a);
      setHomeState(p?.home_state || '');
      setHomeRegion(p?.home_region || '');
      const { data } = await getLeaderboard({ lens: 'home', level: 'global' });
      setRank(data?.me?.rank ?? null);
      // Vouches are a V2 feature: never block the card if they fail to load
      listVouches().then(setVouches).catch(() => {});
    } catch (err) {
      setError(err.message || 'Could not load expeditions');
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Defer so the first render isn't blocked; setState happens in the async callback.
    const t = setTimeout(() => { if (!cancelled) load(); }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [userId, load]);

  const saveHome = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateExpeditionSettings(userId, { home_country: 'IN', home_state: homeState || null, home_region: homeRegion.trim() || null });
      track('home_location_set', { state: homeState || null });
      setProfile((p) => ({ ...p, home_state: homeState || null, home_region: homeRegion.trim() || null }));
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async () => {
    const next = !profile.show_on_leaderboards;
    setProfile((p) => ({ ...p, show_on_leaderboards: next }));
    try {
      await updateExpeditionSettings(userId, { show_on_leaderboards: next });
      track(next ? 'leaderboard_opt_in' : 'leaderboard_opt_out');
    } catch (err) {
      setProfile((p) => ({ ...p, show_on_leaderboards: !next }));
      setError(err.message);
    }
  };

  const appeal = async (id) => {
    try {
      await appealAttempt(id);
      setAttempts((list) => list.map((a) => (a.id === id ? { ...a, status: 'pending', appeal_used: true } : a)));
    } catch (err) {
      setError(err.message);
    }
  };

  if (!profile) {
    return error ? <div className="expedition-profile glass-panel"><p className="expedition-hint">{error}</p></div> : null;
  }

  const homeDirty = (homeState || '') !== (profile.home_state || '') || homeRegion.trim() !== (profile.home_region || '');

  return (
    <section className="expedition-profile glass-panel" data-testid="expedition-profile">
      <div className="expedition-profile-head">
        <div>
          <span className="expedition-profile-label">Expeditions</span>
          <div className="expedition-profile-ap"><strong>{(profile.total_ap || 0).toLocaleString('en-IN')}</strong> AP</div>
        </div>
        {rank && <div className="expedition-profile-rank">#{rank}<span>global</span></div>}
      </div>

      <TierBadge tier={profile.tier} ap={profile.total_ap || 0} showProgress />

      <div className="expedition-profile-actions">
        <button type="button" onClick={() => navigate('/leaderboard')}><Trophy size={15} /> Leaderboards</button>
        <button type="button" onClick={() => navigate('/expeditions')}><Mountain size={15} /> Expeditions</button>
      </div>

      <div className="expedition-profile-home">
        <label htmlFor="home-state"><MapPin size={13} /> Home (for state &amp; region rankings)</label>
        <div className="expedition-profile-home-row">
          <select id="home-state" value={homeState} onChange={(e) => { setHomeState(e.target.value); setSaved(false); }}>
            <option value="">Select state</option>
            {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="text"
            placeholder="City / district"
            value={homeRegion}
            maxLength={60}
            onChange={(e) => { setHomeRegion(e.target.value); setSaved(false); }}
          />
        </div>
        {(homeDirty || saved) && (
          <button type="button" className="expedition-save-btn" disabled={saving || !homeDirty} onClick={saveHome}>
            {saved && !homeDirty ? <><Check size={14} /> Saved</> : saving ? 'Saving…' : 'Save home'}
          </button>
        )}
      </div>

      <button type="button" className="expedition-visibility" onClick={toggleVisibility} aria-pressed={profile.show_on_leaderboards}>
        {profile.show_on_leaderboards ? <Eye size={15} /> : <EyeOff size={15} />}
        {profile.show_on_leaderboards ? 'Shown on public leaderboards' : 'Hidden from public leaderboards'}
        <span className="expedition-visibility-hint">Only your username, tier, AP and trek names are public. GPS tracks stay private.</span>
      </button>

      <IncomingVouches
        items={vouches.incoming}
        onAnswered={(id, status) => setVouches((v) => ({ ...v, incoming: v.incoming.map((x) => (x.id === id ? { ...x, status } : x)) }))}
      />

      {attempts.length > 0 && (
        <div className="expedition-attempts">
          <span className="expedition-profile-label">Recent expeditions</span>
          {attempts.slice(0, 5).map((a) => (
            <div key={a.id} className="expedition-attempt-row">
              <div>
                <strong>{a.adventures?.name || 'Expedition'}</strong>
                <span>{new Date(a.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="expedition-attempt-right">
                {a.status === 'verified' && a.awarded_ap != null && <span className="expedition-attempt-ap">+{a.awarded_ap} AP</span>}
                <span className={`expedition-status status-${a.status}`}>{STATUS_LABEL[a.status] || a.status}</span>
                {a.status === 'rejected' && !a.appeal_used && (
                  <button type="button" className="expedition-appeal" onClick={() => appeal(a.id)}>Appeal</button>
                )}
                {canRequestVouch(a) && (
                  <button
                    type="button"
                    className="expedition-appeal"
                    aria-expanded={vouchFor === a.id}
                    onClick={() => setVouchFor((id) => (id === a.id ? null : a.id))}
                  >
                    <UserCheck size={13} /> Vouch
                  </button>
                )}
              </div>
              <VouchStatus items={vouches.outgoing.filter((v) => v.attempt_id === a.id)} />
              {vouchFor === a.id && (
                <VouchRequestForm
                  attemptId={a.id}
                  onSent={(row) => setVouches((v) => ({ ...v, outgoing: [{ ...row, bonus_applied: false }, ...v.outgoing] }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="expedition-hint">{error}</p>}
    </section>
  );
}
