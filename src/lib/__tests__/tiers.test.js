import { describe, it, expect } from 'vitest';
import { TIERS, tierFor, tierById, tierProgress } from '../tiers';

describe('tiers (BRD FR-6, mirrors compute_tier())', () => {
  it('maps AP to the same thresholds as the SQL compute_tier()', () => {
    expect([0, 499, 500, 1999, 2000, 5999, 6000, 14999, 15000, 99999].map((ap) => tierFor(ap).id)).toEqual([
      'wanderer', 'wanderer', 'trailblazer', 'trailblazer', 'ridge_runner', 'ridge_runner',
      'summiteer', 'summiteer', 'expedition_legend', 'expedition_legend'
    ]);
  });

  it('progress toward the next tier', () => {
    expect(tierProgress(108)).toMatchObject({ current: { id: 'wanderer' }, next: { id: 'trailblazer' }, remaining: 392 });
    expect(tierProgress(108).ratio).toBeCloseTo(108 / 500, 5);
    expect(tierProgress(764)).toMatchObject({ current: { id: 'trailblazer' }, next: { id: 'ridge_runner' }, remaining: 1236 });
    expect(tierProgress(20000)).toMatchObject({ next: null, remaining: 0, ratio: 1 });
  });

  it('unknown tier id falls back to the first tier', () => {
    expect(tierById('nope')).toBe(TIERS[0]);
    expect(tierById('summiteer').name).toBe('Summiteer');
  });
});
