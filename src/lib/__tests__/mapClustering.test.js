import { describe, it, expect } from 'vitest';
import { buildMapItems, projectToWorld, inBounds, padBounds } from '../mapClustering';

const viewport = { bounds: { north: 28.7, south: 28.5, east: 77.3, west: 77.1 }, zoom: 12 };

function grid(n, lat = 28.6, lng = 77.2, step = 0.0001) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, latitude: lat + (i % 10) * step, longitude: lng + Math.floor(i / 10) * step }));
}

describe('projection + bounds', () => {
  it('projects the origin to the world centre', () => {
    const p = projectToWorld(0, 0, 0);
    expect(p.x).toBeCloseTo(128);
    expect(p.y).toBeCloseTo(128);
  });
  it('pads bounds on every side', () => {
    const b = padBounds(viewport.bounds, 0.5);
    expect(inBounds(28.75, 77.2, b)).toBe(true);
    expect(inBounds(28.75, 77.2, viewport.bounds)).toBe(false);
  });
});

describe('buildMapItems', () => {
  it('renders every spot before the first map idle', () => {
    expect(buildMapItems(grid(5), null)).toHaveLength(5);
  });

  it('culls spots far outside the viewport', () => {
    const spots = [...grid(3), { id: 99, latitude: 19.07, longitude: 72.87 }];
    const items = buildMapItems(spots, viewport);
    expect(items.map((i) => i.spot.id)).not.toContain(99);
    expect(items).toHaveLength(3);
  });

  it('leaves sparse views unclustered', () => {
    const items = buildMapItems(grid(40), viewport, { threshold: 60 });
    expect(items.every((i) => i.type === 'spot')).toBe(true);
  });

  it('clusters dense views and conserves the spot count', () => {
    const spots = grid(100);
    const items = buildMapItems(spots, viewport, { threshold: 60 });
    const clusters = items.filter((i) => i.type === 'cluster');
    expect(clusters.length).toBeGreaterThan(0);
    const total = items.reduce((n, i) => n + (i.type === 'cluster' ? i.count : 1), 0);
    expect(total).toBe(100);
  });

  it('never clusters or culls kept ids (the selected pin)', () => {
    const spots = [...grid(100), { id: 500, latitude: 19.07, longitude: 72.87 }];
    const items = buildMapItems(spots, viewport, { threshold: 60, keepIds: [1, 500] });
    const singles = items.filter((i) => i.type === 'spot').map((i) => i.spot.id);
    expect(singles).toContain(1);
    expect(singles).toContain(500);
  });

  it('stops clustering at street-level zoom', () => {
    const items = buildMapItems(grid(100), { ...viewport, zoom: 18 }, { threshold: 60 });
    expect(items.every((i) => i.type === 'spot')).toBe(true);
  });
});
