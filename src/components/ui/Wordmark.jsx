import { useId } from 'react';

// SPOTA wordmark: wide Archivo caps with the "O" drawn as an almond eye whose
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
        <g className="sp-eye__lid">
          <path d={almond} fill="currentColor" />
          <g clipPath={`url(#${clipId})`}>
            <g className="sp-eye__iris">
              <circle cx="20" cy="11" r="8" fill="var(--accent)" />
              <circle cx="20" cy="11" r="3.7" fill="var(--accent-ink)" />
            </g>
          </g>
        </g>
      </svg>
      <span aria-hidden="true">TA</span>
    </span>
  );
}
