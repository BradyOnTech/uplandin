import * as THREE from 'three';
import { expect, it } from 'vitest';
import { GeneratedFieldMotion } from '../src/three/dogs/generatedFieldMotion';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import { BirdsSystem } from '../src/three/subsystems/birds';
import { getArea, getDropPoint } from '../src/game/areas';
import { getSpecies } from '../src/game/species';
import type { Ctx } from '../src/three/engine';
import { vi } from 'vitest';

it('reaches the actual fall across spatial stop distances, headings and slopes without moving planted paws', () => {
  for (const slope of [-.15, 0, .15]) for (const yaw of [-1.2, 0, 2.4]) for (const distance of [.52, .65]) {
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const ground = (x: number, z: number) => (x * forward.x + z * forward.z) * slope;
    const target = forward.clone().multiplyScalar(distance); target.y = ground(target.x, target.z) + .06;
    const dog = new GeneratedFieldMotion('lite', ground);
    for (let frame = 0; frame < 45; frame++) dog.update(0, 0, yaw, 1 / 60, false, false);
    const feet = dog.contactSnapshot().map(foot => new THREE.Vector3(...foot.actual));
    const mouth = () => dog.asset.joints.head.localToWorld(dog.mouthMotion.grip.clone());
    for (let frame = 1; frame <= 42; frame++) {
      dog.update(0, 0, yaw, 1 / 60, false, false, { stage: 'pickup', holdMs: frame * 1000 / 60, target });
      dog.contactSnapshot().forEach((foot, i) => expect(new THREE.Vector3(...foot.actual).distanceTo(feet[i])).toBeLessThan(.003));
    }
    expect(mouth().distanceTo(target)).toBeLessThan(.014);
    let previous = mouth();
    for (let frame = 0; frame < 36; frame++) {
      dog.update(0, 0, yaw, 1 / 60, false, false, { stage: 'carry', holdMs: 0, speciesId: 'chukar' });
      const next = mouth(); expect(next.distanceTo(previous)).toBeLessThan(.10); previous = next;
    }
    expect(mouth().y).toBeGreaterThan(.45);
    dog.dispose();
  }
});

it('does not chase a stale pickup target during a point, after release or while swimming', () => {
  let depth = 0;
  const dog = new GeneratedFieldMotion('lite', () => 0, () => depth);
  const control = new GeneratedFieldMotion('lite', () => 0, () => depth);
  const target = { x: 0, y: .06, z: .65 };
  const mouth = (actor: GeneratedFieldMotion) => actor.asset.joints.head.localToWorld(actor.mouthMotion.grip.clone());
  for (let frame = 1; frame <= 42; frame++) dog.update(0, 0, 0, 1 / 60, false, false, { stage: 'pickup', holdMs: frame * 1000 / 60, target });
  for (let frame = 0; frame < 60; frame++) {
    dog.update(0, 0, 0, 1 / 60, false, true, { stage: 'pickup', holdMs: 700, target });
    control.update(0, 0, 0, 1 / 60, false, true);
  }
  expect(mouth(dog).distanceTo(mouth(control))).toBeLessThan(.002);
  depth = .8;
  dog.update(0, 0, 0, 1 / 60, false, false, { stage: 'pickup', holdMs: 700, target });
  control.update(0, 0, 0, 1 / 60, false, false);
  expect(mouth(dog).distanceTo(mouth(control))).toBeLessThan(.002);
  dog.dispose(); control.dispose();
});

it('keeps the actual nose and lower-jaw skin above flat and sloped ground throughout four-species pickup', () => {
  for (const speciesId of ['bobwhite', 'chukar', 'sharptail', 'ringneck']) for (const slope of [-.30, 0, .30]) {
    const ground = (_x: number, z: number) => slope * z;
    const dog = new GeneratedFieldMotion('high', ground);
    const target = { x: 0, y: ground(0, .65) + .06, z: .65 };
    for (let frame = 0; frame < 45; frame++) dog.update(0, 0, 0, 1 / 60, false, false);
    const { skin, skeleton, joints } = dog.asset;
    const positions = skin.geometry.getAttribute('position'), indices = skin.geometry.getAttribute('skinIndex');
    const weights = skin.geometry.getAttribute('skinWeight');
    const head = skeleton.bones.indexOf(joints.head), jaw = skeleton.bones.indexOf(joints.jaw);
    const influencedBy = (i: number, bone: number) => {
      let influence = 0;
      for (let channel = 0; channel < 4; channel++) {
        if (indices.array[i * 4 + channel] === bone) influence += weights.array[i * 4 + channel];
      }
      return influence > .001;
    };
    const all = Array.from({ length: positions.count }, (_, i) => i);
    const nose = all.filter(i => influencedBy(i, head) && positions.getZ(i) > .535);
    const lower = all.filter(i => influencedBy(i, jaw));
    expect(nose.length).toBeGreaterThan(50);
    expect(lower.length).toBeGreaterThan(50);
    const vertices = [...new Set([...nose, ...lower])];
    const point = new THREE.Vector3();
    let minimumClearance = Infinity;
    for (let frame = 1; frame <= 42; frame++) {
      dog.update(0, 0, 0, 1 / 60, false, false, { stage: 'pickup', holdMs: frame * 1000 / 60, target, speciesId });
      dog.asset.root.updateMatrixWorld(true); skeleton.update();
      for (const vertex of vertices) {
        point.fromBufferAttribute(positions, vertex); skin.applyBoneTransform(vertex, point); point.applyMatrix4(skin.matrixWorld);
        minimumClearance = Math.min(minimumClearance, point.y - ground(point.x, point.z));
      }
    }
    // Inspect every selected vertex on every frame, with one assertion per
    // case so richer skins do not spend their test budget formatting matchers.
    expect(minimumClearance).toBeGreaterThan(.005);
    expect(joints.head.localToWorld(dog.mouthMotion.grip.clone()).distanceTo(new THREE.Vector3(0, target.y, target.z))).toBeLessThan(.014);
    dog.dispose();
  }
});

