import { describe, expect, it } from 'vitest';
import { TravellingShot } from '../src/three/shotPattern';
import { resolveShotAssistance } from '../src/three/shotAssistance';
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
  it('retains the swept impact instead of the later target position', () => {
    const target = bird(0, -12);
    const shot = new TravellingShot(origin, { x: .72, y: 0, z: -12 }, .035, [target]);
    expect(shot.impact).toBeNull();
    target.x = 1.8;
    expect(shot.advance(.1, [target], clear)).toBe(1);
    const impact = shot.impact!;
    expect(impact.x).toBeCloseTo(.72, 2); expect(impact.z).toBe(-12);
    expect(impact.x).toBeLessThan(target.x);
    target.x = 10;
    expect(shot.advance(.1, [target], clear)).toBeNull(); expect(shot.impact).toEqual(impact);
  });
  it('never exposes an impact for a blocked or missed shot', () => {
    for (const target of [bird(0), bird(20)]) {
      const shot = new TravellingShot(origin, { x: 0, y: 0, z: -1 }, .035, [target]);
      expect(shot.advance(.2, [target], () => false)).toBeNull();
      expect(shot.impact).toBeNull(); expect(shot.done).toBe(true);
    }
  });
});

describe('bounded mobile shot forgiveness', () => {
  const off = resolveShotAssistance('wild', 'difficulty', 'touch');
  const light = resolveShotAssistance('balanced', 'difficulty', 'touch');
  const generous = resolveShotAssistance('relaxed', 'difficulty', 'touch');
  const aim = { x: 0, y: 0, z: -1 };

  it.each([12, 30, 50])('turns only bounded near misses into hits at %s metres', distance => {
    const baseRadius = Math.max(.48, distance * Math.tan(.035));
    const offsets = [baseRadius + .05, baseRadius + (distance === 12 ? .13 : .30), baseRadius + .60];
    const expected = [[null, 1, 1], [null, null, 1], [null, null, null]];
    offsets.forEach((offset, row) => {
      const target = bird(offset, -distance);
      [off, light, generous].forEach((profile, col) => {
        const shot = new TravellingShot(origin, aim, .035, [target], profile);
        expect(shot.advance(.2, [target], clear), `offset=${offset}, profile=${profile.level}`).toBe(expected[row][col]);
      });
    });
  });

  it.each([30, 60, 120])('retains crossing lead with generous assistance at %s Hz', fps => {
    for (const distance of [12, 30, 50]) {
      const target = bird(0, -distance);
      const led = new TravellingShot(origin, { x: 18 * distance / 300, y: 0, z: -distance }, .035, [target], generous);
      const unled = new TravellingShot(origin, aim, .035, [target], generous);
      let ledHit: number | null = null, unledHit: number | null = null;
      for (let frame = 1; frame <= Math.ceil(fps * .25); frame++) {
        target.x = 18 * frame / fps;
        ledHit ??= led.advance(1 / fps, [target], clear);
        unledHit ??= unled.advance(1 / fps, [target], clear);
      }
      expect(ledHit, `led at ${distance}m`).toBe(1);
      expect(unledHit, `unled at ${distance}m`).toBeNull();
    }
  });

  it('preserves weapon spread ordering instead of multiplying every pattern', () => {
    // Same aim and flight path: a wider-pattern double retains its advantage.
    const target = bird(1.55, -30);
    for (const profile of [off, light, generous]) {
      const results = [.035, .040, .045].map(spread =>
        new TravellingShot(origin, aim, spread, [target], profile).advance(.2, [target], clear));
      expect(results).toEqual(profile.level === 'off' ? [null, null, null]
        : profile.level === 'light' ? [null, null, 1] : [null, 1, 1]);
    }
  });

  it('does not extend range, revive ineligible targets or go through obstructions', () => {
    const blocked = bird(1.3, -30, 1);
    const distant = bird(0, -56, 2);
    const grounded = { ...bird(0, -15, 3), status: 'grounded' };
    const falling = bird(0, -20, 4);
    const targets = [blocked, distant, grounded, falling];
    const shot = new TravellingShot(origin, aim, .035, targets, generous);
    falling.status = 'falling';
    const inspected: number[] = [];
    expect(shot.advance(.2, targets, target => { inspected.push(target.simId); return false; })).toBeNull();
    expect(inspected).toEqual([1]);
    expect(shot.done).toBe(true);
  });

  it('uses the swept bird position for visibility and resolves only one nearest clear bird', () => {
    const near = bird(.55, -12, 1), far = bird(1.3, -30, 2);
    const shot = new TravellingShot(origin, aim, .035, [far, near], generous);
    near.x += .05; far.x += .05;
    const inspected: {simId: number; x: number}[] = [];
    expect(shot.advance(.15, [far, near], target => { inspected.push(target); return true; })).toBe(1);
    expect(inspected.find(target => target.simId === 1)?.x).toBeCloseTo(.55 + .05 * (.04 / .15));
    expect(shot.advance(.15, [far, near], clear)).toBeNull();
  });
});
