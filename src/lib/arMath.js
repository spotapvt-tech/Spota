// Pure maths for the AR finder (ARView): sensor → camera heading/pitch, and
// spot → screen placement. Kept free of DOM/React so it can be unit tested.

import { haversineDistance } from './utils';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const AR_RADIUS_KM = 5;      // matches the map's default range filter
export const AR_MAX_SPOTS = 25;     // nearest N only — keeps the overlay readable and cheap

export function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

// Signed shortest difference target - current, in [-180, 180)
export function angleDiff(target, current) {
  return normalizeAngle(target - current + 180) - 180;
}

export function lerpAngle(current, target, t) {
  return normalizeAngle(current + angleDiff(target, current) * t);
}

export function getBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * RAD;
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return normalizeAngle(Math.atan2(y, x) * DEG);
}

// Direction the rear camera looks (device -Z axis) in the earth frame
// (x = east, y = north, z = up), from W3C DeviceOrientation Z-X'-Y'' angles.
// Independent of screen rotation, so portrait/landscape need no correction.
function cameraVector(alpha, beta, gamma) {
  const cA = Math.cos(alpha * RAD), sA = Math.sin(alpha * RAD);
  const cB = Math.cos(beta * RAD), sB = Math.sin(beta * RAD);
  const cG = Math.cos(gamma * RAD), sG = Math.sin(gamma * RAD);
  return {
    east: -cA * sG - sA * sB * cG,
    north: -sA * sG + cA * sB * cG,
    up: -cB * cG,
  };
}

// Tilt-compensated compass heading of the rear camera (0 = N, clockwise).
// Returns null when the phone is near flat and the heading is undefined.
export function cameraHeading(alpha, beta, gamma) {
  const v = cameraVector(alpha, beta, gamma);
  if (Math.hypot(v.east, v.north) < 0.15) return null;
  return normalizeAngle(Math.atan2(v.east, v.north) * DEG);
}

// Camera elevation in degrees: 0 = horizon, +90 = straight up, -90 = down.
export function cameraPitch(beta, gamma) {
  const up = -Math.cos(beta * RAD) * Math.cos(gamma * RAD);
  return Math.asin(Math.max(-1, Math.min(1, up))) * DEG;
}

// Turn a deviceorientation(absolute) event into { heading, pitch }, or null
// when the reading can't be trusted. Relative-frame readings (Android's plain
// `deviceorientation`) are rejected rather than mixed with absolute ones.
export function readOrientation(e, isAbsoluteEvent) {
  if (e.beta == null || e.gamma == null) return null;
  const pitch = cameraPitch(e.beta, e.gamma);
  // iOS: already a clockwise-from-north compass heading — use as-is.
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
    return { heading: normalizeAngle(e.webkitCompassHeading), pitch };
  }
  if (e.alpha == null || !(isAbsoluteEvent || e.absolute === true)) return null;
  return { heading: cameraHeading(e.alpha, e.beta, e.gamma), pitch };
}

export function fieldOfView(isLandscape) {
  return isLandscape ? { h: 65, v: 40 } : { h: 50, v: 65 };
}

// Distance + bearing for the nearest spots within the AR radius.
export function arCandidates(spots, coords, { radiusKm = AR_RADIUS_KM, max = AR_MAX_SPOTS } = {}) {
  if (!coords) return [];
  const [lat, lng] = coords;
  return spots
    .filter((s) => s.status !== 'deleted' && s.status !== 'flagged' && Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .map((s) => ({
      spot: s,
      distance: haversineDistance(lat, lng, s.latitude, s.longitude),
      bearing: getBearing(lat, lng, s.latitude, s.longitude),
    }))
    .filter((c) => c.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
}

// 0 for the nearest spots → 1 at the edge of the AR radius (log-spaced, so
// 100 m vs 300 m is as distinguishable as 1 km vs 3 km).
export function distanceBand(km, radiusKm = AR_RADIUS_KM) {
  const near = 0.05;
  const d = Math.max(near, Math.min(radiusKm, km));
  return Math.log(d / near) / Math.log(radiusKm / near);
}

const LABEL_WIDTH = 180;
const LANE_HEIGHT = 64;
const MAX_LANES = 3;

// Screen placement for every candidate. Near spots sit below the horizon and
// far ones above it; labels that would overlap horizontally are stacked into
// lanes. Returns one entry per candidate (same order), `visible` false when
// outside the field of view.
export function layoutMarkers(candidates, { heading, pitch, width, height, fov }) {
  const halfH = fov.h / 2;
  const halfV = fov.v / 2;
  const horizonY = height / 2 + (pitch / halfV) * (height / 2);

  const placed = candidates.map((c) => {
    const rel = angleDiff(c.bearing, heading);
    const abs = Math.abs(rel);
    const band = distanceBand(c.distance);
    const elevation = -6 + band * 12; // degrees above (+) / below (-) horizon
    const fadeStart = halfH - 5;
    return {
      x: width / 2 + (rel / halfH) * (width / 2),
      y: horizonY - (elevation / halfV) * (height / 2),
      scale: 1 - band * 0.3,
      opacity: abs <= fadeStart ? 1 : Math.max(0, 1 - (abs - fadeStart) / 10),
      zIndex: Math.round(100 - band * 90),
      visible: abs < halfH + 5,
    };
  });

  // Declutter nearest-first so close spots keep the base lane.
  const lanes = Array.from({ length: MAX_LANES }, () => []);
  placed.forEach((p) => {
    if (!p.visible) return;
    const w = LABEL_WIDTH * p.scale;
    let lane = lanes.findIndex((xs) => xs.every((x) => Math.abs(x - p.x) >= w));
    if (lane === -1) lane = MAX_LANES - 1;
    lanes[lane].push(p.x);
    p.y -= lane * LANE_HEIGHT;
  });

  placed.forEach((p) => { p.y = Math.max(120, Math.min(height - 140, p.y)); });
  return placed;
}
