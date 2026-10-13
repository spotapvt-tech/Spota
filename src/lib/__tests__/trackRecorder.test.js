import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
  haversineM,
  shouldKeepPoint,
  computeTrackStats,
  startRecording,
  stopRecording,
  discardRecording,
  isRecording,
  getLiveStats,
  subscribe,
  ACTIVE_EXPEDITION_KEY,
  DEFAULT_SAMPLE_MS
} from '../trackRecorder';
import * as store from '../expeditionStore';

// A controllable location source: tests push fixes through `emit`.
function makeFakeSource() {
  const ctl = { emit: null, error: null, stopped: false };
  const source = async (onFix, onError) => {
    ctl.emit = onFix;
    ctl.error = onError;
    return { kind: 'fake', stop: () => { ctl.stopped = true; } };
  };
  return { ctl, source };
}

const T0 = 1_760_000_000_000;
const fix = (i, extra = {}) => ({
  lat: 32.25 + i * 0.001,
  lng: 76.35,
  alt: 2000 + i * 20,
  acc: 10,
  t: T0 + i * DEFAULT_SAMPLE_MS,
  mock: false,
  ...extra
});

describe('trackRecorder — pure helpers', () => {
  it('haversineM: ~111 m per 0.001° latitude', () => {
    const d = haversineM({ lat: 32, lng: 76 }, { lat: 32.001, lng: 76 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('shouldKeepPoint: accepts the first valid fix', () => {
    expect(shouldKeepPoint(null, fix(0))).toBe(true);
  });

  it('shouldKeepPoint: rejects invalid, null-island and low-accuracy fixes', () => {
    expect(shouldKeepPoint(null, { lat: NaN, lng: 1, t: T0 })).toBe(false);
    expect(shouldKeepPoint(null, { lat: 0, lng: 0, t: T0 })).toBe(false);
    expect(shouldKeepPoint(null, { lat: 95, lng: 1, t: T0 })).toBe(false);
    expect(shouldKeepPoint(null, fix(0, { acc: 250 }))).toBe(false);
  });

  it('shouldKeepPoint: throttles to the sample interval and drops out-of-order fixes', () => {
    const prev = fix(0);
    expect(shouldKeepPoint(prev, { ...fix(1), t: prev.t + 5_000 })).toBe(false);
    expect(shouldKeepPoint(prev, { ...fix(1), t: prev.t - 1 })).toBe(false);
    expect(shouldKeepPoint(prev, fix(1))).toBe(true);
    expect(shouldKeepPoint(prev, { ...fix(1), t: prev.t + 40_000 }, { sampleIntervalMs: 60_000 })).toBe(false);
  });

  it('computeTrackStats: distance, gain, max altitude, duration, mock count', () => {
    const pts = [fix(0), fix(1), fix(2, { mock: true }), fix(3)];
    const s = computeTrackStats(pts);
    expect(s.pointCount).toBe(4);
    expect(s.distanceKm).toBeCloseTo(0.33, 1);
    expect(s.elevationGainM).toBe(60);
    expect(s.maxAltitudeM).toBe(2060);
    expect(s.durationMin).toBe(2); // 3 × 30 s = 90 s → rounds to 2
    expect(s.mockCount).toBe(1);
  });

  it('computeTrackStats: ignores sub-5 m altitude jitter', () => {
    const jitter = [0, 3, -2, 4, 1, -3].map((d, i) => ({ ...fix(i), lat: 32.25, alt: 3000 + d }));
    expect(computeTrackStats(jitter).elevationGainM).toBe(0);
  });

  it('computeTrackStats: handles empty tracks and missing altitude', () => {
    expect(computeTrackStats([])).toMatchObject({ pointCount: 0, distanceKm: 0, maxAltitudeM: null });
    expect(computeTrackStats([fix(0, { alt: null }), fix(1, { alt: null })]).maxAltitudeM).toBeNull();
  });
});

describe('trackRecorder — recording session (fake-indexeddb)', () => {
  beforeEach(async () => {
    if (isRecording()) await discardRecording();
    await store.clearExpeditionStore();
    localStorage.clear();
  });

  it('requires an adventureId', async () => {
    await expect(startRecording({})).rejects.toThrow('adventureId');
  });

  it('records throttled fixes to IndexedDB and seals the attempt on stop', async () => {
    const { ctl, source } = makeFakeSource();
    const events = [];
    const unsub = subscribe((e) => events.push(e.type));

    const { clientAttemptId, sourceKind } = await startRecording({
      adventureId: 'adv-1',
      adventureName: 'Triund',
      locationSource: source
    });
    expect(sourceKind).toBe('fake');
    expect(localStorage.getItem(ACTIVE_EXPEDITION_KEY)).toBe(clientAttemptId);

    ctl.emit(fix(0));
    ctl.emit({ ...fix(0), t: fix(0).t + 1_000 }); // throttled
    ctl.emit(fix(1));
    ctl.emit(fix(2, { acc: 500 })); // inaccurate, dropped
    ctl.emit(fix(3));

    const live = await getLiveStats(clientAttemptId);
    expect(live.pointCount).toBe(3);

    const attempt = await stopRecording();
    unsub();

    expect(ctl.stopped).toBe(true);
    expect(isRecording()).toBe(false);
    expect(attempt.status).toBe('completed_local');
    expect(attempt.completedAt).toBeTruthy();
    expect(attempt.stats.pointCount).toBe(3);
    expect(attempt.pointCount).toBe(3);
    expect(localStorage.getItem(ACTIVE_EXPEDITION_KEY)).toBeNull();
    expect(events).toEqual(expect.arrayContaining(['started', 'point', 'stopped']));

    const points = await store.getPoints(clientAttemptId);
    expect(points.map((p) => p.t)).toEqual([fix(0).t, fix(1).t, fix(3).t]);
  });

  it('refuses to start a second expedition while one is active', async () => {
    const { source } = makeFakeSource();
    await startRecording({ adventureId: 'adv-1', locationSource: source });
    await expect(startRecording({ adventureId: 'adv-2', locationSource: source })).rejects.toThrow('already');
  });

  it('cleans up when the location source fails to start (e.g. permission denied)', async () => {
    const failing = async () => { throw new Error('Permission denied'); };
    await expect(startRecording({ adventureId: 'adv-1', locationSource: failing })).rejects.toThrow('Permission denied');
    expect(isRecording()).toBe(false);
    expect(await store.listAttempts()).toHaveLength(0);
    expect(localStorage.getItem(ACTIVE_EXPEDITION_KEY)).toBeNull();
  });

  it('discardRecording deletes the attempt and its points', async () => {
    const { ctl, source } = makeFakeSource();
    const { clientAttemptId } = await startRecording({ adventureId: 'adv-1', locationSource: source });
    ctl.emit(fix(0));
    await discardRecording();
    expect(await store.getAttempt(clientAttemptId)).toBeNull();
    expect(await store.getPoints(clientAttemptId)).toHaveLength(0);
  });
});

describe('trackRecorder — resume after app kill', () => {
  it('re-attaches to the recording attempt and keeps throttling from the last stored point', async () => {
    await store.clearExpeditionStore();
    localStorage.clear();

    // Simulate a previous app session that was killed mid-trek.
    const id = 'killed-attempt-0001';
    await store.putAttempt({
      clientAttemptId: id,
      adventureId: 'adv-1',
      sampleIntervalMs: DEFAULT_SAMPLE_MS,
      startedAt: new Date(T0).toISOString(),
      status: 'recording',
      pointCount: 0
    });
    await store.appendPoint(id, fix(0));
    localStorage.setItem(ACTIVE_EXPEDITION_KEY, id);

    vi.resetModules(); // fresh module = fresh in-memory session, same IndexedDB
    const recorder = await import('../trackRecorder');
    const { ctl, source } = makeFakeSource();

    const resumed = await recorder.resumeActiveRecording({ locationSource: source });
    expect(resumed.clientAttemptId).toBe(id);
    expect(recorder.isRecording()).toBe(true);

    ctl.emit({ ...fix(0), t: fix(0).t + 1_000 }); // within interval of stored point → dropped
    ctl.emit(fix(1));
    const attempt = await recorder.stopRecording();
    expect(attempt.stats.pointCount).toBe(2);
  });

  it('returns null when nothing was recording', async () => {
    await store.clearExpeditionStore();
    localStorage.clear();
    vi.resetModules();
    const recorder = await import('../trackRecorder');
    expect(await recorder.resumeActiveRecording({ locationSource: makeFakeSource().source })).toBeNull();
  });
});
