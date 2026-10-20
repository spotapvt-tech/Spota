/**
 * communityService.js — Spota Expeditions V2: buddy/guide vouches, user-submitted
 * routes, agency challenges. All writes go through SECURITY DEFINER RPCs in
 * supabase_expeditions_v2.sql (no direct table writes).
 *
 * Challenges are cached in localStorage so the list still opens offline
 * (CLAUDE.md offline rule).
 */

import { supabase } from './supabaseClient';

const CHALLENGES_CACHE = 'spota_challenges_cache';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

// ---------- vouches (attestations) ----------

export const VOUCH_BONUS = 15;
export const VOUCH_WINDOW_DAYS = 14;

/** True when the trek can still get a vouch (server re-checks everything). */
export function canRequestVouch(attempt, now = Date.now()) {
  if (!attempt || !['pending', 'rejected'].includes(attempt.status)) return false;
  if (attempt.reviewed_by || attempt.reviewed_at) return false;
  if ((attempt.attestation_bonus || 0) > 0) return false;
  const done = new Date(attempt.completed_at || attempt.submitted_at).getTime();
  return Number.isFinite(done) && now - done <= VOUCH_WINDOW_DAYS * 86400000;
}

export async function requestVouch(attemptId, username, role = 'buddy') {
  const name = String(username || '').trim().replace(/^@/, '');
  if (!name) throw new Error('Enter their Spota username');
  return unwrap(await supabase.rpc('request_attestation', { p_attempt: attemptId, p_username: name, p_role: role }));
}

export async function respondVouch(attestationId, confirm, note = null) {
  return unwrap(await supabase.rpc('respond_attestation', {
    p_attestation: attestationId, p_confirm: confirm, p_note: note || null
  }));
}

/** @returns {Promise<{incoming: object[], outgoing: object[]}>} */
export async function listVouches() {
  const data = unwrap(await supabase.rpc('list_attestations'));
  return { incoming: data?.incoming || [], outgoing: data?.outgoing || [] };
}

// ---------- route submissions ----------

/** Client-side validation that mirrors the table checks; returns an error string or null. */
export function validateRoute(f) {
  const num = (v) => (v === '' || v == null ? NaN : Number(v));
  if (!f.name || f.name.trim().length < 3) return 'Give the route a name (3+ characters)';
  if (!f.state) return 'Pick a state';
  if (!f.region || f.region.trim().length < 2) return 'Add the region / valley';
  const g = num(f.grade);
  if (!(g >= 1 && g <= 5)) return 'Grade must be 1–5';
  const d = num(f.distanceKm);
  if (!(d > 0 && d <= 500)) return 'Distance must be between 0 and 500 km';
  const gain = num(f.gainM);
  if (!(gain >= 0 && gain <= 10000)) return 'Elevation gain must be 0–10,000 m';
  const alt = num(f.maxAltM);
  if (!(alt >= 1 && alt <= 9000)) return 'Max altitude must be 1–9,000 m';
  const days = num(f.days);
  if (!(days >= 1 && days <= 30)) return 'Days must be 1–30';
  const lat = num(f.endLat);
  const lng = num(f.endLng);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return 'Add the summit / endpoint location';
  return null;
}

export async function submitRoute(f) {
  const problem = validateRoute(f);
  if (problem) throw new Error(problem);
  const opt = (v) => (v === '' || v == null ? null : Number(v));
  return unwrap(await supabase.rpc('submit_adventure', {
    p_name: f.name.trim(),
    p_state: f.state,
    p_region: f.region.trim(),
    p_grade: Number(f.grade),
    p_distance_km: Number(f.distanceKm),
    p_gain_m: Math.round(Number(f.gainM)),
    p_max_alt_m: Math.round(Number(f.maxAltM)),
    p_days: Number(f.days),
    p_end_lat: Number(f.endLat),
    p_end_lng: Number(f.endLng),
    p_start_lat: opt(f.startLat),
    p_start_lng: opt(f.startLng),
    p_notes: f.notes?.trim() || null
  }));
}

