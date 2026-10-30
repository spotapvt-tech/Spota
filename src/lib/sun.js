const rad = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440587.5;
const J2000 = 2451545;

/**
 * Sunset for the given place and day, computed on-device (sunrise equation,
 * same approach as suncalc) so it works offline. Accurate to a few minutes.
 * Returns null when the sun doesn't set that day (polar summer/winter).
 */
export function sunsetTime(lat, lng, date = new Date()) {
  const lw = -lng * rad;
  const phi = lat * rad;
  const d = date.getTime() / DAY_MS + J1970 - J2000;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397));
  const cosW = (Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null;
  const a = 0.0009 + (Math.acos(cosW) + lw) / (2 * Math.PI) + n;
  const jSet = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return new Date((jSet - J1970) * DAY_MS);
}
