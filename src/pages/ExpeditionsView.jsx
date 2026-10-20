import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mountain, Trophy, Play, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ChallengesList from '../components/ChallengesList';
import SuggestRouteForm from '../components/SuggestRouteForm';
import { fetchAdventures } from '../lib/adventureCatalog';
import { estimateAP } from '../lib/apFormula';
import { track } from '../lib/analytics';
import './LeaderboardView.css';

const TABS = [['adventures', 'Adventures'], ['challenges', 'Challenges'], ['suggest', 'Suggest']];
const GRADE_LABEL = { 1: 'Easy', 2: 'Moderate', 3: 'Challenging', 4: 'Difficult', 5: 'Extreme' };

/** Adventure catalog: browse by state, see AP on offer, start one in Safe Trek. */
export default function ExpeditionsView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const signedIn = Boolean(user && !user.isGuest);
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'adventures';
  const [items, setItems] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [stateFilter, setStateFilter] = useState('all');
  const [grade, setGrade] = useState('all');

  useEffect(() => {
    fetchAdventures().then(({ items: list, fromCache: cached }) => {
      setItems(list);
      setFromCache(cached);
    });
  }, []);

  const states = useMemo(() => [...new Set((items || []).map((a) => a.state))].sort(), [items]);
  const visible = (items || [])
    .filter((a) => stateFilter === 'all' || a.state === stateFilter)
    .filter((a) => grade === 'all' || a.grade === Number(grade))
    .map((a) => ({ ...a, ap: estimateAP(a).points }))
    .sort((a, b) => a.state.localeCompare(b.state) || a.grade - b.grade || a.name.localeCompare(b.name));

  return (
    <div className="lb-container animate-fade-in">
      <div className="lb-header">
        <button className="back-btn-circle" onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="lb-title"><Mountain size={22} /><h1>Expeditions</h1></div>
        <button className="lb-header-link" onClick={() => navigate('/leaderboard')}><Trophy size={16} /> Ranks</button>
      </div>

      <div className="lb-segment exp-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''}
            onClick={() => setParams(k === 'adventures' ? {} : { tab: k }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'challenges' && <ChallengesList signedIn={signedIn} />}
      {tab === 'suggest' && <SuggestRouteForm userId={signedIn ? user.id : null} />}

      {tab === 'adventures' && (<>
      <p className="lb-intro">Complete a trek with Safe Trek on, finish with a summit photo, and earn Adventure Points once it's verified.</p>

      <div className="lb-filters">
        <select aria-label="State" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="all">All states</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="all">All grades</option>
          {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>G{g} · {GRADE_LABEL[g]}</option>)}
        </select>
      </div>

      {fromCache && <p className="lb-note"><WifiOff size={13} /> Offline: showing saved adventures</p>}
      {items === null && <p className="lb-empty">Loading…</p>}
      {items && visible.length === 0 && <p className="lb-empty">No adventures match these filters.</p>}

      <div className="exp-grid">
        {visible.map((a) => (
          <article key={a.id} className="exp-card glass-panel" data-testid="expedition-card">
            <div className="exp-card-top">
              <div>
                <h3>{a.name}</h3>
                <span className="exp-card-where">{a.terrainRegion} · {a.state}</span>
              </div>
              <span className={`exp-grade g${a.grade}`}>G{a.grade}</span>
            </div>
            <div className="exp-stats">
              <span><strong>{a.distanceKm}</strong> km</span>
              <span><strong>{a.elevationGainM}</strong> m climb</span>
              <span><strong>{a.maxAltitudeM}</strong> m max</span>
              <span><strong>{a.typicalDays}</strong> {a.typicalDays > 1 ? 'days' : 'day'}</span>
            </div>
            <div className="exp-card-bottom">
              <span className="exp-ap"><Trophy size={14} /> ~{a.ap} AP</span>
              <button className="exp-start" onClick={() => { track('expedition_catalog_start', { adventure_id: a.id }); navigate('/safe-trek', { state: { adventureId: a.id } }); }}>
                <Play size={14} /> Start
              </button>
            </div>
          </article>
        ))}
      </div>
      </>)}
    </div>
  );
}
