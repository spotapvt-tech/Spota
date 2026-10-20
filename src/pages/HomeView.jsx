import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, ChevronRight, Clapperboard, Compass, LocateFixed, Map as MapIcon,
  Mountain, Plus, RefreshCw, ShieldCheck, Trophy, Users, WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useSpots, { spotPopularity } from '../hooks/useSpots';
import useGeolocation from '../hooks/useGeolocation';
import { haversineDistance } from '../lib/utils';
import { getCategoryById } from '../lib/categoryConfig';
import { fetchAdventures } from '../lib/adventureCatalog';
import { estimateAP } from '../lib/apFormula';
import { getMyExpeditionProfile } from '../lib/leaderboardService';
import { tierProgress } from '../lib/tiers';
import { formatCoords, formatDistance, greeting, timeAgo, GRADE_LABEL } from '../lib/format';
import CategoryGlyph, { CategoryIcon } from '../components/ui/CategoryGlyph';
import SpotDetailsModal from '../components/SpotDetailsModal';
import './HomeView.css';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Outdoor-first categories surfaced as quick entry points on Home.
const QUICK_CATS = ['trail', 'viewpoint', 'waterfall', 'lake', 'forest', 'campsite', 'mountain', 'cafe'];
// Categories the hero favours — SPOTA leads with the outdoors.
const OUTDOOR = new Set(['trail', 'mountain', 'viewpoint', 'waterfall', 'lake', 'forest', 'campsite', 'cave', 'beach']);

function explorerName(user) {
  const raw = user?.user_metadata?.username || (user?.email ? user.email.split('@')[0] : '');
  if (!raw || /^guest/i.test(raw)) return 'explorer';
  return raw.split(/[\s_]/)[0];
}

