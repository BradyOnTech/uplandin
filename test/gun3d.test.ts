import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { GunSystem } from '../src/three/subsystems/gun';

describe('3D shotgun action', () => {
  afterEach(() => vi.unstubAllGlobals());

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
