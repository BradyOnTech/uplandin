import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { quailCoverAt } from '../src/game/quailLandscape';
import { QUAIL_COVERTS, quailPlumAt } from '../src/game/quailComposition';
import {
  QUAIL_BURN, QUAIL_CREEK, QUAIL_FIREBREAK, QUAIL_OLD_FENCE, QUAIL_RAKE, quailBurnAt, quailCreekAt, quailFeatureBare,
} from '../src/game/quailFeatures';
import type { Ctx } from '../src/three/engine';
import { QuailEnvironmentSystem } from '../src/three/subsystems/quailEnvironment';
import { quailTrackDistanceAt } from '../src/three/subsystems/quailTracks';

const area = getArea('quail-fields');

describe('Quail Fields history', () => {
  it('grows the old line fence into a real plum covert birds can use', () => {
    const covert = QUAIL_COVERTS.find(c => c.id === 'old-fence-plum')!;
    expect(covert.points).toEqual(QUAIL_OLD_FENCE);
    for (const point of QUAIL_OLD_FENCE) {
      expect(quailCoverAt(area, point.x, point.y)).toBe(1);
      expect(quailPlumAt(point.x, point.y)).toBeGreaterThan(.5);
      expect(quailTrackDistanceAt(area, point.x, point.y, 40)).toBeGreaterThan(25);
    }
    // The rake sits in the plums by the fence, off every track.
    expect(quailCoverAt(area, QUAIL_RAKE.x, QUAIL_RAKE.y)).toBe(1);
    expect(quailTrackDistanceAt(area, QUAIL_RAKE.x, QUAIL_RAKE.y, 40)).toBeGreaterThan(20);
  });

  it('cuts the dry creek into the draw without crossing a track, and keeps grass off its sand', () => {
    const landscape = new LandscapeModel(area);
    for (const point of QUAIL_CREEK) {
      expect(quailTrackDistanceAt(area, point.x, point.y, 30)).toBeGreaterThan(12);
      expect(quailCreekAt(point.x, point.y)).toBe(1);
      expect(quailFeatureBare(point.x, point.y)).toBe(1);
    }
    // The bed lies lower than the ground a few yards to either side.
    const mid = QUAIL_CREEK[Math.floor(QUAIL_CREEK.length / 2)];
    const bed = landscape.heightAtProperty(mid.x, mid.y);
    const banks = [-6, 6].map(offset => landscape.heightAtProperty(mid.x, mid.y + offset));
    expect(Math.min(...banks)).toBeGreaterThan(bed);
  });

  it('keeps the burn in open grass beside the return, with its firebreak toward the trail', () => {
    expect(quailBurnAt(QUAIL_BURN.x, QUAIL_BURN.y)).toBe(1);
    expect(quailBurnAt(QUAIL_BURN.x + QUAIL_BURN.rx * 1.4, QUAIL_BURN.y)).toBe(0);
    for (let a = 0; a < Math.PI * 2; a += .3) {
      const x = QUAIL_BURN.x + Math.cos(a) * QUAIL_BURN.rx * .8, y = QUAIL_BURN.y + Math.sin(a) * QUAIL_BURN.ry * .8;
      expect(quailCoverAt(area, x, y)).toBe(0);
      expect(quailTrackDistanceAt(area, x, y, 30)).toBeGreaterThan(10);
    }
    for (const point of QUAIL_FIREBREAK) {
      expect(quailBurnAt(point.x, point.y)).toBeLessThan(.5);
      expect(point.y).toBeLessThan(QUAIL_BURN.y);
    }
  });

  it('builds the fence, rake, creek and burn, and the rake stops shot', () => {
    const landscape = new LandscapeModel(area);
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', time: 0, paused: true,
      events: new EventTarget(), renderer: { domElement: new EventTarget() } } as unknown as Ctx;
    const environment = new QuailEnvironmentSystem(landscape);
    environment.init(ctx);
    for (const name of ['Quail old line fence', 'Quail dump rake', 'Quail dry creek bed', 'Quail prescribed burn', 'Quail burn firebreak'])
      expect(ctx.scene.getObjectByName(name), name).toBeDefined();
    const rake = landscape.propertyToWorld(QUAIL_RAKE.x, QUAIL_RAKE.y, { x: 0, z: 0 });
    expect(environment.collisionCircles().some(c => Math.hypot(c.x - rake.x, c.z - rake.z) < .1)).toBe(true);
    const y = landscape.heightAtWorld(rake.x, rake.z) + .7;
    const along = { x: Math.cos(QUAIL_RAKE.angle), z: Math.sin(QUAIL_RAKE.angle) };
    // Through a wheel's hub, along the axle.
    expect(environment.blocksShot({ x: rake.x - along.x * 6, y, z: rake.z - along.z * 6 }, { x: rake.x + along.x * 6, y, z: rake.z + along.z * 6 })).toBe(true);
    environment.dispose(ctx);
  }, 60_000);
});
