import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/game/math';
import { FeatherDrift, featherTones, FEATHER_TONES } from '../src/three/featherDrift';

const calm = { x: 0, z: 0 }, flat = () => 0;
const airborne = (drift: FeatherDrift) => {
  const out = [];
  for (let i = 0; i < drift.capacity; i++) { const f = drift.feather(i); if (f && !f.landed) out.push(f); }
  return out;
};

describe('loose feathers', () => {
  it('bursts off the bird, then flutters down slowly and lands near the hit', () => {
    const drift = new FeatherDrift(32);
    drift.emit({ x: 0, y: 8, z: 0 }, { x: 12, y: 2, z: 0 }, 12, featherTones('ringneck', 'rooster'), mulberry32(1));
    expect(drift.count).toBe(12); expect(drift.points.visible).toBe(true);
    const heights = () => airborne(drift).map(f => f.y);
    for (let i = 0; i < 45; i++) drift.step(1 / 30, flat, calm);
    const before = heights();
    drift.step(1, flat, calm);
    // Past the burst, every airborne feather sinks at under a metre a second.
    const after = heights();
    expect(after.length).toBeGreaterThan(0);
    for (let i = 0; i < after.length; i++) expect(before[i] - after[i]).toBeLessThan(1.1);
    for (let i = 0; i < 400; i++) drift.step(1 / 30, flat, calm);
    for (let i = 0; i < 32; i++) {
      const f = drift.feather(i);
      if (!f) continue;
      expect(f.landed).toBe(true); expect(f.y).toBeCloseTo(.02);
      // Carried a little way along the bird's line and scattered, not flung.
      expect(Math.hypot(f.x, f.z)).toBeLessThan(9);
    }
  });

  it('lies on the ground a while, then fades out and frees its slot', () => {
    const drift = new FeatherDrift(16);
    drift.emit({ x: 0, y: .3, z: 0 }, { x: 0, y: 0, z: 0 }, 6, featherTones('bobwhite'), mulberry32(2));
    for (let i = 0; i < 60; i++) drift.step(1 / 30, flat, calm);
    expect(drift.count).toBe(6);
    expect(drift.feather(0)!.alpha).toBe(1);
    for (let i = 0; i < 30 * 5; i++) drift.step(1 / 30, flat, calm);
    expect(drift.count).toBe(0); expect(drift.points.visible).toBe(false);
  });

  it('drifts downwind', () => {
    const run = (wind: { x: number; z: number }) => {
      const drift = new FeatherDrift(16);
      drift.emit({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 }, 10, featherTones('chukar'), mulberry32(4));
      for (let i = 0; i < 90; i++) drift.step(1 / 30, flat, wind);
      const xs = airborne(drift).map(f => f.x);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(run({ x: .55, z: 0 }) - run(calm)).toBeGreaterThan(1);
  });

  it('reuses the oldest feathers past capacity and colours them by species', () => {
    const drift = new FeatherDrift(20);
    for (let k = 0; k < 3; k++) drift.emit({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, 9, featherTones('hun'), mulberry32(k));
    expect(drift.count).toBe(20);
    expect(featherTones('ringneck', 'hen')).toBe(FEATHER_TONES['ringneck:hen']);
    expect(featherTones('sharptail')).toBe(FEATHER_TONES.sharptail);
    expect(featherTones('woodcock').length).toBeGreaterThan(0);
    drift.clear(); expect(drift.count).toBe(0);
    drift.dispose();
  });
});
