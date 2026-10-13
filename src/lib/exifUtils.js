/**
 * exifUtils.js — EXIF GPS extraction from image files
 *
 * IMPORTANT: Must be called on the ORIGINAL file BEFORE compressImage(),
 * because canvas compression strips all EXIF metadata.
 *
 * Supports: JPEG · HEIC/HEIF (iOS) · TIFF · WebP (partial)
 * Library:  exifr v7 — https://github.com/MikeKovarik/exifr
 */

/**
 * Extracts GPS coordinates from an image file's EXIF metadata.
 *
 * @param {File|Blob} file - Original (uncompressed) image file
 * @returns {Promise<{lat: number, lng: number} | null>}
 *   Decimal lat/lng if found, null if not present or on any error.
 */
export async function extractExifGps(file) {
  if (!file) return null;
  const type = file.type || '';
  // Only attempt on image types
  if (type && !type.startsWith('image/')) return null;

  try {
    // Dynamic import — only loads the GPS-only sub-module (~8KB gz)
    const { gps } = await import('exifr');
    const coords = await gps(file);

    if (!coords?.latitude || !coords?.longitude) return null;

    const lat = coords.latitude;
    const lng = coords.longitude;

    // Sanity check: reject null island (0,0) and out-of-range values
    if (lat === 0 && lng === 0) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return { lat, lng };
  } catch {
    // Fail silently — EXIF parsing errors are non-fatal
    return null;
  }
}

/**
 * Extracts GPS coordinates AND the capture time from an image's EXIF.
 * Used by Spota Expeditions to match a summit photo against the GPS track
 * (BRD FR-3.2, "Photo EXIF match").
 *
 * Like extractExifGps, call this on the ORIGINAL file before compressImage().
 *
 * Timezone note: EXIF DateTimeOriginal has no zone. exifr interprets it in the
 * device's local timezone, which is correct when the photo is read on the
 * same phone that took it (the normal summit-photo flow).
 *
 * @param {File|Blob} file
 * @returns {Promise<{lat: number|null, lng: number|null, takenAt: string|null} | null>}
 *   null when neither GPS nor a capture time is present.
 */
export async function extractExifMeta(file) {
  if (!file) return null;
  const type = file.type || '';
  if (type && !type.startsWith('image/')) return null;

  try {
    const exifr = await import('exifr');
    const [coords, tags] = await Promise.all([
      exifr.gps(file).catch(() => null),
      exifr.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => null)
    ]);

    let lat = null;
    let lng = null;
    if (Number.isFinite(coords?.latitude) && Number.isFinite(coords?.longitude)) {
      const valid =
        !(coords.latitude === 0 && coords.longitude === 0) &&
        Math.abs(coords.latitude) <= 90 &&
        Math.abs(coords.longitude) <= 180;
      if (valid) {
        lat = coords.latitude;
        lng = coords.longitude;
      }
    }

    const raw = tags?.DateTimeOriginal || tags?.CreateDate || null;
    const date = raw instanceof Date ? raw : raw ? new Date(raw) : null;
    const takenAt = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;

    if (lat === null && takenAt === null) return null;
    return { lat, lng, takenAt };
  } catch {
    return null;
  }
}
