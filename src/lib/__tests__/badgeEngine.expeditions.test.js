import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('../offlineCache', () => ({ getCachedZones: vi.fn(async () => []) }));

import { supabase } from '../supabaseClient';
import { getBadgesProgress, BADGE_DEFS } from '../badgeEngine';

function qb(value) {
  const b = { select: () => b, eq: () => b, neq: () => b, then: (r) => r(value) };
  return b;
}

const adv = (state, alt = 3000, ws = null, we = null) => ({ max_altitude_m: alt, state, winter_start_md: ws, winter_end_md: we });

function mockTables(expeditions) {
  supabase.from.mockImplementation((table) => {
    if (table === 'adventure_attempts') return qb({ data: expeditions });
    if (table === 'safe_treks') return qb({ count: 0 });
    return qb({ data: [] });
  });
}

describe('badgeEngine: Expedition badges', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it('defines the four BRD FR-6.2 badges', () => {
    expect(Object.keys(BADGE_DEFS)).toEqual(expect.arrayContaining(['first_expedition', 'high_altitude', 'winter_warrior', 'state_explorer']));
  });

  it('no verified expeditions → nothing earned', async () => {
    mockTables([]);
    const { progress } = await getBadgesProgress({ id: 'u1' });
    expect(progress.first_expedition).toMatchObject({ current: 0, earned: false });
    expect(progress.state_explorer).toMatchObject({ current: 0, target: 5, earned: false });
  });

  it('first, high-altitude and winter badges from verified attempts', async () => {
    mockTables([
      { adventure_id: 'triund', completed_at: '2027-01-10T08:00:00Z', adventures: adv('Himachal Pradesh', 2850, '12-15', '02-28') },
      { adventure_id: 'stok', completed_at: '2026-08-01T08:00:00Z', adventures: adv('Ladakh', 6153) }
    ]);
    const { progress } = await getBadgesProgress({ id: 'u1' });
    expect(progress.first_expedition.earned).toBe(true);
    expect(progress.high_altitude.earned).toBe(true);
    expect(progress.winter_warrior.earned).toBe(true);
  });

  it('state explorer counts distinct adventures in the best state', async () => {
    const hp = (id) => ({ adventure_id: id, completed_at: '2026-10-01T08:00:00Z', adventures: adv('Himachal Pradesh') });
    mockTables([hp('a'), hp('b'), hp('b'), hp('c'), hp('d'), { adventure_id: 'x', completed_at: '2026-10-01T08:00:00Z', adventures: adv('Uttarakhand') }]);
    let { progress } = await getBadgesProgress({ id: 'u1' });
    expect(progress.state_explorer).toMatchObject({ current: 4, earned: false }); // b counted once

    mockTables([hp('a'), hp('b'), hp('c'), hp('d'), hp('e')]);
    ({ progress } = await getBadgesProgress({ id: 'u1' }));
    expect(progress.state_explorer).toMatchObject({ current: 5, earned: true });
  });

  it('a failed expeditions query does not break the other badges', async () => {
    supabase.from.mockImplementation((table) => (table === 'adventure_attempts' ? qb({ data: null, error: { message: 'x' } }) : qb({ data: [] })));
    const { progress } = await getBadgesProgress({ id: 'u1' });
    expect(progress.first_expedition.current).toBe(0);
    expect(progress.gem_hunter.current).toBe(0);
  });
});
