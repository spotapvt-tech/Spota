// SPOTA wordmark: wide Archivo caps with the "O" drawn as a survey marker
// (ring + centre point). Inline SVG for the O so it renders without fonts.
export default function Wordmark({ size = 20, className = '' }) {
  const ring = Math.round(size * 0.78);
  return (
    <span className={`sp-wordmark ${className}`} style={{ fontSize: size }} aria-label="Spota">
      <span aria-hidden="true">SP</span>
      <svg width={ring} height={ring} viewBox="0 0 24 24" aria-hidden="true" style={{ margin: '0 0.04em', flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3.4" />
        <circle cx="12" cy="12" r="3.2" fill="var(--accent)" />
      </svg>
      <span aria-hidden="true">TA</span>
    </span>
  );
}
