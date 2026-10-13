import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Mountain } from 'lucide-react';
import { getLiveStats, subscribe } from '../lib/trackRecorder';
import './ExpeditionMode.css';

/** Live expedition stats card shown on the active Safe Trek panel. */
export default function ExpeditionTracker({ clientAttemptId, adventureName, sourceKind }) {
  const [stats, setStats] = useState(null);
  const [lastFixAt, setLastFixAt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientAttemptId) return undefined;
    let cancelled = false;

    const refresh = () =>
      getLiveStats(clientAttemptId)
        .then((s) => { if (!cancelled) setStats(s); })
        .catch(() => {});

    refresh();
    const unsubscribe = subscribe((event) => {
      if (event.clientAttemptId && event.clientAttemptId !== clientAttemptId) return;
      if (event.type === 'point') {
        setLastFixAt(event.point.t);
        setError(null);
        refresh();
      } else if (event.type === 'error') {
        setError(event.error?.message || 'GPS signal problem');
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [clientAttemptId]);

  const fmt = (v, digits = 0) => (v === null || v === undefined ? '–' : Number(v).toFixed(digits));

  return (
    <div className="expedition-tracker glass-panel" data-testid="expedition-tracker">
      <div className="expedition-tracker-head">
        <Mountain size={16} />
        <span>Expedition: <strong>{adventureName}</strong></span>
        <span className="expedition-rec-dot" aria-label="Recording" />
      </div>

      <div className="expedition-tracker-grid">
        <div><span className="ex-val">{fmt(stats?.distanceKm, 2)}</span><span className="ex-lbl">km</span></div>
        <div><span className="ex-val">{fmt(stats?.elevationGainM)}</span><span className="ex-lbl">m climb</span></div>
        <div><span className="ex-val">{fmt(stats?.maxAltitudeM)}</span><span className="ex-lbl">m max alt</span></div>
        <div><span className="ex-val">{fmt(stats?.pointCount)}</span><span className="ex-lbl">GPS points</span></div>
      </div>

      <div className="expedition-tracker-foot">
        <Activity size={12} />
        <span>
          {lastFixAt
            ? `Last fix ${new Date(lastFixAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Waiting for GPS fix…'}
        </span>
      </div>

      {sourceKind === 'foreground' && (
        <div className="expedition-warn">
          <AlertTriangle size={14} />
          <span>Background GPS isn't available here. Keep Spota open so your route keeps recording.</span>
        </div>
      )}
      {error && (
        <div className="expedition-warn">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
