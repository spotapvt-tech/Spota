import { describe, expect, it } from 'vitest';
import { sunsetTime } from '../sun';

const minutesOff = (actual, iso) => Math.abs(actual.getTime() - new Date(iso).getTime()) / 60000;

describe('sunsetTime', () => {
  it('New Delhi, June solstice ≈ 19:22 IST', () => {
    expect(minutesOff(sunsetTime(28.61, 77.21, new Date('2026-06-21T06:00:00Z')), '2026-06-21T13:52:00Z')).toBeLessThan(5);
  });

  it('London, December solstice ≈ 15:53 GMT', () => {
    expect(minutesOff(sunsetTime(51.5, -0.13, new Date('2026-12-21T12:00:00Z')), '2026-12-21T15:53:00Z')).toBeLessThan(5);
  });

  it('returns null during polar day', () => {
    expect(sunsetTime(78.2, 15.6, new Date('2026-06-21T12:00:00Z'))).toBeNull();
  });
});
