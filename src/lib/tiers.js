/**
 * tiers.js — Expedition tiers (BRD FR-6). Thresholds must match
 * compute_tier() in supabase_expeditions_setup.sql.
 */

export const TIERS = [
  { id: 'wanderer', name: 'Wanderer', min: 0, emoji: '🧭', unlock: 'Start your first expedition' },
  { id: 'trailblazer', name: 'Trailblazer', min: 500, emoji: '🥾', unlock: 'Profile frame' },
  { id: 'ridge_runner', name: 'Ridge Runner', min: 2000, emoji: '⛰️', unlock: 'Can attest other trekkers (coming soon)' },
  { id: 'summiteer', name: 'Summiteer', min: 6000, emoji: '🏔️', unlock: 'Agency package discounts' },
  { id: 'expedition_legend', name: 'Expedition Legend', min: 15000, emoji: '🏆', unlock: 'Featured profile + early route access' }
];

export function tierFor(ap = 0) {
  let current = TIERS[0];
  for (const t of TIERS) if (ap >= t.min) current = t;
  return current;
}

export function tierById(id) {
  return TIERS.find((t) => t.id === id) || TIERS[0];
}

/** Progress toward the next tier: { current, next, remaining, ratio } (next null at the top). */
export function tierProgress(ap = 0) {
  const current = tierFor(ap);
  const idx = TIERS.indexOf(current);
  const next = TIERS[idx + 1] || null;
  if (!next) return { current, next: null, remaining: 0, ratio: 1 };
  const span = next.min - current.min;
  return { current, next, remaining: next.min - ap, ratio: Math.min(1, Math.max(0, (ap - current.min) / span)) };
}
