import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import type { Ctx } from '../src/three/engine';
import type { LocomotionPose } from '../src/three/dogs/locomotion';
import { sampleHuntArrival, type HuntArrivalSite } from '../src/three/huntArrival';
import { DogSystem } from '../src/three/subsystems/dog';

afterEach(() => vi.unstubAllGlobals());
const site: HuntArrivalSite = {
  crateFloor: { x: 3, y: 1.2, z: 4 }, boxThreshold: { x: 3, y: 1.2, z: 4.9 },
  tailgateEdge: { x: 3, y: 1.185, z: 5.38 }, landing: { x: 3, y: .2, z: 6.7 },
  releaseHeading: Math.PI / 2, fieldHeading: .65,
};

function fixture(quality: 'high' | 'lite', terrainSlope: number) {
  vi.stubGlobal('window', {}); vi.stubGlobal('location', { search: '' });
  const dog = new Dog({ x: 0, y: 0 }, { breed: getBreed('english-setter'), level: 8 }, () => .25);
  dog.state = 'heel'; dog.gait = 'still'; dog.heading = site.fieldHeading;
  const position = { x: site.landing.x, z: site.landing.z };
  const ground = vi.fn((x: number, z: number) => .2 + terrainSlope * (x - 3) + terrainSlope * .7 * (z - 6.7));
  const hunt = { dog: () => dog, dogRenderWorld: vi.fn((_: number, out: typeof position) => Object.assign(out, position)),
    huntState: () => ({ areaId: 'chukar-ridge', birds: [] }), coverPatches: () => [] };
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    renderer: { domElement: { clientWidth: 1000, clientHeight: 800 } }, quality,
    timeOfDay: 'noon', time: 0, fixedAlpha: 1, events: new EventTarget(),
    get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: ground } } as unknown as Ctx;
  const system = new DogSystem('english-setter', 'orange-belton'); system.init(ctx);
  const root = ctx.scene.getObjectByName('english-setter-root')!;
  const soles = ['fore-paw-l', 'fore-paw-r', 'hind-paw-l', 'hind-paw-r'].map(id => root.getObjectByName(`${id}__sole`)!);
  const points = () => soles.map(sole => sole.getWorldPosition(new THREE.Vector3()));
  const sample = (elapsed: number) => {
    const frame = sampleHuntArrival(site, elapsed);
    system.setArrivalPose(frame.dog, elapsed, 1 / 60); system.update(ctx, 1 / 60);
    return frame;
  };
  return { system, ctx, root, soles, points, sample, dog, hunt, ground };
}

describe('Setter arrival platform contact', () => {
  it.each(['high', 'lite'] as const)('solves actual soles after pitch/compression against the supplied plane, not terrain (%s)', quality => {
    const f = fixture(quality, .35);
    const diagnostics = f.system as unknown as { locomotion: LocomotionPose };
    const unchanged = JSON.stringify(f.dog);
    try {
      f.ground.mockClear(); f.hunt.dogRenderWorld.mockClear();
      for (const elapsed of [0, .2, .75, 1.075, 1.18, 1.34, 1.46, 2.16, 2.27, 2.5, 3.2]) {
        const frame = f.sample(elapsed), points = f.points();
        let supporting = 0;
        points.forEach((point, i) => {
          const foot = diagnostics.locomotion.feet[i];
          const planted = frame.dog.locomotion === 'stand' || foot.contact !== 'swing';
          const gap = point.y - frame.dog.y;
          expect(gap, `${elapsed} / foot ${i}`).toBeGreaterThan(-.001);
          if (planted) { expect(Math.abs(gap), `${elapsed} / foot ${i}`).toBeLessThan(.001); supporting++; }
          else expect(gap).toBeGreaterThan(.001);
          const rotation = f.soles[i].parent!.getWorldQuaternion(new THREE.Quaternion());
          expect(new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-7);
        });
        if (frame.dog.locomotion === 'stand') expect(supporting).toBe(4);
        else {
          // The short eager trot can have a brief suspended pair change;
          // it must remain close to the platform rather than float away.
          expect(supporting === 0 || supporting >= 2).toBe(true);
          if (!supporting) points.forEach(point => expect(point.y - frame.dog.y).toBeLessThan(.12));
        }
        expect(f.root.rotation.x).toBeCloseTo(-frame.dog.pitch, 10);
        expect(f.root.position.x).toBe(frame.dog.x); expect(f.root.position.z).toBe(frame.dog.z);
        f.sample(elapsed);
        f.points().forEach((point, i) => expect(point.distanceTo(points[i])).toBeLessThan(1e-9));
      }
      expect(f.ground).not.toHaveBeenCalled(); expect(f.hunt.dogRenderWorld).not.toHaveBeenCalled();
      expect(JSON.stringify(f.dog)).toBe(unchanged);
    } finally { f.system.dispose(f.ctx); }
  });

  it('keeps the airborne fold independent of terrain and restores ordinary slope support on release', () => {
    const a = fixture('lite', .30), b = fixture('lite', -.25);
    try {
      a.ground.mockClear(); b.ground.mockClear();
      const frame = a.sample(1.84); b.sample(1.84);
      expect(frame.phase).toBe('airborne');
      a.points().forEach((point, i) => {
        expect(point.distanceTo(b.points()[i])).toBeLessThan(1e-10);
        expect(point.y).toBeGreaterThan(frame.dog.y + .035);
      });
      expect(a.ground).not.toHaveBeenCalled(); expect(b.ground).not.toHaveBeenCalled();
      a.sample(3.2); a.system.setArrivalPose(null);
      for (let i = 0; i < 120; i++) { a.ctx.time += 1 / 60; a.system.update(a.ctx, 1 / 60); }
      expect(a.hunt.dogRenderWorld).toHaveBeenCalled(); expect(a.ground).toHaveBeenCalled();
      a.points().forEach(point => expect(Math.abs(point.y - a.ground(point.x, point.z))).toBeLessThan(.001));
    } finally { a.system.dispose(a.ctx); b.system.dispose(b.ctx); }
  });
});
