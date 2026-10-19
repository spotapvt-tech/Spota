import { tierById, tierProgress } from '../lib/tiers';
import './ExpeditionMode.css';

/** Tier pill; with `ap` + `showProgress`, also a bar toward the next tier. */
export default function TierBadge({ tier, ap, showProgress = false, size = 'md' }) {
  const t = tier ? tierById(tier) : tierProgress(ap || 0).current;
  const progress = showProgress && typeof ap === 'number' ? tierProgress(ap) : null;

  return (
    <div className={`tier-badge-wrap tier-${size}`}>
      <span className={`tier-badge tier-${t.id}`} title={t.unlock}>
        <span aria-hidden="true">{t.emoji}</span> {t.name}
      </span>
      {progress && (
        <div className="tier-progress" aria-label={progress.next ? `${progress.remaining} AP to ${progress.next.name}` : 'Top tier'}>
          <div className="tier-progress-bar"><span style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></div>
          <span className="tier-progress-text">
            {progress.next ? <><strong>{progress.remaining.toLocaleString('en-IN')}</strong> AP to {progress.next.name}</> : 'Top tier reached'}
          </span>
        </div>
      )}
    </div>
  );
}
