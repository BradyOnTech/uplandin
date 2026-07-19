import { describe, expect, it } from 'vitest';
import { escapeVelocity, escapeVelocityFan, hitTest } from '../src/game/shot';

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

  it('a covey rise fans out — no two slots share a bearing', () => {
    const flight = { speedMin: 120, speedMax: 120, climb: 0.6, wobble: 0 };
    const vels = Array.from({ length: 5 }, (_, i) => escapeVelocityFan(flight, i, 5, () => 0.5));
    // Leftmost slice flies left, rightmost right, everyone climbs.
    expect(vels[0].x).toBeLessThan(0);
    expect(vels[4].x).toBeGreaterThan(0);
    for (const v of vels) expect(v.y).toBeLessThan(0);
    // Bearings are strictly spread across the arc.
    const bearings = vels.map((v) => Math.atan2(v.y, v.x));
    for (let i = 1; i < bearings.length; i++) {
      expect(Math.abs(bearings[i] - bearings[i - 1])).toBeGreaterThan(0.1);
    }
    // A solo bird still climbs somewhere inside the arc.
    const solo = escapeVelocityFan(flight, 0, 1, () => 0.9);
    expect(solo.y).toBeLessThan(0);
  });

  it('even steep climbers separate laterally — the push beats a narrow arc', () => {
    // Bobwhite-like: climb 0.75 gives a ~24-degree half arc, which alone
    // separates 44px sprites far too slowly. The per-slot push guarantees
    // adjacent covey mates diverge fast enough to read as a scatter.
    const steep = { speedMin: 115, speedMax: 155, climb: 0.75, wobble: 26 };
    const vels = Array.from({ length: 6 }, (_, i) => escapeVelocityFan(steep, i, 6, () => 0.5));
    for (let i = 1; i < vels.length; i++) {
      expect(vels[i].x - vels[i - 1].x).toBeGreaterThan(15); // px/s of divergence
    }
    for (const v of vels) expect(v.y).toBeLessThan(-40); // everyone still genuinely climbs
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
