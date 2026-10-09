import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { defaultQuickConfig, QUICK_KEY } from '../src/game/quick';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';

const DT = 1000 / 30;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/**
 * A handler doing what the Quail guidance asks: follow the dog, stopping
 * about 20 m off it to watch. The trail-walking handler of the other search
 * tests keeps moving, which hid a dog circling a beat it could never enter.
 * Birdless, so a trot while quartering is always a cast to cover.
 */
function longestCast(areaId: string, breedId: string, level: number, wind: string, seconds = 240) {
  const quick = { ...defaultQuickConfig(), areaId, breedId, level, weather: 'mild', wind };
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === QUICK_KEY ? JSON.stringify(quick) : null });
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: '?play=quick&drop=south-gate&seed=48291&range=medium' });
  const area = getArea(areaId), landscape = new LandscapeModel(area, 'south-gate');
  const hunt = new Hunt3DSystem(landscape), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.62, 40); camera.rotation.y = Math.PI;
  const player = { consumeRecall: () => false, isRunning: () => false,
    setHuntHeading: (_ctx: Ctx, heading: number) => { camera.rotation.y = -heading - Math.PI / 2; } };
  const ctx = { camera, get: (id: string) => id === 'player' ? player : { isRiseActive: () => false } } as unknown as Ctx;
  hunt.init(ctx); hunt.fixedUpdate(ctx, DT);
  hunt.huntState().birds = [];
  // Walk in off the drop until the dog is out hunting, then follow it.
  const heading = hunt.dropPoint().heading;
  let walkingIn = true, run = 0, longest = 0;
  for (let frame = 0; frame < seconds * 30; frame++) {
    const dog = hunt.dog(), p = hunt.dogWorld({ x: 0, z: 0 });
    const dx = p.x - camera.position.x, dz = p.z - camera.position.z, d = Math.hypot(dx, dz);
    walkingIn &&= frame < 20 * 30 && !(dog.state === 'quartering' && d >= 20);
    const [mx, mz] = walkingIn ? [Math.cos(heading), Math.sin(heading)] : d > 20 ? [dx / d, dz / d] : [0, 0];
    camera.position.x += mx * 1.5 / 30;
    camera.position.z += mz * 1.5 / 30;
    if (walkingIn) camera.rotation.y = Math.atan2(-mx, -mz);
    else if (d > .5) camera.rotation.y = Math.atan2(-dx, -dz);
    hunt.fixedUpdate(ctx, DT);
    run = dog.state === 'quartering' && dog.gait === 'trot' ? run + 1 : 0;
    longest = Math.max(longest, run / 30);
  }
  return longest;
}

describe('local cover beats a following handler can watch', () => {
  // Quail and Chukar dogs bend their casts toward the authored routes. The
  // bend once carried the end of a cast up to 9 yd outside a small beat,
  // where the dog circled it until the handler walked well past.
  for (const areaId of ['quail-fields', 'chukar-ridge']) {
    for (const [breedId, level] of [['irish-setter', 1], ['gsp', 8]] as const) {
      it(`a level-${level} ${breedId} on ${areaId} reaches each beat or moves on`, () => {
        for (const wind of ['calm', 'strong']) {
          expect(longestCast(areaId, breedId, level, wind)).toBeLessThan(12);
        }
      });
    }
  }
});
