import { describe, expect, it } from 'vitest';
import { TravellingShot } from '../src/three/shotPattern';
const origin = { x: 0, y: 2, z: 0 };
const bird = (x = 0, z = -30, simId = 1) => ({ simId, x, y: 2, z, status: 'flying' });
const clear = () => true;

describe('travelling 3D shot pattern', () => {
  it.each([1/120, 1/30, .1])('rewards lead on a crossing bird at frame interval %s', dt => {
    const target = bird();
    // 18 m/s across a 30 m shot: about 1.8 m of lead.
    const led = new TravellingShot(origin, { x: 1.8, y: 0, z: -30 }, .035, [target]);
    const centered = new TravellingShot(origin, { x: 0, y: 0, z: -1 }, .035, [target]);
    let ledHit: number | null = null, centerHit: number | null = null;
    for (let t = dt; t < .25; t += dt) {
      target.x = 18*t;
      ledHit ??= led.advance(dt, [target], clear);
      centerHit ??= centered.advance(dt, [target], clear);
    }
    expect(ledHit).toBe(1); expect(centerHit).toBeNull();
  });
  it('keeps close shots forgiving, but does not resolve them before arrival', () => {
    const target = bird(0, -6);
    const shot = new TravellingShot(origin, { x: 0, y: 0, z: -1 }, .035, [target]);
    target.x = .18;
    expect(shot.advance(.01, [target], clear)).toBeNull();
    target.x = .36;
    expect(shot.advance(.01, [target], clear)).toBe(1);
  });
  it('retains the firing origin and aim after the player turns or moves', () => {
    const o = { ...origin }, d = { x: 0, y: 0, z: -1 }, target = bird();
    const shot = new TravellingShot(o, d, .035, [target]);
    o.x = 100; d.x = 1; d.z = 0;
    expect(shot.advance(.11, [target], clear)).toBe(1);
  });
  it('rejects targets beyond effective range and targets that are no longer flying', () => {
    for (const target of [bird(0, -56), bird()]) {
      const shot = new TravellingShot(origin, { x: 0, y: 0, z: -1 }, .035, [target]);
      if (target.z === -30) target.status = 'falling';
      expect(shot.advance(.2, [target], clear)).toBeNull(); expect(shot.done).toBe(true);
    }
  });
  it('checks obstruction at the crossing location and resolves the nearest clear target once', () => {
    const targets = [bird(0, -30, 2), bird(0, -12, 1)];
    const shot = new TravellingShot(origin, { x: 0, y: 0, z: -1 }, .035, targets);
    expect(shot.advance(.15, targets, t => t.simId !== 1)).toBe(2);
    expect(shot.advance(.15, targets, clear)).toBeNull();
  });
});
