import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { getBreed } from '../src/game/breeds';
import { Dog, type DogEnv } from '../src/game/dog';
import { LandscapeModel } from '../src/game/landscape';
import { parseDropPointId, resolveThreeHuntArea } from '../src/game/gameplayMode';
import {
  Hunt3DSystem,
  liveDogBreedId,
  liveMovementScaleForDog,
  liveMovementScaleForGait,
} from '../src/three/subsystems/hunt3d';
import { pickBirdAlongRay } from '../src/three/subsystems/birds';
import { saveQuickConfig } from '../src/game/quick';
import type { StorageLike } from '../src/game/career';
import { REVIEW_HUNT_SEED } from '../src/game/huntSeed';

function liveCtx(x = 0, z = 40): Ctx {
  const ctx = {
    camera: { position: { x, z }, rotation: { y: Math.PI } },
  } as unknown as Ctx;
  const player = {
    isRunning: () => false,
    consumeRecall: () => false,
    setHuntHeading: (_ctx: Ctx, heading: number) => { ctx.camera.rotation.y = -heading - Math.PI / 2; },
  };
  const birds = { isRiseActive: () => false };
  (ctx as unknown as { get: (id: string) => unknown }).get = (id) => id === 'player' ? player : birds;
  return ctx;
}

function liveHunt(): Hunt3DSystem {
  const search = location.search;
  return new Hunt3DSystem(
    new LandscapeModel(resolveThreeHuntArea(search), parseDropPointId(search)),
  );
}

function walkForward(ctx: Ctx, distance: number): void {
  ctx.camera.position.x += -Math.sin(ctx.camera.rotation.y) * distance;
  ctx.camera.position.z += -Math.cos(ctx.camera.rotation.y) * distance;
}

/** Follow the public entry trail until the visible dog makes scent. Never
 * route the hunter from concealed bird coordinates or the selected cover. */
function entryWalk(ctx: Ctx, hunt: Hunt3DSystem): () => void {
  const area = resolveThreeHuntArea(location.search);
  const start = hunt.worldToSim(ctx.camera.position.x, ctx.camera.position.z, { x: 0, y: 0 });
  const startDistance = (point: { x: number; y: number }) => Math.hypot(point.x - start.x, point.y - start.y);
  const trail = area.trails.reduce((best, candidate) =>
    startDistance(candidate.points[0]) < startDistance(best.points[0]) ? candidate : best).points;
  let leg = 1;
  return () => {
    const target = hunt.dog().scentStage !== 'none'
      ? hunt.dogWorld({ x: 0, z: 0 })
      : hunt.simToWorld(trail[leg].x, trail[leg].y, { x: 0, z: 0 });
    if (hunt.dog().scentStage === 'none'
      && Math.hypot(target.x - ctx.camera.position.x, target.z - ctx.camera.position.z) < 1
      && leg < trail.length - 1) leg++;
    ctx.camera.rotation.y = Math.atan2(-(target.x - ctx.camera.position.x), -(target.z - ctx.camera.position.z));
    walkForward(ctx, 2.2 / 30);
  };
}

