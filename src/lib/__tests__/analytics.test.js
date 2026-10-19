import { describe, it, expect, beforeEach, vi } from 'vitest';

const insert = vi.fn();
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(() => ({ insert }))
  }
}));

import { supabase } from '../supabaseClient';
import { track, flushEvents, PENDING_EVENTS_KEY } from '../analytics';

const signedIn = (id = 'u1') => supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id } } } });
const setOnline = (v) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v });
const queue = () => JSON.parse(localStorage.getItem(PENDING_EVENTS_KEY) || '[]');

describe('analytics.track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setOnline(true);
    insert.mockResolvedValue({ error: null });
  });

  it('sends an event as the signed-in user into analytics_events', async () => {
    signedIn();
    expect(await track('expedition_started', { adventure_id: 'a1' })).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('analytics_events');
    const [rows] = insert.mock.calls[0];
    expect(rows[0]).toMatchObject({ event_type: 'expedition_started', user_id: 'u1', details: { adventure_id: 'a1' } });
    expect(rows[0].details.client_ts).toBeTruthy();
  });

  it('skips guests entirely', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await track('leaderboard_viewed')).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(queue()).toHaveLength(0);
  });

  it('queues offline and flushes when back online', async () => {
    signedIn();
    setOnline(false);
    expect(await track('leaderboard_viewed', { lens: 'home' })).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(queue()).toHaveLength(1);

    setOnline(true);
    expect(await flushEvents()).toBe(1);
    expect(insert.mock.calls[0][0][0].event_type).toBe('leaderboard_viewed');
    expect(queue()).toHaveLength(0);
  });

  it('queues on a server error and never throws', async () => {
    signedIn();
    insert.mockResolvedValueOnce({ error: { message: 'boom' } });
    await expect(track('rank_card_shared')).resolves.toBe(false);
    expect(queue()).toHaveLength(1);
  });

  it('only flushes the current user\'s queued events', async () => {
    localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify([
      { event_type: 'a', user_id: 'u1', details: {} },
      { event_type: 'b', user_id: 'other', details: {} }
    ]));
    signedIn('u1');
    expect(await flushEvents()).toBe(1);
    expect(queue()).toEqual([{ event_type: 'b', user_id: 'other', details: {} }]);
  });
});
