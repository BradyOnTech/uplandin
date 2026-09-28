import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import type { Ctx } from '../src/three/engine';
import { DogSystem } from '../src/three/subsystems/dog';

afterEach(() => vi.unstubAllGlobals());

function fixture(ground: (x: number, z: number) => number, quality: 'high' | 'lite' = 'lite', capture = false) {
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: capture ? '?capture=1' : '' });
  const dog = new Dog({ x: 0, y: 0 }, { breed: getBreed('english-setter'), level: 8 }, () => .25);
  dog.heading = Math.PI / 2;
  dog.state = 'heel';
  dog.gait = 'still';
  const position = { x: 0, z: 0 };
  const hunt = {
    dog: () => dog,
    dogWorld: (out: typeof position) => Object.assign(out, position),
    dogRenderWorld: (_: number, out: typeof position) => Object.assign(out, position),
    huntState: () => ({ areaId: 'chukar-ridge', birds: [{ id: 1, pos: { x: 0, y: 3 } }] }),
    simToWorld: (x: number, z: number, out: typeof position) => Object.assign(out, { x, z }),
    coverPatches: () => [],
  };
  const ctx = {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    renderer: { domElement: { clientWidth: 1000, clientHeight: 800 } },
    quality, timeOfDay: 'noon', time: 0, fixedAlpha: 1, events: new EventTarget(),
    get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: ground },
  } as unknown as Ctx;
  const system = new DogSystem('english-setter', 'orange-belton');
  system.init(ctx);
  const root = ctx.scene.getObjectByName('english-setter-root')!;
  const paws = ['fore-paw-l', 'fore-paw-r', 'hind-paw-l', 'hind-paw-r']
    .map(id => root.getObjectByName(`${id}__sole`)!);
  const sample = () => paws.map(paw => paw.getWorldPosition(new THREE.Vector3()));
  const step = (dt: number, speed = 0) => {
    position.z += speed * dt;
    ctx.time += dt;
    system.update(ctx, dt);
  };
  const settle = (hz: number, seconds = 4) => {
    for (let frame = 0; frame < hz * seconds; frame++) step(1 / hz);
  };
  return { dog, ctx, root, paws, system, sample, step, settle, ground };
}

describe('actual Setter still-pose support', () => {
  it.each([30, 60])('plants stand, point and honor supports on level and sloping terrain at %i Hz', hz => {
    for (const quality of ['high', 'lite'] as const) {
      for (const [sx, sz] of [[0, 0], [.18, 0], [-.18, 0], [0, .2], [0, -.2]]) {
        const f = fixture((x, z) => sx * x + sz * z, quality);
        try {
          for (const state of ['heel', 'pointing', 'honoring'] as const) {
            f.dog.state = state;
            f.dog.pointedBirdId = state === 'pointing' ? 1 : null;
            f.settle(hz);
            const feet = f.sample();
            feet.forEach((p, i) => {
              const gap = p.y - f.ground(p.x, p.z);
              if (state !== 'heel' && i === 0) {
                expect(gap).toBeGreaterThan(.15);
              } else {
                // This failed by 9–10 cm on both hinds in the old renderer.
                expect(Math.abs(gap)).toBeLessThan(.001);
              }
            });
            // The correction may lower the torso by a few centimetres, but
            // must not solve the old unreachable rearward stance by a squat.
            expect(f.root.position.y).toBeGreaterThan(.065);
            expect(f.root.position.y).toBeLessThan(.12);
            if (state !== 'heel') {
              expect(f.root.getObjectByName('fore-leg-l__pivot')!.rotation.x).toBeCloseTo(-.95, 5);
            }
          }
        } finally { f.system.dispose(f.ctx); }
      }
    }
  });

  it('does not creep during a held point after a slope turn, and uses the actual ground under each paw', () => {
    const f = fixture((x, z) => .12 * x + .15 * z + .018 * Math.sin(x * 7) * Math.sin(z * 5));
    try {
      f.dog.heading = .3;
      f.settle(60);
      f.dog.state = 'honoring';
      f.settle(60, 5);
      const before = f.sample();
      f.settle(60, 12);
      f.sample().forEach((p, i) => {
        expect(p.distanceTo(before[i])).toBeLessThan(.0001);
        if (i > 0) expect(Math.abs(p.y - f.ground(p.x, p.z))).toBeLessThan(.001);
      });
    } finally { f.system.dispose(f.ctx); }
  });

  it.each([30, 60])('hands the stance to the existing trot and returns to planted support at %i Hz', hz => {
    const f = fixture((x, z) => .1 * x + .12 * z);
    try {
      f.settle(hz);
      const standing = f.sample();
      let lastY = f.root.position.y;
      let maximumVerticalStep = 0;
      const frontTravel: number[] = [];
      f.dog.state = 'quartering';
      f.dog.gait = 'trot';
      for (let frame = 0; frame < hz * 2; frame++) {
        f.step(1 / hz, 2);
        maximumVerticalStep = Math.max(maximumVerticalStep, Math.abs(f.root.position.y - lastY));
        lastY = f.root.position.y;
        frontTravel.push(f.sample()[0].z);
        f.sample().forEach(p => expect(p.toArray().every(Number.isFinite)).toBe(true));
      }
      expect(frontTravel.at(-1)! - standing[0].z).toBeGreaterThan(3.5);
      expect(maximumVerticalStep).toBeLessThan(.055);
      f.dog.state = 'heel';
      f.dog.gait = 'still';
      f.settle(hz);
      f.sample().forEach(p => expect(Math.abs(p.y - f.ground(p.x, p.z))).toBeLessThan(.001));
    } finally { f.system.dispose(f.ctx); }
  });

  it.each([30, 60])('lowers the raised point paw into heel/marking while retaining the three supports at %i Hz', hz => {
    for (const state of ['heel', 'marking'] as const) {
      for (const [sx, sz] of [[0, 0], [.18, .2], [-.18, -.2]]) {
        const f = fixture((x, z) => sx * x + sz * z);
        try {
          f.dog.state = 'pointing';
          f.dog.pointedBirdId = 1;
          f.settle(hz);
          let previous = f.sample();
          f.dog.state = state;
          f.dog.pointedBirdId = null;
          for (let frame = 0; frame < hz; frame++) {
            f.step(1 / hz);
            const next = f.sample();
            next.forEach((p, i) => {
              const gap = p.y - f.ground(p.x, p.z);
              expect(gap).toBeGreaterThan(-.001);
              if (i > 0 || frame > hz / 4) expect(gap).toBeLessThan(.001);
              expect(p.distanceTo(previous[i])).toBeLessThan(i === 0 ? 2.8 / hz : .012);
            });
            // The former instant plant erased the lifted foreleg at exit.
            if (frame === 0) expect(next[0].y - f.ground(next[0].x, next[0].z)).toBeGreaterThan(.09);
            previous = next;
          }
        } finally { f.system.dispose(f.ctx); }
      }
    }
  });

  it('does not retain a pending landing in a zero-time captured stand', () => {
    const f = fixture(() => 0, 'lite', true);
    try {
      f.dog.state = 'pointing';
      f.dog.pointedBirdId = 1;
      f.step(0);
      expect(f.sample()[0].y).toBeGreaterThan(.15);
      f.dog.state = 'heel';
      f.dog.pointedBirdId = null;
      f.step(0);
      f.sample().forEach(p => expect(Math.abs(p.y)).toBeLessThan(.001));
    } finally { f.system.dispose(f.ctx); }
  });
});
