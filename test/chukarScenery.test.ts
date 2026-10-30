import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { CHUKAR_RIVER_LEVEL, chukarRiverY, chukarRimModules } from '../src/game/chukarCanyon';
import { CHUKAR_PLACES } from '../src/game/chukarRidge';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { chukarGrassGeometry, chukarSageGeometry } from '../src/three/assets/chukarPlants';
import { CHUKAR_SAGE_TONES, ChukarEnvironmentSystem, chukarTrackDistance } from '../src/three/subsystems/chukarEnvironment';
import { chukarRimModuleGeometry, chukarRimSlabGeometry } from '../src/three/subsystems/chukarRimrock';
import { CHUKAR_GROUND_DETAIL, buildChukarHorizonGeometry, chukarHorizonStrips, createChukarRiver } from '../src/three/subsystems/chukarTerrain';
import { groundQuailTrackGeometry, quailGroundTileAt } from '../src/three/subsystems/quailGroundGeometry';
import { buildQuailTerrainGeometry } from '../src/three/subsystems/quailTerrain';

const area = getArea('chukar-ridge'), landscape = new LandscapeModel(area);

describe('Chukar Ridge scenery', () => {
  it('builds the remembered places solid, and the rimrock stops the hunter and the shot', async () => {
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', time: 0, timeOfDay: 'morning', paused: true,
      events: new EventTarget(), renderer: { domElement: new EventTarget() } } as unknown as Ctx;
    const environment = new ChukarEnvironmentSystem(landscape);
    await environment.init(ctx);
    for (const name of ['Chukar sheepherder cairn', 'Chukar juniper snag', 'Chukar wildlife guzzler', 'Chukar spring seep', 'Chukar seep willows',
      'Chukar line camp corral', 'Chukar cabin chimney', 'Chukar split rock', 'Chukar contour cattle trails'])
      expect(ctx.scene.getObjectByName(name), name).toBeDefined();
    const slabs = ctx.scene.getObjectByName('Chukar rim slabs (far)') as THREE.InstancedMesh;
    expect(slabs.count).toBe(chukarRimModules().length);
    const guzzler = landscape.propertyToWorld(CHUKAR_PLACES.guzzler.x, CHUKAR_PLACES.guzzler.y, { x: 0, z: 0 });
    expect(environment.collisionCircles().filter(c => Math.hypot(c.x - guzzler.x, c.z - guzzler.z) < 8).length).toBeGreaterThan(30);
    expect(environment.collisionCircles().length).toBeGreaterThan(chukarRimModules().length);
    const cairn = landscape.propertyToWorld(CHUKAR_PLACES.cairn.x, CHUKAR_PLACES.cairn.y, { x: 0, z: 0 });
    const y = landscape.heightAtWorld(cairn.x, cairn.z) + 1.2;
    expect(environment.blocksShot({ x: cairn.x - 8, y, z: cairn.z }, { x: cairn.x + 8, y, z: cairn.z })).toBe(true);
    expect(environment.blocksShot({ x: cairn.x - 8, y: y + 5, z: cairn.z }, { x: cairn.x + 8, y: y + 5, z: cairn.z })).toBe(false);
    // A shot level through the middle of an intact rim face hits basalt.
    const rim = chukarRimModules().find(m => m.decay === 0 && m.jut === 0)!;
    const mid = landscape.propertyToWorld(rim.x, rim.y, { x: 0, z: 0 }), half = (rim.top + rim.foot) / 2;
    expect(environment.blocksShot({ x: mid.x + rim.nx * 9, y: half, z: mid.z + rim.ny * 9 }, { x: mid.x - rim.nx * 9, y: half, z: mid.z - rim.ny * 9 })).toBe(true);
    // Places stay off the paths; plants stream in around the hunter.
    for (const place of [CHUKAR_PLACES.cairn, CHUKAR_PLACES.guzzler, CHUKAR_PLACES.corral, CHUKAR_PLACES.chimney]) expect(chukarTrackDistance(area, place.x, place.y)).toBeGreaterThan(6);
    expect(environment.stats().tiles).toBeGreaterThan(0);
    environment.dispose(ctx);
  }, 120_000);

  it('builds columnar basalt within its triangle budget, cheaper on Lightweight', () => {
    const counts = (['high', 'lite'] as const).map(q => [0, 1, 2].map(v => { const g = chukarRimModuleGeometry(v, q), n = g.getAttribute('position').count / 3; g.dispose(); return n; }));
    for (const n of counts[0]) expect(n).toBeLessThanOrEqual(260);
    for (const [i, n] of counts[1].entries()) expect(n).toBeLessThan(counts[0][i] * .7);
    const slab = chukarRimSlabGeometry();
    expect(slab.getAttribute('position').count / 3).toBeLessThanOrEqual(12);
    slab.computeBoundingBox();
    // The far slab hides inside the columns: no wider than a module.
    expect(slab.boundingBox!.max.y).toBeLessThan(1);
    slab.dispose();
  });

  it('greys the sage: silver, not saturated green', () => {
    const hsl = { h: 0, s: 0, l: 0 };
    for (const tone of CHUKAR_SAGE_TONES) {
      new THREE.Color(tone).getHSL(hsl, THREE.SRGBColorSpace);
      expect(hsl.s).toBeLessThan(.12);
      expect(hsl.l).toBeGreaterThan(.38); expect(hsl.l).toBeLessThan(.6);
    }
  });

  it.each([chukarGrassGeometry, chukarSageGeometry])('reduces distant plant geometry while retaining height and spread', make => {
    const close = make(false), distant = make(true); close.computeBoundingBox(); distant.computeBoundingBox();
    const a = close.boundingBox!.getSize(new THREE.Vector3()), b = distant.boundingBox!.getSize(new THREE.Vector3());
    expect(distant.getAttribute('position').count).toBeLessThan(close.getAttribute('position').count * .6);
    expect(close.getAttribute('position').count / 3).toBeLessThan(500);
    expect(Math.abs(a.y - b.y)).toBeLessThan(.2); expect(Math.abs(a.x - b.x)).toBeLessThan(.35); expect(Math.abs(a.z - b.z)).toBeLessThan(.35);
    close.dispose(); distant.dispose();
  });

  it.each(['high', 'lite'] as const)('keeps the paths on actual %s terrain triangles at both distances', quality => {
    const source = new THREE.BufferGeometry(), positions: number[] = [];
    const trail = area.trails.find(t => t.id === 'river-road-climb')!;
    for (const p of [trail.points[3], trail.points[20], trail.points[60]]) for (const [dx, dy] of [[0, 0], [.65, 0], [0, .7]]) {
      const w = landscape.propertyToWorld(p.x + dx, p.y + dy, { x: 0, z: 0 }); positions.push(w.x, 0, w.z);
    }
    source.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    source.setAttribute('color', new THREE.Float32BufferAttribute(Array(positions.length / 3 * 4).fill(1), 4));
    source.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
    const detail = CHUKAR_GROUND_DETAIL[quality], road = groundQuailTrackGeometry(landscape, source, detail);
    const p = road.getAttribute('position'), far = road.getAttribute('quailFarGround');
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), ray = new THREE.Raycaster();
    for (const level of ['near', 'far'] as const) for (let i = 0; i < p.count; i++) {
      const property = landscape.worldToProperty(p.getX(i), p.getZ(i), { x: 0, y: 0 });
      const tile = quailGroundTileAt(landscape, property.x, property.y);
      const geometry = buildQuailTerrainGeometry(landscape, tile.x, tile.y, tile.width, tile.depth, detail[level]);
      const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(p.getX(i), 1000, p.getZ(i)), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0]; expect(hit).toBeDefined();
      expect((level === 'near' ? p.getY(i) : far.getX(i)) - hit.point.y).toBeCloseTo(.032, 4); geometry.dispose();
    }
    source.dispose(); road.dispose(); material.dispose();
  });
});

