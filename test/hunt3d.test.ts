import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { getBreed } from '../src/game/breeds';
import {
  Hunt3DSystem,
  liveDogBreedId,
  liveMovementScaleForDog,
  liveMovementScaleForGait,
} from '../src/three/subsystems/hunt3d';
import { pickBirdAlongRay } from '../src/three/subsystems/birds';

function liveCtx(x = 0, z = 40): Ctx {
  return {
    camera: { position: { x, z }, rotation: { y: Math.PI } },
  } as unknown as Ctx;
}

describe('Hunt3DSystem live start', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the dog within a visible working distance of the player on the first live tick', () => {
    vi.stubGlobal('location', { search: '' });
    const ctx = liveCtx();
    const hunt = new Hunt3DSystem();
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

    ctx.camera.position.z += 2;
    hunt.fixedUpdate(ctx, 1000 / 30);
    // The opening covey may already be on the edge of the Setter's wind-
    // stretched nose; either open search or the first scent beat is a valid
    // cast-off, but the dog must leave heel.
    expect(hunt.dog().state).not.toBe('heel');
  });

  it('keeps the dog within a readable working distance after cast-off', () => {
    vi.stubGlobal('location', { search: '' });
    const ctx = liveCtx();
    const hunt = new Hunt3DSystem();
    hunt.init(ctx);

    hunt.fixedUpdate(ctx, 1000 / 30);
    // Walk forward for five seconds. The old 2D-tuned pace carried the dog
    // out of frame almost immediately; the live 3D cast should keep working
    // the lane ahead of the moving hunter.
    for (let i = 0; i < 150; i++) {
      ctx.camera.position.z += 2.2 / 30;
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

  it('lets a walking player naturally reach a dog search-to-point sequence', () => {
    vi.stubGlobal('location', { search: '?breed=english-setter' });
    const ctx = liveCtx();
    const hunt = new Hunt3DSystem();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    // Cast off, then walk a straight, playable hunting line for 30 seconds.
    // This drives the exact live bridge: camera → hunter → work anchor →
    // shared Dog scent logic. A player should not need debug knowledge of
    // hidden bird coordinates to see the game's central sequence.
    ctx.camera.position.z += 2;
    let sawScent = false;
    let sawPoint = false;
    let maxDogHandlerM = 0;
    for (let i = 0; i < 30 * 30; i++) {
      ctx.camera.position.z += 2.2 / 30;
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
    const hunt = new Hunt3DSystem();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    ctx.camera.position.z += 2;
    for (let i = 0; i < 30 * 30 && hunt.dog().state !== 'pointing'; i++) {
      ctx.camera.position.z += 2.2 / 30;
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

  it('interpolates adjacent fixed dog snapshots for the render frame', () => {
    vi.stubGlobal('location', { search: '' });
    const ctx = liveCtx();
    const hunt = new Hunt3DSystem();
    hunt.init(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);

    ctx.camera.position.z += 2;
    hunt.fixedUpdate(ctx, 1000 / 30);
    const previous = hunt.dogRenderWorld(0, { x: 0, z: 0 });
    const current = hunt.dogRenderWorld(1, { x: 0, z: 0 });
    const middle = hunt.dogRenderWorld(0.5, { x: 0, z: 0 });

    expect(middle.x).toBeCloseTo((previous.x + current.x) / 2, 8);
    expect(middle.z).toBeCloseTo((previous.z + current.z) / 2, 8);
    expect(hunt.dogWorld({ x: 0, z: 0 })).toEqual(current);
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
});

describe('3D center-pattern shooting', () => {
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
