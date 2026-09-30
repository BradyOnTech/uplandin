import { describe, expect, it } from 'vitest';
import { GUNS, chokeForShot, getGun } from '../src/game/guns';
import { TravellingShot, WOUND_RANGE_M, type ShotTarget } from '../src/three/shotPattern';
import { shotCall } from '../src/three/shotFx';

/** Fire straight down -z at a bird crossing left to right at 30 m. */
function crossing(offsetX: number, offsetY = 0) {
  const bird = (t: number): ShotTarget => ({ simId: 1, x: offsetX + t * 12, y: 2 + offsetY, z: -30, status: 'flying' });
  const shot = new TravellingShot({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: -1 }, 14 / 400, [bird(0)]);
  let t = 0;
  while (!shot.done) { t += 1 / 30; shot.advance(1 / 30, [bird(t)], () => true); }
  return shot;
}

describe('shot coaching', () => {
  it('calls a miss behind a crossing bird, in front of it, over and under', () => {
    // The pattern arrives ~0.1 s after the trigger: the bird has moved 1.2 m on.
    expect(crossing(1.2).nearMiss?.call).toBe('behind');
    expect(crossing(-3.6).nearMiss?.call).toBe('ahead');
    expect(crossing(-1.2, 2.2).nearMiss?.call).toBe('low');
    expect(crossing(-1.2, -2.2).nearMiss?.call).toBe('high');
    expect(crossing(-1.2).nearMiss).toBeNull();
  });

  it('turns the result into a coach’s word, not a scoreboard', () => {
    expect(shotCall(true, false, null).text).toBe('BIRD DOWN');
    expect(shotCall(true, true, null).tone).toBe('wound');
    expect(shotCall(false, false, { call: 'behind', margin: 1.4 }).text).toBe('MISS · BEHIND IT');
    expect(shotCall(false, false, { call: 'behind', margin: 3.5 }).text).toBe('MISS');
  });

  it('doubles fire an open barrel first and a tighter one second; repeaters keep one choke', () => {
    for (const gun of GUNS) {
      const first = chokeForShot(gun, gun.shells), second = chokeForShot(gun, gun.shells - 1);
      if (gun.shells === 2) expect(second.pattern).toBeLessThan(first.pattern);
      else expect(second).toBe(first);
    }
    const ou = getGun('over-under');
    expect(chokeForShot(ou, 2).name).toBe('Improved cylinder');
    expect(chokeForShot(ou, 1).name).toBe('Modified');
    expect(WOUND_RANGE_M / Math.sqrt(chokeForShot(ou, 1).pattern)).toBeGreaterThan(WOUND_RANGE_M);
  });
});
