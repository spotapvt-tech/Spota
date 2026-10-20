/**
 * analytics.js — fire-and-forget product events into `analytics_events`
 * (Expeditions plan §8). Never blocks or throws into the UI.
 *
 * - Signed-in users only (RLS: a user can only log events as themselves).
 * - Offline / failed sends queue in localStorage (`spota_pending_events`, max 200)
 *   and flush on the next successful track() or when the device comes online.
 * - Trust-critical events (attempt verified / pending / rejected, appeals,
 *   tier ups) are logged server-side by triggers, not here.
 */

import { supabase } from './supabaseClient';

export const PENDING_EVENTS_KEY = 'spota_pending_events';
const MAX_QUEUE = 200;

function readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(PENDING_EVENTS_KEY) || '[]');
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function writeQueue(q) {
  try {
    localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    // storage unavailable: drop silently, analytics must never break the app
  }
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch {
    return null;
  }
}

async function send(rows) {
  const { error } = await supabase.from('analytics_events').insert(rows);
  if (error) throw error;
}

let flushing = null;

/** Send any queued events. Safe to call often. */
export function flushEvents() {
  if (flushing) return flushing;
  flushing = (async () => {
    const queue = readQueue();
    if (!queue.length) return 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    const userId = await currentUserId();
    if (!userId) return 0;
    const mine = queue.filter((e) => e.user_id === userId);
    try {
      if (mine.length) await send(mine);
      writeQueue(queue.filter((e) => e.user_id !== userId));
      return mine.length;
    } catch {
      return 0;
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Log a product event. Resolves to true if sent now, false if queued/skipped.
 * @param {string} eventType snake_case, e.g. 'expedition_started'
 * @param {object} [details] small JSON payload (keep < 4 KB; no personal data)
 */
export async function track(eventType, details = {}) {
  try {
    const userId = await currentUserId();
    if (!userId) return false; // guests aren't tracked
    const row = { event_type: eventType, user_id: userId, details: { ...details, client_ts: new Date().toISOString() } };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      writeQueue([...readQueue(), row]);
      return false;
    }
    try {
      await send([row]);
      flushEvents();
      return true;
    } catch {
      writeQueue([...readQueue(), row]);
      return false;
    }
  } catch {
    return false;
  }
}

/** Flush the queue whenever the device comes back online. Returns cleanup. */
export function registerAnalyticsAutoFlush() {
  if (typeof window === 'undefined') return () => {};
  const handler = () => { flushEvents(); };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
