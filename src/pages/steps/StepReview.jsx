import { Eye, MapPin, ShieldCheck, Pencil, Globe } from 'lucide-react';
import { getCategoryById } from '../../lib/categoryConfig';
import { CategoryIcon } from '../../components/ui/CategoryGlyph';
import './StepReview.css';

/**
 * Step 6 — Review & publish.
 * Shows the SPOTA exactly as explorers will see it, states plainly who can
 * see the pin (spots are public with exact coordinates — the schema has no
 * hidden/approximate mode yet), and asks for a one-tap safety/access
 * acknowledgement before publishing.
 */
export default function StepReview({
  photoPreview, photoFilter, gemName, category, description, selectedTags = [],
  location, safetyAck, setSafetyAck, onEditStep,
}) {
  const cat = getCategoryById(category);
  const coords = location?.lat != null
    ? `${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)}`
    : null;

  return (
    <div className="review-step">
      <header className="review-head">
        <span className="sp-eyebrow"><Eye size={12} /> Preview</span>
        <h2 className="sp-display">This is what explorers will find.</h2>
      </header>

      <article className="review-card">
        <div className="review-card__media">
          {photoPreview
            ? <img src={photoPreview} alt="" style={{ filter: photoFilter && photoFilter !== 'none' ? photoFilter : undefined }} />
            : <span className="review-card__noimg"><CategoryIcon category={category} size={32} /></span>}
          <span className="review-card__cat" style={{ background: cat.color }}>
            <CategoryIcon category={category} size={12} /> {cat.label}
          </span>
        </div>
        <div className="review-card__body">
          <div className="review-row">
            <h3>{gemName || 'Untitled SPOTA'}</h3>
            <button type="button" className="review-edit" onClick={() => onEditStep(3)} aria-label="Edit name and category"><Pencil size={14} /></button>
          </div>
          {description && (
            <div className="review-row">
              <p>{description}</p>
              <button type="button" className="review-edit" onClick={() => onEditStep(5)} aria-label="Edit description"><Pencil size={14} /></button>
            </div>
          )}
          {selectedTags.length > 0 && (
            <div className="review-tags">{selectedTags.map((t) => <span key={t}>#{t}</span>)}</div>
          )}
          <div className="review-loc">
            <MapPin size={14} />
            <span>
              {location?.address || location?.placeName || 'Pinned location'}
              {coords && <small className="sp-mono">{coords}</small>}
            </span>
            <button type="button" className="review-edit" onClick={() => onEditStep(2)} aria-label="Edit location"><Pencil size={14} /></button>
          </div>
        </div>
      </article>

      <section className="review-visibility">
        <div className="review-visibility__row">
          <Globe size={18} />
          <div>
            <strong>Public SPOTA · exact pin</strong>
            <p>Anyone on Spota can see this place and navigate to the pin. New drops are reviewed by the community before they&apos;re featured.</p>
          </div>
        </div>
      </section>

      <label className={`review-ack ${safetyAck ? 'is-on' : ''}`}>
        <input type="checkbox" checked={safetyAck} onChange={(e) => setSafetyAck(e.target.checked)} />
        <span className="review-ack__box" aria-hidden="true"><ShieldCheck size={16} /></span>
        <span className="review-ack__text">
          This place is publicly accessible and safe to reach — not private property, a closed area, or someone&apos;s home.
        </span>
      </label>
    </div>
  );
}
