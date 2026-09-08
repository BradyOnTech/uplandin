import { describe, expect, it } from 'vitest';
import type { Bird } from '../src/game/birds';
import { getBreed, type BreedConfig } from '../src/game/breeds';
import {
  Dog,
  castAimPoint,
  coverEdgeFraction,
  coverThoroughness,
  HONOR_SIGHT,
  perimeterPoint,
  QUARTER_RANGE,
  SCENT_RADIUS,
  scentApproachStyle,
  scentRange,
  WHISTLE_RANGE,
  type DogEnv,
} from '../src/game/dog';
import { FIELD_BOUNDS, type Rect } from '../src/game/field';
import { dist } from '../src/game/math';
import type { RNG } from '../src/game/types';

/** Average-everything breed at high level: reproduces the pre-breed base behavior. */
const testBreed: BreedConfig = {
  id: 'test',
  name: 'Test',
  blurb: '',
  stats: { nose: 2, speed: 2, range: 2, steadiness: 2, stamina: 2 },
  motion: { runStride: 1, huntSurge: 0, surgeHz: 0.4, searchLooseness: 0.5, headFreedom: 0.5, tailAction: 0.5, verticalMotion: 1 },
  xpRate: 1,
};

function makeDog(x: number, y: number, level = 10, rng: RNG = () => 0.5, breed = testBreed): Dog {
  return new Dog({ x, y }, { breed, level }, rng);
}

