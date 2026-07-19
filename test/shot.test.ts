import { describe, expect, it } from 'vitest';
import {
  escapeVelocity,
  escapeVelocityFan,
  exitDirFor,
  flushBias,
  glideStep,
  GLIDE_MAX,
  hitTest,
  LEVEL_MAX,
  levelStep,
} from '../src/game/shot';

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

  it('the tilted playfield: a gliding bird always drives off-screen, even from a hover', () => {
    // The floating-quail bug: a near-vertical riser has ~0 lateral speed,
    // and a multiplicative boost multiplies nothing. The glide must build
    // real exit speed from a standstill.
    const vel = { x: 2, y: -120 };
    const dir = exitDirFor(vel.x, 240);
    for (let i = 0; i < 30; i++) glideStep(vel, dir, 0.05); // 1.5 simulated seconds
    expect(Math.abs(vel.x)).toBeGreaterThanOrEqual(100); // genuinely leaving
    expect(Math.abs(vel.x)).toBeLessThanOrEqual(GLIDE_MAX);
    expect(vel.y).toBeGreaterThan(0); // wings locked, gently sinking
    // The rooster's level-off builds an even faster crossing exit.
    const rv = { x: 40, y: -100 };
    for (let i = 0; i < 40; i++) levelStep(rv, 1, 0.05);
    expect(rv.x).toBeGreaterThanOrEqual(180);
    expect(rv.x).toBeLessThanOrEqual(LEVEL_MAX);
    expect(Math.abs(rv.y)).toBeLessThan(5); // climb is gone — pure crossing shot
  });

  it('skill-linked difficulty: a tight walk-in usually buys big close birds', () => {
    const earned = () => 0.99; // rolls past the wild/gift band
    const pointBlank = flushBias(10, earned);
    const edgeOfRange = flushBias(38, earned);
    expect(pointBlank.kind).toBe('earned');
    // Ranges are sane and ordered...
    expect(pointBlank.min).toBeLessThan(pointBlank.max);
    expect(edgeOfRange.min).toBeLessThan(edgeOfRange.max);
    // ...and they don't even overlap: the worst point-blank bird is still
    // bigger than the best edge-of-range bird.
    expect(pointBlank.min).toBeGreaterThan(edgeOfRange.max);
  });

  it('...but birds do wild bird things: skill loads the dice, never replaces them', () => {
    const seq = (vals: number[]) => {
      let i = 0;
      return () => vals[Math.min(i++, vals.length - 1)];
    };
    const earned = () => 0.99;
    // A perfect point-blank walk-in can still blow out wild — the rise
    // behaves like an edge-of-range scramble despite your good work.
    const wild = flushBias(10, seq([0.05, 0.5]));
    expect(wild.kind).toBe('wild');
    expect(wild.max).toBeLessThan(flushBias(10, earned).min);
    // And a bad scramble can still find birds that sat like stones.
    const gift = flushBias(38, seq([0.2, 0.5]));
    expect(gift.kind).toBe('gift');
    expect(gift.min).toBeGreaterThan(flushBias(38, earned).max);
  });

  it('exitDirFor leaves with momentum, or by the nearer edge from a hover', () => {
    expect(exitDirFor(80, 240)).toBe(1);
    expect(exitDirFor(-80, 240)).toBe(-1);
    expect(exitDirFor(3, 100)).toBe(-1); // hovering on the left: leave left
    expect(exitDirFor(-3, 380)).toBe(1); // hovering on the right: leave right
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
