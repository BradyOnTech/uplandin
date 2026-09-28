import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import type { Ctx } from '../src/three/engine';
import type { LocomotionPose } from '../src/three/dogs/locomotion';
import { DogSystem } from '../src/three/subsystems/dog';

afterEach(() => vi.unstubAllGlobals());

function fixture(slope: number) {
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: '' });
  const dog = new Dog({ x: 0, y: 0 }, { breed: getBreed('english-setter'), level: 8 }, () => .25);
  dog.heading = Math.PI / 2;
  dog.state = 'heel';
  dog.gait = 'still';
  const position = { x: 0, z: 0 };
  const ground = (_x: number, z: number) => slope * z;
  const hunt = {
    dog: () => dog,
    dogRenderWorld: (_alpha: number, out: typeof position) => Object.assign(out, position),
    dogRenderHeading: () => Math.PI / 2,
    huntState: () => ({ areaId: 'chukar-ridge', birds: [] }),
    coverPatches: () => [],
  };
  const ctx = {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    renderer: { domElement: { clientWidth: 1000, clientHeight: 800 } },
    quality: 'lite', timeOfDay: 'noon', time: 0, fixedAlpha: 1, events: new EventTarget(),
    get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: ground },
  } as unknown as Ctx;
  const system = new DogSystem('english-setter', 'orange-belton');
  system.init(ctx);
  const root = ctx.scene.getObjectByName('english-setter-root')!;
  const soles = ['fore-paw-l', 'fore-paw-r', 'hind-paw-l', 'hind-paw-r']
    .map(id => root.getObjectByName(`${id}__sole`)!);
  const diagnostics = system as unknown as { locomotion: LocomotionPose; ik: { clamped: boolean }[] };
  const step = (dt: number, speed: number) => {
    dog.state = speed ? 'quartering' : 'heel';
    dog.gait = speed ? 'trot' : 'still';
    position.z += speed * dt;
    ctx.time += dt;
    system.update(ctx, dt);
    return soles.map(sole => sole.getWorldPosition(new THREE.Vector3()));
  };
  return { step, diagnostics, system, ctx, ground };
}

describe('actual Setter support-to-swing handoff', () => {
  it.each([30, 60])('recovers promptly into a reachable trot swing at %i Hz without moving planted feet', hz => {
    for (const slope of [0, .15, -.15]) {
      const f = fixture(slope);
      try {
        for (let frame = 0; frame < hz; frame++) f.step(1 / hz, 0);
        let prior = f.step(1 / hz, 2);
        let priorContacts = f.diagnostics.locomotion.feet.map(foot => foot.contact);
        let maximumPawSpeed = 0;
        let maximumSupportDrift = 0;
        let swingClamps = 0;
        let swingSamples = 0;
        for (let frame = 0; frame < hz * 6; frame++) {
          const feet = f.step(1 / hz, 2);
          const contacts = f.diagnostics.locomotion.feet.map(foot => foot.contact);
          if (frame > hz * 3) feet.forEach((paw, i) => {
            const displacement = paw.distanceTo(prior[i]);
            maximumPawSpeed = Math.max(maximumPawSpeed, displacement * hz);
            if (contacts[i] === 'stance' && priorContacts[i] === 'stance') {
              maximumSupportDrift = Math.max(maximumSupportDrift, displacement);
            }
            if (contacts[i] === 'swing') {
              swingSamples++;
              if (f.diagnostics.ik[i].clamped) swingClamps++;
            }
            expect(paw.y - f.ground(paw.x, paw.z)).toBeGreaterThan(-.002);
          });
          prior = feet;
          priorContacts = contacts;
        }
        // The fixed 140 ms hold delayed recovery into mid-swing, producing
        // 7 m/s catch-up snaps and repeatedly exhausting the limb's reach.
        expect(maximumPawSpeed).toBeLessThan(6);
        expect(swingSamples).toBeGreaterThan(hz * 5);
        // The level-ground trot now stays within reach throughout. A few
        // downhill samples still reach the existing solver's limit.
        if (slope === 0) expect(swingClamps).toBe(0);
        expect(swingClamps / swingSamples).toBeLessThan(.02);
        expect(maximumSupportDrift).toBeLessThan(.002);
        for (let frame = 0; frame < hz * 3; frame++) prior = f.step(1 / hz, 0);
        prior.forEach(paw => expect(Math.abs(paw.y - f.ground(paw.x, paw.z))).toBeLessThan(.001));
      } finally { f.system.dispose(f.ctx); }
    }
  });
});
