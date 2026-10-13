// Gem Service — Supabase insert, image upload, offline queue
// Extracted from AddGemView.jsx (v2.0 wizard refactor)

import { supabase } from './supabaseClient';
import { fileToBase64 } from './imageUtils';

const PENDING_KEY = 'spota_pending_gems';

/**
 * Upload image to Supabase Storage. Falls back to base64 string.
 * Returns final URL string.
 */
async function uploadImage(imageFile, cameraBase64) {
  const fileExt = (imageFile?.name || 'photo.jpg').split('.').pop() || 'jpg';
  const filePath = `spot-images/${Date.now()}.${fileExt}`;

  try {
    const uploadPromise = supabase.storage.from('spot-images').upload(filePath, imageFile);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Storage upload timeout')), 30000)
    );
    const result = await Promise.race([uploadPromise, timeoutPromise]);
    if (result?.error) throw result.error;
    if (!result?.data) throw new Error('Empty upload response');

    const { data: pub } = supabase.storage.from('spot-images').getPublicUrl(filePath);
    if (pub?.publicUrl) return pub.publicUrl;
  } catch (storageErr) {
    console.warn('Storage upload failed, using base64 fallback:', storageErr);
  }

  // Fallback 1: raw cameraBase64 (Capacitor native)
  if (cameraBase64) {
    const fmt = fileExt === 'jpg' ? 'jpeg' : fileExt;
    return `data:image/${fmt};base64,${cameraBase64}`;
  }

  // Fallback 2: FileReader base64 (web, small files only)
  if (imageFile && imageFile.size < 1.5 * 1024 * 1024) {
    return await Promise.race([
      fileToBase64(imageFile),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Base64 timeout')), 10000))
    ]);
  }

  throw new Error('Upload failed: image too large for base64 fallback and Storage is unavailable.');
}

/**
 * Upload a blob/data-URL image (used when re-syncing a queued pending gem).
 * Returns final URL string, or the original data URL if Storage is unavailable.
 */
