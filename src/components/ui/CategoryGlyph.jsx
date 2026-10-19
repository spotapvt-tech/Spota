import {
  Footprints, Mountain, Binoculars, Droplets, Waves, TreePine, Tent,
  Flashlight, Sun, Coffee, Palette, Ticket, MapPin,
} from 'lucide-react';
import { getCategoryById } from '../../lib/categoryConfig';

// Static map (not a dynamic lookup into the lucide namespace) so the bundler
// can tree-shake every icon we don't use.
const ICONS = {
  Footprints, Mountain, Binoculars, Droplets, Waves, TreePine, Tent,
  Flashlight, Sun, Coffee, Palette, Ticket, MapPin,
};

export function CategoryIcon({ category, size = 16, strokeWidth = 2.2, ...rest }) {
  const cat = getCategoryById(category);
  const Icon = ICONS[cat.icon] || MapPin;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}

/**
 * A tinted rounded tile holding the category icon — the visual unit used for
 * categories across chips, cards, list rows and the map sheet.
 */
export default function CategoryGlyph({ category, size = 28, iconSize, solid = false, className = '' }) {
  const cat = getCategoryById(category);
  const style = solid
    ? { '--glyph-bg': cat.color, '--glyph-fg': '#09130F', width: size, height: size }
    : { '--glyph-bg': `color-mix(in srgb, ${cat.color} 16%, transparent)`, '--glyph-fg': cat.color, width: size, height: size };
  return (
    <span className={`sp-glyph ${className}`} style={style} title={cat.label}>
      <CategoryIcon category={category} size={iconSize || Math.round(size * 0.55)} />
    </span>
  );
}
