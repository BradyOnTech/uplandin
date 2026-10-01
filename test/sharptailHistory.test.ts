import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import {
  SHARPTAIL_BADGER_KNOLL, SHARPTAIL_ENTRANCE_POSTS, SHARPTAIL_HOMESTEAD, SHARPTAIL_STOCK_POND, SHARPTAIL_TIPI_RINGS, SHARPTAIL_TIPI_STONES,
  sharptailEntrances, sharptailStoneClearance,
} from '../src/game/sharptailFeatures';
import type { Ctx } from '../src/three/engine';
import { SharptailRanchSystem } from '../src/three/subsystems/sharptailRanch';

const area = getArea('sharptail-prairie');
const ctxFor = () => ({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', time: 0,
  timeOfDay: 'morning', paused: true, events: new EventTarget() } as unknown as Ctx);
const trailDistance = (x: number, y: number) => Math.min(...area.trails.flatMap(trail => trail.points.slice(1).map((b, i) => {
  const a = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
})));
const patchDistance = (x: number, y: number) => Math.min(...area.patches.map(p =>
  Math.hypot(Math.max(p.x - x, 0, x - p.x - p.w), Math.max(p.y - y, 0, y - p.y - p.h))));

describe('Sharptail pasture history', () => {
  it('opens the boundary fence where each two-track comes in, and keeps grass off the ruts', () => {
    const landscape = new LandscapeModel(area), ctx = ctxFor(), ranch = new SharptailRanchSystem(landscape);
    ranch.init(ctx);
    const entrances = sharptailEntrances(area.world, area.dropPoints);
    expect(entrances.map(e => e.kind).sort()).toEqual(['cattle-guard', 'wire-gate']);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), property = { x: 0, y: 0 };
    for (const name of ['Sharptail fence posts', 'Sharptail fence line posts']) {
      const posts = ctx.scene.getObjectByName(name) as THREE.InstancedMesh;
      for (let i = 0; i < posts.count; i++) {
        posts.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
        landscape.worldToProperty(position.x, position.z, property);
        // Nothing stands in the opening itself.
        for (const e of entrances) expect(Math.hypot(property.x - e.x, property.y - e.y) * PROPERTY_PX_TO_M).toBeGreaterThan(SHARPTAIL_ENTRANCE_POSTS.gatepost - .05);
      }
    }
    expect(ctx.scene.getObjectByName('Sharptail entrances')).toBeDefined();
    expect(ctx.scene.getObjectByName('Sharptail two-track ruts')).toBeDefined();
    for (const e of entrances) {
      const mid = { x: (e.x + e.truck.x) / 2, y: (e.y + e.truck.y) / 2 };
      const dx = e.truck.x - e.x, dy = e.truck.y - e.y, length = Math.hypot(dx, dy);
      const rut = { x: mid.x - dy / length * .93, y: mid.y + dx / length * .93 };
      expect(sharptailStoneClearance(rut.x, rut.y)).toBe(0);
    }
    ranch.dispose(ctx);
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('holds water behind the stock dam and makes its deep middle a boundary', () => {
    const landscape = new LandscapeModel(area), ctx = ctxFor(), ranch = new SharptailRanchSystem(landscape);
    ranch.init(ctx);
    const pond = ctx.scene.getObjectByName('Sharptail stock pond') as THREE.Mesh;
    expect(pond).toBeDefined();
    const crest = landscape.heightAtProperty(SHARPTAIL_STOCK_POND.dam.x, SHARPTAIL_STOCK_POND.dam.y);
    expect(pond.position.y).toBeCloseTo(crest - SHARPTAIL_STOCK_POND.freeboard, 5);
    // Real depth at the middle of the pit; dry ground just below the dam.
    expect(pond.position.y - landscape.heightAtProperty(SHARPTAIL_STOCK_POND.x - 6, SHARPTAIL_STOCK_POND.y)).toBeGreaterThan(1.2);
    expect(landscape.heightAtProperty(SHARPTAIL_STOCK_POND.dam.x - 30, SHARPTAIL_STOCK_POND.dam.y)).toBeLessThan(pond.position.y);
    const middle = landscape.propertyToWorld(SHARPTAIL_STOCK_POND.x - 6, SHARPTAIL_STOCK_POND.y, { x: 0, z: 0 });
    expect(ranch.collisionCircles().some(c => Math.hypot(c.x - middle.x, c.z - middle.z) < c.radius)).toBe(true);
    // Grass does not grow out of open water.
    expect(sharptailStoneClearance(SHARPTAIL_STOCK_POND.x - 6, SHARPTAIL_STOCK_POND.y)).toBe(0);
    expect(patchDistance(SHARPTAIL_STOCK_POND.x, SHARPTAIL_STOCK_POND.y)).toBeGreaterThan(SHARPTAIL_STOCK_POND.rx * .7);
    ranch.dispose(ctx);
  });

  it('puts the homestead, tipi rings and badger knoll off the lanes and out of the bird cover', () => {
    for (const site of [SHARPTAIL_HOMESTEAD, SHARPTAIL_BADGER_KNOLL, ...SHARPTAIL_TIPI_RINGS]) {
      expect(trailDistance(site.x, site.y)).toBeGreaterThan(20);
      expect(patchDistance(site.x, site.y)).toBeGreaterThan(20);
    }
    expect(SHARPTAIL_TIPI_STONES.length).toBeGreaterThan(40);
    // Each ring's stones sit on its circle, give or take a rolled stone.
    for (const ring of SHARPTAIL_TIPI_RINGS) {
      const stones = SHARPTAIL_TIPI_STONES.filter(s => Math.hypot(s.x - ring.x, s.y - ring.y) * PROPERTY_PX_TO_M < ring.radius + 2);
      expect(stones.length).toBeGreaterThan(ring.radius * 4);
    }
  });

  it('makes the claim shack solid to walk into and to shoot through', () => {
    const landscape = new LandscapeModel(area), ctx = ctxFor(), ranch = new SharptailRanchSystem(landscape);
    ranch.init(ctx);
    const shack = landscape.propertyToWorld(SHARPTAIL_HOMESTEAD.x, SHARPTAIL_HOMESTEAD.y, { x: 0, z: 0 });
    expect(ranch.collisionCircles().some(c => Math.hypot(c.x - shack.x, c.z - shack.z) < .1 && c.radius > 2)).toBe(true);
    const y = landscape.heightAtWorld(shack.x, shack.z) + 1.4;
    // Across the standing west gable end.
    expect(ranch.blocksShot({ x: shack.x - 12, y, z: shack.z - 4 }, { x: shack.x + 12, y, z: shack.z + 4 })).toBe(true);
    expect(ranch.blocksShot({ x: shack.x - 12, y: y + 12, z: shack.z }, { x: shack.x + 12, y: y + 12, z: shack.z })).toBe(false);
    ranch.dispose(ctx);
    expect(ranch.blocksShot({ x: shack.x - 12, y, z: shack.z }, { x: shack.x + 12, y, z: shack.z })).toBe(false);
  });
});
