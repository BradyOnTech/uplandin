import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { GunSystem } from '../src/three/subsystems/gun';
import { pickBirdAlongRay } from '../src/three/subsystems/birds';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn() }));

describe('3D shotgun action', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['tree', 'terrain', 'open'])('consumes a shell and resolves only a clear shot (%s)', obstruction => {
    const blocked = obstruction !== 'open';
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null });
    const target = { simId: 5, x: 0, y: 0, z: -12, status: 'flying' };
    const hunt = { dog: () => ({ state: 'quartering', pointedBirdId: null }), dogCount: () => 1, huntState: () => ({ gunId: 'over-under', birds: [] }), resolveBird: vi.fn(() => true) };
    const habitat = { blocksShot: vi.fn(() => obstruction === 'tree') };
    const birds = { riseSequence: () => 1, isRiseActive: () => true, downBird: vi.fn(), shootRay: (origin: THREE.Vector3, direction: THREE.Vector3, spread: number, visible: (candidate: typeof target) => boolean) =>
      pickBirdAlongRay([target], origin, direction, spread, visible) };
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
      events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 10, paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds, 'property-habitat': habitat,
        terrain: { heightAt: (_x: number, z: number) => obstruction === 'terrain' ? Math.max(0, 2 - Math.abs(z + 6)) : 0 } }[id]),
    } as unknown as Ctx;
    vi.stubGlobal('document', { getElementById: () => null, pointerLockElement: ctx.renderer.domElement });
    const gun = new GunSystem(); gun.init(ctx);
    (gun as unknown as { mountT: number }).mountT = 1;
    const click = Object.assign(new Event('mousedown'), { button: 0 });
    window.dispatchEvent(click);
    expect(gun.shellsRemaining()).toBe(1);
    expect(habitat.blocksShot).toHaveBeenCalledTimes(obstruction === 'terrain' ? 0 : 1);
    expect(hunt.resolveBird).toHaveBeenCalledTimes(blocked ? 0 : 1);
    expect(birds.downBird).toHaveBeenCalledTimes(blocked ? 0 : 1);
    gun.dispose(ctx);
  });

  it('reloads an empty gun when the player presses R', () => {
    const browserWindow = new EventTarget();
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null });

    const hunt = {
      huntState: () => ({ gunId: 'over-under', birds: [] }),
      dog: () => ({ state: 'quartering', pointedBirdId: null }),
      dogCount: () => 1,
      simToWorld: (_x: number, _y: number, out: { x: number; z: number }) => out,
    };
    const birds = {
      isRiseActive: () => true,
      riseSequence: () => 1,
    };
    const terrain = { heightAt: () => 0 };
    const camera = new THREE.PerspectiveCamera();
    const ctx = {
      scene: new THREE.Scene(),
      camera,
      renderer: { domElement: new EventTarget() },
      rng: () => 0.5,
      events: new EventTarget(),
      quality: 'high',
      timeOfDay: 'dawn',
      time: 0,
      fixedAlpha: 1,
      paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds, terrain }[id]),
    } as unknown as Ctx;
    const gun = new GunSystem();
    gun.init(ctx);

    // Reproduce a spent gun without coupling this regression to hit testing.
    (gun as unknown as { shells: number }).shells = 0;
    const reload = new Event('keydown');
    Object.defineProperty(reload, 'key', { value: 'r' });
    browserWindow.dispatchEvent(reload);
    expect(gun.isReloading()).toBe(true);
    expect(gun.shellsRemaining()).toBe(0);
    for (let i = 0; i < 120; i++) {
      ctx.time += 1 / 60;
      gun.update(ctx, 1 / 60);
    }

    expect(gun.isReloading()).toBe(false);
    expect(gun.shellsRemaining()).toBe(2);
  });
});
