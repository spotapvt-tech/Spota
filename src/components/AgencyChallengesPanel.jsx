import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flag, Plus, Users, CheckCircle2 } from 'lucide-react';
import { fetchAdventures } from '../lib/adventureCatalog';
import { createChallenge, getMyChallenges, setChallengeActive, challengeScopeLabel } from '../lib/communityService';
import { track } from '../lib/analytics';
import './ExpeditionMode.css';
import '../pages/LeaderboardView.css';

const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const plusDays = (d) => new Date(Date.now() + 5.5 * 3600000 + d * 86400000).toISOString().slice(0, 10);
const EMPTY = () => ({
  title: '', description: '', reward: '', scopeType: 'region', scopeState: '', scopeRegion: '',
  adventureIds: [], minGrade: '1', requiredCount: '1', startsAt: today(), endsAt: plusDays(60)
});

/** AgencyDashboard tab: create challenges and see who joined / completed. */
export default function AgencyChallengesPanel({ agency }) {
  const isPartner = Boolean(agency?.partner_verified_at);
  const [catalog, setCatalog] = useState([]);
  const [mine, setMine] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getMyChallenges().then(setMine).catch((err) => { setMine([]); setError(err.message); });
  }, []);

  useEffect(() => {
    fetchAdventures().then(({ items }) => setCatalog(items || []));
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const states = useMemo(() => [...new Set(catalog.map((a) => a.state))].sort(), [catalog]);
  const regions = useMemo(() => [...new Set(catalog.map((a) => a.terrainRegion))].sort(), [catalog]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleAdv = (id) => setF((x) => ({
    ...x, adventureIds: x.adventureIds.includes(id) ? x.adventureIds.filter((i) => i !== id) : [...x.adventureIds, id]
  }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createChallenge(f);
      track('challenge_created', { scope: f.scopeType, required: Number(f.requiredCount) });
      setF(EMPTY());
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (c) => {
    try {
      await setChallengeActive(c.id, !c.is_active);
      setMine((l) => l.map((x) => (x.id === c.id ? { ...x, is_active: !c.is_active } : x)));
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isPartner) {
    return (
      <div className="agchal glass-panel" data-testid="agency-challenges">
        <h3><Flag size={18} /> Expedition challenges</h3>
        <p className="expedition-hint">
          Run challenges like “Complete 2 Kullu treks by 31 Dec, get 10% off a package”. Trekkers join from the
          Expeditions page and progress counts only GPS-verified treks.
        </p>
        <p className="expedition-hint"><strong>Challenges are for Spota partner agencies.</strong> Contact Spota to get partner status.</p>
      </div>
    );
  }

  return (
    <div className="agchal" data-testid="agency-challenges">
      <div className="agchal-head">
        <h3><Flag size={18} /> Expedition challenges</h3>
        <button type="button" className="exp-start" onClick={() => setShowForm((v) => !v)}><Plus size={14} /> New challenge</button>
      </div>

      {showForm && (
        <form className="route-form glass-panel" onSubmit={submit} data-testid="challenge-form">
          <label>Title<input value={f.title} onChange={set('title')} maxLength={80} placeholder="Kullu Explorer" /></label>
          <label>Description<textarea rows={2} value={f.description} onChange={set('description')} maxLength={500} /></label>
          <label>Reward<input value={f.reward} onChange={set('reward')} maxLength={200} placeholder="10% off any Kullu package" /></label>
          <div className="route-row">
            <label>Which treks count
              <select value={f.scopeType} onChange={set('scopeType')}>
                <option value="region">A region / valley</option>
                <option value="state">A state</option>
                <option value="adventures">Specific treks</option>
                <option value="any">Any trek</option>
              </select>
            </label>
            {f.scopeType === 'region' && (
              <label>Region
                <select value={f.scopeRegion} onChange={set('scopeRegion')}>
                  <option value="">Select</option>
                  {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
            {f.scopeType === 'state' && (
              <label>State
                <select value={f.scopeState} onChange={set('scopeState')}>
                  <option value="">Select</option>
                  {states.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
          </div>
          {f.scopeType === 'adventures' && (
            <div className="agchal-advs">
              {catalog.map((a) => (
                <label key={a.id} className="route-check">
                  <input type="checkbox" checked={f.adventureIds.includes(a.id)} onChange={() => toggleAdv(a.id)} /> {a.name}
                </label>
              ))}
            </div>
          )}
          <div className="route-row route-row-4">
            <label>Treks needed<input inputMode="numeric" value={f.requiredCount} onChange={set('requiredCount')} /></label>
            <label>Min grade
              <select value={f.minGrade} onChange={set('minGrade')}>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>G{g}+</option>)}</select>
            </label>
            <label>Starts<input type="date" value={f.startsAt} onChange={set('startsAt')} /></label>
            <label>Ends<input type="date" value={f.endsAt} onChange={set('endsAt')} /></label>
          </div>
          {error && <p className="expedition-hint">{error}</p>}
          <button type="submit" className="exp-start" disabled={busy}>{busy ? 'Creating…' : 'Publish challenge'}</button>
        </form>
      )}
      {!showForm && error && <p className="expedition-hint">{error}</p>}

      {mine === null && <p className="expedition-hint">Loading…</p>}
      {mine?.length === 0 && <p className="expedition-hint">No challenges yet. Create one to bring trekkers to your region.</p>}
      {mine?.map((c) => {
        const done = (c.participants || []).filter((p) => p.completed).length;
        return (
          <article key={c.id} className="chal-card glass-panel" data-testid="agency-challenge">
            <header className="chal-head">
              <div>
                <h3>{c.title}</h3>
                <span className="chal-by">
                  {c.required_count} × {challengeScopeLabel(c)} · until {new Date(c.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {!c.is_active && ' · paused'}
                </span>
              </div>
              <button type="button" className="chal-leave" onClick={() => toggleActive(c)}>{c.is_active ? 'Pause' : 'Resume'}</button>
            </header>
            <div className="chal-meta">
              <span><Users size={13} /> {c.participants.length} joined</span>
              <span><CheckCircle2 size={13} /> {done} completed</span>
            </div>
            {c.participants.length > 0 && (
              <table className="agchal-table">
                <thead><tr><th>Trekker</th><th>Progress</th><th /></tr></thead>
                <tbody>
                  {c.participants.map((p) => (
                    <tr key={p.username}>
                      <td>@{p.username}</td>
                      <td>{p.progress} / {c.required_count}</td>
                      <td>{p.completed ? <span className="expedition-status status-verified">Completed</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        );
      })}
    </div>
  );
}
