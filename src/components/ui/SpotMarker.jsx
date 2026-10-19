import { CategoryIcon } from './CategoryGlyph';
import { getCategoryById } from '../../lib/categoryConfig';
import './SpotMarker.css';

/**
 * Map pin for a SPOTA. Teardrop-free "survey marker": a rotated square tile
 * in the category colour with an icon, a stem, and a ground dot. States:
 *  - selected: lifts + scales, gets a signal ring
 *  - trending: small ember flame tick in the corner
 *  - pending:  dashed outline, desaturated (awaiting moderation)
 */
export default function SpotMarker({ category, selected = false, trending = false, pending = false, label }) {
  const cat = getCategoryById(category);
  return (
    <div
      className={`spot-marker ${selected ? 'is-selected' : ''} ${pending ? 'is-pending' : ''}`}
      style={{ '--mk': cat.color }}
      role="img"
      aria-label={label || cat.label}
    >
      <span className="spot-marker__tile">
        <CategoryIcon category={category} size={15} strokeWidth={2.4} />
      </span>
      {trending && !pending && <span className="spot-marker__hot" aria-hidden="true" />}
      <span className="spot-marker__stem" aria-hidden="true" />
      <span className="spot-marker__ground" aria-hidden="true" />
    </div>
  );
}