describe('Chukar Ridge beyond the fence', () => {
  it('samples the authoritative surface in both tiers within a bounded horizon budget', () => {
    const totals: number[] = [];
    for (const quality of ['high', 'lite'] as const) {
      let triangles = 0;
      for (const [x, y, w, h] of chukarHorizonStrips(area.world)) {
        const geometry = buildChukarHorizonGeometry(landscape, x, y, w, h, CHUKAR_GROUND_DETAIL[quality].horizonSpacing);
        const vertices = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
        for (let i = 0; i < vertices.count; i += 41) {
          expect(Number.isFinite(vertices.getY(i))).toBe(true);
          expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 4);
          const property = landscape.worldToProperty(vertices.getX(i), vertices.getZ(i), { x: 0, y: 0 });
          const offset = landscape.heightAtProperty(property.x, property.y) - vertices.getY(i);
          expect(Math.min(Math.abs(offset), Math.abs(offset - 3))).toBeLessThan(.002);
        }
        triangles += vertices.count / 3; geometry.dispose();
      }
      totals.push(triangles);
    }
    expect(totals[0]).toBeLessThan(110_000); expect(totals[1]).toBeLessThan(totals[0] * .5);
  });

  it('lays the river in the canyon floor below the property, where the land meets it', () => {
    const river = createChukarRiver(landscape), p = river.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 9) {
      expect(p.getY(i)).toBeCloseTo(CHUKAR_RIVER_LEVEL, 4);
      const property = landscape.worldToProperty(p.getX(i), p.getZ(i), { x: 0, y: 0 });
      expect(property.y).toBeGreaterThan(area.world.y + area.world.h);
      expect(Math.abs(property.y - chukarRiverY(property.x))).toBeLessThan(40);
      // The canyon floor at the river's edge sits just under the water.
      expect(landscape.heightAtProperty(property.x, chukarRiverY(property.x))).toBeLessThan(CHUKAR_RIVER_LEVEL + .5);
    }
    river.geometry.dispose(); (river.material as THREE.Material).dispose();
  });
});
