/**
 * expeditionStore.js — IndexedDB persistence for Spota Expeditions.
 *
 * Everything about an in-progress or not-yet-synced attempt lives here,
 * so a trek can be recorded and completed with zero connectivity and
 * survive the app being killed (BRD FR-2.2, FR-2.5).
 *
 * Stores:
 *   attempts  keyPath clientAttemptId   — attempt metadata
 *   points    autoIncrement, idx by_attempt — one row per GPS fix
 *   photos    keyPath id ("{attempt}:{n}"), idx by_attempt — summit photos + EXIF
 */

const DB_NAME = 'spota_expeditions_db';
const DB_VERSION = 1;

let dbPromise = null;

export function openExpeditionDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('attempts')) {
        db.createObjectStore('attempts', { keyPath: 'clientAttemptId' });
      }
      if (!db.objectStoreNames.contains('points')) {
        const points = db.createObjectStore('points', { keyPath: 'id', autoIncrement: true });
        points.createIndex('by_attempt', 'clientAttemptId', { unique: false });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by_attempt', 'clientAttemptId', { unique: false });
      }
    };
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------- attempts ----------

export async function putAttempt(attempt) {
  const db = await openExpeditionDB();
  const tx = db.transaction('attempts', 'readwrite');
  tx.objectStore('attempts').put(attempt);
  await txDone(tx);
  return attempt;
}

export async function getAttempt(clientAttemptId) {
  const db = await openExpeditionDB();
  const tx = db.transaction('attempts', 'readonly');
  const result = await requestToPromise(tx.objectStore('attempts').get(clientAttemptId));
  return result || null;
}

export async function updateAttempt(clientAttemptId, patch) {
  const existing = await getAttempt(clientAttemptId);
  if (!existing) throw new Error(`Unknown attempt ${clientAttemptId}`);
  return putAttempt({ ...existing, ...patch, clientAttemptId });
}

export async function listAttempts() {
  const db = await openExpeditionDB();
  const tx = db.transaction('attempts', 'readonly');
  return requestToPromise(tx.objectStore('attempts').getAll());
}

// ---------- points ----------

export async function appendPoint(clientAttemptId, point) {
  const db = await openExpeditionDB();
  const tx = db.transaction(['points', 'attempts'], 'readwrite');
  tx.objectStore('points').add({ ...point, clientAttemptId });
  const attempts = tx.objectStore('attempts');
  const getReq = attempts.get(clientAttemptId);
  getReq.onsuccess = () => {
    const attempt = getReq.result;
    if (attempt) {
      attempts.put({ ...attempt, pointCount: (attempt.pointCount || 0) + 1, lastPointAt: point.t });
    }
  };
  await txDone(tx);
}

/** All points for an attempt, oldest first. */
export async function getPoints(clientAttemptId) {
  const db = await openExpeditionDB();
  const tx = db.transaction('points', 'readonly');
  const rows = await requestToPromise(
    tx.objectStore('points').index('by_attempt').getAll(IDBKeyRange.only(clientAttemptId))
  );
  return rows
    .sort((a, b) => a.t - b.t)
    .map(({ lat, lng, alt, acc, t, mock }) => ({ lat, lng, alt, acc, t, mock }));
}

// ---------- photos ----------

export async function addPhoto(clientAttemptId, blob, exif) {
  const existing = await getPhotos(clientAttemptId);
  const index = existing.length;
  const db = await openExpeditionDB();
  const tx = db.transaction('photos', 'readwrite');
  const record = {
    id: `${clientAttemptId}:${index}`,
    clientAttemptId,
    index,
    blob,
    type: blob?.type || 'image/jpeg',
    exif: exif || null,
    addedAt: Date.now()
  };
  tx.objectStore('photos').put(record);
  await txDone(tx);
  return record;
}

export async function getPhotos(clientAttemptId) {
  const db = await openExpeditionDB();
  const tx = db.transaction('photos', 'readonly');
  const rows = await requestToPromise(
    tx.objectStore('photos').index('by_attempt').getAll(IDBKeyRange.only(clientAttemptId))
  );
  return rows.sort((a, b) => a.index - b.index);
}

// ---------- cleanup ----------

async function deleteByAttempt(db, storeName, clientAttemptId) {
  const tx = db.transaction(storeName, 'readwrite');
  const index = tx.objectStore(storeName).index('by_attempt');
  const req = index.openCursor(IDBKeyRange.only(clientAttemptId));
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await txDone(tx);
}

/** Drop the heavy payload (points + photos) but keep the attempt summary row. */
export async function purgeAttemptPayload(clientAttemptId) {
  const db = await openExpeditionDB();
  await deleteByAttempt(db, 'points', clientAttemptId);
  await deleteByAttempt(db, 'photos', clientAttemptId);
}

export async function deleteAttempt(clientAttemptId) {
  await purgeAttemptPayload(clientAttemptId);
  const db = await openExpeditionDB();
  const tx = db.transaction('attempts', 'readwrite');
  tx.objectStore('attempts').delete(clientAttemptId);
  await txDone(tx);
}

export async function clearExpeditionStore() {
  const db = await openExpeditionDB();
  const tx = db.transaction(['attempts', 'points', 'photos'], 'readwrite');
  tx.objectStore('attempts').clear();
  tx.objectStore('points').clear();
  tx.objectStore('photos').clear();
  await txDone(tx);
}
