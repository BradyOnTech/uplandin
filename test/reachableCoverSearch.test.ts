import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { Dog, type DogEnv } from '../src/game/dog';
import { mulberry32 } from '../src/game/math';
import { PROPERTY_PX_TO_M } from '../src/game/worldUnits';

const DT = 1000 / 30;
function edgeSearch(areaId: string, seed = 42, windAngle = 0) {
  const area = getArea(areaId);
  const patch = area.patches[areaId === 'quail-fields' ? 9 : 27];
  const hunter = { x: patch.x - 8, y: patch.y + patch.h / 2 };
  const dog = new Dog({ ...hunter }, { breed: getBreed('gsp'), level: 8 }, mulberry32(seed), area.world);
  const env: DogEnv = { huntAreaId: area.id, hunterPos: hunter, workAnchor: { ...hunter },
    rangeRadius: 22 / PROPERTY_PX_TO_M, movementScale: .05, windAngle,
    slopeAngle: area.slope, patches: [patch], trails: area.trails };
  const inside = () => dog.pos.x >= patch.x && dog.pos.x <= patch.x + patch.w
    && dog.pos.y >= patch.y && dog.pos.y <= patch.y + patch.h;
  return { dog, env, patch, inside };
}

describe('reachable Quail and Chukar cover', () => {
  it.each(['quail-fields', 'chukar-ridge'])('casts into a reachable %s edge whose whole-patch center is out of range', areaId => {
    for (const seed of [1, 2, 3, 42, 200]) {
      const { dog, env, patch, inside } = edgeSearch(areaId, seed);
      expect(Math.hypot(patch.x + patch.w / 2 - env.workAnchor!.x,
        patch.y + patch.h / 2 - env.workAnchor!.y)).toBeGreaterThan(55);
      dog.update(DT, [], env);
      expect(dog.gait).toBe('trot');
      let entered = false;
      for (let tick = 0; tick < 180; tick++) {
        dog.update(DT, [], env);
        if (inside()) { entered = true; break; }
      }
      expect(entered).toBe(true);
      expect(dog.state).toBe('quartering');
    }
  });

  it('retains Chukar uphill casting within the reachable contour, rather than a generic prairie cast', () => {
    const north = edgeSearch('chukar-ridge'), south = edgeSearch('chukar-ridge');
    north.env.slopeAngle = -Math.PI / 2; south.env.slopeAngle = Math.PI / 2;
    north.env.windAngle = south.env.windAngle = undefined;
    north.env.trails = south.env.trails = [];
    // Inspect the actual cast before both dogs begin their perimeter work.
    for (let tick = 0; tick < 30; tick++) {
      north.dog.update(DT, [], north.env); south.dog.update(DT, [], south.env);
    }
    expect(south.dog.pos.y - north.dog.pos.y).toBeGreaterThan(1);
  });

  it('changes a Quail edge approach with the wind', () => {
    const one = edgeSearch('quail-fields', 42, 0), other = edgeSearch('quail-fields', 42, Math.PI);
    for (let tick = 0; tick < 30; tick++) {
      one.dog.update(DT, [], one.env); other.dog.update(DT, [], other.env);
    }
    expect(Math.hypot(one.dog.pos.x - other.dog.pos.x, one.dog.pos.y - other.dog.pos.y)).toBeGreaterThan(1);
  });

  it.each(['quail-fields', 'chukar-ridge'])('remembers checked %s ground, then casts through fresh parts as the handler advances', areaId => {
    const { dog, env, patch } = edgeSearch(areaId);
    let repeatCasting = 0;
    for (let tick = 0; tick < 60 * 30; tick++) {
      dog.update(DT, [], env);
      if (tick > 15 * 30 && dog.gait === 'trot') repeatCasting++;
    }
    // A whole-patch cooldown must not make a checked near edge look fresh.
    expect(repeatCasting).toBe(0);
    let freshCasting = 0, farCover = 0;
    for (let tick = 0; tick < 40 * 30; tick++) {
      env.hunterPos!.x += 2.2 / PROPERTY_PX_TO_M / 30;
      env.workAnchor!.x = env.hunterPos!.x;
      dog.update(DT, [], env);
      if (dog.gait === 'trot') freshCasting++;
      if (dog.pos.x > patch.x + 45 && dog.pos.y >= patch.y && dog.pos.y <= patch.y + patch.h) farCover++;
    }
    expect(freshCasting).toBeGreaterThan(30);
    expect(farCover).toBeGreaterThan(5 * 30);
    expect(dog.state).toBe('quartering');
  });

  it.each(['quail-fields', 'chukar-ridge'])('searches %s identically with or without distant concealed birds', areaId => {
    const empty = edgeSearch(areaId), occupied = edgeSearch(areaId);
    const hidden: Bird = { id: 9001, coveyId: 9001, speciesId: areaId === 'quail-fields' ? 'bobwhite' : 'chukar',
      pos: { x: 1100, y: 100 }, state: 'hidden', runs: false, runEnergy: 0, restingMs: 0, nerveMs: 10000 };
    for (let tick = 0; tick < 40 * 30; tick++) {
      for (const { env } of [empty, occupied]) {
        env.hunterPos!.x += 2.2 / PROPERTY_PX_TO_M / 30;
        env.workAnchor!.x = env.hunterPos!.x;
      }
      empty.dog.update(DT, [], empty.env); occupied.dog.update(DT, [hidden], occupied.env);
      expect(occupied.dog.pos).toEqual(empty.dog.pos);
      expect(occupied.dog.state).toEqual(empty.dog.state);
    }
    expect(hidden.state).toBe('hidden');
  });
});
