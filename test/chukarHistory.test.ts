import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import {
  CHUKAR_GUZZLER, CHUKAR_JUNIPER_SNAG, CHUKAR_SEEP, CHUKAR_SEEP_COVER, CHUKAR_SHEEP_CAIRN, CHUKAR_TALUS_FANS,
  chukarFeatureOccupies, chukarSeepAt, chukarTalusFanAt,
} from '../src/game/chukarFeatures';
import type { Ctx } from '../src/three/engine';
import { ChukarEnvironmentSystem, chukarTrackDistance } from '../src/three/subsystems/chukarEnvironment';

vi.mock('../src/three/assets/chukarKit', () => ({ loadChukarKit: async () => [0, 1, 2].map(() => new THREE.BoxGeometry(1, 1, 1)) }));
const area = getArea('chukar-ridge');

describe('Chukar Ridge remembered places', () => {
  it('runs the seep down the bench below the shoulder, with a pocket of cover where chukar water', () => {
    for (const point of CHUKAR_SEEP) expect(chukarSeepAt(point.x, point.y)).toBe(1);
    expect(chukarSeepAt(CHUKAR_SEEP[2].x + 30, CHUKAR_SEEP[2].y)).toBe(0);
    // Close enough to the switchback to be seen from it, never across it.
    const nearest = Math.min(...CHUKAR_SEEP.map(p => chukarTrackDistance(area, p.x, p.y)));
    expect(nearest).toBeGreaterThan(8); expect(nearest).toBeLessThan(40);
    const cx = CHUKAR_SEEP_COVER.x + CHUKAR_SEEP_COVER.w / 2, cy = CHUKAR_SEEP_COVER.y + CHUKAR_SEEP_COVER.h / 2;
    expect(area.patches.some(p => cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h)).toBe(true);
  });

  it('spills the talus fans below the big rims and stops them short of the trail', () => {
    for (const fan of CHUKAR_TALUS_FANS) {
      expect(chukarTalusFanAt((fan.apex.x + fan.toe.x) / 2, (fan.apex.y + fan.toe.y) / 2)).toBeGreaterThan(.9);
      expect(chukarTrackDistance(area, fan.toe.x, fan.toe.y)).toBeGreaterThan(8);
    }
    const landscape = new LandscapeModel(area);
    // Each fan runs downhill from its chute.
    for (const fan of CHUKAR_TALUS_FANS) expect(landscape.heightAtProperty(fan.apex.x, fan.apex.y)).toBeGreaterThan(landscape.heightAtProperty(fan.toe.x, fan.toe.y));
  });

  it('keeps the cairn, snag and guzzler off the paths and out of plant placement', () => {
    for (const site of [CHUKAR_SHEEP_CAIRN, CHUKAR_JUNIPER_SNAG, CHUKAR_GUZZLER]) {
      expect(chukarTrackDistance(area, site.x, site.y)).toBeGreaterThan(20);
      expect(chukarFeatureOccupies(site.x, site.y, .2)).toBe(true);
    }
    const landscape = new LandscapeModel(area), sample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
    landscape.surfaceAtProperty(CHUKAR_GUZZLER.x, CHUKAR_GUZZLER.y, sample);
    // A guzzler apron wants a gentle bench.
    expect(sample.slope).toBeLessThan(.2);
  });

  it('builds them solid: the fence keeps the hunter out of the guzzler and the cairn stops shot', async () => {
    const landscape = new LandscapeModel(area);
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', time: 0, timeOfDay: 'morning', paused: true,
      events: new EventTarget(), renderer: { domElement: new EventTarget() } } as unknown as Ctx;
    const environment = new ChukarEnvironmentSystem(landscape);
    await environment.init(ctx);
    for (const name of ['Chukar sheepherder cairn', 'Chukar juniper snag', 'Chukar wildlife guzzler', 'Chukar spring seep', 'Chukar seep willows'])
      expect(ctx.scene.getObjectByName(name), name).toBeDefined();
    const guzzler = landscape.propertyToWorld(CHUKAR_GUZZLER.x, CHUKAR_GUZZLER.y, { x: 0, z: 0 });
    const fence = environment.collisionCircles().filter(c => Math.hypot(c.x - guzzler.x, c.z - guzzler.z) < 8);
    expect(fence.length).toBeGreaterThan(30);
    const cairn = landscape.propertyToWorld(CHUKAR_SHEEP_CAIRN.x, CHUKAR_SHEEP_CAIRN.y, { x: 0, z: 0 });
    const y = landscape.heightAtWorld(cairn.x, cairn.z) + 1.2;
    expect(environment.blocksShot({ x: cairn.x - 8, y, z: cairn.z }, { x: cairn.x + 8, y, z: cairn.z })).toBe(true);
    expect(environment.blocksShot({ x: cairn.x - 8, y: y + 5, z: cairn.z }, { x: cairn.x + 8, y: y + 5, z: cairn.z })).toBe(false);
    environment.dispose(ctx);
  }, 60_000);
});