export async function listMyRouteSubmissions(userId) {
  return unwrap(await supabase
    .from('adventure_submissions')
    .select('id, name, state, terrain_region, grade, status, review_note, created_at')
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false })
    .limit(20)) || [];
}

// admin
export async function listPendingRouteSubmissions() {
  return unwrap(await supabase
    .from('adventure_submissions')
    .select('id, name, state, terrain_region, grade, distance_km, elevation_gain_m, max_altitude_m, typical_days, endpoint, notes, created_at, profiles!adventure_submissions_submitted_by_fkey(username)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50)) || [];
}

export async function reviewRouteSubmission(id, decision, { note, coordsVerified = false, radiusM = 150 } = {}) {
  return unwrap(await supabase.rpc('review_adventure_submission', {
    p_submission: id, p_decision: decision, p_note: note || null,
    p_coords_verified: coordsVerified, p_radius_m: radiusM
  }));
}

export async function listAgenciesForAdmin() {
  return unwrap(await supabase.rpc('list_agencies_for_admin')) || [];
}

export async function setAgencyPartner(agencyId, verified) {
  return unwrap(await supabase.rpc('set_agency_partner', { p_agency: agencyId, p_verified: verified }));
}

// ---------- challenges ----------

/** @returns {Promise<{items: object[], fromCache: boolean}>} */
export async function getChallenges() {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!offline) {
    const { data, error } = await supabase.rpc('get_challenges');
    if (!error && Array.isArray(data)) {
      try { localStorage.setItem(CHALLENGES_CACHE, JSON.stringify(data)); } catch { /* storage full */ }
      return { items: data, fromCache: false };
    }
  }
  try {
    const raw = localStorage.getItem(CHALLENGES_CACHE);
    return { items: raw ? JSON.parse(raw) : [], fromCache: true };
  } catch {
    return { items: [], fromCache: true };
  }
}

export async function joinChallenge(id, join = true) {
  return unwrap(await supabase.rpc('join_challenge', { p_challenge: id, p_join: join }));
}

export async function getMyChallenges() {
  return unwrap(await supabase.rpc('get_my_challenges')) || [];
}

export async function createChallenge(f) {
  if (!f.title || f.title.trim().length < 3) throw new Error('Give the challenge a title');
  const required = Number(f.requiredCount);
  if (!(required >= 1 && required <= 50)) throw new Error('Required treks must be 1–50');
  if (!f.startsAt || !f.endsAt) throw new Error('Pick start and end dates');
  const starts = new Date(`${f.startsAt}T00:00:00+05:30`);
  const ends = new Date(`${f.endsAt}T23:59:59+05:30`);
  if (!(ends > starts)) throw new Error('End date must be after the start date');
  return unwrap(await supabase.rpc('create_challenge', {
    p_title: f.title.trim(),
    p_description: f.description?.trim() || null,
    p_reward: f.reward?.trim() || null,
    p_scope_type: f.scopeType || 'any',
    p_scope_state: f.scopeType === 'state' ? f.scopeState : null,
    p_scope_region: f.scopeType === 'region' ? f.scopeRegion : null,
    p_adventure_ids: f.scopeType === 'adventures' ? f.adventureIds : null,
    p_min_grade: Number(f.minGrade) || 1,
    p_required_count: required,
    p_starts_at: starts.toISOString(),
    p_ends_at: ends.toISOString()
  }));
}

export async function setChallengeActive(id, active) {
  return unwrap(await supabase.rpc('set_challenge_active', { p_challenge: id, p_active: active }));
}

/** Human label for a challenge's scope, e.g. "Kullu treks, grade 2+". */
export function challengeScopeLabel(c) {
  const where = c.scope_type === 'state' ? c.scope_state
    : c.scope_type === 'region' ? c.scope_region
    : c.scope_type === 'adventures' ? (c.adventures || []).map((a) => a.name).join(', ') || 'Selected treks'
    : 'Any';
  const grade = c.min_grade > 1 ? `, grade ${c.min_grade}+` : '';
  return c.scope_type === 'adventures' ? `${where}${grade}` : `${where} treks${grade}`;
}