it('routes a bracemate reserved fall through the real pooled bird centre and preserves its grip on acquisition', () => {
  vi.stubGlobal('window', {});
  let holdMs = 0;
  const primary = { state: 'heel', gait: 'still', heading: Math.PI / 2, carryingBirdId: null as number | null };
  const secondary = { state: 'retrieving', gait: 'still', heading: Math.PI / 2, carryingBirdId: null as number | null,
    scentStage: 'none', reservedRetrieveId: () => 7, retrieveHoldTimeMs: () => holdMs };
  const fall = { id: 7, speciesId: 'chukar', state: 'downed' };
  const hunt = { areaConfig: () => getArea('quail-fields'), dropPoint: () => getDropPoint(getArea('quail-fields')),
    huntState: () => ({ birds: [{ id: 99, speciesId: 'ringneck', state: 'downed' }, fall] }),
    dog: (slot = 0) => slot === 0 ? primary : secondary, dogCount: () => 2,
    dogRenderWorld: (_alpha: number, out: { x: number; z: number }) => Object.assign(out, { x: 0, z: 0 }),
    dogRenderHeading: () => Math.PI / 2, dogRenderTravelHeading: () => Math.PI / 2 };
  const terrain = { heightAt: () => 0 }, visual = new GeneratedDogSystem('liver-roan', 1), birds = new BirdsSystem();
  const internal = birds as unknown as { mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean;
    slots: { root: THREE.Group; simId: number; status: string; x: number; y: number; z: number }[];
    buildPool(ctx: Ctx): void; applySpeciesAppearance(slot: unknown, species: ReturnType<typeof getSpecies>): void };
  Object.assign(internal, { mat: new THREE.MeshLambertMaterial({ vertexColors: true }), hunt, terrain, frozen: false });
  const registry: Record<string, unknown> = { hunt3d: hunt, terrain, birds, 'dog-2': visual };
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', fixedAlpha: 1,
    get: (id: string) => registry[id] } as unknown as Ctx;
  visual.init(ctx); internal.buildPool(ctx);
  const slot = internal.slots[0]; internal.applySpeciesAppearance(slot, getSpecies('chukar'));
  Object.assign(slot, { simId: 7, status: 'grounded', x: 0, y: .06, z: .62, previousX: 0, previousY: .06, previousZ: .62 });
  const mouth = new THREE.Vector3(), centre = new THREE.Vector3();
  try {
    expect(birds.groundedTarget(99, centre)).toBe(false);
    expect(birds.groundedTarget(7, centre)).toBe(true); expect(centre.toArray()).toEqual([0, .06, .62]);
    for (let frame = 1; frame <= 42; frame++) { holdMs = frame * 1000 / 60; visual.update(ctx, 1 / 60); birds.update(ctx, 1 / 60); }
    visual.mouthWorld(mouth); expect(mouth.distanceTo(slot.root.position)).toBeLessThan(.014);
    const groundedPosition = slot.root.position.clone();
    secondary.carryingBirdId = 7; holdMs = 0; fall.state = 'carried';
    visual.update(ctx, 1 / 60); birds.update(ctx, 1 / 60); visual.mouthWorld(mouth);
    expect(slot.root.position.distanceTo(mouth)).toBeLessThan(1e-7);
    expect(slot.root.position.distanceTo(groundedPosition)).toBeLessThan(.10);
    expect(primary.carryingBirdId).toBeNull();
    expect(secondary.carryingBirdId).toBe(7);
  } finally { visual.dispose(); birds.dispose(ctx); vi.unstubAllGlobals(); }
});
