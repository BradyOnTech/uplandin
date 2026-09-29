import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea, getDropPoint } from '../src/game/areas';
import type { Ctx } from '../src/three/engine';
import { sampleHuntArrival, type HuntArrivalSite } from '../src/three/huntArrival';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';

afterEach(() => vi.unstubAllGlobals());
const site: HuntArrivalSite = {
  crateFloor: { x: 3, y: 1.25, z: 4 }, boxThreshold: { x: 3, y: 1.25, z: 4.9 },
  tailgateEdge: { x: 3, y: 1.235, z: 5.38 }, landing: { x: 3, y: .25, z: 6.7 },
  releaseHeading: Math.PI / 2, fieldHeading: .7,
};

describe('generated GSP arrival bridge', () => {
  it.each(['high', 'lite'] as const)('holds feet on the supplied box, folds in flight, and returns to hunt authority (%s)', quality => {
    const scope: { __generatedDogAudit?: () => { speed: number; root: number[]; feet: { groundGap: number }[] } } = {};
    vi.stubGlobal('window', scope);
    const dog = Object.freeze({ state: 'heel', gait: 'still', scentStage: 'none', scentProgress: 0, carryingBirdId: null });
    const hunt = { areaConfig: () => getArea('quail-fields'), dropPoint: () => getDropPoint(getArea('quail-fields')),
      dog: vi.fn(() => dog), dogRenderWorld: vi.fn((_alpha: number, out: { x: number; z: number }) => Object.assign(out, site.landing)),
      dogRenderHeading: vi.fn(() => site.fieldHeading), dogRenderTravelHeading: vi.fn(() => site.fieldHeading) };
    const ctx = { scene: new THREE.Scene(), quality, fixedAlpha: 1,
      get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: () => .25 } } as unknown as Ctx;
    const system = new GeneratedDogSystem(); system.init(ctx);
    const root = ctx.scene.getObjectByName('generated-gsp')!, vector = new THREE.Vector3();
    const feet = ['front-left-paw', 'front-right-paw', 'hind-left-paw', 'hind-right-paw'].map(name => root.getObjectByName(name)!);
    const bones: THREE.Bone[] = []; root.traverse(object => { if (object instanceof THREE.Bone) bones.push(object); });
    try {
      for (const elapsed of [0, .2, .7, 1.2, 1.84, 2.31, 3.2]) {
        const frame = sampleHuntArrival(site, elapsed);
        system.setArrivalPose(frame.dog, elapsed, 1 / 60); system.update(ctx, 1 / 60);
        expect(root.position.toArray()).toEqual([frame.dog.x, frame.dog.y, frame.dog.z]);
        expect(root.rotation.y).toBeCloseTo(Math.PI / 2 - frame.dog.heading, 10);
        expect(root.rotation.x).toBeCloseTo(-frame.dog.pitch, 10);
        if (frame.dog.locomotion === 'stand') {
          for (const paw of feet) {
            paw.getWorldPosition(vector);
            expect(vector.y - frame.dog.y).toBeCloseTo(.023, 3);
          }
        }
        if (frame.dog.locomotion === 'hop') {
          expect(root.getObjectByName('front-left-lower')!.rotation.x).toBeLessThan(-1);
          expect(root.getObjectByName('front-right-lower')!.rotation.x).toBeLessThan(-1);
          expect(root.getObjectByName('hind-left-lower')!.rotation.x).toBeGreaterThan(.6);
        }
        const matrices = bones.map(bone => [...bone.matrixWorld.elements]);
        system.update(ctx, 0);
        expect(bones.map(bone => [...bone.matrixWorld.elements])).toEqual(matrices);
      }
      expect(hunt.dog).not.toHaveBeenCalled(); expect(hunt.dogRenderWorld).not.toHaveBeenCalled();
      expect(hunt.dogRenderHeading).not.toHaveBeenCalled(); expect(hunt.dogRenderTravelHeading).not.toHaveBeenCalled();
      system.setArrivalPose(null); system.update(ctx, 1 / 60);
      expect(hunt.dogRenderWorld).toHaveBeenCalledOnce();
      const audit = scope.__generatedDogAudit!();
      expect(audit.speed).toBe(0); expect(audit.root).toEqual([site.landing.x, .25, site.landing.z]);
      for (const foot of audit.feet) expect(Math.abs(foot.groundGap)).toBeLessThan(.012);
    } finally { system.dispose(); }
    expect(ctx.scene.children).toHaveLength(0); expect(scope.__generatedDogAudit).toBeUndefined();
  });
});
