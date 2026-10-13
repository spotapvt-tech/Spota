/**
 * adventureCatalog.js — read the Expeditions adventure catalog.
 *
 * Offline-first: the last successful fetch is cached in localStorage
 * (`spota_adventures_cache`), so the picker still works at a trailhead with
 * no signal.
 *
 * PostgREST returns PostGIS geography columns as hex EWKB strings by default,
 * so endpoint points are decoded here (parsePoint) instead of needing a
 * DB view or RPC.
 */

import { supabase } from './supabaseClient';

export const ADVENTURES_CACHE_KEY = 'spota_adventures_cache';

const SELECT_COLUMNS = [
  'id', 'slug', 'name', 'grade', 'distance_km', 'elevation_gain_m', 'max_altitude_m',
  'typical_days', 'endpoint', 'endpoint_radius_m', 'country', 'state', 'terrain_region',
  'winter_start_md', 'winter_end_md', 'coords_verified'
].join(', ');

/**
 * Decode a POINT from hex (E)WKB, as returned by PostgREST, or from GeoJSON.
 * @returns {{lat: number, lng: number} | null}
 */
export function parsePoint(value) {
  if (!value) return null;

  // GeoJSON (if the API is ever configured to return it)
  if (typeof value === 'object' && value.type === 'Point' && Array.isArray(value.coordinates)) {
    const [lng, lat] = value.coordinates;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  if (typeof value !== 'string' || !/^[0-9a-fA-F]+$/.test(value) || value.length < 42) return null;

  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(value.substr(i * 2, 2), 16);
  }
  const view = new DataView(bytes.buffer);
  const little = view.getUint8(0) === 1;
  const type = view.getUint32(1, little);
  const hasSrid = (type & 0x20000000) !== 0;
  const geomType = type & 0x0fffffff;
  if (geomType !== 1) return null; // not a POINT

  let offset = 5 + (hasSrid ? 4 : 0);
  if (bytes.length < offset + 16) return null;
  const lng = view.getFloat64(offset, little);
  offset += 8;
  const lat = view.getFloat64(offset, little);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function normalizeAdventure(row) {
  const endpoint = parsePoint(row.endpoint);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    grade: Number(row.grade),
    distanceKm: Number(row.distance_km),
    elevationGainM: Number(row.elevation_gain_m),
    maxAltitudeM: Number(row.max_altitude_m),
    typicalDays: Number(row.typical_days) || 1,
    endpointLat: endpoint?.lat ?? null,
    endpointLng: endpoint?.lng ?? null,
    endpointRadiusM: Number(row.endpoint_radius_m) || 150,
    country: row.country,
    state: row.state,
    terrainRegion: row.terrain_region,
    winterStartMd: row.winter_start_md || null,
    winterEndMd: row.winter_end_md || null,
    coordsVerified: Boolean(row.coords_verified)
  };
}

export function getCachedAdventures() {
  try {
    const raw = localStorage.getItem(ADVENTURES_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function setCachedAdventures(items) {
  try {
    localStorage.setItem(ADVENTURES_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items }));
  } catch {
    // storage unavailable: the picker still works for this session
  }
}

/**
 * Fetch active adventures, sorted by state then name. Falls back to the
 * cached list when offline or on error.
 * @returns {Promise<{items: object[], fromCache: boolean, error?: string}>}
 */
export async function fetchAdventures() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { items: getCachedAdventures(), fromCache: true };
  }
  try {
    const { data, error } = await supabase
      .from('adventures')
      .select(SELECT_COLUMNS)
      .eq('is_active', true)
      .order('state', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    const items = (data || []).map(normalizeAdventure);
    setCachedAdventures(items);
    return { items, fromCache: false };
  } catch (err) {
    return { items: getCachedAdventures(), fromCache: true, error: err?.message || String(err) };
  }
}
