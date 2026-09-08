import { describe, expect, it } from 'vitest';
import { AREAS, areaBirdCount } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { birdsRemaining, createHunt, endFieldSession, endHuntEarly, huntComplete, type HuntState } from '../src/game/state';

function huntWith(states: Bird['state'][]): HuntState {
  return {
    areaId: 'test-area',
    dropPointId: 'test-drop',
    birds: states.map((state, i) => ({
      id: i + 1,
      coveyId: 0,
      speciesId: 'bobwhite',
      pos: { x: 0, y: 0 },
      state,
      runs: false,
      runEnergy: 0,
      restingMs: 0,
      nerveMs: 5000,
    })),
    dogsPos: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    hunterPos: { x: 0, y: 0 },
    wind: 0,
    windStrength: 'calm',
    condition: 'mild',
    downed: 0,
    escaped: 0,
    doubles: 0,
    henDowns: 0,
    gunId: 'remington-870',
    dogWork: [
      { pointFlushes: 0, retrieves: 0, downedOverPoint: 0 },
      { pointFlushes: 0, retrieves: 0, downedOverPoint: 0 },
    ],
  };
}

describe('hunt bookkeeping', () => {
  it('counts only hidden birds as remaining', () => {
    expect(birdsRemaining(huntWith(['hidden', 'downed', 'escaped']))).toBe(1);
  });

  it('is not complete while birds are hidden or mid-flush', () => {
    expect(huntComplete(huntWith(['hidden', 'downed']))).toBe(false);
    expect(huntComplete(huntWith(['flushed']))).toBe(false);
  });

  it('waits for downed and carried birds to be delivered', () => {
    expect(huntComplete(huntWith(['downed', 'escaped']))).toBe(false);
    expect(huntComplete(huntWith(['carried', 'escaped']))).toBe(false);
    expect(huntComplete(huntWith(['retrieved', 'escaped']))).toBe(true);
  });

  it('endHuntEarly writes off hidden and flushed birds as escaped', () => {
    const hunt = huntWith(['hidden', 'flushed', 'downed', 'retrieved']);
    hunt.escaped = 1;
    const n = endHuntEarly(hunt);
    expect(n).toBe(2);
    expect(hunt.escaped).toBe(3);
    expect(hunt.birds[0].state).toBe('escaped');
    expect(hunt.birds[1].state).toBe('escaped');
    expect(hunt.birds[2].state).toBe('downed');
    expect(hunt.birds[3].state).toBe('retrieved');
    expect(huntComplete(hunt)).toBe(false);
    hunt.birds[2].state = 'retrieved';
    expect(huntComplete(hunt)).toBe(true);
    expect(birdsRemaining(hunt)).toBe(0);
  });

  it('endHuntEarly is a no-op when the hunt is already complete', () => {
    const hunt = huntWith(['retrieved', 'escaped']);
    expect(endHuntEarly(hunt)).toBe(0);
    expect(hunt.escaped).toBe(0);
  });

  it('closes a quiet field session without converting hidden birds to escapes', () => {
    const hunt = huntWith(['hidden', 'hidden']);
    expect(endFieldSession(hunt)).toBe(true);
    expect(huntComplete(hunt)).toBe(true);
    expect(hunt.escaped).toBe(0);
    expect(birdsRemaining(hunt)).toBe(2);
    expect(endFieldSession(hunt)).toBe(true);
    expect(hunt.escaped).toBe(0);
  });

  it.each(['flushed', 'downed', 'carried'] as const)('cannot close a field session with a %s bird', (state) => {
    const hunt = huntWith(['hidden', state]);
    expect(endFieldSession(hunt)).toBe(false);
    expect(hunt.fieldSessionEnded).toBeUndefined();
    expect(huntComplete(hunt)).toBe(false);
    hunt.birds[1].state = 'retrieved';
    expect(endFieldSession(hunt)).toBe(true);
    expect(huntComplete(hunt)).toBe(true);
  });

  it('createHunt builds a hunt from the area config', () => {
    const hunt = createHunt(AREAS[0]);
    expect(hunt.areaId).toBe(AREAS[0].id);
    expect(hunt.dropPointId).toBe(AREAS[0].dropPoints[0].id);
    expect(hunt.birds).toHaveLength(areaBirdCount(AREAS[0]));
    expect(hunt.downed).toBe(0);
    expect(hunt.escaped).toBe(0);
  });

  it('starts from the selected truck and keeps birds outside every safety zone', () => {
    const area = AREAS[0];
    const drop = area.dropPoints[1];
    const hunt = createHunt(area, Math.random, { dropPointId: drop.id });
    expect(hunt.hunterPos).toEqual(drop.position);
    for (const bird of hunt.birds) {
      for (const point of area.dropPoints) {
        expect(Math.hypot(bird.pos.x - point.position.x, bird.pos.y - point.position.y))
          .toBeGreaterThanOrEqual(point.safetyRadius);
      }
    }
  });

  it('puts the opening covey in cover along the selected walk-in', () => {
    const area = AREAS[0];
    const hunt = createHunt(area, Math.random, { dropPointId: 'south-gate' });
    const first = hunt.birds[0];
    expect(area.patches.some((patch) =>
      first.pos.x >= patch.x - 10 && first.pos.x <= patch.x + patch.w + 10 &&
      first.pos.y >= patch.y - 10 && first.pos.y <= patch.y + patch.h + 10,
    )).toBe(true);
    expect(Math.hypot(first.pos.x - hunt.hunterPos.x, first.pos.y - hunt.hunterPos.y)).toBeGreaterThan(48);
  });

  it('weather override sticks, and frost birds hold longer than mild ones', () => {
    function rng(seed: number) {
      let s = seed;
      return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    }
    const mild = createHunt(AREAS[0], rng(9), { wind: 'calm', condition: 'mild' });
    const frost = createHunt(AREAS[0], rng(9), { wind: 'calm', condition: 'frost' });
    expect(mild.condition).toBe('mild');
    expect(frost.condition).toBe('frost');
    for (let i = 0; i < mild.birds.length; i++) {
      expect(frost.birds[i].nerveMs).toBeCloseTo(mild.birds[i].nerveMs * 1.25, 5);
    }
  });

  it('starts hunter and dog inside the area world, birds too', () => {
    for (const area of AREAS) {
      const hunt = createHunt(area);
      const inWorld = (p: { x: number; y: number }) =>
        p.x >= area.world.x &&
        p.x <= area.world.x + area.world.w &&
        p.y >= area.world.y &&
        p.y <= area.world.y + area.world.h;
      expect(inWorld(hunt.hunterPos)).toBe(true);
      for (const p of hunt.dogsPos) expect(inWorld(p)).toBe(true);
      for (const b of hunt.birds) expect(inWorld(b.pos)).toBe(true);
    }
  });
});
