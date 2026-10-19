import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { supabase } from '../supabaseClient';
import {
  canRequestVouch, requestVouch, validateRoute, submitRoute, getChallenges,
  createChallenge, challengeScopeLabel
} from '../communityService';

const setOnline = (v) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v });
const DAY = 86400000;

const route = (over = {}) => ({
  name: 'Prashar Lake', state: 'Himachal Pradesh', region: 'Mandi', grade: '2', distanceKm: '8',
  gainM: '900', maxAltM: '2730', days: '1', endLat: '31.7546', endLng: '77.1018', startLat: '', startLng: '', notes: '', ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setOnline(true);
});

describe('canRequestVouch', () => {
  const now = Date.parse('2026-10-16T10:00:00Z');
  const base = { status: 'pending', completed_at: new Date(now - 2 * DAY).toISOString(), attestation_bonus: 0 };

  it('allows pending and rejected treks within 14 days', () => {
    expect(canRequestVouch(base, now)).toBe(true);
    expect(canRequestVouch({ ...base, status: 'rejected' }, now)).toBe(true);
  });

  it('refuses verified, admin-reviewed, already-boosted or old treks', () => {
    expect(canRequestVouch({ ...base, status: 'verified' }, now)).toBe(false);
    expect(canRequestVouch({ ...base, reviewed_at: '2026-10-15T00:00:00Z' }, now)).toBe(false);
    expect(canRequestVouch({ ...base, attestation_bonus: 15 }, now)).toBe(false);
    expect(canRequestVouch({ ...base, completed_at: new Date(now - 15 * DAY).toISOString() }, now)).toBe(false);
  });
});

describe('requestVouch', () => {
  it('strips @ and whitespace and calls the RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 't1', status: 'requested' }, error: null });
    await requestVouch('att1', '  @Buddy ', 'guide');
    expect(supabase.rpc).toHaveBeenCalledWith('request_attestation', { p_attempt: 'att1', p_username: 'Buddy', p_role: 'guide' });
  });

  it('surfaces server errors and rejects an empty username without calling the server', async () => {
    await expect(requestVouch('att1', ' @ ')).rejects.toThrow('username');
    expect(supabase.rpc).not.toHaveBeenCalled();
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Buddies need to be Ridge Runner tier or higher' } });
    await expect(requestVouch('att1', 'low')).rejects.toThrow('Ridge Runner');
  });
});

describe('route submissions', () => {
  it('validates the fields the database checks', () => {
    expect(validateRoute(route())).toBeNull();
    expect(validateRoute(route({ name: 'ab' }))).toMatch(/name/);
    expect(validateRoute(route({ state: '' }))).toMatch(/state/);
    expect(validateRoute(route({ grade: '7' }))).toMatch(/Grade/);
    expect(validateRoute(route({ distanceKm: '0' }))).toMatch(/Distance/);
    expect(validateRoute(route({ maxAltM: '9500' }))).toMatch(/altitude/);
    expect(validateRoute(route({ endLat: '' }))).toMatch(/endpoint/);
    expect(validateRoute(route({ endLng: '200' }))).toMatch(/endpoint/);
  });

  it('sends numbers and nulls for optional start point', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 's1', status: 'pending' }, error: null });
    await submitRoute(route({ gainM: '900.6' }));
    const [fn, args] = supabase.rpc.mock.calls[0];
    expect(fn).toBe('submit_adventure');
    expect(args).toMatchObject({ p_grade: 2, p_distance_km: 8, p_gain_m: 901, p_end_lat: 31.7546, p_start_lat: null, p_notes: null });
  });

  it('never calls the server with invalid input', async () => {
    await expect(submitRoute(route({ endLat: 'x' }))).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('challenges', () => {
  it('caches the list and serves it offline', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'c1', title: 'Kullu Explorer' }], error: null });
    expect(await getChallenges()).toEqual({ items: [{ id: 'c1', title: 'Kullu Explorer' }], fromCache: false });
    setOnline(false);
    supabase.rpc.mockClear();
    expect(await getChallenges()).toEqual({ items: [{ id: 'c1', title: 'Kullu Explorer' }], fromCache: true });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('falls back to the cache when the server errors', async () => {
    localStorage.setItem('spota_challenges_cache', JSON.stringify([{ id: 'old' }]));
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await getChallenges()).toEqual({ items: [{ id: 'old' }], fromCache: true });
  });

  it('creates with IST day bounds and only the relevant scope field', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'c1' }, error: null });
    await createChallenge({
      title: 'Kullu Explorer', scopeType: 'region', scopeRegion: 'Kullu', scopeState: 'Himachal Pradesh',
      minGrade: '2', requiredCount: '2', startsAt: '2026-11-01', endsAt: '2026-12-31'
    });
    const [, args] = supabase.rpc.mock.calls[0];
    expect(args).toMatchObject({ p_scope_type: 'region', p_scope_region: 'Kullu', p_scope_state: null, p_adventure_ids: null, p_min_grade: 2, p_required_count: 2 });
    expect(args.p_starts_at).toBe('2026-10-31T18:30:00.000Z');
    expect(args.p_ends_at).toBe('2026-12-31T18:29:59.000Z');
  });

  it('rejects bad dates and counts before calling the server', async () => {
    await expect(createChallenge({ title: 'X ok', requiredCount: '0', startsAt: '2026-11-01', endsAt: '2026-12-01' })).rejects.toThrow('1–50');
    await expect(createChallenge({ title: 'X ok', requiredCount: '1', startsAt: '2026-12-01', endsAt: '2026-11-01' })).rejects.toThrow('after');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('labels scopes', () => {
    expect(challengeScopeLabel({ scope_type: 'region', scope_region: 'Kullu', min_grade: 2 })).toBe('Kullu treks, grade 2+');
    expect(challengeScopeLabel({ scope_type: 'state', scope_state: 'Uttarakhand', min_grade: 1 })).toBe('Uttarakhand treks');
    expect(challengeScopeLabel({ scope_type: 'adventures', adventures: [{ name: 'Triund' }, { name: 'Kareri Lake' }], min_grade: 1 })).toBe('Triund, Kareri Lake');
    expect(challengeScopeLabel({ scope_type: 'any', min_grade: 1 })).toBe('Any treks');
  });
});
