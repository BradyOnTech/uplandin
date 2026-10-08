import { describe, expect, it } from 'vitest';
import { GLARE_MISS_THRESHOLD, glareStrength, sunDirection, sunLowness } from '../src/three/sunGlare';
import { fieldTimeOfDay } from '../src/three/palette';

const CORE_AREAS = ['quail-fields', 'pheasant-coverts', 'chukar-ridge', 'sharptail-prairie'];

/** A level view along a compass azimuth, in the sky's convention. */
function levelView(azimuthDeg: number) {
  return sunDirection(0, azimuthDeg);
}

describe('sun glare', () => {
  it('only a low sun glares', () => {
    expect(sunLowness(2)).toBe(1);
    expect(sunLowness(9)).toBeGreaterThan(0.5);
    expect(sunLowness(25)).toBe(0);
    expect(sunLowness(-6)).toBe(0);
  });

  it('looking into an evening sun glares; looking away does not', () => {
    for (const area of CORE_AREAS) {
      const { sunElevation, sunAzimuth } = fieldTimeOfDay(area, 'evening');
      const sun = sunDirection(sunElevation, sunAzimuth);
      expect(glareStrength(sunDirection(sunElevation, sunAzimuth), sun, sunElevation)).toBeGreaterThan(GLARE_MISS_THRESHOLD);
      expect(glareStrength(levelView(sunAzimuth + 180), sun, sunElevation)).toBe(0);
      expect(glareStrength(levelView(sunAzimuth + 60), sun, sunElevation)).toBe(0);
    }
  });

  it('glare falls off with the angle from the sun', () => {
    const sun = sunDirection(6, 52);
    const near = glareStrength(levelView(52), sun, 6);
    const off = glareStrength(levelView(72), sun, 6);
    expect(near).toBeGreaterThan(off);
    expect(off).toBeGreaterThan(0);
  });

  it('morning and midday hunts never glare on the core grounds', () => {
    for (const area of CORE_AREAS) for (const time of ['morning', 'noon'] as const) {
      const { sunElevation, sunAzimuth } = fieldTimeOfDay(area, time);
      const sun = sunDirection(sunElevation, sunAzimuth);
      expect(glareStrength(sun, sun, sunElevation)).toBe(0);
    }
  });
});
