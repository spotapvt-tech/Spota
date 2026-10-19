import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Share2, WifiOff, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TierBadge from '../components/TierBadge';
import { getLeaderboard } from '../lib/leaderboardService';
import { fetchAdventures } from '../lib/adventureCatalog';
import { track } from '../lib/analytics';
import { shareRankCard } from '../lib/rankCard';
import './LeaderboardView.css';

const LEVELS = [
  { id: 'global', label: 'Global' },
  { id: 'country', label: 'India' },
  { id: 'state', label: 'State' },
  { id: 'region', label: 'Region' }
];

function Row({ e }) {
  const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : null;
  return (
    <li className={`lb-row ${e.is_me ? 'is-me' : ''}`}>
      <span className="lb-rank">{medal || `#${e.rank}`}</span>
      <span className="lb-avatar" aria-hidden="true">
        {e.avatar_url ? <img src={e.avatar_url} alt="" /> : (e.username || '?').slice(0, 1).toUpperCase()}
      </span>
      <span className="lb-name">
        <strong>{e.username || 'Explorer'}{e.is_me ? ' (you)' : ''}</strong>
        <TierBadge tier={e.tier} size="sm" />
      </span>
      <span className="lb-ap"><strong>{Number(e.ap).toLocaleString('en-IN')}</strong> AP</span>
    </li>
  );
}

