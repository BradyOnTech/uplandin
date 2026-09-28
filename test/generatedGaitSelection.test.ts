import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import { getArea, getDropPoint } from '../src/game/areas';
import type { Ctx } from '../src/three/engine';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';

afterEach(() => vi.unstubAllGlobals());

function fixture(hz: number) {
  const scope = {} as { __generatedDogAudit: () => { gait: string; speed: number; clamped: number } };
  vi.stubGlobal('window', scope);
  const area = getArea('chukar-ridge');
  const dog = new Dog({ x: 0, y: 0 }, { breed: getBreed('gsp'), level: 8 }, () => .25);
  dog.heading = Math.PI / 2;
  dog.state = 'heel'; dog.gait = 'still';
  let z = 0;
  const hunt = {
    areaConfig: () => area, dropPoint: () => getDropPoint(area), dog: () => dog,
    dogRenderWorld: (_: number, out: { x: number; z: number }) => Object.assign(out, { x: 0, z }),
    dogRenderHeading: () => Math.PI / 2, dogRenderTravelHeading: () => Math.PI / 2,
    huntState: () => ({ birds: [] }),
  };
  const ctx = {
    scene: new THREE.Scene(), quality: 'lite', fixedAlpha: 1,
    get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: () => 0 },
  } as unknown as Ctx;
  const renderer = new GeneratedDogSystem();
  renderer.init(ctx);
  renderer.update(ctx, 1 / hz);
  return {
    step(speed: number) {
      dog.state = speed > 0 ? 'quartering' : 'heel'; dog.gait = speed > 0 ? 'trot' : 'still';
      z += speed / hz;
      renderer.update(ctx, 1 / hz);
      return scope.__generatedDogAudit();
    },
    dispose: () => renderer.dispose(),
  };
}

it.each([30, 60])('keeps a stable generated gait through small pace variations at %i Hz', hz => {
  for (const center of [1.15, 2.5, 4.3]) {
    const f = fixture(hz);
    try {
      let previous = '', changes = 0;
      for (let frame = 0; frame < hz * 12; frame++) {
        const speed = center + .15 * Math.sin(frame / hz * Math.PI * 1.4);
        const actual = f.step(speed);
        if (frame > hz * 2 && actual.gait !== previous) {
          if (previous) changes++;
          previous = actual.gait;
        }
      }
      // The real subsystem previously restarted a 240 ms pose transition
      // twelve to fourteen times in ten seconds for these quiet surges.
      expect(changes).toBeLessThanOrEqual(1);
    } finally { f.dispose(); }
  }
});

it('still selects four distinct footfall laws from sustained physical speed despite identical sim intent', () => {
  const f = fixture(60);
  try {
    for (const [speed, gait] of [[.8, 'walk'], [2, 'trot'], [3.6, 'canter'], [5.5, 'gallop']] as const) {
      let actual = f.step(speed);
      for (let frame = 0; frame < 240; frame++) actual = f.step(speed);
      expect(actual.gait).toBe(gait);
      expect(actual.speed).toBeCloseTo(speed, 4);
      expect(actual.clamped).toBe(0);
    }
  } finally { f.dispose(); }
});