export default function HomeView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const signedIn = Boolean(user && !user.isGuest);
  const { spots, status, isOffline, reload } = useSpots();
  const geo = useGeolocation();
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [adventures, setAdventures] = useState(null);
  const [ap, setAp] = useState(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetchAdventures().then(({ items }) => { if (alive) setAdventures(items || []); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!signedIn) return undefined;
    let alive = true;
    getMyExpeditionProfile(user.id)
      .then(({ profile }) => { if (alive) setAp(profile?.total_ap ?? 0); })
      .catch(() => { /* progress card simply stays in its sign-in-free state */ });
    return () => { alive = false; };
  }, [signedIn, user?.id]);

  // Only moderated / community-visible spots are featured on Home.
  const visible = useMemo(
    () => spots.filter((s) => s.status !== 'pending' && s.status !== 'rejected' && s.status !== 'flagged'),
    [spots]
  );

  const withDistance = useMemo(() => {
    if (!geo.coords) return visible.map((s) => ({ ...s, _km: null }));
    return visible.map((s) => ({ ...s, _km: haversineDistance(geo.coords[0], geo.coords[1], s.latitude, s.longitude) }));
  }, [visible, geo.coords]);

  const nearby = useMemo(() => {
    if (!geo.coords) return [];
    return [...withDistance].filter((s) => s._km <= 50).sort((a, b) => a._km - b._km).slice(0, 10);
  }, [withDistance, geo.coords]);

  const trending = useMemo(
    () => [...withDistance].filter((s) => spotPopularity(s) > 0).sort((a, b) => spotPopularity(b) - spotPopularity(a)).slice(0, 8),
    [withDistance]
  );

  const recent = useMemo(
    () => [...withDistance].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5),
    [withDistance]
  );

  const freshThisWeek = useMemo(
    () => visible.filter((s) => now - new Date(s.created_at).getTime() < WEEK_MS).length,
    [visible, now]
  );

  // Hero: the nearest photographed spot if we know where you are, otherwise
  // the most-reacted one — always a real record, never a placeholder.
  const pickHero = (list) => list.find((s) => s.image_url && OUTDOOR.has(s.category)) || null;
  const hero = pickHero(nearby) || pickHero(trending) || pickHero(recent)
    || nearby.find((s) => s.image_url) || trending.find((s) => s.image_url) || recent.find((s) => s.image_url) || null;

  const featuredAdventures = useMemo(
    () => (adventures || [])
      .filter((a) => !/^\[DEV\]/.test(a.name))
      .map((a) => ({ ...a, ap: estimateAP(a).points }))
      .sort((a, b) => a.grade - b.grade || b.ap - a.ap)
      .slice(0, 6),
    [adventures]
  );

  const progress = ap != null ? tierProgress(ap) : null;
  const coordsLabel = formatCoords(geo.coords || []);

  const showOnMap = (spot) => navigate('/explore', { state: { focusSpotId: spot.id } });

  return (
    <div className="home">
      {/* ---------- Masthead ---------- */}
      <section className="home-mast">
        <div className="home-mast__meta">
          <span className="sp-eyebrow">{greeting()}, {explorerName(user)}</span>
          {coordsLabel ? (
            <span className="home-mast__coords sp-mono"><LocateFixed size={11} /> {coordsLabel}</span>
          ) : isOffline ? (
            <span className="home-mast__coords sp-mono home-mast__coords--warn"><WifiOff size={11} /> Offline · cached zones</span>
          ) : null}
        </div>
        <h1 className="home-mast__title sp-display">
          {nearby.length > 0
            ? <><em>{nearby.length}</em> {nearby.length === 1 ? 'SPOTA' : 'SPOTAs'} within 50&nbsp;km of you.</>
            : <>Every place has a story. <em>Go find one.</em></>}
        </h1>
        {freshThisWeek > 0 && (
          <p className="home-mast__sub">
            <span className="home-live-dot" aria-hidden="true" />
            {freshThisWeek} new {freshThisWeek === 1 ? 'drop' : 'drops'} from the community this week
          </p>
        )}
      </section>

      <div className="home-sheet">
      {/* ---------- Hero discovery ---------- */}
      {status === 'loading' && !hero ? (
        <div className="home-hero sp-skeleton" aria-busy="true" aria-label="Loading discoveries" />
      ) : hero ? (
        <article className="home-hero" onClick={() => setSelectedSpot(hero)}>
          <img src={hero.image_url} alt="" className="home-hero__img" loading="eager" />
          <div className="home-hero__shade" />
          <div className="home-hero__body">
            <span className="home-hero__tag">
              <CategoryIcon category={hero.category} size={13} />
              {hero._km != null ? `${formatDistance(hero._km)} away` : spotPopularity(hero) > 0 ? 'Most loved right now' : 'Fresh drop'}
            </span>
            <h2 className="home-hero__title">{hero.title}</h2>
            {hero.description && <p className="home-hero__desc">{hero.description}</p>}
            <div className="home-hero__actions" onClick={(e) => e.stopPropagation()}>
              <button className="sp-btn sp-btn--primary sp-btn--sm" onClick={() => showOnMap(hero)}>
                <Compass size={16} /> Take me there
              </button>
              <button className="sp-btn sp-btn--secondary sp-btn--sm home-hero__ghost" onClick={() => setSelectedSpot(hero)}>
                Details
              </button>
            </div>
          </div>
        </article>
      ) : null}

      {/* ---------- Primary actions ---------- */}
      <div className="home-actions">
        <Link to="/explore" className="home-action home-action--explore">
          <MapIcon size={20} />
          <span><strong>Explore the map</strong><small>Pins, trails &amp; filters</small></span>
          <ChevronRight size={18} className="home-action__chev" />
        </Link>
        <Link to="/add" className="home-action home-action--drop">
          <Plus size={20} strokeWidth={2.6} />
          <span><strong>Drop a SPOTA</strong><small>Put a place on the map</small></span>
        </Link>
      </div>

      {/* ---------- Location ask (with context, never on first paint) ---------- */}
      {!geo.coords && geo.status !== 'unavailable' && (
        <div className="home-locate">
          <div className="home-locate__icon"><LocateFixed size={20} /></div>
          <div className="home-locate__text">
            <strong>{geo.status === 'denied' ? 'Location is off' : 'See what\'s near you'}</strong>
            <p>
              {geo.status === 'denied'
                ? 'Turn it on in your device settings to sort SPOTAs by distance. You can still browse everything.'
                : 'Spota uses your location only to sort nearby SPOTAs and to pin your own drops.'}
            </p>
          </div>
          {geo.status !== 'denied' && (
            <button className="sp-btn sp-btn--secondary sp-btn--sm" onClick={geo.request} disabled={geo.status === 'locating'}>
              {geo.status === 'locating' ? 'Locating…' : 'Allow'}
            </button>
          )}
        </div>
      )}

      {/* ---------- Category quick entry ---------- */}
      <nav className="home-cats sp-rail" aria-label="Browse by type">
        {QUICK_CATS.map((id) => {
          const cat = getCategoryById(id);
          return (
            <button key={id} className="home-cat" onClick={() => navigate('/explore', { state: { category: id } })}>
              <CategoryGlyph category={id} size={40} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ---------- Error / empty ---------- */}
      {status === 'error' && (
        <div className="sp-state home-state">
          <div className="sp-state__icon"><WifiOff size={22} /></div>
          <h3>Couldn&apos;t load discoveries</h3>
          <p>Check your connection. Downloaded offline zones still work on the map.</p>
          <button className="sp-btn sp-btn--secondary sp-btn--sm" onClick={reload}><RefreshCw size={14} /> Try again</button>
        </div>
      )}
      {status === 'ready' && visible.length === 0 && (
        <div className="sp-state home-state">
          <div className="sp-state__icon"><Plus size={22} /></div>
          <h3>{isOffline ? 'No offline zones saved' : 'The map is wide open'}</h3>
          <p>{isOffline ? 'Download an area from the Explore map before heading off-grid.' : 'No SPOTAs here yet. Be the first explorer to drop one.'}</p>
          {!isOffline && <Link to="/add" className="sp-btn sp-btn--primary sp-btn--sm">Drop the first SPOTA</Link>}
        </div>
      )}

      {/* ---------- Near you ---------- */}
      {nearby.length > 1 && (
        <section className="home-section">
          <header className="sp-section-head">
            <h2>Near you</h2>
            <Link to="/explore" className="sp-link">Map <ChevronRight size={14} /></Link>
          </header>
          <div className="sp-rail">
            {nearby.filter((s) => s.id !== hero?.id).map((s) => (
              <SpotTile key={s.id} spot={s} onOpen={() => setSelectedSpot(s)} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Adventures ---------- */}
      {featuredAdventures.length > 0 && (
        <section className="home-section">
          <header className="sp-section-head">
            <h2>Treks &amp; expeditions</h2>
            <Link to="/expeditions" className="sp-link">All <ChevronRight size={14} /></Link>
          </header>
          <div className="sp-rail">
            {featuredAdventures.map((a) => (
              <Link key={a.id} to="/expeditions" className="adv-ticket">
                <div className="adv-ticket__top">
                  <span className={`adv-grade adv-grade--${a.grade}`}>{GRADE_LABEL[a.grade] || `Grade ${a.grade}`}</span>
                  <span className="adv-ticket__ap sp-mono">+{a.ap} AP</span>
                </div>
                <h3 className="adv-ticket__name">{a.name}</h3>
                <span className="adv-ticket__region">{a.state}</span>
                <AltitudeStrip max={a.maxAltitudeM} gain={a.elevationGainM} />
                <dl className="adv-ticket__stats sp-mono">
                  <div><dt>Dist</dt><dd>{a.distanceKm} km</dd></div>
                  <div><dt>Max</dt><dd>{a.maxAltitudeM?.toLocaleString()} m</dd></div>
                  <div><dt>Days</dt><dd>{a.typicalDays}</dd></div>
                </dl>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Trending ---------- */}
      {trending.length > 1 && (
        <section className="home-section">
          <header className="sp-section-head">
            <h2>Getting the most love</h2>
          </header>
          <div className="sp-rail">
            {trending.filter((s) => s.id !== hero?.id).map((s) => (
              <SpotTile key={s.id} spot={s} wide onOpen={() => setSelectedSpot(s)} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Explorer record ---------- */}
      <section className="home-section home-record">
        <div className="home-record__card">
          <div className="home-record__head">
            <span className="sp-eyebrow">Explorer record</span>
            <Trophy size={16} />
          </div>
          {progress ? (
            <>
              <div className="home-record__tier">
                <strong>{progress.current.name}</strong>
                <span className="sp-mono">{ap.toLocaleString()} AP</span>
              </div>
              <div className="home-record__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.ratio * 100)}>
                <span style={{ width: `${Math.max(3, progress.ratio * 100)}%` }} />
              </div>
              <p className="home-record__hint">
                {progress.next ? <><span className="sp-mono">{progress.remaining.toLocaleString()} AP</span> to {progress.next.name} · unlocks {progress.next.unlock.toLowerCase()}</> : 'Top tier reached. Legend.'}
              </p>
            </>
          ) : (
            <>
              <p className="home-record__pitch">
                {signedIn
                  ? 'Complete a verified trek with Safe Trek on to earn your first Adventure Points.'
                  : 'Sign in to earn Adventure Points for verified treks and climb your state\'s rankings.'}
              </p>
              <Link to={signedIn ? '/expeditions' : '/profile'} className="sp-link home-record__cta">
                {signedIn ? 'Pick a first expedition' : 'Create your explorer profile'} <ArrowUpRight size={14} />
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ---------- Toolkit ---------- */}
      <section className="home-section">
        <header className="sp-section-head"><h2>Your toolkit</h2></header>
        <div className="home-tools">
          <Link to="/vibes" className="home-tool"><Clapperboard size={20} /><strong>Vibes</strong><small>Clips from the field</small></Link>
          <Link to="/trips" className="home-tool"><Users size={20} /><strong>Trip boards</strong><small>Plan with your crew</small></Link>
          <Link to="/safe-trek" className="home-tool"><ShieldCheck size={20} /><strong>Safe Trek</strong><small>Check-ins &amp; SOS</small></Link>
          <Link to="/leaderboard" className="home-tool"><Mountain size={20} /><strong>Rankings</strong><small>State &amp; region</small></Link>
        </div>
      </section>

      {/* ---------- Fresh drops ---------- */}
      {recent.length > 0 && (
        <section className="home-section">
          <header className="sp-section-head">
            <h2>Fresh drops</h2>
          </header>
          <ul className="home-feed">
            {recent.map((s) => (
              <li key={s.id}>
                <button className="home-feed__row" onClick={() => setSelectedSpot(s)}>
                  {s.image_url
                    ? <img src={s.image_url} alt="" loading="lazy" className="home-feed__thumb" />
                    : <CategoryGlyph category={s.category} size={52} className="home-feed__thumb" />}
                  <span className="home-feed__body">
                    <strong>{s.title}</strong>
                    <span className="home-feed__meta">
                      {getCategoryById(s.category).label}
                      {s.address ? ` · ${s.address.split(',')[0]}` : ''}
                    </span>
                  </span>
                  <span className="home-feed__time sp-mono">
                    {timeAgo(s.created_at)}
                    {s._km != null && <em>{formatDistance(s._km)}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="home-foot sp-eyebrow">Explore responsibly · respect closures &amp; private land</p>
      </div>

      {selectedSpot && <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />}
    </div>
  );
}

function SpotTile({ spot, wide = false, onOpen }) {
  const cat = getCategoryById(spot.category);
  return (
    <button className={`spot-tile ${wide ? 'spot-tile--wide' : ''}`} onClick={onOpen}>
      <span className="spot-tile__media">
        {spot.image_url
          ? <img src={spot.image_url} alt="" loading="lazy" />
          : <span className="spot-tile__noimg"><CategoryIcon category={spot.category} size={28} /></span>}
        {spot._km != null && <span className="spot-tile__dist sp-mono">{formatDistance(spot._km)}</span>}
      </span>
      <span className="spot-tile__body">
        <span className="spot-tile__cat" style={{ color: cat.color }}>
          <CategoryIcon category={spot.category} size={12} /> {cat.label}
        </span>
        <strong className="spot-tile__title">{spot.title}</strong>
      </span>
    </button>
  );
}

/** Thin altitude gauge: where the summit sits on a 0–5,500 m scale, with the day's gain shaded. */
function AltitudeStrip({ max, gain }) {
  const CEIL = 5500;
  if (!max) return null;
  const top = Math.min(1, max / CEIL);
  const start = Math.max(0, (max - (gain || 0)) / CEIL);
  return (
    <div className="alt-strip" aria-label={`Climb from ${Math.round(max - (gain || 0))} m to ${max} m`}>
      <span className="alt-strip__gain" style={{ left: `${start * 100}%`, width: `${(top - start) * 100}%` }} />
      <span className="alt-strip__peak" style={{ left: `${top * 100}%` }} />
    </div>
  );
}

