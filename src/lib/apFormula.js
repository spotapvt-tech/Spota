/**
 * apFormula.js — Adventure Points (AP) formula v1, BRD FR-4.1.
 *
 * CLIENT-SIDE PREVIEW ONLY ("You'll earn ~X AP"). Points are awarded
 * server-side by award_ap() (Phase 1), which must mirror this exactly.
 * Guided and self-guided treks score the same (BRD D1).
 */

export const AP_FORMULA_VERSION = 'v1';

const BASE_BY_GRADE = { 1: 50, 2: 100, 3: 200, 4: 400, 5: 800 };

export function altitudeFactor(maxAltitudeM) {
  if (maxAltitudeM >= 5000) return 1.5;
  if (maxAltitudeM >= 4000) return 1.25;
  return 1.0;
}

export function repeatFactor(priorCompletions = 0) {
  if (priorCompletions <= 0) return 1.0;
  if (priorCompletions === 1) return 0.5;
  return 0.2;
}

/** Is `date` inside an 'MM-DD'..'MM-DD' window? Handles windows that wrap the year (Dec → Feb). */
export function isInWinterWindow(date, startMd, endMd) {
  if (!startMd || !endMd || !date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return startMd <= endMd ? md >= startMd && md <= endMd : md >= startMd || md <= endMd;
}

/**
 * @param {object} adventure  normalized adventure (adventureCatalog.normalizeAdventure)
 * @param {object} [opts]
 * @param {Date|string} [opts.completedAt=now]
 * @param {number}  [opts.priorCompletions=0]
 * @param {boolean} [opts.checkinsOnTime=true]
 * @returns {{points: number, breakdown: object}}
 */
export function estimateAP(adventure, { completedAt = new Date(), priorCompletions = 0, checkinsOnTime = true } = {}) {
  const base = BASE_BY_GRADE[adventure?.grade] ?? 0;
  const distanceF = 1 + (Number(adventure?.distanceKm) || 0) / 50;
  const gainF = 1 + (Number(adventure?.elevationGainM) || 0) / 2000;
  const altitudeF = altitudeFactor(Number(adventure?.maxAltitudeM) || 0);
  const seasonF = isInWinterWindow(completedAt, adventure?.winterStartMd, adventure?.winterEndMd) ? 1.3 : 1.0;
  const repeatF = repeatFactor(priorCompletions);
  const safety = checkinsOnTime ? 0.1 : 0;

  const points = Math.round(base * distanceF * gainF * altitudeF * seasonF * repeatF * (1 + safety));
  return {
    points,
    breakdown: { version: AP_FORMULA_VERSION, base, distanceF, gainF, altitudeF, seasonF, repeatF, safety }
  };
}
