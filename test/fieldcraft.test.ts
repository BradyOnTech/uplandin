import { describe, expect, it } from 'vitest';
import {
  FLANK_NERVE_MULT,
  isFlanking,
  slopeApproach,
  slopeFlightMult,
  slopeNerveMult,
} from '../src/game/fieldcraft';

describe('slope (the chukar rule)', () => {
  const uphillNorth = -Math.PI / 2; // uphill is up-screen

  it('knows above from below', () => {
    const bird = { x: 200, y: 200 };
    expect(slopeApproach(uphillNorth, { x: 200, y: 120 }, bird)).toBe('above'); // hunter north = uphill
    expect(slopeApproach(uphillNorth, { x: 200, y: 280 }, bird)).toBe('below');
    expect(slopeApproach(uphillNorth, { x: 120, y: 200 }, bird)).toBe('level'); // sidehilling
    expect(slopeApproach(undefined, { x: 200, y: 120 }, bird)).toBeNull(); // flat ground
  });

  it('holds from above, spooks from below', () => {
    expect(slopeNerveMult('above')).toBeLessThan(1);
    expect(slopeNerveMult('below')).toBeGreaterThan(1);
    expect(slopeNerveMult('level')).toBe(1);
    expect(slopeNerveMult(null)).toBe(1);
  });

  it('the downhill shot is slower; from below they rocket', () => {
    expect(slopeFlightMult('above')).toBeLessThan(1);
    expect(slopeFlightMult('below')).toBeGreaterThan(1);
    expect(slopeFlightMult(null)).toBe(1);
  });
});

describe('walk-in craft (flanking)', () => {
  const bird = { x: 200, y: 200 };
  const dog = { x: 230, y: 200 }; // pointing from the east

  it('flanking means the bird sits between hunter and dog', () => {
    expect(isFlanking({ x: 150, y: 200 }, dog, bird)).toBe(true); // hunter west: pincer
    expect(isFlanking({ x: 260, y: 200 }, dog, bird)).toBe(false); // walking up the dog's back
    expect(isFlanking({ x: 200, y: 150 }, dog, bird)).toBe(false); // square to the side: no bonus
    expect(FLANK_NERVE_MULT).toBeLessThan(1);
  });

  it('degenerate positions do not flank', () => {
    expect(isFlanking(bird, dog, bird)).toBe(false);
    expect(isFlanking({ x: 150, y: 200 }, bird, bird)).toBe(false);
  });
});
