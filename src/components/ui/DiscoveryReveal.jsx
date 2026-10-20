import { useEffect, useRef } from 'react';
import { Compass } from 'lucide-react';
import './DiscoveryReveal.css';

const PARTICLES = 10;

/**
 * Short, non-blocking "you found it" moment. Mount it with `open` ONLY after
 * the backend has confirmed the discovery (never optimistically). The action
 * button and Esc/backdrop dismissal work from the first frame, so nobody has
 * to sit through the animation. With prefers-reduced-motion the same content
 * shows as a static card (see DiscoveryReveal.css).
 */
export default function DiscoveryReveal({ open, title, kicker = 'Discovered', detail, actionLabel = 'Continue', onAction, onClose }) {
  const actionRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    actionRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dr" role="dialog" aria-modal="true" aria-labelledby="dr-title" onClick={onClose}>
      <div className="dr__card sp-glass sp-glass--thick" onClick={(e) => e.stopPropagation()}>
        <div className="dr__emblem" aria-hidden="true">
          <span className="dr__ring" />
          <span className="dr__ring dr__ring--late" />
          <span className="dr__particles">
            {Array.from({ length: PARTICLES }, (_, i) => (
              <i key={i} style={{ '--a': `${(360 / PARTICLES) * i}deg` }} />
            ))}
          </span>
          <span className="dr__tile"><Compass size={34} strokeWidth={2.2} /></span>
        </div>
        <p className="sp-eyebrow dr__kicker">{kicker}</p>
        <h2 id="dr-title" className="dr__title">{title}</h2>
        {detail && <p className="dr__detail sp-mono">{detail}</p>}
        <button ref={actionRef} type="button" className="sp-btn sp-btn--primary sp-btn--block" onClick={onAction || onClose}>
          {actionLabel}
        </button>
        {onAction && (
          <button type="button" className="sp-btn sp-btn--ghost sp-btn--block" onClick={onClose}>Not now</button>
        )}
      </div>
    </div>
  );
}
