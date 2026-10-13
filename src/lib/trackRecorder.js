/**
 * trackRecorder.js — offline-first GPS track recording for Spota Expeditions.
 *
 * Location source, best first:
 *   1. @capacitor-community/background-geolocation (Android, screen-off,
 *      foreground-service notification, reports mock locations). It is used
 *      only if the plugin is installed. Approval is pending (see implementation plan §4.3).
 *   2. navigator.geolocation.watchPosition, which works on web and inside the
 *      Capacitor WebView, but only while the app is in the foreground.
 *
 * Every kept fix is written to IndexedDB immediately (expeditionStore), so a
 * crash, app kill or dead battery loses at most the in-flight point.
 * The active attempt id is mirrored in localStorage so the UI can resume.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import * as store from './expeditionStore';

export const ACTIVE_EXPEDITION_KEY = 'spota_active_expedition';
export const DEFAULT_SAMPLE_MS = 30_000;
export const LOW_POWER_SAMPLE_MS = 60_000;
export const MAX_ACCURACY_M = 100;
const ELEVATION_NOISE_M = 5;

// Registered lazily (first native use) so HMR / test module resets don't
// trigger Capacitor's "already registered" warning.
let backgroundPlugin = null;
function getBackgroundPlugin() {
  if (!backgroundPlugin) backgroundPlugin = registerPlugin('BackgroundGeolocation');
  return backgroundPlugin;
}

// ------------------------------------------------------------------
// Pure helpers (unit-tested)
// ------------------------------------------------------------------

export function haversineM(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Decide whether a new fix should be stored.
 * Drops invalid / low-accuracy fixes and throttles to one per sample interval.
 */
export function shouldKeepPoint(prev, next, { sampleIntervalMs = DEFAULT_SAMPLE_MS, maxAccuracyM = MAX_ACCURACY_M } = {}) {
  if (!next || !Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) return false;
  if (next.lat === 0 && next.lng === 0) return false;
  if (next.acc != null && next.acc > maxAccuracyM) return false;
  if (!prev) return true;
  if (!(next.t > prev.t)) return false;
  return next.t - prev.t >= sampleIntervalMs;
}

/**
 * Summary stats for live UI and AP preview. Elevation gain uses a hysteresis
 * band so GPS altitude jitter doesn't inflate the climb.
 */
export function computeTrackStats(points = []) {
  let distanceM = 0;
  let gainM = 0;
  let maxAltitudeM = null;
  let anchorAlt = null;
  let mockCount = 0;

  points.forEach((p, i) => {
    if (p.mock) mockCount += 1;
    if (i > 0) distanceM += haversineM(points[i - 1], p);

    if (Number.isFinite(p.alt)) {
      if (maxAltitudeM === null || p.alt > maxAltitudeM) maxAltitudeM = p.alt;
      if (anchorAlt === null) {
        anchorAlt = p.alt;
      } else if (p.alt - anchorAlt >= ELEVATION_NOISE_M) {
        gainM += p.alt - anchorAlt;
        anchorAlt = p.alt;
      } else if (anchorAlt - p.alt >= ELEVATION_NOISE_M) {
        anchorAlt = p.alt;
      }
    }
  });

  const durationMin = points.length > 1 ? (points[points.length - 1].t - points[0].t) / 60_000 : 0;

  return {
    pointCount: points.length,
    distanceKm: Math.round(distanceM / 10) / 100,
    elevationGainM: Math.round(gainM),
    maxAltitudeM: maxAltitudeM === null ? null : Math.round(maxAltitudeM),
    durationMin: Math.round(durationMin),
    mockCount
  };
}

// ------------------------------------------------------------------
// Location sources
// ------------------------------------------------------------------

export function hasBackgroundPlugin() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BackgroundGeolocation');
}

async function backgroundSource(onFix, onError) {
  const BackgroundGeolocation = getBackgroundPlugin();
  const id = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'Spota is recording your expedition',
      backgroundMessage: 'Tracking your route so your adventure can be verified.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 10
    },
    (location, error) => {
      if (error) {
        onError(error);
        return;
      }
      onFix({
        lat: location.latitude,
        lng: location.longitude,
        alt: location.altitude ?? null,
        acc: location.accuracy ?? null,
        t: location.time ?? Date.now(),
        mock: Boolean(location.simulated)
      });
    }
  );
  return { kind: 'background', stop: () => BackgroundGeolocation.removeWatcher({ id }) };
}

async function foregroundSource(onFix, onError) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not available on this device');
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        alt: pos.coords.altitude ?? null,
        acc: pos.coords.accuracy ?? null,
        t: pos.timestamp || Date.now(),
        mock: false
      }),
    onError,
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 60_000 }
  );
  return { kind: 'foreground', stop: () => navigator.geolocation.clearWatch(id) };
}

function defaultSource(onFix, onError) {
  return hasBackgroundPlugin() ? backgroundSource(onFix, onError) : foregroundSource(onFix, onError);
}

// ------------------------------------------------------------------
// Session (module singleton — one expedition at a time)
// ------------------------------------------------------------------

let session = null;
const listeners = new Set();

function emit(event) {
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      console.warn('[trackRecorder] listener failed', err);
    }
  });
}

