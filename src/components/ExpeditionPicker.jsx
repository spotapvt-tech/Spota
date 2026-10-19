import { useMemo } from 'react';
import { Mountain, Trophy, WifiOff } from 'lucide-react';
import { estimateAP } from '../lib/apFormula';
import './ExpeditionMode.css';

const GRADE_LABEL = { 1: 'Easy', 2: 'Moderate', 3: 'Challenging', 4: 'Difficult', 5: 'Extreme' };

/**
 * Optional "link this Safe Trek to an Expedition" picker for the setup form.
 * Picking an adventure earns Adventure Points once the trek is verified.
 */
export default function ExpeditionPicker({
  adventures = [],
  loading = false,
  fromCache = false,
  selectedId = '',
  onSelect,
  isGuided = false,
  onGuidedChange,
  isGuest = false,
  onBrowse,
  lowPower = false,
  onLowPowerChange
}) {
  const grouped = useMemo(() => {
    const byState = new Map();
    adventures.forEach((a) => {
      if (!byState.has(a.state)) byState.set(a.state, []);
      byState.get(a.state).push(a);
    });
    return [...byState.entries()];
  }, [adventures]);

  const selected = adventures.find((a) => a.id === selectedId) || null;
  const preview = selected ? estimateAP(selected) : null;

  if (isGuest) {
    return (
      <div className="form-group expedition-picker">
        <label>Expedition (earn Adventure Points)</label>
        <p className="expedition-hint">Sign in to record this trek as an Expedition and climb the leaderboards.</p>
      </div>
    );
  }

  return (
    <div className="form-group expedition-picker">
      <label htmlFor="expedition-select">Expedition (earn Adventure Points)</label>
      <div className="input-with-icon">
        <Mountain size={18} className="input-icon" />
        <select
          id="expedition-select"
          className="expedition-select"
          value={selectedId}
          onChange={(e) => onSelect?.(e.target.value)}
          disabled={loading}
        >
          <option value="">{loading ? 'Loading adventures…' : 'None (Safe Trek only)'}</option>
          {grouped.map(([state, items]) => (
            <optgroup key={state} label={state}>
              {items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.terrainRegion}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {fromCache && adventures.length > 0 && (
        <span className="expedition-hint"><WifiOff size={12} /> Offline: showing saved adventures</span>
      )}
      {onBrowse && (
        <button type="button" className="expedition-browse-link" onClick={onBrowse}>
          Browse all expeditions &amp; leaderboards →
        </button>
      )}
      {!loading && adventures.length === 0 && (
        <span className="expedition-hint">No adventures available yet. Connect once to download the list.</span>
      )}

      {selected && (
        <div className="expedition-summary" data-testid="expedition-summary">
          <div className="expedition-stats">
            <span><strong>G{selected.grade}</strong> {GRADE_LABEL[selected.grade]}</span>
            <span><strong>{selected.distanceKm}</strong> km</span>
            <span><strong>{selected.elevationGainM}</strong> m climb</span>
            <span><strong>{selected.maxAltitudeM}</strong> m max</span>
          </div>
          <div className="expedition-ap">
            <Trophy size={14} />
            <span>Earn ~<strong>{preview.points}</strong> AP on a verified first completion</span>
          </div>
          <label className="expedition-guided">
            <input type="checkbox" checked={isGuided} onChange={(e) => onGuidedChange?.(e.target.checked)} />
            Guided / with an agency (scores the same)
          </label>
          {onLowPowerChange && (
            <label className="expedition-guided">
              <input type="checkbox" checked={lowPower} onChange={(e) => onLowPowerChange(e.target.checked)} />
              Battery saver: GPS fix every 60 s instead of 30 s (multi-day treks)
            </label>
          )}
          <p className="expedition-hint">
            GPS records your route, even offline. Finish with a summit photo to get verified.
          </p>
        </div>
      )}
    </div>
  );
}
