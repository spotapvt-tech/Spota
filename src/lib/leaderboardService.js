/**
 * leaderboardService.js — leaderboards, expedition profile, appeals, admin review.
 *
 * Leaderboards come from the get_leaderboard() RPC (supabase_expeditions_phase1_2.sql).
 * The last result per board is cached in localStorage so boards still open offline
 * (CLAUDE.md offline rule); the UI shows "last updated" when serving the cache.
 */

import { supabase } from './supabaseClient';

const CACHE_PREFIX = 'spota_lb_cache:';

function cacheKey({ lens, level, scope, window }) {
  return `${CACHE_PREFIX}${lens}:${level}:${scope || ''}:${window}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // storage unavailable: still fine online
  }
}

/**
 * @param {{lens:'home'|'terrain', level:'global'|'country'|'state'|'region', scope?:string|null, window?:'all'|'season', limit?:number}} q
 * @returns {Promise<{data: object|null, fromCache: boolean, savedAt?: number, error?: string}>}
 */
export async function getLeaderboard({ lens, level, scope = null, window = 'all', limit = 50 }) {
  const key = cacheKey({ lens, level, scope, window });
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!offline) {
    const { data, error } = await supabase.rpc('get_leaderboard', {
      p_lens: lens, p_level: level, p_scope: scope, p_window: window, p_limit: limit
    });
    if (!error && data) {
      writeCache(key, data);
      return { data, fromCache: false };
    }
    const cached = readCache(key);
    return { data: cached?.data ?? null, fromCache: Boolean(cached), savedAt: cached?.savedAt, error: error?.message || 'Could not load leaderboard' };
  }
  const cached = readCache(key);
  return { data: cached?.data ?? null, fromCache: true, savedAt: cached?.savedAt };
}

/** Tier, AP, home location, visibility and recent attempts for the signed-in user. */
export async function getMyExpeditionProfile(userId) {
  const [profileRes, attemptsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('tier, total_ap, home_country, home_state, home_region, show_on_leaderboards')
      .eq('id', userId)
      .single(),
    supabase
      .from('adventure_attempts')
      .select('id, status, awarded_ap, verification_score, submitted_at, completed_at, reviewed_at, attestation_bonus, appeal_used, review_note, adventures(name, state, terrain_region)')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(20)
  ]);
  if (profileRes.error) throw profileRes.error;
  return { profile: profileRes.data, attempts: attemptsRes.data || [] };
}

export async function updateExpeditionSettings(userId, patch) {
  const allowed = ['home_country', 'home_state', 'home_region', 'show_on_leaderboards'];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  const { error } = await supabase.from('profiles').update(clean).eq('id', userId);
  if (error) throw error;
}

export async function appealAttempt(attemptId) {
  const { data, error } = await supabase.rpc('appeal_attempt', { p_attempt: attemptId });
  if (error) throw error;
  return data;
}

// ---------- admin ----------

export async function listAttemptsForReview() {
  const { data, error } = await supabase
    .from('adventure_attempts')
    .select('id, status, verification_score, verification_breakdown, track_point_count, mock_point_count, photo_paths, started_at, completed_at, submitted_at, appeal_used, is_guided, adventures(name, state, terrain_region), profiles!adventure_attempts_user_id_fkey(username)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function getPhotoUrls(paths = []) {
  if (!paths.length) return [];
  const { data, error } = await supabase.storage.from('expedition-photos').createSignedUrls(paths, 600);
  if (error) return [];
  return (data || []).map((d) => d.signedUrl).filter(Boolean);
}

export async function reviewAttempt(attemptId, decision, note) {
  const { data, error } = await supabase.rpc('review_attempt', { p_attempt: attemptId, p_decision: decision, p_note: note || null });
  if (error) throw error;
  return data;
}

/** Admin: beta tuning numbers from expedition_stats() (supabase_expeditions_phase3.sql). */
export async function getExpeditionStats(days = 30) {
  const { data, error } = await supabase.rpc('expedition_stats', { p_days: days });
  if (error) throw error;
  return data;
}