async function uploadQueuedImage(imageDataUrl) {
  if (!imageDataUrl) return '';
  try {
    const res = await fetch(imageDataUrl);
    const blob = await res.blob();
    const ext = (blob.type?.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const filePath = `spot-images/${Date.now()}.${ext}`;
    const up = await supabase.storage.from('spot-images').upload(filePath, blob);
    if (up?.error) throw up.error;
    const { data: pub } = supabase.storage.from('spot-images').getPublicUrl(filePath);
    if (pub?.publicUrl) return pub.publicUrl;
  } catch (err) {
    console.warn('Queued image upload failed, falling back to inline base64:', err);
  }
  return imageDataUrl;
}

/**
 * Best-effort conversion of the current photo into a data URL small enough
 * to persist in localStorage, so an offline/failed drop can still be
 * re-synced with its photo later instead of losing it.
 */
async function getImageDataForQueue(imageFile, cameraBase64) {
  if (cameraBase64) {
    return `data:image/jpeg;base64,${cameraBase64}`;
  }
  if (imageFile && imageFile.size < 2 * 1024 * 1024) {
    try {
      return await fileToBase64(imageFile);
    } catch (err) {
      console.warn('Could not encode image for offline queue:', err);
    }
  }
  return null;
}

/**
 * Queue a gem locally (localStorage) so it survives being offline or a
 * failed submit, and can be retried automatically once back online.
 */
async function queuePendingGem(fields, imageFile, cameraBase64) {
  const imageDataUrl = await getImageDataForQueue(imageFile, cameraBase64);
  const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  pending.push({ ...fields, imageDataUrl, _pendingAt: Date.now() });
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

/**
 * Perform the actual Supabase insert (image upload + spots row + vibe ratings).
 * Throws on failure — callers decide how to handle that (queue, surface, etc).
 */
async function submitGem({ imageFile, cameraBase64, videoFile, location, title, category, description, tags, address, vibeRatings, userId }) {
  // Upload image
  let finalImageUrl = '';
  if (imageFile) {
    finalImageUrl = await uploadImage(imageFile, cameraBase64);
  }

  // Upload video (optional, best-effort)
  let finalVideoUrl = '';
  if (videoFile) {
    try {
      const vExt = (videoFile?.name || 'clip.mp4').split('.').pop() || 'mp4';
      const vPath = `spot-videos/${Date.now()}.${vExt}`;
      const vUp = await Promise.race([
        supabase.storage.from('spot-videos').upload(vPath, videoFile),
        new Promise((_, rej) => setTimeout(() => rej(new Error('video timeout')), 60000))
      ]);
      if (!vUp?.error && vUp?.data) {
        const { data: vPub } = supabase.storage.from('spot-videos').getPublicUrl(vPath);
        if (vPub?.publicUrl) finalVideoUrl = vPub.publicUrl;
      }
    } catch (vErr) {
      console.warn('Video upload failed, skipping:', vErr);
    }
  }

  // Insert spot row
  const { data: insertedData, error } = await supabase
    .from('spots')
    .insert([{
      title,
      category,
      description,
      latitude: location.lat,
      longitude: location.lng,
      image_url: finalImageUrl,
      video_url: finalVideoUrl,
      status: 'approved',
      user_id: userId,
      tags,
      address
    }])
    .select();

  if (error) throw error;

  const spot = insertedData?.[0];
  if (!spot) throw new Error('Insert returned no data');

  // Insert vibe ratings (best-effort)
  try {
    await supabase.from('vibe_ratings').insert([{
      spot_id: spot.id,
      user_id: userId,
      cozy: vibeRatings.cozy,
      insta_worthy: vibeRatings.insta_worthy,
      lively: vibeRatings.lively,
      zen: vibeRatings.zen,
      workspace: vibeRatings.workspace
    }]);
  } catch (rErr) {
    console.warn('Vibe ratings insert failed (non-fatal):', rErr);
  }

  // Track locally
  const localCreated = JSON.parse(localStorage.getItem('spota_created_spots') || '[]');
  localCreated.push({ id: spot.id, category: spot.category, latitude: spot.latitude, longitude: spot.longitude });
  localStorage.setItem('spota_created_spots', JSON.stringify(localCreated));

  return spot;
}

/**
 * Drop a gem. Handles offline queuing automatically, and also queues on a
 * failed online submit (flaky connection, transient Supabase error, etc.)
 * instead of losing the gem — CLAUDE.md requires a local fallback whenever
 * a Supabase write fails, not just when navigator.onLine is false.
 * Returns { success: true, spot } or { offline: true } (queued for later sync).
 */
export async function dropGem({ imageFile, cameraBase64, videoFile, location, title, category, description, tags, address, vibeRatings, user }) {
  const userId = user && !user.isGuest ? user.id : null;
  const queueFields = { title, category, description, tags, address, lat: location.lat, lng: location.lng, vibeRatings, userId };

  if (!navigator.onLine) {
    await queuePendingGem(queueFields, imageFile, cameraBase64);
    return { offline: true };
  }

  try {
    const spot = await submitGem({ imageFile, cameraBase64, videoFile, location, title, category, description, tags, address, vibeRatings, userId });
    return { success: true, spot };
  } catch (err) {
    console.warn('Online gem submit failed, queuing locally for retry:', err);
    await queuePendingGem(queueFields, imageFile, cameraBase64);
    return { offline: true };
  }
}

/**
 * Re-attempt every locally-queued gem (from an offline drop or a failed
 * online submit). Called automatically when the browser comes back online.
 * Successfully synced gems are removed from the queue; failures are kept
 * for the next attempt.
 */
export async function syncPendingGems() {
  if (!navigator.onLine) return;

  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  } catch {
    pending = [];
  }
  if (!pending.length) return;

  const stillPending = [];
  for (const item of pending) {
    try {
      const finalImageUrl = await uploadQueuedImage(item.imageDataUrl);

      const { data: insertedData, error } = await supabase
        .from('spots')
        .insert([{
          title: item.title,
          category: item.category,
          description: item.description,
          latitude: item.lat,
          longitude: item.lng,
          image_url: finalImageUrl,
          status: 'approved',
          user_id: item.userId || null,
          tags: item.tags,
          address: item.address,
        }])
        .select();

      if (error) throw error;
      const spot = insertedData?.[0];

      if (spot && item.vibeRatings) {
        try {
          await supabase.from('vibe_ratings').insert([{
            spot_id: spot.id,
            user_id: item.userId || null,
            cozy: item.vibeRatings.cozy,
            insta_worthy: item.vibeRatings.insta_worthy,
            lively: item.vibeRatings.lively,
            zen: item.vibeRatings.zen,
            workspace: item.vibeRatings.workspace
          }]);
        } catch (rErr) {
          console.warn('Queued vibe ratings insert failed (non-fatal):', rErr);
        }
      }

      if (spot) {
        const localCreated = JSON.parse(localStorage.getItem('spota_created_spots') || '[]');
        localCreated.push({ id: spot.id, category: spot.category, latitude: spot.latitude, longitude: spot.longitude });
        localStorage.setItem('spota_created_spots', JSON.stringify(localCreated));
      }
    } catch (err) {
      console.warn('Pending gem sync failed, will retry later:', err);
      stillPending.push(item);
    }
  }

  localStorage.setItem(PENDING_KEY, JSON.stringify(stillPending));
}
