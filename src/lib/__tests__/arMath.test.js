import { describe, it, expect } from 'vitest';
import {
  angleDiff, lerpAngle, getBearing, cameraHeading, cameraPitch, readOrientation,
  arCandidates, layoutMarkers, fieldOfView, distanceBand,
} from '../arMath';

const close = (a, b, eps = 0.5) => expect(Math.abs(angleDiff(a, b))).toBeLessThan(eps);

describe('angle helpers', () => {
  it('takes the shortest signed path', () => {
    expect(angleDiff(10, 350)).toBeCloseTo(20);
    expect(angleDiff(350, 10)).toBeCloseTo(-20);
    expect(angleDiff(180, 0)).toBeCloseTo(-180);
  });
  it('lerps across north without spinning the long way', () => {
    close(lerpAngle(350, 10, 0.5), 0);
  });
});

describe('getBearing', () => {
  it('returns cardinal bearings', () => {
    close(getBearing(28.6, 77.2, 28.7, 77.2), 0);
    close(getBearing(28.6, 77.2, 28.6, 77.3), 90);
    close(getBearing(28.6, 77.2, 28.5, 77.2), 180);
    close(getBearing(28.6, 77.2, 28.6, 77.1), 270);
  });
});

describe('cameraHeading (tilt-compensated, rear camera)', () => {
  it('phone upright, alpha 0 → camera faces north', () => {
    close(cameraHeading(0, 90, 0), 0);
  });
  it('alpha is counter-clockwise: alpha 90 → west, 270 → east', () => {
    close(cameraHeading(90, 90, 0), 270);
    close(cameraHeading(270, 90, 0), 90);
  });
  it('stays on the same bearing when the phone is tilted back', () => {
    close(cameraHeading(90, 60, 0), 270);
    close(cameraHeading(90, 120, 0), 270); // tilted past vertical: camera aims upward, same bearing
  });
  it('is undefined when the phone lies flat', () => {
    expect(cameraHeading(0, 0, 0)).toBeNull();
  });
});

describe('cameraPitch', () => {
  it('maps beta to camera elevation', () => {
    expect(cameraPitch(90, 0)).toBeCloseTo(0);
    expect(cameraPitch(0, 0)).toBeCloseTo(-90);
    expect(cameraPitch(120, 0)).toBeCloseTo(30);
  });
});

describe('readOrientation', () => {
  it('uses iOS webkitCompassHeading as-is (no inversion)', () => {
    const r = readOrientation({ alpha: 10, beta: 90, gamma: 0, webkitCompassHeading: 45 }, false);
    expect(r.heading).toBe(45);
  });
  it('rejects relative-frame Android readings', () => {
    expect(readOrientation({ alpha: 10, beta: 90, gamma: 0, absolute: false }, false)).toBeNull();
  });
  it('accepts absolute readings', () => {
    const r = readOrientation({ alpha: 90, beta: 90, gamma: 0 }, true);
    close(r.heading, 270);
    expect(r.pitch).toBeCloseTo(0);
  });
});

describe('arCandidates', () => {
  const me = [28.6139, 77.209];
  const spots = [
    { id: 1, latitude: 28.6239, longitude: 77.209 },   // ~1.1 km N
    { id: 2, latitude: 28.6139, longitude: 77.219 },   // ~1 km E
    { id: 3, latitude: 19.07, longitude: 72.87 },      // Mumbai — out of radius
    { id: 4, latitude: 28.614, longitude: 77.209, status: 'flagged' },
  ];
  it('keeps nearby spots only, nearest first', () => {
    const c = arCandidates(spots, me);
    expect(c.map((x) => x.spot.id)).toEqual([2, 1]);
  });
  it('returns nothing without a location (no Delhi fallback)', () => {
    expect(arCandidates(spots, null)).toEqual([]);
  });
});

describe('layoutMarkers', () => {
  const fov = fieldOfView(false);
  const base = { pitch: 0, width: 400, height: 800, fov };
  const at = (bearing, distance = 1) => ({ bearing, distance, spot: { id: bearing } });

  it('centres a spot dead ahead and hides one behind', () => {
    const [ahead, behind] = layoutMarkers([at(0), at(180)], { ...base, heading: 0 });
    expect(ahead.visible).toBe(true);
    expect(ahead.x).toBeCloseTo(200);
    expect(behind.visible).toBe(false);
  });
  it('puts a spot half the FOV to the right at the screen edge', () => {
    const [p] = layoutMarkers([at(fov.h / 2)], { ...base, heading: 0 });
    expect(p.x).toBeCloseTo(400);
  });
  it('places near spots below far ones', () => {
    const [near, far] = layoutMarkers([at(-20, 0.1), at(20, 4.5)], { ...base, heading: 0 });
    expect(near.y).toBeGreaterThan(far.y);
    expect(distanceBand(0.1)).toBeLessThan(distanceBand(4.5));
  });
  it('stacks overlapping labels into separate lanes', () => {
    const [a, b] = layoutMarkers([at(0, 1), at(1, 1)], { ...base, heading: 0 });
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(40);
  });
});
