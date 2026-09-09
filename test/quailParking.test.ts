import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';
import { LandmarksSystem } from '../src/three/subsystems/landmarks';
import { PlayerSystem } from '../src/three/subsystems/player';
import { deriveQuailEntrances, deriveQuailParkingPose } from '../src/three/subsystems/quailEntrances';
import { buildQuailFenceGeometry } from '../src/three/subsystems/quailFences';

vi.mock('../src/audio', () => ({ unlockAudio: vi.fn(), playFootstep: vi.fn(), playCoverBrush: vi.fn(), playWhistle: vi.fn() }));
const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { getElementById: () => null }));
  vi.stubGlobal('HTMLElement', class {});
});
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });

function fixture(dropId: string, areaId = 'quail-fields') {
  vi.stubGlobal('location', { search: `?area=${areaId}&drop=${dropId}&breed=gsp` });
  const area = getArea(areaId), landscape = new LandscapeModel(area, dropId);
  const fence = buildQuailFenceGeometry(landscape), hunt = new Hunt3DSystem(landscape);
  const player = new PlayerSystem(landscape), landmarks = new LandmarksSystem();
  const systems = { hunt3d: hunt, player, landmarks, terrain: { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) },
    'quail-environment': { collisionCircles: () => fence.laneObstacles } };
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), paused: false, events: new EventTarget(),
    renderer: { domElement: new EventTarget() }, get: (id: keyof typeof systems) => systems[id] } as unknown as Ctx;
  player.init(ctx); hunt.init(ctx);
  const sharedState = JSON.stringify(hunt.huntState());
  landmarks.init(ctx); ctx.scene.updateMatrixWorld(true);
  const truck = ctx.scene.children.at(-1)!;
  cleanup.push(() => { player.dispose(); landmarks.dispose(ctx); fence.wires.dispose(); });
  const press = (...codes: string[]) => codes.forEach(code => window.dispatchEvent(Object.assign(new Event('keydown'), { code })));
  return { area, landscape, ctx, hunt, player, landmarks, truck, press, sharedState };
}

function worldVertices(root: THREE.Object3D): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) result.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld));
  });
  return result;
}

