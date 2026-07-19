import { describe, expect, it } from 'vitest';
import { escapeVelocity, hitTest } from '../src/game/shot';

describe('hitTest', () => {
  it('connects inside the spread', () => {
    expect(hitTest({ x: 100, y: 100 }, { x: 108, y: 100 }, 14)).toBe(true);
  });

  it('misses outside the spread', () => {
    expect(hitTest({ x: 100, y: 100 }, { x: 120, y: 100 }, 14)).toBe(false);
  });
});

describe('escapeVelocity', () => {
  it('always climbs', () => {
    for (let i = 0; i < 50; i++) {
      expect(escapeVelocity().y).toBeLessThan(0);
    }
  });

  it('shapes the arc by species flight style', () => {
    const tower = { speedMin: 100, speedMax: 100, climb: 0.95, wobble: 0 };
    const burner = { speedMin: 100, speedMax: 100, climb: 0.4, wobble: 0 };
    // rng 0.999 → widest angle each style allows
    const steep = escapeVelocity(tower, () => 0.999);
    const flat = escapeVelocity(burner, () => 0.999);
    expect(Math.abs(steep.x)).toBeLessThan(Math.abs(flat.x)); // woodcock towers, sharptail runs flat
    expect(Math.hypot(steep.x, steep.y)).toBeCloseTo(100, 5); // speed comes from the style
  });
});
