import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGeneratedGsp } from '../src/three/dogs/generatedGsp';
import { ENGLISH_SETTER_COATS } from '../src/three/dogs/englishSetter';
import { GeneratedScentMotion } from '../src/three/dogs/generatedScentMotion';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import { getArea, getDropPoint } from '../src/game/areas';
import type { Ctx } from '../src/three/engine';

afterEach(() => vi.unstubAllGlobals());

describe('faceted setter on the skinned rig', () => {
  for (const detail of ['high', 'lite'] as const) it(`keeps every plane flat and stays one light skin (${detail})`, () => {
    for (const coat of ENGLISH_SETTER_COATS) {
      const faceted = createGeneratedGsp(detail, false, coat.id, 'faceted'), smooth = createGeneratedGsp(detail, false, coat.id);
      try {
        expect(faceted.root.userData.look).toBe('faceted');
        const material = faceted.skin.material as THREE.MeshLambertMaterial;
        expect(material.flatShading).toBe(true);
        expect(material.defines?.SETTER_FACETED).toBeDefined();
        expect(faceted.stats.meshes).toBe(1); expect(faceted.stats.materials).toBe(1);
        // Broader planes than the smooth body (the lite bodies already match), on the same bones.
        if (detail === 'high') expect(faceted.stats.triangles).toBeLessThan(smooth.stats.triangles);
        else expect(faceted.stats.triangles).toBeLessThanOrEqual(smooth.stats.triangles);
        expect(faceted.skeleton.bones.map(bone => bone.name)).toEqual(smooth.skeleton.bones.map(bone => bone.name));
        const weights = faceted.skin.geometry.getAttribute('skinWeight');
        for (let i = 0; i < weights.count; i++) expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 6);
        const standing = new THREE.Box3().setFromObject(faceted.root);
        expect(standing.min.y).toBeGreaterThanOrEqual(0); expect(standing.min.y).toBeLessThan(.01);
      } finally { faceted.dispose(); smooth.dispose(); }
    }
  });

  it('holds a high flag and a lifted head on point', () => {
    const dog = createGeneratedGsp('high', false, 'orange-belton', 'faceted');
    try {
      dog.setPose('point');
      // Near twelve o'clock: the tail bone well above the topline.
      expect(dog.joints.tail.rotation.x).toBeGreaterThan(1.1);
      expect(dog.joints.neck.rotation.x).toBeLessThan(.08);
    } finally { dog.dispose(); }
  });
});

describe('skinned dog in the field', () => {
  function field(state: string) {
    vi.stubGlobal('window', {}); vi.stubGlobal('location', { search: '?capture=1' });
    let ticks = 0;
    const dog = { state, gait: 'still', scentStage: 'none', scentProgress: 0, carryingBirdId: null, retrieveHoldTimeMs: () => 0 };
    const hunt = { areaConfig: () => getArea('quail-fields'), dropPoint: () => getDropPoint(getArea('quail-fields')),
      huntState: () => ({ birds: [] }), dog: () => dog, tickCount: () => ticks,
      dogRenderWorld: (_alpha: number, out: { x: number; z: number }) => Object.assign(out, { x: 0, z: 0 }),
      dogRenderHeading: () => 0, dogRenderTravelHeading: () => 0, coverPatches: () => [{ cx: 0, cz: 0, hx: 5, hz: 5 }] };
    const ctx = { scene: new THREE.Scene(), quality: 'lite', fixedAlpha: 1,
      get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: () => 0, markingTarget: () => false } } as unknown as Ctx;
    const system = new GeneratedDogSystem('orange-belton', 0, 'faceted'); system.init(ctx);
    return { system, ctx, dog, step: (n: number) => { ticks += n; }, motion: () => (system as unknown as { motion: { asset: ReturnType<typeof createGeneratedGsp> } }).motion };
  }

  it('settles a frozen capture by the hunt ticks stepped, not the zero render dt', () => {
    const { system, ctx, step, motion } = field('pointing');
    system.update(ctx, 0);
    step(45);
    system.update(ctx, 0);
    // A second and a half of hunt ticks: the point is fully up.
    expect(motion().asset.joints.tail.rotation.x).toBeGreaterThan(1.1);
    const tail = motion().asset.joints.tail.rotation.x;
    system.update(ctx, 0); system.update(ctx, 0);
    // Re-rendering the same tick changes nothing.
    expect(motion().asset.joints.tail.rotation.x).toBeCloseTo(tail, 9);
    system.dispose();
  });

  it('parts the cover wider around a dog on point', () => {
    const { system, ctx, step } = field('quartering');
    const part = { x: 0, z: 0, r: 0 };
    system.update(ctx, 0); step(30); system.update(ctx, 0);
    system.partingPoint(part); const moving = part.r;
    const pointing = field('pointing');
    pointing.system.update(pointing.ctx, 0); pointing.step(60); pointing.system.update(pointing.ctx, 0);
    pointing.system.partingPoint(part);
    expect(part.r).toBeGreaterThan(moving + .8);
    system.dispose(); pointing.system.dispose();
  });
});

describe('skinned dog tail and idle life', () => {
  const asset = () => createGeneratedGsp('lite', true, 'orange-belton', 'faceted');
  const intent = (inCover: boolean) => ({ state: 'quartering' as const, scentStage: 'none' as const, scentProgress: 0, waitingForHandler: false, intentYaw: 0, inCover });

  it('carries the tail high and cracking inside cover', () => {
    const open = asset(), cover = asset();
    const a = new GeneratedScentMotion(), b = new GeneratedScentMotion();
    for (let i = 0; i < 60; i++) {
      open.setPose('stand'); cover.setPose('stand');
      a.update(open, intent(false), true, 0, 1 / 60, false); b.update(cover, intent(true), true, 0, 1 / 60, false);
    }
    expect(cover.joints.tail.rotation.x).toBeGreaterThan(open.joints.tail.rotation.x + .08);
    open.dispose(); cover.dispose();
  });

  it('breathes and looks round at heel instead of standing as a statue', () => {
    const dog = asset(), motion = new GeneratedScentMotion();
    const heel = { ...intent(false), state: 'heel' as const };
    const yaws: number[] = [];
    for (let i = 0; i < 300; i++) {
      dog.setPose('stand');
      motion.update(dog, heel, false, 0, 1 / 30, false);
      yaws.push(dog.joints.neck.rotation.y);
    }
    expect(Math.max(...yaws) - Math.min(...yaws)).toBeGreaterThan(.05);
    dog.dispose();
  });
});
