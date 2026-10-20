import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, AlertTriangle, XCircle, Trophy, Flame, Compass, Lock, MapPin, Search, Mountain } from 'lucide-react';
import CategoryGlyph from '../components/ui/CategoryGlyph';
import DiscoveryReveal from '../components/ui/DiscoveryReveal';
import './DesignPreview.css';

// Dev-only style specimen: renders the same product surfaces under each
// candidate palette so directions can be compared on real components.
const DIRECTIONS = {
  a: {
    name: 'A · Wild Explorer',
    note: 'Forest + lime. Premium outdoor, natural discovery.',
    pairs: [
      ['Text on canvas', '#F5F5EF', '#0D1B16'],
      ['Muted on card', '#89968C', '#142A22'],
      ['CTA label on lime', '#0D1B16', '#3E6B4F'],
      ['Lime on card', '#3E6B4F', '#142A22'],
    ],
  },
  b: {
    name: 'B · Extreme Adventure',
    note: 'Obsidian + orange. Bold, high-energy, sport.',
    pairs: [
      ['Text on canvas', '#FFFFFF', '#171717'],
      ['Muted on card', '#A6A6A6', '#202020'],
      ['CTA label on orange', '#171717', '#FF6B35'],
      ['Orange on card', '#FF6B35', '#202020'],
    ],
  },
  c: {
    name: 'C · Digital Discovery',
    note: 'Navy + cyan. Futuristic, map-first, tech.',
    pairs: [
      ['Text on canvas', '#F4F8FC', '#101827'],
      ['Muted on card', '#8595AA', '#182235'],
      ['CTA label on cyan', '#101827', '#45D9F5'],
      ['Cyan on card', '#45D9F5', '#182235'],
    ],
  },
};

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (fg, bg) => {
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function Specimen({ id }) {
  const d = DIRECTIONS[id];
  return (
    <section className="dp" data-dir={id} aria-label={d.name}>
      <header className="dp__head">
        <span className="sp-wordmark dp__wordmark">SPOTA</span>
        <span className="sp-eyebrow">{d.name}</span>
      </header>
      <p className="dp__note">{d.note}</p>

      <h1 className="dp__title">Find what the map forgot.</h1>
      <p className="dp__body">
        Hidden waterfalls, ridge lines and trailheads dropped by explorers near you.
      </p>
      <div className="dp__row">
        <button className="sp-btn sp-btn--primary">Start exploring</button>
        <button className="sp-btn sp-btn--secondary">Browse trips</button>
      </div>
      <div className="dp__row">
        <button className="sp-chip is-active">Waterfalls</button>
        <button className="sp-chip">Viewpoints</button>
        <button className="sp-chip">Camps</button>
      </div>

      <div className="dp__card">
        <CategoryGlyph category="waterfall" size={40} />
        <div className="dp__card-main">
          <strong>Mistfall Gorge</strong>
          <span className="dp__meta">Waterfall · Bir, Himachal</span>
          <span className="dp__coords">32.0421°N 76.7208°E · 2.4 km</span>
        </div>
        <span className="dp__score">4.8</span>
      </div>

      <div className="dp__card dp__card--hidden">
        <Lock size={18} aria-hidden="true" />
        <div className="dp__card-main">
          <strong>Hidden SPOTA · 300 m away</strong>
          <span className="dp__meta">Get close to reveal. +50 AP</span>
        </div>
      </div>

      <div className="dp__card dp__card--trek">
        <Mountain size={18} aria-hidden="true" />
        <div className="dp__card-main">
          <strong>Triund Ridge Expedition</strong>
          <span className="dp__meta">Day 2 of 3 · Moderate</span>
          <div className="dp__bar" role="progressbar" aria-valuenow={62} aria-valuemin={0} aria-valuemax={100} aria-label="Expedition progress">
            <span style={{ width: '62%' }} />
          </div>
        </div>
        <span className="dp__coords">62%</span>
      </div>

      <div className="dp__map" aria-hidden="true">
        <span className="dp__pin dp__pin--sel"><MapPin size={16} /></span>
        <span className="dp__pin dp__pin--a" />
        <span className="dp__pin dp__pin--b" />
        <div className="dp__sheet">
          <strong>Mistfall Gorge</strong>
          <span className="dp__meta">1.1 km · open now</span>
        </div>
      </div>

      <div className="dp__row">
        <span className="dp__badge"><Trophy size={14} aria-hidden="true" /> Ridge Runner</span>
        <span className="dp__badge dp__badge--dim"><Flame size={14} aria-hidden="true" /> 7-day streak</span>
        <span className="dp__badge dp__badge--dim"><Compass size={14} aria-hidden="true" /> Pathfinder</span>
      </div>

      <label className="dp__field">
        <span className="sp-eyebrow">Spot name</span>
        <span className="dp__input"><Search size={16} aria-hidden="true" /> Mistfall Gorge</span>
      </label>

      <div className="dp__status">
        <span className="dp__st dp__st--ok"><Check size={14} aria-hidden="true" /> Gem dropped</span>
        <span className="dp__st dp__st--warn"><AlertTriangle size={14} aria-hidden="true" /> Weak GPS</span>
        <span className="dp__st dp__st--err"><XCircle size={14} aria-hidden="true" /> Upload failed</span>
      </div>

      <table className="dp__ratios">
        <caption className="sp-eyebrow">WCAG contrast</caption>
        <tbody>
          {d.pairs.map(([label, fg, bg]) => {
            const r = contrast(fg, bg);
            return (
              <tr key={label}>
                <td>{label}</td>
                <td className="dp__coords">{r.toFixed(1)}:1</td>
                <td>{r >= 4.5 ? 'AA pass' : r >= 3 ? 'Large/UI only' : 'Fail'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function DesignPreview() {
  const [view, setView] = useState('all');
  const [reveal, setReveal] = useState(false); // specimen only: replays the animation, no backend involved
  const ids = view === 'all' ? Object.keys(DIRECTIONS) : [view];
  return (
    <main className="dpv">
      <nav className="dpv__bar" aria-label="Direction">
        <Link to="/" className="sp-chip">← App</Link>
        {['all', 'a', 'b', 'c'].map((v) => (
          <button key={v} className={`sp-chip${view === v ? ' is-active' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === 'all' ? 'Compare' : v.toUpperCase()}
          </button>
        ))}
        <button className="sp-chip" onClick={() => setReveal(true)}>Replay discovery</button>
      </nav>
      <DiscoveryReveal open={reveal} kicker="Specimen" title="Mistfall Gorge" detail="+50 AP" onClose={() => setReveal(false)} />
      <div className="dpv__grid">{ids.map((id) => <Specimen key={id} id={id} />)}</div>
    </main>
  );
}
