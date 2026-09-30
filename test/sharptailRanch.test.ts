import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { sharptailGroundZones } from '../src/game/sharptailLandscape';
import { sharptailStoneClearance } from '../src/game/sharptailFeatures';
import type { Ctx } from '../src/three/engine';
import { sharptailCommunityAt, tintSharptailCommunity, type SharptailCommunitySample } from '../src/three/subsystems/sharptailCommunities';
import { sharptailMeadowAt } from '../src/three/subsystems/sharptailMeadow';
import { SharptailRanchSystem, SHARPTAIL_WINDMILL } from '../src/three/subsystems/sharptailRanch';
import { SharptailTurfSystem } from '../src/three/subsystems/sharptailTurf';

const area = getArea('sharptail-prairie');
const ctxFor = (quality: 'high' | 'lite') => ({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0,
  timeOfDay: 'morning', paused: true, events: new EventTarget() } as unknown as Ctx);

describe('Sharptail plant communities', () => {
  it('covers the prairie with every community somewhere, deterministically', () => {
    const zones = { swale: 0, stand: 0 }, meadow = { crown: 0, hollow: 0, cured: 0, exposed: 0 };
    const sample: SharptailCommunitySample = { bluestem: 0, bigBluestem: 0, wheatgrass: 0, needle: 0 };
    const present = { bluestem: 0, bigBluestem: 0, wheatgrass: 0, needle: 0 };
    let n = 0;
    for (let y = 10; y < area.world.h; y += 20) for (let x = 10; x < area.world.w; x += 20) {
      sharptailGroundZones(x, y, zones); sharptailMeadowAt(x, y, zones.swale, meadow);
      sharptailCommunityAt(x, y, meadow, sample); n++;
      for (const key of Object.keys(present) as (keyof typeof present)[]) {
        expect(sample[key]).toBeGreaterThanOrEqual(0); expect(sample[key]).toBeLessThanOrEqual(1);
        if (sample[key] > .5) present[key]++;
      }
    }
    for (const count of Object.values(present)) expect(count / n).toBeGreaterThan(.02);
    const again = sharptailCommunityAt(300, 400, meadow, { bluestem: 0, bigBluestem: 0, wheatgrass: 0, needle: 0 });
    expect(sharptailCommunityAt(300, 400, meadow, { bluestem: 0, bigBluestem: 0, wheatgrass: 0, needle: 0 })).toEqual(again);
  });
  it('changes hue while keeping the land’s light and shade', () => {
    const base = new THREE.Color(0xc2ad76), value = (c: THREE.Color) => c.r * .2126 + c.g * .7152 + c.b * .0722;
    const tinted = tintSharptailCommunity(base.clone(), { bluestem: 1, bigBluestem: 0, wheatgrass: 0, needle: 0 }, .62);
    expect(Math.abs(value(tinted) - value(base)) / value(base)).toBeLessThan(.12);
    expect(tinted.r - tinted.g).toBeGreaterThan(base.r - base.g);
  });
});

describe('Sharptail turf', () => {
  it('streams a short sward around the hunter, off the stones, and releases it behind', () => {
    const landscape = new LandscapeModel(area), ctx = ctxFor('high'), turf = new SharptailTurfSystem(landscape);
    const start = landscape.propertyToWorld(700, 600, { x: 0, z: 0 });
    ctx.camera.position.set(start.x, 2, start.z);
    turf.init(ctx);
    const high = turf.instances();
    expect(high).toBeGreaterThan(1500);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), property = { x: 0, y: 0 };
    for (const mesh of ctx.scene.children as THREE.InstancedMesh[]) for (let i = 0; i < mesh.count; i += 7) {
      mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
      landscape.worldToProperty(position.x, position.z, property);
      expect(sharptailStoneClearance(property.x, property.y)).toBeGreaterThanOrEqual(.5);
    }
    const far = landscape.propertyToWorld(200, 200, { x: 0, z: 0 });
    ctx.camera.position.set(far.x, 2, far.z); turf.update(ctx);
    const lite = ctxFor('lite'), liteTurf = new SharptailTurfSystem(landscape);
    lite.camera.position.set(start.x, 2, start.z); liteTurf.init(lite);
    expect(liteTurf.instances()).toBeLessThan(high);
    turf.dispose(ctx); liteTurf.dispose(lite);
    expect(ctx.scene.children).toHaveLength(0);
  });
});

describe('Sharptail ranch furniture', () => {
  it('fences the pasture with open gates at both entries and a solid swale windmill', () => {
    const landscape = new LandscapeModel(area), ctx = ctxFor('high'), ranch = new SharptailRanchSystem(landscape);
    ranch.init(ctx);
    const posts = ctx.scene.children.filter(o => o.name === 'Sharptail fence posts') as THREE.InstancedMesh[];
    expect(posts.reduce((n, m) => n + m.count, 0)).toBeGreaterThan(500);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), property = { x: 0, y: 0 };
    for (const mesh of posts) for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
      landscape.worldToProperty(position.x, position.z, property);
      for (const drop of area.dropPoints) expect(Math.hypot(property.x - drop.position.x, property.y - drop.position.y)).toBeGreaterThan(14);
    }
    const mill = landscape.propertyToWorld(SHARPTAIL_WINDMILL.x, SHARPTAIL_WINDMILL.y, { x: 0, z: 0 });
    expect(ranch.collisionCircles()).toHaveLength(2);
    expect(Math.hypot(ranch.collisionCircles()[0].x - mill.x, ranch.collisionCircles()[0].z - mill.z)).toBeLessThan(.01);
    // Well clear of every authored route.
    for (const trail of area.trails) for (const p of trail.points) {
      expect(Math.hypot(p.x - SHARPTAIL_WINDMILL.x, p.y - SHARPTAIL_WINDMILL.y)).toBeGreaterThan(20);
    }
    ranch.dispose(ctx);
    expect(ctx.scene.children).toHaveLength(0);
    expect(ranch.collisionCircles()).toHaveLength(0);
  });
});
