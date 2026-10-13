import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('exifr', () => ({ gps: vi.fn(), parse: vi.fn() }));

import * as exifr from 'exifr';
import { extractExifMeta } from '../exifUtils';

const jpg = () => new File(['x'], 'summit.jpg', { type: 'image/jpeg' });

describe('extractExifMeta', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns GPS and capture time', async () => {
    exifr.gps.mockResolvedValue({ latitude: 32.26, longitude: 76.35 });
    exifr.parse.mockResolvedValue({ DateTimeOriginal: new Date('2026-10-10T08:30:00Z') });
    expect(await extractExifMeta(jpg())).toEqual({
      lat: 32.26, lng: 76.35, takenAt: '2026-10-10T08:30:00.000Z'
    });
  });

  it('falls back to CreateDate and still returns time when GPS is missing', async () => {
    exifr.gps.mockResolvedValue(undefined);
    exifr.parse.mockResolvedValue({ CreateDate: new Date('2026-10-10T08:31:00Z') });
    expect(await extractExifMeta(jpg())).toEqual({ lat: null, lng: null, takenAt: '2026-10-10T08:31:00.000Z' });
  });

  it('drops null-island GPS', async () => {
    exifr.gps.mockResolvedValue({ latitude: 0, longitude: 0 });
    exifr.parse.mockResolvedValue({ DateTimeOriginal: new Date('2026-10-10T08:30:00Z') });
    expect((await extractExifMeta(jpg())).lat).toBeNull();
  });

  it('returns null when nothing useful is present, or on parser errors', async () => {
    exifr.gps.mockResolvedValue(null);
    exifr.parse.mockResolvedValue(null);
    expect(await extractExifMeta(jpg())).toBeNull();

    exifr.gps.mockRejectedValue(new Error('corrupt'));
    exifr.parse.mockRejectedValue(new Error('corrupt'));
    expect(await extractExifMeta(jpg())).toBeNull();
  });

  it('ignores non-image files', async () => {
    expect(await extractExifMeta(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBeNull();
    expect(exifr.gps).not.toHaveBeenCalled();
  });
});
