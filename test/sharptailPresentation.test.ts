import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { mulberry32 } from '../src/game/math';
import { getSpecies } from '../src/game/species';
import type { Ctx } from '../src/three/engine';
import { buildSharptailBody, buildSharptailWing, poseSharptailFoldedWings } from '../src/three/assets/sharptail';
import { BirdsSystem } from '../src/three/subsystems/birds';
import { sharptailLaunchDelay, sharptailWingbeat } from '../src/three/sharptailPresentation';
import { quailLaunchDelay } from '../src/three/quailPresentation';

describe('Sharptail species presentation', () => {
  it('keeps a three-mesh mobile bird with a graduated pointed tail and pale underside', () => {
    const body = buildSharptailBody(), left = buildSharptailWing(-1), right = buildSharptailWing(1);
    let triangles = 0;
    for (const geometry of [body, left, right]) {
      const p = geometry.getAttribute('position'); triangles += p.count / 3;
      expect(geometry.groups).toHaveLength(0);
      expect(geometry.getAttribute('color').count).toBe(p.count);
      expect(geometry.getAttribute('normal').count).toBe(p.count);
      expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
    }
    expect(triangles).toBeLessThanOrEqual(650);
    expect(body.boundingBox!.min.z).toBeGreaterThan(-.18);
    expect(body.boundingBox!.max.z).toBeLessThan(.15);
    expect(right.boundingBox!.max.x).toBeCloseTo(.186, 6);
    expect(left.boundingBox!.min.x).toBeCloseTo(-.186, 6);
    const p = body.getAttribute('position'), colors = body.getAttribute('color');
    let tailWidth = 0, tipWidth = 0, bellyLight = 0, backLight = 0, bellyN = 0, backN = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.getZ(i) < -.12) tailWidth = Math.max(tailWidth, Math.abs(p.getX(i)));
      if (p.getZ(i) < -.17) tipWidth = Math.max(tipWidth, Math.abs(p.getX(i)));
      const luminance = colors.getX(i) * .2126 + colors.getY(i) * .7152 + colors.getZ(i) * .0722;
      if (Math.abs(p.getZ(i)) < .06 && p.getY(i) < -.023) { bellyLight += luminance; bellyN++; }
      if (Math.abs(p.getZ(i)) < .06 && p.getY(i) > .025) { backLight += luminance; backN++; }
    }
    expect(tipWidth).toBeLessThan(tailWidth * .3);
    expect(bellyLight / bellyN).toBeGreaterThan(backLight / backN * 1.6);
    for (const geometry of [body, left, right]) geometry.dispose();
  });

  it('recovers the outer hand while the shoulder stays attached, and folds the wings aft on retrieval', () => {
    const material = new THREE.MeshBasicMaterial();
    const wings = [-1, 1].map(side => ({ side, geometry: buildSharptailWing(side as -1 | 1), pivot: new THREE.Group() }));
    for (const { side, geometry, pivot } of wings) {
      expect(geometry.morphAttributes.position).toBeDefined();
      const p = geometry.getAttribute('position'), recovery = geometry.morphAttributes.position![0];
      expect(recovery.count).toBe(p.count);
      for (let i = 0; i < p.count; i++) {
        const span = side * p.getX(i);
        if (span <= .078) {
          expect(recovery.getX(i)).toBe(p.getX(i)); expect(recovery.getY(i)).toBe(p.getY(i)); expect(recovery.getZ(i)).toBe(p.getZ(i));
        } else if (span > .17) {
          expect(side * recovery.getX(i)).toBeLessThan(span * .84);
          expect(recovery.getZ(i)).toBeLessThan(p.getZ(i) - .06);
        }
      }
      pivot.add(new THREE.Mesh(geometry, material));
    }
    poseSharptailFoldedWings(wings[0].pivot, wings[1].pivot);
    for (const { geometry, pivot } of wings) {
      const box = new THREE.Box3().setFromObject(pivot, true);
      expect(box.min.z).toBeLessThan(-.16);
      expect(box.max.y).toBeLessThan(.09);
      geometry.dispose();
    }
    material.dispose();
  });

  it('keeps the main rise tight with occasional seeded trailing birds, not a long regular wave', () => {
    let late = 0;
    const sequence = (seed: number, count: number) => {
      const rng = mulberry32(seed);
      return Array.from({ length: count }, (_, i) => sharptailLaunchDelay(i, count, rng));
    };
    for (let seed = 1; seed <= 100; seed++) {
      const delays = sequence(seed, 6);
      expect(delays).toEqual(sequence(seed, 6));
      expect(delays[0]).toBe(0);
      expect(Math.max(...delays.slice(0, -1))).toBeLessThan(250);
      expect(delays.at(-1)).toBeLessThanOrEqual(650);
      if (delays.at(-1)! > 250) late++;
      expect(Math.max(...sequence(seed, 3))).toBeLessThan(250);
    }
    expect(late).toBeGreaterThan(15); expect(late).toBeLessThan(45);
  });

  it('preserves the prior queue random stream so presentation does not reroll later flight profiles', () => {
    for (const count of [3, 4, 5, 6]) for (const seed of [1, 517, 9881]) {
      const before = mulberry32(seed), after = mulberry32(seed);
      for (let index = 0; index < count; index++) {
        quailLaunchDelay(index, count, before); sharptailLaunchDelay(index, count, after);
        expect(after()).toBe(before());
      }
    }
  });

  it('alternates powered recovery and open glides continuously after the old rigid-wing cutoff', () => {
    let powered = 0, gliding = 0;
    for (let ms = 1200; ms <= 4500; ms += 10) {
      const pose = sharptailWingbeat(ms / 1000, 13, .735);
      expect(pose.angle).toBeGreaterThan(-1); expect(pose.angle).toBeLessThan(1.1);
      expect(pose.recovery).toBeGreaterThanOrEqual(0); expect(pose.recovery).toBeLessThanOrEqual(1);
      if (pose.recovery > .4) powered++;
      if (pose.angle === .15 && pose.recovery === 0) gliding++;
    }
    expect(powered).toBeGreaterThan(30); expect(gliding).toBeGreaterThan(80);
    for (const boundary of [.8, 1.02, 2.35, 3.9]) {
      const before = sharptailWingbeat(boundary - .000001, 13), after = sharptailWingbeat(boundary + .000001, 13);
      expect(Math.abs(after.angle - before.angle)).toBeLessThan(.001);
      expect(Math.abs(after.recovery - before.recovery)).toBeLessThan(.001);
    }
  });
});

