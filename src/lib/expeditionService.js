/**
 * expeditionService.js — completing and syncing Spota Expedition attempts.
 *
 * Flow:
 *   trackRecorder.startRecording() → … trek … → trackRecorder.stopRecording()
 *   → addSummitPhoto(id, file)  (EXIF read from the ORIGINAL file, stored offline)
 *   → completeAttempt(id)       (queues; submits immediately if online)
 *   → syncPendingAttempts()     (on reconnect / app resume)
 *
 * The client only RECORDS. Status, score and AP are decided server-side
 * (verify-attempt Edge Function, Phase 1). Writes go through the
 * submit_attempt() RPC, which is idempotent on client_attempt_id.
 *
 * Offline queue: localStorage key `spota_pending_attempts` holds attempt ids;
 * the heavy payload (points + photos) stays in IndexedDB (expeditionStore).
 */

import { supabase } from './supabaseClient';
import * as store from './expeditionStore';
import { extractExifMeta } from './exifUtils';
import { compressImage } from './imageUtils';

export const PENDING_ATTEMPTS_KEY = 'spota_pending_attempts';
export const PHOTO_BUCKET = 'expedition-photos';

// ---------- offline queue (localStorage, ids only) ----------

export function getPendingAttemptIds() {
  try {
    const raw = localStorage.getItem(PENDING_ATTEMPTS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function setPendingAttemptIds(ids) {
  try {
    localStorage.setItem(PENDING_ATTEMPTS_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // storage unavailable — attempt status in IndexedDB still says 'queued'
  }
}

function enqueue(id) {
  setPendingAttemptIds([...getPendingAttemptIds(), id]);
}

function dequeue(id) {
  setPendingAttemptIds(getPendingAttemptIds().filter((x) => x !== id));
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// ---------- photos ----------

/**
 * Attach a summit/endpoint photo. EXIF (GPS + capture time) is read from the
 * original file first, because compression strips it. The compressed copy is stored offline.
 * @returns {Promise<{lat, lng, takenAt} | null>} the EXIF found (for UI hints)
 */
export async function addSummitPhoto(clientAttemptId, file) {
  if (!file) throw new Error('A photo is required');
  const attempt = await store.getAttempt(clientAttemptId);
  if (!attempt) throw new Error(`Unknown attempt ${clientAttemptId}`);

  const exif = await extractExifMeta(file);
  let blob;
  try {
    blob = await compressImage(file);
  } catch {
    blob = file;
  }
  await store.addPhoto(clientAttemptId, blob, exif);
  return exif;
}

// ---------- complete + sync ----------

/**
 * Mark a stopped attempt ready to submit. Submits right away when online,
 * otherwise leaves it queued for syncPendingAttempts().
 * @returns {Promise<{status: 'submitted'|'queued', attempt?: object, error?: string}>}
 */
export async function completeAttempt(clientAttemptId, { checkinsOnTime = null } = {}) {
  const attempt = await store.getAttempt(clientAttemptId);
  if (!attempt) throw new Error(`Unknown attempt ${clientAttemptId}`);
  if (attempt.status === 'recording') {
    throw new Error('Stop recording before completing the attempt');
  }

  const photos = await store.getPhotos(clientAttemptId);
  if (photos.length === 0) throw new Error('Add at least one summit photo to complete');

  if (attempt.status !== 'submitted') {
    await store.updateAttempt(clientAttemptId, { status: 'queued', checkinsOnTime });
    enqueue(clientAttemptId);
  }

  if (!isOnline()) return { status: 'queued' };
  return syncAttempt(clientAttemptId);
}

function extensionFor(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Upload photos + submit one queued attempt. Never throws for network/server
 * errors; it returns {status:'queued', error} so the caller can retry later.
 */
export async function syncAttempt(clientAttemptId) {
  const attempt = await store.getAttempt(clientAttemptId);
  if (!attempt) {
    dequeue(clientAttemptId);
    return { status: 'missing' };
  }
  if (attempt.status === 'submitted') {
    dequeue(clientAttemptId);
    return { status: 'submitted', attempt };
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (userError || !userId) throw new Error('Sign in to submit your expedition');

    const photos = await store.getPhotos(clientAttemptId);
    const photoPaths = [];
    const photoMeta = [];
    for (const photo of photos) {
      const path = `${userId}/${clientAttemptId}/${photo.index}.${extensionFor(photo.type)}`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, photo.blob, { upsert: true, contentType: photo.type });
      if (uploadError) throw uploadError;
      photoPaths.push(path);
      photoMeta.push({
        path,
        lat: photo.exif?.lat ?? null,
        lng: photo.exif?.lng ?? null,
        taken_at: photo.exif?.takenAt ?? null
      });
    }

    const points = await store.getPoints(clientAttemptId);
    const { data, error } = await supabase.rpc('submit_attempt', {
      p_client_attempt_id: clientAttemptId,
      p_adventure_id: attempt.adventureId,
      p_started_at: attempt.startedAt,
      p_completed_at: attempt.completedAt || new Date().toISOString(),
      p_points: points,
      p_photo_paths: photoPaths,
      p_photo_meta: photoMeta,
      p_checkins_on_time: attempt.checkinsOnTime ?? null,
      p_is_guided: Boolean(attempt.isGuided),
      p_safe_trek_id: attempt.safeTrekId ?? null
    });
    if (error) throw error;

    const updated = await store.updateAttempt(clientAttemptId, {
      status: 'submitted',
      serverId: data?.id ?? null,
      // Phase 1: submit_attempt verifies immediately → verified | pending | rejected
      serverStatus: data?.status ?? 'submitted',
      awardedAp: data?.awarded_ap ?? null,
      verificationScore: data?.verification_score ?? null,
      submittedAt: new Date().toISOString(),
      lastError: null
    });
    // Server now holds the track + photos; free device storage, keep the summary.
    await store.purgeAttemptPayload(clientAttemptId);
    dequeue(clientAttemptId);
    return { status: 'submitted', attempt: updated };
  } catch (err) {
    const message = err?.message || String(err);
    await store.updateAttempt(clientAttemptId, { status: 'queued', lastError: message }).catch(() => {});
    enqueue(clientAttemptId);
    return { status: 'queued', error: message };
  }
}

let syncInFlight = null;

/** Submit every queued attempt, one at a time. Safe to call repeatedly. */
export function syncPendingAttempts() {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    const results = [];
    if (!isOnline()) return results;
    for (const id of getPendingAttemptIds()) {
      results.push({ clientAttemptId: id, ...(await syncAttempt(id)) });
    }
    return results;
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

/** Auto-sync when the device comes back online. Returns a cleanup function. */
export function registerAutoSync() {
  if (typeof window === 'undefined') return () => {};
  const handler = () => {
    syncPendingAttempts();
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
