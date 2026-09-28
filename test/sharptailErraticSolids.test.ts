import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { SHARPTAIL_ERRATICS } from '../src/game/sharptailFeatures';
import type { Ctx } from '../src/three/engine';
import { GunSystem } from '../src/three/subsystems/gun';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';
import { LandmarksSystem } from '../src/three/subsystems/landmarks';
import { PlayerSystem } from '../src/three/subsystems/player';

vi.mock('../src/audio', () => ({
  unlockAudio: vi.fn(), playFootstep: vi.fn(), playCoverBrush: vi.fn(), playWhistle: vi.fn(),
  playShot: vi.fn(), playActionClick: vi.fn(),
}));
const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { getElementById: () => null, querySelector: () => null }));
  vi.stubGlobal('HTMLElement', class {});
});
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function fixture(dropId: string, quality: 'high' | 'lite') {
  vi.stubGlobal('location', { search: `?area=sharptail-prairie&drop=${dropId}&breed=gsp&gun=over-under&seed=1184004868` });
  const landscape = new LandscapeModel(getArea('sharptail-prairie'), dropId);
  const hunt = new Hunt3DSystem(landscape), landmarks = new LandmarksSystem(), player = new PlayerSystem(landscape);
  const systems = new Map<string, unknown>([
    ['hunt3d', hunt], ['landmarks', landmarks], ['player', player],
    ['terrain', { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) }],
  ]);
  const ctx = {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 1,
    timeOfDay: 'morning', paused: false, fixedAlpha: 1, events: new EventTarget(),
    renderer: { domElement: new EventTarget() }, get: (id: string) => systems.get(id),
  } as unknown as Ctx;
  player.init(ctx); hunt.init(ctx); landmarks.init(ctx); ctx.scene.updateMatrixWorld(true);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; player.dispose(); landmarks.dispose(ctx);
  };
  cleanup.push(dispose);
  const key = (code: string, type = 'keydown') => window.dispatchEvent(Object.assign(new Event(type), { code, key: code === 'KeyF' ? 'f' : ' ' }));
  const rocks = SHARPTAIL_ERRATICS.map(stone => {
    const root = ctx.scene.getObjectByName(`Sharptail ${stone.id}`)!;
    const mesh = root.children[0] as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(root);
    return { stone, root, mesh, bounds };
  });
  return { landscape, hunt, landmarks, player, ctx, systems, key, rocks, dispose };
}

const entries = getArea('sharptail-prairie').dropPoints;
const cases = entries.flatMap(drop => (['high', 'lite'] as const).map(quality => ({ dropId: drop.id, quality })));