describe('Hunt3DSystem live start', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the active challenge when the next-hunt URL changes', () => {
    vi.stubGlobal('location', { search: '?area=pheasant-coverts&challenge=relaxed&seed=1' });
    const hunt = liveHunt();
    hunt.init(liveCtx());
    expect(hunt.getActiveChallenge()).toBe('relaxed');
    location.search = '?area=pheasant-coverts&challenge=wild&seed=1';
    expect(hunt.getActiveChallenge()).toBe('relaxed');
  });

  it('flushes a resting unpointed pheasant when the live camera walks over it', () => {
    vi.stubGlobal('location', { search: '?breed=gsp&area=pheasant-coverts&seed=1' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);
    const state = hunt.huntState();
    const position = hunt.worldToSim(ctx.camera.position.x + 7, ctx.camera.position.z, { x: 0, y: 0 });
    const bird = { ...state.birds[0], speciesId: 'ringneck', pos: position,
      state: 'hidden' as const, runs: true, restingMs: 2000, approachRoll: .2 };
    state.birds = [bird];
    hunt.dog().pos = { x: position.x + 300, y: position.y + 300 };
    ctx.camera.position.x += 6;
    hunt.fixedUpdate(ctx, 1000 / 30);
    expect(bird.state).toBe('flushed');
    expect(hunt.lastFlushInfo()?.ids).toEqual([bird.id]);
    expect(state.dogWork[0].pointFlushes).toBe(0);
  });

  it('ends a quiet Quail session without releasing hidden birds or advancing the dog afterward', () => {
    vi.stubGlobal('location', { search: '?breed=gsp&area=quail-fields' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);
    const before = structuredClone(hunt.huntState());
    const dogPosition = { ...hunt.dog().pos };
    hunt.endHunt();
    walkForward(ctx, 100);
    for (let tick = 0; tick < 120; tick++) hunt.fixedUpdate(ctx, 1000 / 30);
    expect(hunt.huntState().fieldSessionEnded).toBe(true);
    expect(hunt.huntState().birds).toEqual(before.birds);
    expect(hunt.huntState().escaped).toBe(0);
    expect(hunt.dog().pos).toEqual(dogPosition);
  });

  it.each(['south-gate', 'west-track'])(
    'replays the same GSP hunt in capture and ordinary play from %s',
    (drop) => {
      const query = `?breed=gsp&area=quail-fields&drop=${drop}`;
      vi.stubGlobal('location', { search: query });
      const normalCtx = liveCtx();
      const normal = liveHunt();
      normal.init(normalCtx);
      vi.stubGlobal('location', { search: `${query}&capture=1` });
      const captureCtx = liveCtx();
      const capture = liveHunt();
      capture.init(captureCtx);

      // Recording freezes the clock, not spawn, working radius, pace or
      // scent decisions. Replay the same camera input at the real adapter
      // seam, including the initial heel and the first walking cast.
      for (let tick = 0; tick < 900; tick++) {
        if (tick > 30) {
          walkForward(normalCtx, 2.2 / 30);
          walkForward(captureCtx, 2.2 / 30);
        }
        normal.fixedUpdate(normalCtx, 1000 / 30);
        capture.step(captureCtx, 1);
        expect(capture.dog().pos).toEqual(normal.dog().pos);
        expect(capture.dog().state).toBe(normal.dog().state);
        expect(capture.dog().scentStage).toBe(normal.dog().scentStage);
        // Bird ids are process-global; compare each hunt's corresponding
        // birds/outcome rather than the allocation sequence of two hunts.
        expect(capture.lastFlushInfo()?.distPx).toEqual(normal.lastFlushInfo()?.distPx);
        expect(capture.lastFlushInfo()?.ids.length).toEqual(normal.lastFlushInfo()?.ids.length);
        expect(capture.huntState().birds.map((bird) => bird.state)).toEqual(
          normal.huntState().birds.map((bird) => bird.state),
        );
      }
    },
  );

  it('continues handling the dog during an airborne Quail rise when a capture clock advances', () => {
    vi.stubGlobal('location', { search: `?breed=gsp&capture=1&seed=${REVIEW_HUNT_SEED}` });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.step(ctx, 1);
    const walk = entryWalk(ctx, hunt);
    for (let tick = 0; tick < 1800 && hunt.dog().state !== 'pointing'; tick++) {
      walk();
      hunt.step(ctx, 1);
    }
    expect(hunt.dog().state).toBe('pointing');
    expect(hunt.triggerFlush(ctx)).not.toBeNull();
    const get = ctx.get.bind(ctx);
    ctx.get = ((id: string) => id === 'birds' ? { isRiseActive: () => true } : get(id)) as Ctx['get'];
    const position = { ...hunt.dog().pos };
    walkForward(ctx, -10); // Give the recalled dog a meaningful return distance.
    const recall = vi.fn().mockReturnValue(false).mockReturnValueOnce(true);
    const player = ctx.get('player') as unknown as { consumeRecall: () => boolean };
    player.consumeRecall = recall;
    hunt.step(ctx, 90);
    expect(recall).toHaveBeenCalledTimes(90);
    expect(Math.hypot(hunt.dog().pos.x-position.x,hunt.dog().pos.y-position.y)).toBeGreaterThan(.1);
  });

  it('puts the dog within a visible working distance of the player on the first live tick', () => {
    vi.stubGlobal('location', { search: '' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);

    hunt.fixedUpdate(ctx, 1000 / 30);

    const dog = hunt.dogWorld({ x: 0, z: 0 });
    const distance = Math.hypot(dog.x - ctx.camera.position.x, dog.z - ctx.camera.position.z);
    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(8);
    expect(hunt.dog().state).toBe('heel');

    // It stays at heel while the player looks around; time alone must not
    // release it and recreate the off-screen sprint.
    for (let i = 0; i < 300; i++) hunt.fixedUpdate(ctx, 1000 / 30);
    expect(hunt.dog().state).toBe('heel');

    walkForward(ctx, 2);
    hunt.fixedUpdate(ctx, 1000 / 30);
    // The opening covey may already be on the edge of the Setter's wind-
    // stretched nose; either open search or the first scent beat is a valid
    // cast-off, but the dog must leave heel.
    expect(hunt.dog().state).not.toBe('heel');
  });

  it.each(['gsp', 'english-setter'])('keeps the %s within a readable working distance while casting into entry cover', breed => {
    vi.stubGlobal('location', { search: `?area=quail-fields&breed=${breed}&seed=${REVIEW_HUNT_SEED}` });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);

    hunt.fixedUpdate(ctx, 1000 / 30);
    const dog = hunt.dogWorld({ x: 0, z: 0 });
    let workedCover = false;
    const patches = resolveThreeHuntArea(location.search).patches;
    // The reachable plum edge is around twenty metres ahead. A twelve-metre
    // snapshot at five seconds accidentally required the old empty-ground
    // sweep. Keep the established 35m readable envelope on EVERY first-cast
    // tick, and require useful cover work rather than proximity alone.
    for (let i = 0; i < 300; i++) {
      walkForward(ctx, 2.2 / 30);
      hunt.fixedUpdate(ctx, 1000 / 30);
      hunt.dogWorld(dog);
      expect(Math.hypot(dog.x - ctx.camera.position.x, dog.z - ctx.camera.position.z)).toBeLessThan(35);
      const pos = hunt.dog().pos;
      workedCover ||= patches.some(p => pos.x >= p.x && pos.x <= p.x + p.w && pos.y >= p.y && pos.y <= p.y + p.h);
    }
    expect(workedCover).toBe(true);
    const forwardX = -Math.sin(ctx.camera.rotation.y);
    const forwardZ = -Math.cos(ctx.camera.rotation.y);
    const forwardDistance =
      (dog.x - ctx.camera.position.x) * forwardX + (dog.z - ctx.camera.position.z) * forwardZ;
    expect(forwardDistance).toBeGreaterThan(0);
  });

  it.each(['south-gate', 'west-track'])('keeps a searching GSP with the handler through broad cover at %s', drop => {
    vi.stubGlobal('location', { search: `?area=quail-fields&breed=gsp&seed=41&drop=${drop}` });
    const ctx = liveCtx(), hunt = liveHunt(); hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);
    let searchingSamples = 0;
    for (let i = 0; i < 1800; i++) {
      walkForward(ctx, 2.2 / 30); hunt.fixedUpdate(ctx, 1000 / 30);
      if (hunt.dog().state === 'tracking' || hunt.dog().state === 'pointing') break;
      if (hunt.dog().state !== 'quartering') continue;
      searchingSamples++;
      const dog = hunt.dogWorld({ x: 0, z: 0 });
      // Working radius plus its forward anchor and a turning allowance.
      // Scent tracking/pointing may legitimately hold behind a moving hunter.
      expect(Math.hypot(dog.x - ctx.camera.position.x, dog.z - ctx.camera.position.z), JSON.stringify({ tick: i, dog, gait: hunt.dog().gait, heading: hunt.dog().heading, hunter: ctx.camera.position })).toBeLessThan(42);
    }
    expect(searchingSamples).toBeGreaterThan(60);
  });

  it.each([undefined, REVIEW_HUNT_SEED, 1184004868, 41])('lets a walking player naturally reach a complete scent-to-point sequence on seed %s', seed => {
    vi.stubGlobal('location', { search: `?breed=english-setter${seed === undefined ? '' : `&seed=${seed}`}` });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    // The public entry trail bends through the plum edges. An unvarying
    // straight line skips that habitat once the dog works reachable pockets.
    // Walk the actual route, then follow the scenting dog, with one bounded
    // minute for the whole sequence across three encounter seeds, retaining
    // the original seedless fallback as well as its explicit equivalent.
    const walk = entryWalk(ctx, hunt);
    let sawScent = false;
    let sawPoint = false;
    const scentStages = new Set<string>();
    let maxDogHandlerM = 0;
    for (let i = 0; i < 60 * 30; i++) {
      walk();
      hunt.fixedUpdate(ctx, 1000 / 30);
      const dog = hunt.dog();
      const dogW = hunt.dogWorld({ x: 0, z: 0 });
      maxDogHandlerM = Math.max(
        maxDogHandlerM,
        Math.hypot(dogW.x - ctx.camera.position.x, dogW.z - ctx.camera.position.z),
      );
      sawScent ||= dog.scentStage !== 'none';
      if (dog.scentStage !== 'none') scentStages.add(dog.scentStage);
      sawPoint ||= dog.state === 'pointing';
      if (sawPoint) break;
    }

    expect(sawScent).toBe(true);
    expect(sawPoint).toBe(true);
    expect([...scentStages]).toEqual(['checking', 'locating', 'stalking', 'locking']);
    expect(maxDogHandlerM).toBeLessThan(35);
  });

  it('turns a natural walk-in on point into a visible covey flush', () => {
    vi.stubGlobal('location', { search: `?breed=english-setter&seed=${REVIEW_HUNT_SEED}` });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    const walk = entryWalk(ctx, hunt);
    for (let i = 0; i < 60 * 30 && hunt.dog().state !== 'pointing'; i++) {
      walk();
      hunt.fixedUpdate(ctx, 1000 / 30);
    }
    expect(hunt.dog().state).toBe('pointing');

    const pointed = hunt.huntState().birds.find((bird) => bird.id === hunt.dog().pointedBirdId);
    expect(pointed).toBeDefined();
    const target = hunt.simToWorld(pointed!.pos.x, pointed!.pos.y, { x: 0, z: 0 });
    for (let i = 0; i < 30 * 30 && !hunt.lastFlushInfo(); i++) {
      const dx = target.x - ctx.camera.position.x;
      const dz = target.z - ctx.camera.position.z;
      const distance = Math.hypot(dx, dz) || 1;
      const step = Math.min(2.2 / 30, distance);
      ctx.camera.position.x += (dx / distance) * step;
      ctx.camera.position.z += (dz / distance) * step;
      hunt.fixedUpdate(ctx, 1000 / 30);
    }

    const flush = hunt.lastFlushInfo();
    expect(flush).not.toBeNull();
    expect(flush!.ids.length).toBeGreaterThan(0);
    expect(
      hunt.huntState().birds.filter((bird) => flush!.ids.includes(bird.id)).every((bird) => bird.state === 'flushed'),
    ).toBe(true);

    expect(hunt.resolveBird(flush!.ids[0], 'downed')).toBe(true);
    expect(hunt.huntState().birds.find((bird) => bird.id === flush!.ids[0])?.state).toBe('downed');
    expect(hunt.huntState().downed).toBe(1);
  });

  it.each(['hen', 'rooster'] as const)('identifies the %s decision during a pheasant flush', sex => {
    vi.stubGlobal('location', { search: '?breed=gsp&area=pheasant-coverts' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    const dog = hunt.dog();
    const bird = hunt.huntState().birds[0];
    hunt.huntState().birds.splice(1);
    bird.sex = sex;
    bird.state = 'hidden';
    bird.pos = { ...dog.pos, x: dog.pos.x + 10 };
    dog.state = 'pointing';
    dog.pointedBirdId = bird.id;
    expect(hunt.triggerFlush(ctx)?.ids).toContain(bird.id);
    expect(hunt.riseLabel()).toBe(sex === 'hen' ? 'HEN FLUSH · HOLD FIRE' : 'ROOSTER FLUSH');
  });

  it('retrieves from the rendered landing point and credits the dog', () => {
    vi.stubGlobal('location', { search: '?breed=english-setter&area=pheasant-coverts' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    const dog = hunt.dog();
    const bird = hunt.huntState().birds[0];
    hunt.huntState().birds.splice(1);
    bird.state = 'hidden';
    bird.pos = { ...dog.pos, x: dog.pos.x + 10 };
    dog.state = 'pointing';
    dog.pointedBirdId = bird.id;
    const flush = hunt.triggerFlush(ctx);
    expect(flush?.ids).toContain(bird.id);
    expect(hunt.resolveBird(bird.id, 'downed')).toBe(true);

    const landing = { x: ctx.camera.position.x + 18, z: ctx.camera.position.z + 4 };
    expect(hunt.recordFallWorld(bird.id, landing.x, landing.z)).toBe(true);
    const landedSim = hunt.worldToSim(landing.x, landing.z, { x: 0, y: 0 });
    expect(bird.pos.x).toBeCloseTo(landedSim.x, 8);
    expect(bird.pos.y).toBeCloseTo(landedSim.y, 8);
    hunt.finishRise();

    let sawRetrieving = false;
    let sawCarrying = false;
    let pickupGapM = Infinity;
    let deliveryGapM = Infinity;
    const birdState = () => hunt.huntState().birds[0].state;
    const dogState = () => hunt.dog().state;
    for (let i = 0; i < 1200 && birdState() !== 'retrieved'; i++) {
      const prior = birdState();
      hunt.step(ctx, 1);
      if (prior === 'downed' && birdState() === 'carried') {
        pickupGapM = Math.hypot(dog.pos.x - landedSim.x, dog.pos.y - landedSim.y) * .9144;
        expect(hunt.huntState().dogWork[0].retrieves).toBe(0);
      }
      if (prior === 'carried' && birdState() === 'retrieved') {
        deliveryGapM = Math.hypot(dog.pos.x - hunt.huntState().hunterPos.x,
          dog.pos.y - hunt.huntState().hunterPos.y) * .9144;
      }
      sawRetrieving ||= dogState() === 'retrieving';
      sawCarrying ||= birdState() === 'carried' && hunt.dog().carryingBirdId === bird.id;
    }
    expect(sawRetrieving).toBe(true);
    expect(sawCarrying).toBe(true);
    expect(pickupGapM).toBeLessThanOrEqual(.65);
    expect(deliveryGapM).toBeLessThanOrEqual(1);
    expect(birdState()).toBe('retrieved');
    expect(Math.hypot(
      hunt.dog().pos.x - hunt.huntState().hunterPos.x,
      hunt.dog().pos.y - hunt.huntState().hunterPos.y,
    )).toBeLessThanOrEqual(6);
    expect(hunt.huntState().dogWork[0].retrieves).toBe(1);
  });

  it('interpolates adjacent fixed dog snapshots for the render frame', () => {
    vi.stubGlobal('location', { search: '' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    const previousHeading = hunt.dog().heading;
    walkForward(ctx, 2);
    hunt.fixedUpdate(ctx, 1000 / 30);
    const previous = hunt.dogRenderWorld(0, { x: 0, z: 0 });
    const current = hunt.dogRenderWorld(1, { x: 0, z: 0 });
    const middle = hunt.dogRenderWorld(0.5, { x: 0, z: 0 });

    expect(middle.x).toBeCloseTo((previous.x + current.x) / 2, 8);
    expect(middle.z).toBeCloseTo((previous.z + current.z) / 2, 8);
    expect(hunt.dogWorld({ x: 0, z: 0 })).toEqual(current);
    const headingDelta = Math.atan2(Math.sin(hunt.dog().heading - previousHeading), Math.cos(hunt.dog().heading - previousHeading));
    expect(hunt.dogRenderHeading(0)).toBe(previousHeading);
    expect(hunt.dogRenderHeading(0.5)).toBeCloseTo(previousHeading + headingDelta / 2, 8);
    expect(Math.sin(hunt.dogRenderHeading(1))).toBeCloseTo(Math.sin(hunt.dog().heading), 8);
  });

  it('derives travelling orientation from the authoritative displacement snapshots', () => {
    vi.stubGlobal('location', { search: '?breed=gsp&area=quail-fields' });
    const ctx = liveCtx(); const hunt = liveHunt(); hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30); walkForward(ctx, 2);
    let movingSamples = 0;
    for (let n = 0; n < 120; n++) {
      const before = { ...hunt.dog().pos };
      hunt.fixedUpdate(ctx, 1000 / 30);
      const dx = hunt.dog().pos.x - before.x, dy = hunt.dog().pos.y - before.y;
      if (dx * dx + dy * dy <= 0.000001) continue;
      movingSamples++;
      const travel = Math.atan2(dy, dx);
      expect(Math.sin(hunt.dogRenderTravelHeading(1))).toBeCloseTo(Math.sin(travel), 8);
      expect(Math.cos(hunt.dogRenderTravelHeading(1))).toBeCloseTo(Math.cos(travel), 8);
    }
    expect(movingSamples).toBeGreaterThan(20);
  });

  it('keeps physical presentation pace ordered track < trot < run', () => {
    expect(liveMovementScaleForGait('track')).toBeLessThan(liveMovementScaleForGait('trot'));
    expect(liveMovementScaleForGait('trot')).toBeLessThan(liveMovementScaleForGait('run'));
  });

  it.each(['english-setter', 'gsp'])('lets a %s close on a sprinting handler during an open cast', breedId => {
    const breed = getBreed(breedId);
    const dog = new Dog({ x: 1000, y: 1000 }, { breed, level: 8 }, () => .5,
      { x: 0, y: 0, w: 5000, h: 5000 });
    // Isolate forward cast pace; turning from an opposite initial heading
    // now consumes real time instead of snapping at objective selection.
    dog.heading = 0;
    // One valid cover destination isolates real cast movement from scent,
    // collisions and search selection. The handler advances at the actual
    // PlayerSystem dry-ground sprint while the dog is initially10m behind.
    const scale = .9144, hunter = { x: 1000 + 10 / scale, y: 1000 };
    const env: DogEnv = {
      patches: [{ x: 1075, y: 990, w: 20, h: 20 }],
      hunterPos: hunter, workAnchor: { x: hunter.x + 14 / scale, y: 1000 },
      rangeRadius: 500, huntAreaId: 'pheasant-coverts', windAngle: 0,
    };
    let phase = 0, previous = { ...dog.pos }, travel = 0;
    for (let tick = 0; tick < 150; tick++) {
      hunter.x += 4.18 / scale / 30;
      env.workAnchor!.x = hunter.x + 14 / scale;
      phase += Math.PI * 2 * breed.motion.surgeHz / 30;
      env.movementScale = liveMovementScaleForDog(dog.gait, dog.state, breed.motion, phase);
      dog.update(1000 / 30, [], env);
      expect(dog.state).toBe('quartering'); expect(dog.gait).toBe('trot');
      travel += Math.hypot(dog.pos.x - previous.x, dog.pos.y - previous.y) * scale;
      previous = { ...dog.pos };
    }
    expect(travel / 5).toBeGreaterThan(5.4);
    expect((hunter.x - dog.pos.x) * scale).toBeLessThan(2);
  });

  it('compensates the shared stalk factor so a scenting dog can lead a walking hunter', () => {
    const motion = getBreed('english-setter').motion;
    expect(liveMovementScaleForDog('track', 'tracking', motion, 0)).toBeGreaterThan(
      liveMovementScaleForGait('track'),
    );
  });

  it('selects a requested breed without changing the Setter default', () => {
    expect(liveDogBreedId('')).toBe('english-setter');
    expect(liveDogBreedId('?breed=english-pointer')).toBe('english-pointer');
    expect(liveDogBreedId('?breed=unknown')).toBe('english-setter');
  });

  it('surges only during an active quartering run', () => {
    const motion = getBreed('english-pointer').motion;
    const base = liveMovementScaleForGait('run');
    expect(liveMovementScaleForDog('run', 'quartering', motion, Math.PI / 2)).not.toBe(base);
    expect(liveMovementScaleForDog('trot', 'quartering', motion, Math.PI / 2)).not.toBe(
      liveMovementScaleForGait('trot'),
    );
    expect(liveMovementScaleForDog('run', 'recalled', motion, Math.PI / 2)).toBe(base);
  });

  it('boots both dogs from a Quick Hunt brace', () => {
    const data: Record<string, string> = {};
    const storage: StorageLike = {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => { data[key] = value; },
    };
    saveQuickConfig({
      breedId: 'gsp', level: 5, areaId: 'quail-fields', wind: 'calm',
      gunId: 'remington-870', gearTier: 2, breed2Id: 'english-setter', weather: 'mild',
    }, storage);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('location', { search: '?play=quick' });
    const hunt = liveHunt();
    hunt.init(liveCtx());
    expect(hunt.dogCount()).toBe(2);
    expect(hunt.dog(0).profile.breed.id).toBe('gsp');
    expect(hunt.dog(1).profile.breed.id).toBe('english-setter');
  });
});

describe('3D center-pattern shooting', () => {
  it('rejects an obscured bird but can select another bird in an open part of the pattern', () => {
    const targets = [
      { simId: 1, x: 0, y: 1.5, z: -12, status: 'flying' },
      { simId: 2, x: .6, y: 1.5, z: -20, status: 'flying' },
    ];
    const origin = { x: 0, y: 1.5, z: 0 }, direction = { x: 0, y: 0, z: -1 };
    expect(pickBirdAlongRay(targets, origin, direction, .04, target => target.simId !== 1)).toBe(2);
    expect(pickBirdAlongRay(targets, origin, direction, .04, () => false)).toBeNull();
  });

  it('selects the nearest flying bird inside the camera ray pattern', () => {
    const targets = [
      { simId: 1, x: 0.1, y: 1.5, z: -12, status: 'flying' },
      { simId: 2, x: 0.1, y: 1.5, z: -7, status: 'flying' },
      { simId: 3, x: 4, y: 1.5, z: -6, status: 'flying' },
      { simId: 4, x: 0, y: 1.5, z: -4, status: 'falling' },
    ];
    expect(
      pickBirdAlongRay(targets, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }),
    ).toBe(2);
  });

  it('does not hit birds outside the pattern or behind the gun', () => {
    const targets = [
      { simId: 1, x: 3, y: 1.5, z: -5, status: 'flying' },
      { simId: 2, x: 0, y: 1.5, z: 4, status: 'flying' },
    ];
    expect(
      pickBirdAlongRay(targets, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }),
    ).toBeNull();
  });
});