// Exercise the real pooled renderer and launch queue without WebGL, audio or
// a simulation fork. Only already-flushed input birds are supplied here.
function presentationFixture() {
  const system = new BirdsSystem();
  const internal = system as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean; spatialEncounter: boolean;
    queue: number[]; qHead: number; qTail: number; riseRng: () => number;
    slots: { simId: number; species: ReturnType<typeof getSpecies>; status: string; x: number; y: number; z: number;
      vxW: number; vyW: number; vzW: number; airMs: number; previousAirMs: number; gliding: boolean;
      wingR: THREE.Group; wingRMesh: THREE.Mesh; root: THREE.Group }[];
    buildPool(ctx: Ctx): void;
    launchWave(birds: { id: number; speciesId: string; pos: { x: number; y: number } }[]): void;
  };
  const area = getArea('sharptail-prairie'), scene = new THREE.Scene();
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  internal.hunt = { areaConfig: () => area, huntState: () => ({ birds: [] }),
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }), coverPatches: () => [] };
  internal.terrain = { heightAt: () => 0 };
  internal.frozen = true; internal.spatialEncounter = true;
  internal.riseRng = mulberry32(517);
  const ctx = { scene, fixedAlpha: 1, camera: new THREE.PerspectiveCamera() } as unknown as Ctx;
  internal.buildPool(ctx);
  const birds = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, speciesId: 'sharptail', pos: { x: 20 + i * 7, y: 30 + i * 2 } }));
  internal.queue = birds.map(bird => bird.id); internal.qHead = 0; internal.qTail = birds.length;
  internal.launchWave(birds);
  return { system, internal, ctx, birds };
}

describe('Sharptail live presentation integration', () => {
  it('retains real flush origins and excludes waiting birds from shots until lift', () => {
    const { system, internal, ctx, birds } = presentationFixture();
    for (const bird of birds) {
      const slot = internal.slots.find(candidate => candidate.simId === bird.id)!;
      expect(slot.x).toBe(bird.pos.x); expect(slot.z).toBe(bird.pos.y); expect(slot.y).toBe(.2);
      expect(slot.root.children.filter(child => child instanceof THREE.Mesh || child instanceof THREE.Group)).toHaveLength(3);
    }
    const waiting = internal.slots.find(slot => slot.status === 'waiting')!;
    expect(waiting).toBeDefined();
    const origin = { x: waiting.x, y: waiting.y, z: waiting.z - 10 }, direction = { x: 0, y: 0, z: 1 };
    expect(system.shootRay(origin, direction, .001)).toBeNull();
    waiting.status = 'flying';
    expect(system.shootRay(origin, direction, .001)).toBe(waiting.simId);
    system.dispose(ctx);
  });

  it('interpolates wing poses within a fixed tick without changing flight state or hit centers', () => {
    const { system, internal, ctx } = presentationFixture();
    const slot = internal.slots.find(candidate => candidate.status === 'flying')!;
    internal.frozen = false;
    slot.airMs = 1550; slot.previousAirMs = 1550 - 1000 / 30; slot.gliding = true;
    const physicalState = () => [slot.x, slot.y, slot.z, slot.vxW, slot.vyW, slot.vzW, slot.airMs, slot.previousAirMs, slot.gliding];
    const before = physicalState(), poses: number[] = [];
    for (const alpha of [.1, .4, .8]) {
      ctx.fixedAlpha = alpha; system.update(ctx, 1 / 120);
      poses.push(slot.wingR.rotation.z);
      expect(physicalState()).toEqual(before);
      expect(slot.root.position.toArray()).toEqual([slot.x, slot.y, slot.z]);
    }
    expect(Math.max(...poses) - Math.min(...poses)).toBeGreaterThan(.15);
    system.dispose(ctx);
  });
});
