import { useId } from 'react';

// SPOTA wordmark: Sora ExtraBold caps with the "O" drawn as an almond eye whose
// iris looks around and blinks (animation in index.css, off under
// reduced-motion). Inline SVG so it renders without fonts.
export default function Wordmark({ size = 20, className = '' }) {
  const h = Math.round(size * 0.78);
  const clipId = `sp-eye-${useId().replace(/:/g, '')}`;
  const almond = 'M1 11 Q20 -3 39 11 Q20 25 1 11 Z';
  return (
    <span className={`sp-wordmark ${className}`} style={{ fontSize: size }} aria-label="Spota">
      <span aria-hidden="true">SP</span>
      <svg className="sp-eye" width={Math.round(h * 1.82)} height={h} viewBox="0 0 40 22" aria-hidden="true" style={{ margin: '0 0.05em', flexShrink: 0 }}>
        <clipPath id={clipId}><path d={almond} /></clipPath>
        <linearGradient id={`${clipId}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5E8A6A" /><stop offset="1" stopColor="#3E6B4F" />
        </linearGradient>
        <g className="sp-eye__lid">
          <path d={almond} fill="var(--bg-raised)" />
          <g clipPath={`url(#${clipId})`}>
            <g className="sp-eye__iris">
              <circle cx="20" cy="11" r="8" fill={`url(#${clipId}-g)`} />
              <circle cx="20" cy="11" r="3.7" fill="var(--text-strong)" />
            </g>
          </g>
          <path d={almond} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        </g>
      </svg>
      <span aria-hidden="true">TA</span>
    </span>
  );
}