describe('Quail roadside pickup presentation', () => {
  it.each(['south-gate', 'west-track'])('keeps the road and drop clear with mesh, HUD target and collisions aligned at %s', dropId => {
    const geography = JSON.stringify(getArea('quail-fields'));
    const f = fixture(dropId), drop = f.landscape.dropPoint, pose = deriveQuailParkingPose(f.area, dropId)!;
    const spawn = f.landscape.propertyToWorld(drop.position.x, drop.position.y, { x: 0, z: 0 });
    const target = f.hunt.truckWorld({ x: 0, z: 0 });
    expect(f.truck.name).toBe('Quail hunting pickup');
    expect(f.truck.position.x).toBeCloseTo(target.x, 10); expect(f.truck.position.z).toBeCloseTo(target.z, 10);
    expect(f.landscape.worldToProperty(target.x, target.z, { x: 0, y: 0 })).toEqual(pose.position);
    const outward = new THREE.Vector3(-Math.cos(drop.heading), 0, -Math.sin(drop.heading));
    expect(new THREE.Vector3(0, 0, -1).applyQuaternion(f.truck.quaternion).distanceTo(outward)).toBeLessThan(1e-10);
    const right = new THREE.Vector3(-Math.sin(drop.heading), 0, Math.cos(drop.heading));
    const points = worldVertices(f.truck);
    const lateral = points.map(p => (p.x - spawn.x) * right.x + (p.z - spawn.z) * right.z);
    expect(Math.min(...lateral)).toBeGreaterThan(3.19);
    expect(Math.max(...lateral) - Math.min(...lateral)).toBeCloseTo(2.4, 5);
    for (const p of points) expect(Math.hypot(p.x - spawn.x, p.z - spawn.z)).toBeLessThan(9 * PROPERTY_PX_TO_M);
    for (const along of [-1.4, 0, 1.4]) {
      const p = new THREE.Vector3(0, 0, along).applyMatrix4(f.truck.matrixWorld);
      expect(f.landmarks.collisionCircles().some(c => Math.hypot(c.x - p.x, c.z - p.z) < 1e-8 && c.radius === 1.08)).toBe(true);
    }
    expect(spawn).toEqual({ x: 0, z: 40 });
    expect(JSON.stringify(f.hunt.huntState())).toBe(f.sharedState);
    expect(JSON.stringify(f.area)).toBe(geography);
  });

  it.each(['south-gate', 'west-track'])('allows actual player travel through the full entrance road at %s', dropId => {
    const f = fixture(dropId), drop = f.landscape.dropPoint;
    const outward = new THREE.Vector2(-Math.cos(drop.heading), -Math.sin(drop.heading));
    const right = new THREE.Vector2(-outward.y, outward.x);
    const angle = Math.atan2(-outward.x, -outward.y) * 180 / Math.PI;
    f.press('KeyW', 'ShiftLeft');
    // All three paths traverse the old truck obstruction, the open gate and
    // the swung leaves, then return. Long frames exercise real collision code.
    for (const offset of [-1.5, 0, 1.5]) {
      const start = new THREE.Vector2(0, 40).addScaledVector(right, offset);
      f.player.setPose(f.ctx, start.x, start.y, angle);
      for (let i = 0; i < 39; i++) f.player.update(f.ctx, .1);
      const end = start.clone().addScaledVector(outward, 39 * .1 * 2.2 * 1.9);
      expect(new THREE.Vector2(f.ctx.camera.position.x, f.ctx.camera.position.z).distanceTo(end)).toBeLessThan(1e-8);
      f.player.setPose(f.ctx, end.x, end.y, angle + 180);
      for (let i = 0; i < 39; i++) f.player.update(f.ctx, .1);
      expect(new THREE.Vector2(f.ctx.camera.position.x, f.ctx.camera.position.z).distanceTo(start)).toBeLessThan(1e-8);
    }
    // The shared gate and trail anchors remain the actual entrance center.
    expect(deriveQuailEntrances(f.area).find(e => e.dropPointId === dropId)!.dropCenter).toEqual(drop.position);
  });

  it.each(['south-gate', 'west-track'])('grounds all four actual wheel contacts at the roadside pose from %s', dropId => {
    const f = fixture(dropId);
    const rubber = f.truck.children.find(o => o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).color.getHex() === 0x252b29) as THREE.Mesh;
    const attr = rubber.geometry.getAttribute('position');
    const points = Array.from({ length: attr.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(attr, i));
    for (const x of [-.99, .99]) for (const z of [-1.42, 1.53]) {
      const tyre = points.filter(p => Math.abs(p.x - x) < .14 && Math.abs(p.z - z) < .46);
      const lowest = Math.min(...tyre.map(p => p.y));
      const contacts = tyre.filter(p => p.y - lowest < 1e-5);
      expect(contacts.length).toBeGreaterThan(1);
      for (const point of contacts) {
        const p = point.clone().applyMatrix4(rubber.matrixWorld), gap = p.y - f.landscape.heightAtWorld(p.x, p.z);
        expect(gap).toBeGreaterThan(-.02); expect(gap).toBeLessThan(.005);
      }
    }
    for (const p of worldVertices(f.truck)) expect(p.y - f.landscape.heightAtWorld(p.x, p.z)).toBeGreaterThan(-.02);
  });

  it.each(['south-gate', 'west-track'])('retains the original non-Quail truck position at %s', dropId => {
    const f = fixture(dropId, 'pheasant-coverts'), drop = f.landscape.dropPoint;
    const expected = f.landscape.propertyToWorld(drop.position.x - Math.cos(drop.heading) * 6, drop.position.y - Math.sin(drop.heading) * 6, { x: 0, z: 0 });
    expect(deriveQuailParkingPose(f.area, dropId)).toBeUndefined();
    expect(f.hunt.truckWorld({ x: 0, z: 0 })).toEqual(expected);
    expect(f.truck.rotation.y).toBe(-drop.heading);
    expect(f.truck.position.x).toBe(expected.x); expect(f.truck.position.z).toBe(expected.z);
  });
});