/** Subscribe to {type:'point'|'error'|'started'|'stopped', ...}. Returns unsubscribe. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setActiveId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_EXPEDITION_KEY, id);
    else localStorage.removeItem(ACTIVE_EXPEDITION_KEY);
  } catch {
    // storage unavailable (private mode) — IndexedDB status is the source of truth
  }
}

function getActiveId() {
  try {
    return localStorage.getItem(ACTIVE_EXPEDITION_KEY);
  } catch {
    return null;
  }
}

function newAttemptId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function attachSource(attempt, lastPoint, locationSource) {
  session = {
    clientAttemptId: attempt.clientAttemptId,
    sampleIntervalMs: attempt.sampleIntervalMs,
    lastPoint,
    writeChain: Promise.resolve(),
    handle: null
  };

  const current = session;
  const onFix = (fix) => {
    if (session !== current) return; // stale callback after stop
    if (!shouldKeepPoint(current.lastPoint, fix, { sampleIntervalMs: current.sampleIntervalMs })) return;
    current.lastPoint = fix;
    current.writeChain = current.writeChain
      .then(() => store.appendPoint(current.clientAttemptId, fix))
      .catch((err) => emit({ type: 'error', error: err }));
    emit({ type: 'point', point: fix, clientAttemptId: current.clientAttemptId });
  };
  const onError = (error) => emit({ type: 'error', error });

  try {
    current.handle = await (locationSource || defaultSource)(onFix, onError);
  } catch (err) {
    session = null;
    throw err;
  }
  return current.handle.kind;
}

/**
 * Start recording a new expedition attempt.
 * @returns {Promise<{clientAttemptId: string, sourceKind: 'background'|'foreground'|string}>}
 */
export async function startRecording({
  adventureId,
  adventureName = null,
  safeTrekId = null,
  isGuided = false,
  lowPower = false,
  locationSource = null
} = {}) {
  if (!adventureId) throw new Error('adventureId is required');
  if (session) throw new Error('An expedition is already being recorded');

  const attempt = {
    clientAttemptId: newAttemptId(),
    adventureId,
    adventureName,
    safeTrekId,
    isGuided: Boolean(isGuided),
    sampleIntervalMs: lowPower ? LOW_POWER_SAMPLE_MS : DEFAULT_SAMPLE_MS,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'recording', // recording → completed_local → queued → submitted
    pointCount: 0
  };

  await store.putAttempt(attempt);
  setActiveId(attempt.clientAttemptId);

  let sourceKind;
  try {
    sourceKind = await attachSource(attempt, null, locationSource);
  } catch (err) {
    await store.deleteAttempt(attempt.clientAttemptId);
    setActiveId(null);
    throw err;
  }

  await store.updateAttempt(attempt.clientAttemptId, { sourceKind });
  emit({ type: 'started', clientAttemptId: attempt.clientAttemptId, sourceKind });
  return { clientAttemptId: attempt.clientAttemptId, sourceKind };
}

/**
 * Re-attach GPS after an app restart / kill. Returns the attempt or null.
 */
export async function resumeActiveRecording({ locationSource = null } = {}) {
  if (session) return store.getAttempt(session.clientAttemptId);

  let attempt = null;
  const activeId = getActiveId();
  if (activeId) attempt = await store.getAttempt(activeId);
  if (!attempt || attempt.status !== 'recording') {
    const all = await store.listAttempts();
    attempt = all.find((a) => a.status === 'recording') || null;
  }
  if (!attempt) {
    setActiveId(null);
    return null;
  }

  const points = await store.getPoints(attempt.clientAttemptId);
  setActiveId(attempt.clientAttemptId);
  await attachSource(attempt, points[points.length - 1] || null, locationSource);
  emit({ type: 'started', clientAttemptId: attempt.clientAttemptId, resumed: true });
  return attempt;
}

/**
 * Stop GPS and seal the attempt locally. Does NOT submit; see expeditionService.
 * @returns {Promise<object>} attempt with stats
 */
export async function stopRecording() {
  if (!session) throw new Error('No expedition is being recorded');
  const current = session;
  session = null;

  try {
    await current.handle?.stop?.();
  } catch (err) {
    console.warn('[trackRecorder] failed to stop location source', err);
  }
  await current.writeChain;

  const points = await store.getPoints(current.clientAttemptId);
  const stats = computeTrackStats(points);
  const attempt = await store.updateAttempt(current.clientAttemptId, {
    status: 'completed_local',
    completedAt: new Date().toISOString(),
    stats
  });
  setActiveId(null);
  emit({ type: 'stopped', clientAttemptId: current.clientAttemptId, stats });
  return attempt;
}

/** Abandon the current recording and delete everything stored for it. */
export async function discardRecording() {
  if (!session) return;
  const current = session;
  session = null;
  try {
    await current.handle?.stop?.();
  } catch {
    // ignore
  }
  await current.writeChain;
  await store.deleteAttempt(current.clientAttemptId);
  setActiveId(null);
  emit({ type: 'stopped', clientAttemptId: current.clientAttemptId, discarded: true });
}

export function isRecording() {
  return session !== null;
}

export function getActiveAttemptId() {
  return session?.clientAttemptId ?? null;
}

/** Live stats for the recording UI. */
export async function getLiveStats(clientAttemptId = getActiveAttemptId()) {
  if (!clientAttemptId) return null;
  if (session?.clientAttemptId === clientAttemptId) await session.writeChain;
  return computeTrackStats(await store.getPoints(clientAttemptId));
}
