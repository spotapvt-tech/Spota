import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn() } }));

import { supabase } from '../supabaseClient';
import {
  parsePoint,
  normalizeAdventure,
  fetchAdventures,
  getCachedAdventures,
  ADVENTURES_CACHE_KEY
} from '../adventureCatalog';

// Captured from the live Supabase REST API (adventures?slug=eq.triund), 13 Oct 2026
const TRIUND_EWKB = '0101000020E610000018265305A3165340E17A14AE47214040';

const row = {
  id: 'a1', slug: 'triund', name: 'Triund', grade: 1, distance_km: 18.0, elevation_gain_m: 875,
  max_altitude_m: 2850, typical_days: 1, endpoint: TRIUND_EWKB, endpoint_radius_m: 300,
  country: 'IN', state: 'Himachal Pradesh', terrain_region: 'Dhauladhar',
  winter_start_md: '12-15', winter_end_md: '02-28', coords_verified: false
};

function builder(result) {
  const b = { select: () => b, eq: () => b, order: () => b, then: (res) => res(result) };
  return b;
}

function setOnline(v) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v });
}

describe('parsePoint', () => {
  it('decodes little-endian EWKB with SRID (PostgREST format)', () => {
    const p = parsePoint(TRIUND_EWKB);
    expect(p.lat).toBeCloseTo(32.26, 6);
    expect(p.lng).toBeCloseTo(76.3537, 6);
  });

  it('decodes big-endian WKB without SRID', () => {
    const p = parsePoint('0000000001405357ae147ae1484040228f5c28f5c3');
    expect(p.lat).toBeCloseTo(32.27, 6);
    expect(p.lng).toBeCloseTo(77.37, 6);
  });

  it('accepts GeoJSON points', () => {
    expect(parsePoint({ type: 'Point', coordinates: [76.35, 32.26] })).toEqual({ lat: 32.26, lng: 76.35 });
  });

  it('rejects junk, non-points and truncated input', () => {
    expect(parsePoint(null)).toBeNull();
    expect(parsePoint('not-hex')).toBeNull();
    expect(parsePoint('0101000020E6100000')).toBeNull();
    // LINESTRING type (2)
    expect(parsePoint('0102000020E610000018265305A3165340E17A14AE47214040')).toBeNull();
  });
});

describe('normalizeAdventure', () => {
  it('maps DB columns to camelCase with decoded endpoint', () => {
    const a = normalizeAdventure(row);
    expect(a).toMatchObject({
      id: 'a1', name: 'Triund', grade: 1, distanceKm: 18, elevationGainM: 875, maxAltitudeM: 2850,
      endpointRadiusM: 300, state: 'Himachal Pradesh', terrainRegion: 'Dhauladhar',
      winterStartMd: '12-15', winterEndMd: '02-28', coordsVerified: false
    });
    expect(a.endpointLat).toBeCloseTo(32.26, 5);
  });
});

describe('fetchAdventures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setOnline(true);
  });

  it('fetches, normalizes and caches', async () => {
    supabase.from.mockReturnValue(builder({ data: [row], error: null }));
    const res = await fetchAdventures();
    expect(supabase.from).toHaveBeenCalledWith('adventures');
    expect(res.fromCache).toBe(false);
    expect(res.items[0].name).toBe('Triund');
    expect(getCachedAdventures()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(ADVENTURES_CACHE_KEY)).savedAt).toBeTypeOf('number');
  });

  it('falls back to the cache on error', async () => {
    supabase.from.mockReturnValue(builder({ data: [row], error: null }));
    await fetchAdventures();
    supabase.from.mockReturnValue(builder({ data: null, error: { message: 'boom' } }));
    const res = await fetchAdventures();
    expect(res).toMatchObject({ fromCache: true, error: 'boom' });
    expect(res.items).toHaveLength(1);
  });

  it('uses the cache without a network call when offline', async () => {
    setOnline(false);
    const res = await fetchAdventures();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(res).toEqual({ items: [], fromCache: true });
  });
});
