import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { getBreed } from '../src/game/breeds';
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

describe('Hunt3DSystem live start', () => {
  afterEach(() => vi.unstubAllGlobals());

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
    vi.stubGlobal('location', { search: '?breed=gsp&capture=1' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.step(ctx, 1);
    walkForward(ctx, 2);
    for (let tick = 0; tick < 1800 && hunt.dog().state !== 'pointing'; tick++) {
      walkForward(ctx, 2.2 / 30);
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

  it('keeps the dog within a readable working distance after cast-off', () => {
    vi.stubGlobal('location', { search: '' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);

    hunt.fixedUpdate(ctx, 1000 / 30);
    // Walk forward for five seconds. The old 2D-tuned pace carried the dog
    // out of frame almost immediately; the live 3D cast should keep working
    // the lane ahead of the moving hunter.
    for (let i = 0; i < 150; i++) {
      walkForward(ctx, 2.2 / 30);
      hunt.fixedUpdate(ctx, 1000 / 30);
    }

    const dog = hunt.dogWorld({ x: 0, z: 0 });
    const distance = Math.hypot(dog.x - ctx.camera.position.x, dog.z - ctx.camera.position.z);
    expect(distance).toBeLessThan(12);
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

  it('lets a walking player naturally reach a dog search-to-point sequence', () => {
    vi.stubGlobal('location', { search: '?breed=english-setter' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    // Cast off, then walk a straight, playable hunting line for 30 seconds.
    // This drives the exact live bridge: camera → hunter → work anchor →
    // shared Dog scent logic. A player should not need debug knowledge of
    // hidden bird coordinates to see the game's central sequence.
    walkForward(ctx, 2);
    let sawScent = false;
    let sawPoint = false;
    let maxDogHandlerM = 0;
    for (let i = 0; i < 30 * 30; i++) {
      walkForward(ctx, 2.2 / 30);
      hunt.fixedUpdate(ctx, 1000 / 30);
      const dog = hunt.dog();
      const dogW = hunt.dogWorld({ x: 0, z: 0 });
      maxDogHandlerM = Math.max(
        maxDogHandlerM,
        Math.hypot(dogW.x - ctx.camera.position.x, dogW.z - ctx.camera.position.z),
      );
      sawScent ||= dog.scentStage !== 'none';
      sawPoint ||= dog.state === 'pointing';
      if (sawPoint) break;
    }

    expect(sawScent).toBe(true);
    expect(sawPoint).toBe(true);
    expect(maxDogHandlerM).toBeLessThan(35);
  });

  it('turns a natural walk-in on point into a visible covey flush', () => {
    vi.stubGlobal('location', { search: '?breed=english-setter' });
    const ctx = liveCtx();
    const hunt = liveHunt();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    walkForward(ctx, 2);
    for (let i = 0; i < 30 * 30 && hunt.dog().state !== 'pointing'; i++) {
      walkForward(ctx, 2.2 / 30);
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