describe('live Sharptail erratic solids', () => {
  it.each(cases)('grounds physical rocks and blocks their visible bodies at $dropId / $quality', ({ dropId, quality }) => {
    const f = fixture(dropId, quality);
    expect(f.rocks).toHaveLength(11);
    const rays: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    for (const { stone, root, mesh, bounds } of f.rocks) {
      const property = f.landscape.worldToProperty(root.position.x, root.position.z, { x: 0, y: 0 });
      expect(property.x).toBeCloseTo(stone.x, 8); expect(property.y).toBeCloseTo(stone.y, 8);
      expect(root.position.y).toBeCloseTo(f.landscape.heightAtWorld(root.position.x, root.position.z), 8);
      const circle = f.landmarks.collisionCircles().find(c => c.x === root.position.x && c.z === root.position.z)!;
      expect(circle).toBeDefined();
      const vertices = mesh.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld);
        expect(Math.hypot(point.x - circle.x, point.z - circle.z)).toBeLessThanOrEqual(circle.radius + 1e-6);
      }
      for (const contact of root.userData.contactFootprint as { x: number; z: number; bottomY: number }[]) {
        const point = new THREE.Vector3(contact.x, contact.bottomY, contact.z).applyMatrix4(root.matrixWorld);
        expect(point.y).toBeLessThan(f.landscape.heightAtWorld(point.x, point.z) - .09);
      }
      const start = new THREE.Vector3(root.position.x, root.position.y + stone.height * .5, bounds.max.z + 1);
      const end = new THREE.Vector3(root.position.x, start.y, bounds.min.z - 1);
      rays.push({ start, end });
      expect(f.landmarks.blocksShot(start, end), `${stone.id} solid body`).toBe(true);
      expect(f.landmarks.blocksShot(start, new THREE.Vector3(start.x, start.y, bounds.max.z + .2)), `${stone.id} nearer target`).toBe(false);
      expect(f.landmarks.blocksShot(start.clone().setY(bounds.max.y + .2), end.clone().setY(bounds.max.y + .2)), `${stone.id} clear sky`).toBe(false);
      root.visible = mesh.visible = false;
      expect(f.landmarks.blocksShot(start, end), `${stone.id} hidden render object`).toBe(true);
    }
    const disposals = f.rocks.map(({ mesh }) => vi.spyOn(mesh.geometry, 'dispose'));
    f.dispose();
    expect(f.ctx.scene.children).toHaveLength(0);
    expect(f.landmarks.collisionCircles()).toHaveLength(0);
    for (const { start, end } of rays) expect(f.landmarks.blocksShot(start, end)).toBe(false);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });

  it('keeps the same geometry and property collision footprints in High and Lite from both entries', () => {
    const snapshots = cases.map(({ dropId, quality }) => {
      const f = fixture(dropId, quality);
      const snapshot = f.rocks.map(({ root, mesh }) => {
        const circle = f.landmarks.collisionCircles().find(c => c.x === root.position.x && c.z === root.position.z)!;
        const property = f.landscape.worldToProperty(circle.x, circle.z, { x: 0, y: 0 });
        return {
          id: root.name, x: property.x, y: property.y, elevation: root.position.y,
          radius: circle.radius, vertices: Array.from(mesh.geometry.attributes.position.array),
        };
      });
      f.dispose(); return snapshot;
    });
    for (const snapshot of snapshots.slice(1)) for (const [i, stone] of snapshot.entries()) {
      const reference = snapshots[0][i];
      expect(stone.id).toBe(reference.id);
      for (const field of ['x', 'y', 'elevation', 'radius'] as const) expect(stone[field]).toBeCloseTo(reference[field], 8);
      expect(stone.vertices).toEqual(reference.vertices);
    }
  });

  it.each(cases)('stops the real player at a boulder while leaving the space between stones traversable at $dropId / $quality', ({ dropId, quality }) => {
    const f = fixture(dropId, quality), first = f.rocks[0], second = f.rocks[1];
    const circle = f.landmarks.collisionCircles().find(c => c.x === first.root.position.x && c.z === first.root.position.z)!;
    f.player.setPose(f.ctx, circle.x, circle.z + circle.radius + 4, 0);
    f.key('KeyW');
    for (let i = 0; i < 65; i++) f.player.update(f.ctx, .1);
    expect(f.ctx.camera.position.z).toBeGreaterThan(circle.z + circle.radius);
    expect(f.ctx.camera.position.z).toBeLessThan(circle.z + circle.radius + .34);

    const middle = first.root.position.clone().add(second.root.position).multiplyScalar(.5);
    const across = second.root.position.clone().sub(first.root.position).setY(0).normalize();
    const direction = new THREE.Vector3(-across.z, 0, across.x);
    const start = middle.clone().addScaledVector(direction, -4);
    const end = middle.clone().addScaledVector(direction, 4);
    const height = f.landscape.heightAtWorld(middle.x, middle.z) + 1;
    expect(f.landmarks.blocksShot(start.clone().setY(height), end.clone().setY(height))).toBe(false);
    const heading = Math.atan2(-direction.x, -direction.z) * 180 / Math.PI;
    f.player.setPose(f.ctx, start.x, start.z, heading);
    for (let i = 0; i < 40; i++) f.player.update(f.ctx, .1);
    const traveled = f.ctx.camera.position.clone().sub(start).setY(0).dot(direction);
    expect(traveled).toBeGreaterThan(8);
    f.key('KeyW', 'keyup');
  });

  it.each([false, true])('honors real erratic obstruction during the gun sweep, with above-rock shot = %s', above => {
    const f = fixture(entries[0].id, 'lite'), { root, bounds } = f.rocks[0];
    const y = above ? bounds.max.y + 1 : root.position.y + 1.4;
    const bird = { simId: 7, status: 'flying', x: root.position.x, y, z: bounds.min.z - 4 };
    const downBird = vi.fn(), resolveBird = vi.spyOn(f.hunt, 'resolveBird').mockReturnValue(true);
    f.systems.set('birds', { shotTargets: () => [bird], downBird });
    const gun = new GunSystem(); gun.init(f.ctx);
    cleanup.push(() => gun.dispose(f.ctx));
    f.ctx.camera.position.set(root.position.x, y, bounds.max.z + 4);
    f.ctx.camera.rotation.set(0, 0, 0, 'YXZ');
    f.key('KeyF'); gun.update(f.ctx, .2); f.key('Space');
    for (let i = 0; i < 6; i++) gun.fixedUpdate(f.ctx, 1000 / 30);
    expect(gun.shellsRemaining()).toBe(1);
    expect(resolveBird.mock.calls.length).toBe(above ? 1 : 0);
    expect(downBird.mock.calls.length).toBe(above ? 1 : 0);
  });
});
