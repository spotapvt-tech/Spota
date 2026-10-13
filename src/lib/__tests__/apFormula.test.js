import { describe, it, expect } from 'vitest';
import { estimateAP, isInWinterWindow, altitudeFactor, repeatFactor } from '../apFormula';

const triund = { grade: 1, distanceKm: 18, elevationGainM: 875, maxAltitudeM: 2850, winterStartMd: '12-15', winterEndMd: '02-28' };
const hampta = { grade: 3, distanceKm: 35, elevationGainM: 1270, maxAltitudeM: 4270 };
const OCT = new Date(2026, 9, 13);

describe('apFormula v1 (BRD FR-4.1)', () => {
  it('Triund, first completion, safe check-ins: 50 × 1.36 × 1.4375 × 1.1 ≈ 108', () => {
    const { points, breakdown } = estimateAP(triund, { completedAt: OCT });
    expect(breakdown).toMatchObject({ base: 50, gainF: 1.4375, altitudeF: 1, seasonF: 1, repeatF: 1, safety: 0.1 });
    expect(breakdown.distanceF).toBeCloseTo(1.36, 10);
    expect(points).toBe(Math.round(50 * 1.36 * 1.4375 * 1.1));
  });

  it('Hampta Pass gets the 4,000 m altitude bonus', () => {
    const { points, breakdown } = estimateAP(hampta, { completedAt: OCT, checkinsOnTime: false });
    expect(breakdown.altitudeF).toBe(1.25);
    expect(points).toBe(Math.round(200 * 1.7 * 1.635 * 1.25));
  });

  it('applies the winter multiplier, including windows that wrap the year', () => {
    expect(isInWinterWindow(new Date(2026, 11, 20), '12-15', '02-28')).toBe(true);
    expect(isInWinterWindow(new Date(2027, 0, 10), '12-15', '02-28')).toBe(true);
    expect(isInWinterWindow(new Date(2026, 2, 1), '12-15', '02-28')).toBe(false);
    expect(isInWinterWindow(new Date(2026, 0, 10), '12-01', '03-15')).toBe(true);
    expect(isInWinterWindow(new Date(2026, 0, 10), null, null)).toBe(false);
    expect(estimateAP(triund, { completedAt: new Date(2027, 0, 10) }).breakdown.seasonF).toBe(1.3);
  });

  it('decays repeats: 1.0 → 0.5 → 0.2', () => {
    expect([0, 1, 2, 5].map(repeatFactor)).toEqual([1, 0.5, 0.2, 0.2]);
    const first = estimateAP(triund, { completedAt: OCT }).points;
    const second = estimateAP(triund, { completedAt: OCT, priorCompletions: 1 }).points;
    expect(second).toBe(Math.round(first / 2));
  });

  it('altitude bands', () => {
    expect([3999, 4000, 4999, 5000].map(altitudeFactor)).toEqual([1, 1.25, 1.25, 1.5]);
  });

  it('missing/unknown grade scores 0 rather than NaN', () => {
    expect(estimateAP({}, { completedAt: OCT }).points).toBe(0);
  });
});