export default function LeaderboardView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lens, setLens] = useState('home');
  const [level, setLevel] = useState('global');
  const [timeWindow, setTimeWindow] = useState('all');
  const [terrainScope, setTerrainScope] = useState('');
  const [adventures, setAdventures] = useState([]);
  const [result, setResult] = useState({ loading: true });
  const [shareMsg, setShareMsg] = useState(null);

  // Terrain scopes (states / regions that have adventures) come from the catalog
  useEffect(() => {
    fetchAdventures().then(({ items }) => setAdventures(items));
  }, []);

  const terrainOptions = useMemo(() => {
    const key = level === 'region' ? 'terrainRegion' : 'state';
    return [...new Set(adventures.map((a) => a[key]).filter(Boolean))].sort();
  }, [adventures, level]);

  const needsTerrainScope = lens === 'terrain' && (level === 'state' || level === 'region');
  const effectiveTerrainScope = needsTerrainScope
    ? (terrainOptions.includes(terrainScope) ? terrainScope : terrainOptions[0] || '')
    : null;
  const scope = lens === 'terrain' ? effectiveTerrainScope : null; // home lens: server uses my home

  useEffect(() => {
    if (needsTerrainScope && !scope) return undefined;
    let cancelled = false;
    getLeaderboard({ lens, level, scope, window: timeWindow }).then((r) => {
      if (!cancelled) setResult({ loading: false, ...r });
    });
    track('leaderboard_viewed', { lens, level, scope, window: timeWindow });
    return () => { cancelled = true; };
  }, [lens, level, scope, timeWindow, needsTerrainScope]);

  const data = result.data;
  const entries = data?.entries || [];
  const me = data?.me;
  const boardTitle = level === 'global' ? 'Global' : level === 'country' ? 'India' : data?.scope || '';

  const share = async () => {
    if (!me) return;
    const where = lens === 'terrain' ? `trekking in ${boardTitle}` : boardTitle;
    const text = `I'm #${me.rank} ${where ? `(${where}) ` : ''}on Spota Expeditions with ${me.ap} AP 🏔️`;
    try {
      const method = await shareRankCard({
        rank: me.rank,
        ap: me.ap,
        tier: me.tier,
        username: me.username,
        boardLabel: lens === 'terrain' ? `Trekked in ${boardTitle}` : boardTitle,
        windowLabel: timeWindow === 'season' ? 'This season' : 'All-time'
      }, text);
      if (method === 'downloaded') setShareMsg('Rank card saved: share it from your gallery');
      if (method !== 'cancelled') track('rank_card_shared', { method, lens, level, window: timeWindow, rank: me.rank });
    } catch {
      setShareMsg('Could not create the rank card');
    }
  };

  return (
    <div className="lb-container animate-fade-in">
      <div className="lb-header">
        <button className="back-btn-circle" onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="lb-title"><Trophy size={22} /><h1>Leaderboards</h1></div>
      </div>

      <div className="lb-segment" role="tablist" aria-label="Ranking lens">
        <button role="tab" aria-selected={lens === 'home'} className={lens === 'home' ? 'active' : ''} onClick={() => setLens('home')}>Where I'm from</button>
        <button role="tab" aria-selected={lens === 'terrain'} className={lens === 'terrain' ? 'active' : ''} onClick={() => setLens('terrain')}>Where I trekked</button>
      </div>

      <div className="lb-levels" role="tablist" aria-label="Level">
        {LEVELS.map((l) => (
          <button key={l.id} role="tab" aria-selected={level === l.id} className={level === l.id ? 'active' : ''} onClick={() => setLevel(l.id)}>{l.label}</button>
        ))}
      </div>

      <div className="lb-filters">
        {needsTerrainScope && (
          <select aria-label={level === 'region' ? 'Region' : 'State'} value={effectiveTerrainScope || ''} onChange={(e) => setTerrainScope(e.target.value)}>
            {terrainOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <div className="lb-window">
          <button className={timeWindow === 'all' ? 'active' : ''} onClick={() => setTimeWindow('all')}>All-time</button>
          <button className={timeWindow === 'season' ? 'active' : ''} onClick={() => setTimeWindow('season')}>This season</button>
        </div>
      </div>

      {result.fromCache && (
        <p className="lb-note"><WifiOff size={13} /> Offline: showing the last saved board{result.savedAt ? ` (${new Date(result.savedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })})` : ''}</p>
      )}

      {me && (
        <div className="lb-me glass-panel">
          <div>
            <span className="lb-me-label">Your rank</span>
            <strong className="lb-me-rank">#{me.rank}</strong>
            <span className="lb-me-ap">{Number(me.ap).toLocaleString('en-IN')} AP</span>
          </div>
          <button className="lb-share" onClick={share}><Share2 size={16} /> Share</button>
        </div>
      )}

      <div className="lb-board glass-panel">
        <div className="lb-board-head">
          <span>{boardTitle || 'Leaderboard'} · {lens === 'home' ? 'by home' : 'by trek location'}</span>
          {data && !data.needs_scope && <span className="lb-count">{data.total} ranked</span>}
        </div>

        {result.loading && <p className="lb-empty">Loading…</p>}

        {!result.loading && data?.needs_scope && (
          <div className="lb-empty">
            <MapPin size={20} />
            <p>Set your home state and city on your profile to see this board.</p>
            {user && !user.isGuest && <button className="lb-cta" onClick={() => navigate('/profile')}>Set home location</button>}
          </div>
        )}

        {!result.loading && data && !data.needs_scope && entries.length === 0 && (
          <div className="lb-empty"><p>No verified expeditions here yet. Be the first! 🏔️</p></div>
        )}

        {!result.loading && !data && (
          <div className="sp-state">
            <div className="sp-state__icon"><Trophy size={22} /></div>
            <h3>{navigator.onLine ? 'Rankings didn\'t load' : 'Rankings need a connection'}</h3>
            <p>{navigator.onLine ? 'Spota couldn\'t reach the leaderboard. Pull back in a moment and try again.' : 'Your verified treks are safe on this device and will count once you\'re back online.'}</p>
          </div>
        )}

        {entries.length > 0 && <ol className="lb-list">{entries.map((e) => <Row key={`${e.rank}-${e.username}`} e={e} />)}</ol>}

        {data?.around_me?.length > 0 && (
          <>
            <div className="lb-gap">···</div>
            <ol className="lb-list">{data.around_me.map((e) => <Row key={`a-${e.rank}-${e.username}`} e={e} />)}</ol>
          </>
        )}
      </div>

      {shareMsg && <p className="lb-note">{shareMsg}</p>}
      {!me && user && !user.isGuest && data && !data.needs_scope && (
        <p className="lb-note">Complete a verified expedition to appear here. <button className="lb-link" onClick={() => navigate('/expeditions')}>Browse expeditions →</button></p>
      )}
    </div>
  );
}