/** Deterministic value queue (constructor heading roll consumes the first). */
function seq(values: number[]): RNG {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const rng = () => 0.5;

function birdAt(x: number, y: number, over: Partial<Bird> = {}): Bird {
  return {
    id: 1,
    coveyId: 1,
    speciesId: 'bobwhite',
    pos: { x, y },
    state: 'hidden',
    runs: false,
    runEnergy: 0,
    restingMs: 0,
    nerveMs: 5000,
    ...over,
  };
}

function run(dog: Dog, birds: Bird[], steps: number, env: DogEnv = {}, dtMs = 50): void {
  for (let i = 0; i < steps; i++) dog.update(dtMs, birds, env);
}

describe('Dog', () => {
  it.each(['grouse-woods', 'woodcock-bottoms'])('holds distant scent work in %s and resumes when the handler closes', huntAreaId => {
    const dog = makeDog(100, 100), bird = birdAt(145, 100);
    const env = { huntAreaId, hunterPos: { x: 100, y: 100 }, rangeRadius: 24, movementScale: .04 };
    run(dog, [bird], 1000, env);
    expect(dog.waitingForHandler).toBe(true);
    expect(dog.state).toBe('tracking');
    expect(dog.pointedBirdId).toBeNull();
    const held = { ...dog.pos };
    run(dog, [bird], 100, env);
    expect(dog.pos).toEqual(held);
    env.hunterPos = { x: held.x - 4, y: held.y };
    run(dog, [bird], 1000, env);
    expect(dog.waitingForHandler).toBe(false);
    expect(dog.state).toBe('pointing');
    expect(dog.pointedBirdId).toBe(bird.id);
  });

  it.each(['pheasant-coverts', 'chukar-ridge'])('retains uninterrupted scent work in %s', huntAreaId => {
    const dog = makeDog(100, 100), bird = birdAt(145, 100);
    const env = { huntAreaId, hunterPos: { x: 100, y: 100 }, rangeRadius: 24, movementScale: .04 };
    run(dog, [bird], 1000, env);
    expect(dog.waitingForHandler).toBe(false);
    expect(dog.state).toBe('pointing');
  });

  it('starts quartering', () => {
    expect(makeDog(240, 135).state).toBe('quartering');
  });

  it('stays inside the field while quartering', () => {
    const dog = makeDog(240, 135);
    run(dog, [], 600); // 30 simulated seconds
    expect(dog.pos.x).toBeGreaterThanOrEqual(0);
    expect(dog.pos.x).toBeLessThanOrEqual(FIELD_BOUNDS.w);
    expect(dog.pos.y).toBeGreaterThanOrEqual(0);
    expect(dog.pos.y).toBeLessThanOrEqual(FIELD_BOUNDS.h);
  });

  it('respects custom world bounds', () => {
    const world: Rect = { x: 0, y: 0, w: 1400, h: 800 };
    const dog = new Dog({ x: 700, y: 400 }, { breed: testBreed, level: 10 }, () => 0.5, world);
    for (let i = 0; i < 1200; i++) {
      dog.update(50, []);
      expect(dog.pos.x).toBeGreaterThanOrEqual(0);
      expect(dog.pos.x).toBeLessThanOrEqual(world.w);
      expect(dog.pos.y).toBeGreaterThanOrEqual(0);
      expect(dog.pos.y).toBeLessThanOrEqual(world.h);
    }
  });

  describe('hunter-anchored quartering', () => {
    const world: Rect = { x: 0, y: 0, w: 1400, h: 800 };

    it('works the ground around the hunter, not the whole world', () => {
      const hunter = { x: 700, y: 400 };
      const dog = new Dog({ x: 700, y: 380 }, { breed: testBreed, level: 10 }, () => 0.5, world);
      // Overshoot slack: the dog turns back at Range, it doesn't teleport.
      const leash = dog.rangeRadius + 110;
      for (let i = 0; i < 1200; i++) {
        dog.update(50, [], { hunterPos: hunter });
        expect(dist(dog.pos, hunter)).toBeLessThanOrEqual(leash);
      }
    });

    it('actually uses its range instead of hugging the hunter', () => {
      const hunter = { x: 700, y: 400 };
      const dog = new Dog({ x: 700, y: 380 }, { breed: testBreed, level: 10 }, () => 0.5, world);
      let farthest = 0;
      for (let i = 0; i < 1200; i++) {
        dog.update(50, [], { hunterPos: hunter });
        farthest = Math.max(farthest, dist(dog.pos, hunter));
      }
      expect(farthest).toBeGreaterThan(QUARTER_RANGE * 0.5);
    });

    it('follows a moving hunter across the world', () => {
      const hunter = { x: 200, y: 400 };
      const dog = new Dog({ x: 200, y: 380 }, { breed: testBreed, level: 10 }, () => 0.5, world);
      for (let i = 0; i < 1200; i++) {
        hunter.x = Math.min(1200, hunter.x + 0.9); // hunter marches east
        dog.update(50, [], { hunterPos: hunter });
      }
      expect(dist(dog.pos, hunter)).toBeLessThanOrEqual(dog.rangeRadius + 110);
      expect(dog.pos.x).toBeGreaterThan(700); // came along instead of staying put
    });
  });

  it('tracks and points a bird it can smell', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(100 + SCENT_RADIUS - 10, 100);
    run(dog, [bird], 400);
    expect(dog.state).toBe('pointing');
    expect(dog.pointedBirdId).toBe(bird.id);
  });

  it('holds the point until the bird is gone, then casts off', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(120, 100);
    run(dog, [bird], 400);
    expect(dog.state).toBe('pointing');
    bird.state = 'flushed';
    run(dog, [bird], 10);
    expect(dog.state).toBe('quartering');
  });

  it('ignores birds beyond scent range', () => {
    const dog = makeDog(40, 40);
    const bird = birdAt(400, 220);
    run(dog, [bird], 100);
    expect(dog.state).toBe('quartering');
  });

  it('retrieves a downed bird, then casts off', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(160, 100, { id: 7, coveyId: 0, state: 'downed' });
    run(dog, [bird], 400);
    expect(bird.state).toBe('retrieved');
    expect(dog.state).toBe('quartering');
  });

  it('credits a retrieve only after carrying the bird back to the hunter', () => {
    const hunter = { x: 100, y: 100 };
    const dog = makeDog(hunter.x, hunter.y);
    const bird = birdAt(160, 100, { id: 7, coveyId: 0, state: 'downed' });
    let sawCarried = false;

    for (let i = 0; i < 400 && bird.state !== 'retrieved'; i++) {
      dog.update(50, [bird], { hunterPos: hunter });
      sawCarried ||= bird.state === 'carried' && dog.carryingBirdId === bird.id;
    }

    expect(sawCarried).toBe(true);
    expect(bird.state).toBe('retrieved');
    expect(dist(dog.pos, hunter)).toBeLessThanOrEqual(6);
  });

  it('fetches a downed bird before working fresh scent', () => {
    const dog = makeDog(100, 100);
    const downedBird = birdAt(160, 100, { id: 7, coveyId: 0, state: 'downed' });
    const hiddenBird = birdAt(120, 100, { id: 8, coveyId: 1 });
    run(dog, [downedBird, hiddenBird], 40); // reach + fetch the downed bird
    expect(downedBird.state).toBe('retrieved');
    expect(hiddenBird.state).toBe('hidden'); // untouched while retrieving
  });

  it('roads a pointed bird that bolts: breaks back to tracking', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(108, 100);
    run(dog, [bird], 400);
    expect(dog.state).toBe('pointing');
    bird.pos = { x: 140, y: 100 }; // bird makes a run for it
    run(dog, [bird], 1);
    expect(dog.state).toBe('tracking');
  });

  it('won’t point a bird sitting right on the hunter', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(120, 100); // within the dog’s scent range
    const hunter = { x: 118, y: 100 }; // but right next to the hunter
    run(dog, [bird], 100, { hunterPos: hunter });
    expect(dog.state).toBe('quartering');
    // and points it once the hunter moves away
    for (let i = 0; i < 2000 && dog.state !== 'pointing'; i++) dog.update(50, [bird]);
    expect(dog.state).toBe('pointing');
  });

  describe('whistle recall', () => {
    it('is out of earshot beyond whistle range', () => {
      const world: Rect = { x: 0, y: 0, w: 1400, h: 800 };
      const dog = new Dog({ x: 700, y: 400 }, { breed: testBreed, level: 10 }, () => 0.5, world);
      const farHunter = { x: 700 + WHISTLE_RANGE + 50, y: 400 };
      dog.update(50, [], { hunterPos: farHunter, recall: true });
      expect(dog.state).toBe('quartering'); // never heard it
      const nearHunter = { x: 700 + WHISTLE_RANGE - 50, y: 400 };
      dog.update(50, [], { hunterPos: nearHunter, recall: true });
      expect(dog.state).toBe('recalled');
    });

    it('comes back to the hunter and waits at heel until cast off', () => {
      const dog = makeDog(60, 60);
      const hunter = { x: 300, y: 60 };
      dog.update(50, [], { hunterPos: hunter, recall: true });
      expect(dog.state).toBe('recalled');
      for (let i = 0; i < 300 && dog.state === 'recalled'; i++) dog.update(50, [], { hunterPos: hunter });
      expect(dog.state).toBe('heel');
      expect(dist(dog.pos, hunter)).toBeLessThanOrEqual(12);
      dog.castOff();
      expect(dog.state).toBe('quartering');
    });

    it('ignores birds on the way back', () => {
      const dog = makeDog(60, 60);
      const hunter = { x: 300, y: 60 };
      const bird = birdAt(150, 60); // right on the path home
      dog.update(50, [bird], { hunterPos: hunter, recall: true });
      const seen = new Set<string>();
      for (let i = 0; i < 300 && dog.state === 'recalled'; i++) {
        dog.update(50, [bird], { hunterPos: hunter });
        seen.add(dog.state);
      }
      expect(seen.has('tracking')).toBe(false);
      expect(seen.has('pointing')).toBe(false);
    });

    it('never breaks a point', () => {
      const dog = makeDog(100, 100);
      const bird = birdAt(108, 100);
      run(dog, [bird], 400);
      expect(dog.state).toBe('pointing');
      dog.update(50, [bird], { hunterPos: { x: 300, y: 300 }, recall: true });
      expect(dog.state).toBe('pointing');
    });

    it('never interrupts a retrieve', () => {
      const dog = makeDog(100, 100);
      const bird = birdAt(160, 100, { id: 7, coveyId: 0, state: 'downed' });
      run(dog, [bird], 5);
      expect(dog.state).toBe('retrieving');
      dog.update(50, [bird], { hunterPos: { x: 300, y: 300 }, recall: true });
      expect(dog.state).toBe('retrieving');
    });
  });

  describe('wind and scent', () => {
    it('reaches much farther upwind than downwind', () => {
      // bird 60px to the east of the dog; wind blowing east (+x)
      expect(scentRange(Math.PI, 60, 0)).toBeGreaterThan(60); // wind carries scent to the dog
      expect(scentRange(0, 60, 0)).toBeLessThan(20); // wind blows scent away
      expect(scentRange(0, 0, 50)).toBeCloseTo(SCENT_RADIUS * 1.125, 3); // crosswind
      expect(scentRange(undefined, 60, 0)).toBe(SCENT_RADIUS); // calm day: plain circle
    });

    it('points an upwind bird a veteran could never smell on a calm day', () => {
      const dog = makeDog(100, 100);
      const bird = birdAt(160, 100); // 60px — beyond base scent range
      run(dog, [bird], 400, { windAngle: Math.PI });
      expect(dog.state).toBe('pointing');
    });

    it('strong wind (scentMult) stretches the nose', () => {
      // 68px out: beyond this dog's 63px base reach, inside 63 × 1.25.
      const calmDog = makeDog(100, 100);
      run(calmDog, [birdAt(168, 100)], 30);
      expect(calmDog.state).toBe('quartering');
      const strongDog = makeDog(100, 100);
      run(strongDog, [birdAt(168, 100)], 30, { scentMult: 1.25 });
      expect(strongDog.state).not.toBe('quartering'); // tracking or already pointing
    });
  });

  describe('puppy creep and bump', () => {
    it('a soft young dog creeps on point and can bump the bird', () => {
      const irish = getBreed('irish-setter');
      // heading roll, then creep roll (0.1 < chance), then steps roll (0.9 → 3 steps)
      const dog = makeDog(100, 100, 1, seq([0.5, 0.1, 0.9]), irish);
      const bird = birdAt(108, 100);
      run(dog, [bird], 60);
      expect(dog.bumpedBirdId).toBe(bird.id);
    });

    it('a steady veteran stands still', () => {
      const gsp = getBreed('gsp');
      const dog = makeDog(100, 100, 10, seq([0.5, 0.1, 0.9]), gsp);
      const bird = birdAt(108, 100);
      run(dog, [bird], 60);
      expect(dog.bumpedBirdId).toBeNull();
      expect(dog.state).toBe('pointing');
    });
  });

  describe('wind craft', () => {
    it('a level-1 dog gets no upwind bonus', () => {
      const dog = makeDog(100, 100, 1); // tier 0: base nose only
      const bird = birdAt(160, 100); // 60px — upwind-rangeable for a veteran, not a pup
      run(dog, [bird], 60, { windAngle: Math.PI });
      expect(dog.state).toBe('quartering');
    });
  });

  describe('conditions', () => {
    it('a hot day drains stamina faster (drainMult)', () => {
      const cool = makeDog(240, 135, 1);
      const hot = makeDog(240, 135, 1);
      run(cool, [], 200); // 10s of quartering
      run(hot, [], 200, { drainMult: 1.5 });
      const coolSpent = cool.maxStaminaMs - cool.staminaMs;
      const hotSpent = hot.maxStaminaMs - hot.staminaMs;
      expect(hotSpent).toBeCloseTo(coolSpent * 1.5, 3);
    });

    it('snow makes the unmarked search quick (searchMult)', () => {
      const dog = makeDog(100, 100);
      dog.needsSearch = true;
      const b = birdAt(120, 100, { state: 'downed' });
      run(dog, [b], 8, { searchMult: 0.6 }); // travel to the fall
      // 700ms hold + 2200 x 0.6 = 2020ms search → done within ~2.8s
      run(dog, [b], 56, { searchMult: 0.6 });
      expect(b.state).toBe('retrieved');
    });
  });

  describe('fatigue', () => {
    it('drains stamina while working and goes winded', () => {
      const dog = makeDog(240, 135, 1); // 90s pool at level 1
      run(dog, [], 1900); // 95s of quartering
      expect(dog.winded).toBe(true);
    });

    it('recovers at heel', () => {
      const dog = makeDog(240, 135, 1);
      run(dog, [], 1900);
      expect(dog.winded).toBe(true);
      const hunter = { ...dog.pos };
      dog.update(50, [], { hunterPos: hunter, recall: true }); // recalled, already home
      expect(dog.state).toBe('heel');
      run(dog, [], 40, { hunterPos: hunter }); // 2s at heel = 6s of recovery
      expect(dog.staminaMs).toBeGreaterThan(0);
      expect(dog.winded).toBe(false);
    });
  });

  describe('honoring a packmate\'s point', () => {
    const point = { x: 160, y: 100 }; // where the other dog stands on point

    it('a steady dog stops, backs, and stands until the point resolves', () => {
      const dog = makeDog(100, 100, 10, () => 0.999); // 0.999 beats any break chance
      dog.update(50, [], { honorPoint: point });
      expect(dog.state).toBe('honoring');
      const held = { ...dog.pos };
      run(dog, [], 100, { honorPoint: point });
      expect(dog.pos).toEqual(held); // standing, not creeping
      dog.update(50, [], {}); // point resolved
      expect(dog.state).toBe('quartering');
    });

    it('ignores points beyond sight', () => {
      const dog = makeDog(100, 100, 10, () => 0.999);
      dog.update(50, [], { honorPoint: { x: 100 + HONOR_SIGHT + 60, y: 100 } });
      expect(dog.state).toBe('quartering');
    });

    it('a soft young dog may steal the point instead', () => {
      const irish = getBreed('irish-setter');
      // heading roll, then honor roll: 0.01 < breakChance for a lv1 Irish
      const dog = makeDog(100, 100, 1, seq([0.5, 0.01]), irish);
      dog.update(50, [], { honorPoint: point });
      expect(dog.state).not.toBe('honoring'); // kept hunting — trouble incoming
    });

    it('rolls once per point, not per tick', () => {
      const irish = getBreed('irish-setter');
      const dog = makeDog(100, 100, 1, seq([0.5, 0.01, 0.999, 0.999]), irish);
      run(dog, [], 20, { honorPoint: point });
      expect(dog.state).not.toBe('honoring'); // failed roll sticks for this point
    });

    it('breaks off honoring to retrieve a downed bird', () => {
      const dog = makeDog(100, 100, 10, () => 0.999);
      dog.update(50, [], { honorPoint: point });
      expect(dog.state).toBe('honoring');
      const downed = birdAt(120, 100, { state: 'downed' });
      run(dog, [downed], 40, { honorPoint: point });
      expect(downed.state).toBe('retrieved');
    });

    it('a recalled or heeled dog does not honor', () => {
      const dog = makeDog(100, 100, 10, () => 0.999);
      const hunter = { x: 300, y: 100 };
      dog.update(50, [], { hunterPos: hunter, recall: true });
      expect(dog.state).toBe('recalled');
      dog.update(50, [], { hunterPos: hunter, honorPoint: point });
      expect(dog.state).toBe('recalled');
    });
  });

  describe('breaking and marking', () => {
    it('watches the complete continuous covey through flight and falling, then retrieves', () => {
      const dog = makeDog(100, 100);
      const a = birdAt(112, 100, { id: 1, state: 'flushed' });
      const b = birdAt(114, 100, { id: 2, state: 'flushed' });
      dog.onFlush(() => .999, a.pos, [a.id, b.id]);
      const origin = { ...dog.pos };
      run(dog, [a,b], 30);
      expect(dog.state).toBe('marking'); expect(dog.pos).toEqual(origin); expect(dog.gait).toBe('still');
      a.state = 'downed'; a.fallPending = true; b.state = 'escaped';
      run(dog, [a,b], 10);
      expect(dog.state).toBe('marking'); expect(dog.pos).toEqual(origin);
      a.fallPending = false; run(dog, [a,b], 1);
      expect(dog.state).toBe('retrieving'); expect(dog.needsSearch).toBe(false);
    });

    it('lets a handler recall a marking dog and gives up the marked-fall advantage', () => {
      const dog = makeDog(100,100); const bird = birdAt(140,100,{id:1,state:'flushed'});
      dog.onFlush(() => .999,bird.pos,[bird.id]);
      dog.update(50,[bird],{hunterPos:{x:200,y:100},recall:true});
      expect(dog.state).toBe('recalled'); expect(dog.needsSearch).toBe(true);
      expect(dog.pos.x).toBeGreaterThan(100);
    });

    it('keeps a breaking dog moving and does not abandon a carried bird for another flush', () => {
      const dog = makeDog(100,100); const bird = birdAt(140,100,{id:1,state:'flushed'});
      expect(dog.onFlush(() => 0,bird.pos,[bird.id])).toBe(true);
      run(dog,[bird],3); expect(dog.pos.x).toBeGreaterThan(100); expect(dog.needsSearch).toBe(true);
      dog.state='retrieving'; dog.carryingBirdId=42;
      expect(dog.onFlush(() => 0,bird.pos,[bird.id])).toBe(false);
      expect(dog.state).toBe('retrieving'); expect(dog.carryingBirdId).toBe(42);
    });

    it('breaks chase on a forced roll and bumps birds it passes', () => {
      const dog = makeDog(100, 100);
      const flushedBird = birdAt(140, 100, { id: 1, state: 'flushed' });
      const bystander = birdAt(150, 100, { id: 2, coveyId: 2 });
      const broke = dog.onFlush(() => 0, flushedBird.pos); // 0 beats any chance
      expect(broke).toBe(true);
      expect(dog.state).toBe('breaking');
      run(dog, [flushedBird, bystander], 10);
      expect(dog.bumpedBirdId).toBe(2);
      run(dog, [flushedBird, bystander], 60);
      expect(dog.state).toBe('quartering');
      expect(dog.needsSearch).toBe(true);
    });

    it('stands steady on a failed roll', () => {
      const dog = makeDog(100, 100);
      const broke = dog.onFlush(() => 0.999, { x: 140, y: 100 });
      expect(broke).toBe(false);
      expect(dog.state).toBe('quartering');
      expect(dog.needsSearch).toBe(false);
    });

    it('searches longer for a fall it did not mark', () => {
      const dog = makeDog(100, 100);
      dog.needsSearch = true;
      const bird = birdAt(120, 100, { state: 'downed' });
      run(dog, [bird], 8); // travel to the fall
      expect(dog.state).toBe('retrieving');
      run(dog, [bird], 14); // 700ms of hold — a marked bird would be done
      expect(bird.state).toBe('downed');
      run(dog, [bird], 50); // +2500ms — the search completes
      expect(bird.state).toBe('retrieved');
      expect(dog.needsSearch).toBe(false);
    });
  });

  it('exposes breed pressure for the nerve system', () => {
    const gsp = getBreed('gsp');
    const dog = makeDog(0, 0, 1, () => 0.5, gsp);
    expect(dog.pressure).toBeCloseTo(1.35, 2);
  });

  describe('cover work', () => {
    const patch: Rect = { x: 120, y: 80, w: 90, h: 60 };
    const farPatch: Rect = { x: 150, y: 90, w: 60, h: 40 };
    const hunter = { x: 60, y: 110 };

    it('casts to cover and works it instead of scrambling open ground', () => {
      const dog = makeDog(40, 100);
      const env: DogEnv = { hunterPos: hunter, patches: [patch] };
      let insideMs = 0;
      for (let t = 0; t < 12_000; t += 16) {
        dog.update(16, [], env);
        if (
          dog.pos.x >= patch.x && dog.pos.x <= patch.x + patch.w &&
          dog.pos.y >= patch.y && dog.pos.y <= patch.y + patch.h
        ) insideMs += 16;
      }
      // A dog with one objective in range spends real time working it —
      // far more than a random sweep of the whole field would produce.
      expect(insideMs).toBeGreaterThan(2500);
    });

    it('remembers checked cover and moves on to the next patch', () => {
      const second: Rect = { x: 20, y: 40, w: 70, h: 50 };
      const dog = makeDog(130, 100);
      const env: DogEnv = { hunterPos: { x: 110, y: 100 }, patches: [patch, second] };
      let visitedSecondAfterFirst = false;
      let firstChecked = false;
      for (let t = 0; t < 40_000; t += 16) {
        dog.update(16, [], env);
        const inFirst =
          dog.pos.x >= patch.x && dog.pos.x <= patch.x + patch.w &&
          dog.pos.y >= patch.y && dog.pos.y <= patch.y + patch.h;
        const inSecond =
          dog.pos.x >= second.x && dog.pos.x <= second.x + second.w &&
          dog.pos.y >= second.y && dog.pos.y <= second.y + second.h;
        if (firstChecked && inSecond) visitedSecondAfterFirst = true;
        if (!firstChecked && !inFirst && t > 6000) firstChecked = true;
      }
      expect(visitedSecondAfterFirst).toBe(true);
    });

    it('ignores cover beyond its range of the hunter', () => {
      const distant: Rect = { x: 600, y: 600, w: 80, h: 60 };
      const dog = makeDog(40, 100, 10, () => 0.5, testBreed);
      const env: DogEnv = { hunterPos: hunter, patches: [distant] };
      for (let t = 0; t < 8000; t += 16) dog.update(16, [], env);
      // Never dragged out of its working range chasing unreachable cover.
      expect(dist(dog.pos, hunter)).toBeLessThanOrEqual(dog.rangeRadius * 1.3);
    });

    it('a pup calls cover checked sooner than a finished dog', () => {
      expect(coverThoroughness(1)).toBeLessThan(coverThoroughness(10) * 0.6);
    });

    it('a finished dog rings the perimeter before combing; a pup dives the middle', () => {
      // Large square so edge vs core is unambiguous.
      const big: Rect = { x: 100, y: 80, w: 120, h: 100 };
      const hunter = { x: 160, y: 200 };
      const env: DogEnv = { hunterPos: hunter, patches: [big] };

      const distToEdge = (p: { x: number; y: number }): number =>
        Math.min(p.x - big.x, big.x + big.w - p.x, p.y - big.y, big.y + big.h - p.y);

      const edgeShare = (level: number): number => {
        const dog = makeDog(160, 220, level, () => 0.5);
        let insideSamples = 0;
        let nearEdgeSamples = 0;
        let entered = false;
        // Early work window after first entry — edge phase for a finished dog.
        let earlyMs = 0;
        for (let t = 0; t < 20_000; t += 16) {
          dog.update(16, [], env);
          const inside =
            dog.pos.x >= big.x &&
            dog.pos.x <= big.x + big.w &&
            dog.pos.y >= big.y &&
            dog.pos.y <= big.y + big.h;
          if (inside) {
            if (!entered) entered = true;
            if (entered && earlyMs < 2800) {
              earlyMs += 16;
              insideSamples++;
              if (distToEdge(dog.pos) <= 14) nearEdgeSamples++;
            }
          }
        }
        expect(insideSamples).toBeGreaterThan(20);
        return nearEdgeSamples / insideSamples;
      };

      expect(coverEdgeFraction(1)).toBeLessThan(0.05);
      expect(coverEdgeFraction(10)).toBeGreaterThan(0.35);
      const pupEdge = edgeShare(1);
      const vetEdge = edgeShare(10);
      // Finished dog spends early work hugging the rim; pup's early path is deeper.
      expect(vetEdge).toBeGreaterThan(pupEdge + 0.15);
    });

    it('still points a bird hidden in the cover it works', () => {
      const dog = makeDog(100, 100);
      const bird = birdAt(160, 110);
      const env: DogEnv = { hunterPos: { x: 100, y: 160 }, patches: [farPatch] };
      for (let t = 0; t < 10_000 && dog.state !== 'pointing'; t += 16) {
        dog.update(16, [bird], env);
      }
      expect(dog.state).toBe('pointing');
      expect(dog.pointedBirdId).toBe(bird.id);
    });
  });

  describe('presentation gait + scent check', () => {
    it('casts with a trot gait and works cover at a run', () => {
      // Patch must sit inside the dog's leash of the hunter or it won't cast.
      const patch: Rect = { x: 120, y: 100, w: 70, h: 50 };
      const dog = makeDog(40, 120, 10, () => 0.5);
      const env: DogEnv = { hunterPos: { x: 80, y: 120 }, patches: [patch] };
      // First ticks: outside cover → cast.
      dog.update(50, [], env);
      expect(dog.state).toBe('quartering');
      expect(dog.gait).toBe('trot');
      // Drive into the patch.
      for (let t = 0; t < 8000 && dog.gait === 'trot'; t += 16) dog.update(16, [], env);
      // Once working, gait is run (edge/comb).
      let sawRun = false;
      for (let t = 0; t < 2000; t += 16) {
        dog.update(16, [], env);
        if (dog.gait === 'run') sawRun = true;
      }
      expect(sawRun).toBe(true);
    });

    it('freezes on first scent then locates and tracks', () => {
      const dog = makeDog(100, 100, 10, () => 0.5);
      const bird = birdAt(100 + SCENT_RADIUS - 10, 100);
      dog.update(50, [bird]);
      // First contact: scent check still, no point yet.
      expect(dog.state).toBe('tracking');
      expect(dog.scentCheck).toBe(true);
      expect(dog.gait).toBe('still');
      const freezePos = { ...dog.pos };
      dog.update(50, [bird]);
      // Still frozen for ~320ms.
      expect(dist(dog.pos, freezePos)).toBeLessThan(2);
      // After the freeze, it tracks forward.
      for (let i = 0; i < 20; i++) dog.update(50, [bird]);
      expect(dog.scentCheck).toBe(false);
      expect(dog.gait === 'trot' || dog.gait === 'track' || dog.state === 'pointing').toBe(true);
    });

    it('shows every shared scent beat before declaring the point', () => {
      const dog = makeDog(100, 100, 10, () => 0.5);
      const bird = birdAt(100 + SCENT_RADIUS - 10, 100);
      const stages: string[] = [];
      for (let i = 0; i < 200 && dog.state !== 'pointing'; i++) {
        dog.update(25, [bird]);
        if (stages.at(-1) !== dog.scentStage) stages.push(dog.scentStage);
      }
      expect(stages).toEqual(['checking', 'locating', 'stalking', 'locking', 'none']);
      expect(dog.state).toBe('pointing');
    });

    it('abandons a scent sequence cleanly when the bird is truly lost', () => {
      const dog = makeDog(100, 100, 10, () => 0.5);
      const bird = birdAt(130, 100);
      dog.update(50, [bird]);
      expect(dog.scentStage).toBe('checking');
      bird.pos.x = 400;
      dog.update(50, [bird]);
      expect(dog.state).toBe('quartering');
      expect(dog.scentStage).toBe('none');
      expect(dog.scentProgress).toBe(0);
    });

    it('derives distinct approach character from existing breed profiles', () => {
      const setter = scentApproachStyle(getBreed('english-setter'), 8);
      const gsp = scentApproachStyle(getBreed('gsp'), 8);
      const pointer = scentApproachStyle(getBreed('english-pointer'), 8);
      expect(setter.checkMs).toBeGreaterThan(gsp.checkMs);
      expect(pointer.locateMs).toBeLessThan(gsp.locateMs);
      expect(pointer.locateArc).toBeGreaterThan(gsp.locateArc);
      expect(setter.lockMs).toBeGreaterThan(gsp.lockMs);
    });
  });

  describe('wind-aware cast', () => {
    const patch: Rect = { x: 200, y: 100, w: 80, h: 60 };

    it('castAimPoint is center for tier-0 or calm; downwind for craft', () => {
      const center = castAimPoint(patch, 0, 0);
      expect(center.x).toBeCloseTo(240, 5);
      expect(center.y).toBeCloseTo(130, 5);
      // Calm: still center even for a veteran.
      const calm = castAimPoint(patch, undefined, 2);
      expect(calm.x).toBeCloseTo(center.x, 5);
      // Wind blows east (+x): downwind aim is east of center.
      const east = castAimPoint(patch, 0, 1);
      expect(east.x).toBeGreaterThan(center.x + 10);
      // Wind blows south (+y on screen): downwind aim is below center.
      const south = castAimPoint(patch, Math.PI / 2, 1);
      expect(south.y).toBeGreaterThan(center.y + 8);
      // perimeter helper stays on the rect
      const pp = perimeterPoint(patch, 0.25);
      expect(pp.x).toBeGreaterThanOrEqual(patch.x);
      expect(pp.x).toBeLessThanOrEqual(patch.x + patch.w);
    });

    it('a wind-craft dog casts toward the downwind side; a pup aims the center', () => {
      // Dog starts north of the patch. Wind blows east → veteran aim is the
      // eastern (downwind) flank, so its cast path drifts east of the pup's.
      const hunter = { x: 240, y: 40 };
      const envBase = { hunterPos: hunter, patches: [patch], windAngle: 0 as number };

      const castX = (level: number): number => {
        const dog = makeDog(240, 40, level, () => 0.5);
        // Sample while still outside the patch (casting).
        const xs: number[] = [];
        for (let t = 0; t < 4000; t += 16) {
          dog.update(16, [], envBase);
          const outside = dog.pos.y < patch.y - 2;
          if (outside) xs.push(dog.pos.x);
          if (!outside && xs.length > 5) break;
        }
        expect(xs.length).toBeGreaterThan(5);
        return xs.reduce((a, b) => a + b, 0) / xs.length;
      };

      // Level 1 = tier 0 (center cast); level 5 = tier 1 (winded cast).
      expect(castX(5)).toBeGreaterThan(castX(1) + 6);
    });
  });
});
