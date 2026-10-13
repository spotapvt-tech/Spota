import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    storage: { from: vi.fn() },
    rpc: vi.fn()
  }
}));
vi.mock('../exifUtils', () => ({ extractExifMeta: vi.fn() }));
vi.mock('../imageUtils', () => ({ compressImage: vi.fn(async (f) => f) }));

import { supabase } from '../supabaseClient';
import { extractExifMeta } from '../exifUtils';
import * as store from '../expeditionStore';
import {
  addSummitPhoto,
  completeAttempt,
  syncPendingAttempts,
  getPendingAttemptIds,
  PENDING_ATTEMPTS_KEY
} from '../expeditionService';

const ID = 'attempt-test-0001';
const upload = vi.fn();

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

async function seedStoppedAttempt(id = ID) {
  await store.putAttempt({
    clientAttemptId: id,
    adventureId: '11111111-1111-1111-1111-111111111111',
    safeTrekId: 7,
    isGuided: true,
    startedAt: '2026-10-10T03:00:00.000Z',
    completedAt: '2026-10-10T09:00:00.000Z',
    status: 'completed_local',
    pointCount: 0
  });
  await store.appendPoint(id, { lat: 32.26, lng: 76.35, alt: 2800, acc: 8, t: 1, mock: false });
  await store.appendPoint(id, { lat: 32.27, lng: 76.36, alt: 2850, acc: 8, t: 2, mock: false });
}

const photo = () => new File(['x'], 'summit.jpg', { type: 'image/jpeg' });

describe('expeditionService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await store.clearExpeditionStore();
    localStorage.clear();
    setOnline(true);

    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    upload.mockResolvedValue({ data: {}, error: null });
    supabase.storage.from.mockReturnValue({ upload });
    supabase.rpc.mockResolvedValue({ data: { id: 'server-uuid', status: 'submitted' }, error: null });
    extractExifMeta.mockResolvedValue({ lat: 32.26, lng: 76.35, takenAt: '2026-10-10T08:30:00.000Z' });
  });

  it('addSummitPhoto stores the photo with EXIF read from the original file', async () => {
    await seedStoppedAttempt();
    const file = photo();
    const exif = await addSummitPhoto(ID, file);
    expect(extractExifMeta).toHaveBeenCalledWith(file);
    expect(exif.takenAt).toBe('2026-10-10T08:30:00.000Z');
    const photos = await store.getPhotos(ID);
    expect(photos).toHaveLength(1);
    expect(photos[0].exif.lat).toBe(32.26);
  });

  it('completeAttempt requires at least one summit photo', async () => {
    await seedStoppedAttempt();
    await expect(completeAttempt(ID)).rejects.toThrow('summit photo');
  });

  it('completeAttempt refuses an attempt that is still recording', async () => {
    await seedStoppedAttempt();
    await store.updateAttempt(ID, { status: 'recording' });
    await expect(completeAttempt(ID)).rejects.toThrow('Stop recording');
  });

  it('online: uploads photos into the user folder, calls submit_attempt, purges payload', async () => {
    await seedStoppedAttempt();
    await addSummitPhoto(ID, photo());

    const result = await completeAttempt(ID, { checkinsOnTime: true });

    expect(result.status).toBe('submitted');
    expect(supabase.storage.from).toHaveBeenCalledWith('expedition-photos');
    expect(upload.mock.calls[0][0]).toBe(`user-1/${ID}/0.jpg`);

    const [fn, args] = supabase.rpc.mock.calls[0];
    expect(fn).toBe('submit_attempt');
    expect(args).toMatchObject({
      p_client_attempt_id: ID,
      p_adventure_id: '11111111-1111-1111-1111-111111111111',
      p_started_at: '2026-10-10T03:00:00.000Z',
      p_completed_at: '2026-10-10T09:00:00.000Z',
      p_photo_paths: [`user-1/${ID}/0.jpg`],
      p_checkins_on_time: true,
      p_is_guided: true,
      p_safe_trek_id: 7
    });
    expect(args.p_points).toHaveLength(2);
    expect(args.p_photo_meta[0]).toEqual({
      path: `user-1/${ID}/0.jpg`, lat: 32.26, lng: 76.35, taken_at: '2026-10-10T08:30:00.000Z'
    });

    const attempt = await store.getAttempt(ID);
    expect(attempt.status).toBe('submitted');
    expect(attempt.serverId).toBe('server-uuid');
    expect(await store.getPoints(ID)).toHaveLength(0); // payload purged
    expect(getPendingAttemptIds()).toEqual([]);
  });

  it('offline: queues in spota_pending_attempts without touching the network, then syncs on reconnect', async () => {
    await seedStoppedAttempt();
    await addSummitPhoto(ID, photo());
    setOnline(false);

    const result = await completeAttempt(ID);
    expect(result.status).toBe('queued');
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(PENDING_ATTEMPTS_KEY))).toEqual([ID]);
    expect((await store.getAttempt(ID)).status).toBe('queued');

    setOnline(true);
    const results = await syncPendingAttempts();
    expect(results).toEqual([expect.objectContaining({ clientAttemptId: ID, status: 'submitted' })]);
    expect(getPendingAttemptIds()).toEqual([]);
  });

  it('server error keeps the attempt queued with the error, and a retry succeeds', async () => {
    await seedStoppedAttempt();
    await addSummitPhoto(ID, photo());
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Unknown or inactive adventure' } });

    const first = await completeAttempt(ID);
    expect(first).toEqual({ status: 'queued', error: 'Unknown or inactive adventure' });
    const queued = await store.getAttempt(ID);
    expect(queued.status).toBe('queued');
    expect(queued.lastError).toBe('Unknown or inactive adventure');
    expect(await store.getPoints(ID)).toHaveLength(2); // payload kept for retry

    const retry = await syncPendingAttempts();
    expect(retry[0].status).toBe('submitted');
  });

  it('signed-out user: stays queued instead of throwing', async () => {
    await seedStoppedAttempt();
    await addSummitPhoto(ID, photo());
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await completeAttempt(ID);
    expect(result.status).toBe('queued');
    expect(result.error).toMatch(/Sign in/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('a photo upload failure stops the submit (no RPC with missing photos)', async () => {
    await seedStoppedAttempt();
    await addSummitPhoto(ID, photo());
    upload.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });

    const result = await completeAttempt(ID);
    expect(result.status).toBe('queued');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
