import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { birdsRemaining, createHunt, huntComplete, type HuntState } from '../src/game/state';

function huntWith(states: Bird['state'][]): HuntState {
  return {
    areaId: 'test-area',
    birds: states.map((state, i) => ({
      id: i + 1,
      coveyId: 0,
      pos: { x: 0, y: 0 },
      state,
      runs: false,
      runEnergy: 0,
      restingMs: 0,
      nerveMs: 5000,
    })),
    dogPos: { x: 0, y: 0 },
    hunterPos: { x: 0, y: 0 },
    wind: 0,
    downed: 0,
    escaped: 0,
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

  it('is complete when every bird is resolved', () => {
    expect(huntComplete(huntWith(['downed', 'escaped']))).toBe(true);
    expect(huntComplete(huntWith(['retrieved', 'escaped']))).toBe(true);
  });

  it('createHunt builds a hunt from the area config', () => {
    const hunt = createHunt(AREAS[0]);
    expect(hunt.areaId).toBe(AREAS[0].id);
    expect(hunt.birds).toHaveLength(AREAS[0].birdCount);
    expect(hunt.downed).toBe(0);
    expect(hunt.escaped).toBe(0);
  });
});
