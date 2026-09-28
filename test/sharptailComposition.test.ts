import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { SHARPTAIL_COVER_PATCHES, sharptailGroundZones } from '../src/game/sharptailLandscape';
import type { Ctx, Quality } from '../src/three/engine';
import { GrassSystem } from '../src/three/subsystems/grass';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';
import { SharptailSwardField } from '../src/three/subsystems/sharptailSward';
import { sharptailGrassGeometry } from '../src/three/subsystems/sharptailGrass';
import { sharptailShrubGeometry, sharptailTreeGeometry } from '../src/three/subsystems/sharptailWoody';
import { SHARPTAIL_MID_SWARD_BUDGET } from '../src/three/subsystems/sharptailMidSward';

const area = getArea('sharptail-prairie');

describe('Sharptail full-property native sward', () => {
  it('bounds the richer field geometry while retaining its rooted wind contract', () => {
    for (const kind of ['short', 'stalk', 'cover'] as const) {
      const geometry = sharptailGrassGeometry(kind);
      const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      expect(position.count / 3).toBeLessThanOrEqual(kind === 'cover' ? 148 : 56);
      expect(uv.count).toBe(position.count);
      let roots = 0, tips = 0;
      for (let i = 0; i < position.count; i++) {
        expect(uv.getY(i)).toBeGreaterThanOrEqual(0); expect(uv.getY(i)).toBeLessThanOrEqual(1);
        if (uv.getY(i) === 0) { roots++; expect(Math.abs(position.getY(i))).toBeLessThan(.05); }
        if (uv.getY(i) === 1) tips++;
      }
      expect(roots).toBeGreaterThan(0); expect(tips).toBeGreaterThan(0);
      geometry.dispose();
    }
  });
  it('keeps broad basal cover and a cheaper distant silhouette with the same height envelope', () => {
    const field = sharptailGrassGeometry('cover'), distant = sharptailGrassGeometry('cover', 'distant');
    const nearSize = field.boundingBox!.getSize(new THREE.Vector3());
    const farSize = distant.boundingBox!.getSize(new THREE.Vector3());
    expect(field.boundingBox!.min.y).toBe(0);
    expect(distant.boundingBox!.min.y).toBe(0);
    expect(nearSize.x).toBeGreaterThan(1.2);
    expect(nearSize.z).toBeGreaterThan(1.2);
    expect(farSize.y).toBeCloseTo(nearSize.y, 5);
    expect(farSize.x).toBeGreaterThan(nearSize.x * .7);
    expect(farSize.z).toBeGreaterThan(nearSize.z * .7);
    expect(distant.attributes.position.count / 3).toBeLessThanOrEqual(48);
    expect(distant.attributes.position.count).toBeLessThan(field.attributes.position.count * .5);
    field.dispose(); distant.dispose();
  });
  it('keeps physical relief and sward zones attached to the property across parking places', () => {
    const south = new LandscapeModel(area, 'south-gate'), west = new LandscapeModel(area, 'west-track');
    const a = new SharptailSwardField(south), b = new SharptailSwardField(west);
    for (const point of [{ x: 1190, y: 448 }, { x: 350, y: 374 }, { x: 625, y: 254 }, { x: 750, y: 620 }]) {
      const aw = south.propertyToWorld(point.x, point.y, { x: 0, z: 0 });
      const bw = west.propertyToWorld(point.x, point.y, { x: 0, z: 0 });
      expect(south.heightAtWorld(aw.x, aw.z)).toBeCloseTo(west.heightAtWorld(bw.x, bw.z), 8);
      const az = a.sample(aw.x, aw.z, { swale: 0, stand: 0 });
      const bz = b.sample(bw.x, bw.z, { swale: 0, stand: 0 });
      expect(az.swale).toBeCloseTo(bz.swale, 8); expect(az.stand).toBeCloseTo(bz.stand, 8);
      const exact = sharptailGroundZones(point.x, point.y, { swale: 0, stand: 0 });
      expect(Math.abs(az.swale - exact.swale)).toBeLessThan(.04);
      expect(Math.abs(az.stand - exact.stand)).toBeLessThan(.18);
      expect(a.edgeDistance(aw.x, aw.z)).toBeGreaterThan(0);
    }
    const outside = south.propertyToWorld(1401, 448, { x: 0, z: 0 });
    expect(a.edgeDistance(outside.x, outside.z)).toBeLessThan(0);
  });

  it('keeps broad native stands and accessible grades instead of a dense wooded corridor', () => {
    const landscape = new LandscapeModel(area);
    const surface = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
    for (const patch of SHARPTAIL_COVER_PATCHES) {
      expect(patch.w / patch.h).toBeGreaterThan(2);
      expect(area.patches).toContain(patch);
    }
    let min = Infinity, max = -Infinity;
    for (let x = 0; x <= 1400; x += 20) for (let y = 0; y <= 800; y += 20) {
      landscape.surfaceAtProperty(x, y, surface);
      expect(surface.slope).toBeLessThan(.4);
      min = Math.min(min, surface.height); max = Math.max(max, surface.height);
    }
    expect(max - min).toBeGreaterThan(30); expect(max - min).toBeLessThan(40);
    expect(area.speciesMix.map(share => share.speciesId)).toEqual(['sharptail', 'prairie-chicken', 'hun']);
  });

  it.each(['lite', 'high'] as const)('grows a bounded grass ring beyond the old entry plate on %s', quality => {
    const landscape = new LandscapeModel(area);
    const camera = new THREE.PerspectiveCamera();
    const point = landscape.propertyToWorld(1190, 448, { x: 0, z: 0 });
    expect(Math.abs(point.x)).toBeGreaterThan(235);
    camera.position.set(point.x, landscape.heightAtWorld(point.x, point.z) + 1.62, point.z);
    const hunt = {
      huntState: () => ({ areaId: area.id }),
      coverPatches: () => area.patches.map(p => {
        const center = landscape.propertyToWorld(p.x + p.w / 2, p.y + p.h / 2, { x: 0, z: 0 });
        return { cx: center.x, cz: center.z, hx: p.w * PROPERTY_PX_TO_M / 2, hz: p.h * PROPERTY_PX_TO_M / 2 };
      }),
    };
    const terrain = { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z), paintSeed: () => area.terrain.seed };
    const ctx = { scene: new THREE.Scene(), camera, quality, time: 0, timeOfDay: 'noon', events: new EventTarget(),
      get: (id: string) => { if (id === 'terrain') return terrain; if (id === 'hunt3d') return hunt; throw new Error(id); },
    } as unknown as Ctx;
    const grass = new GrassSystem(landscape); grass.init(ctx); grass.update(ctx);
    const meshes = ctx.scene.children as THREE.Mesh[];
    const ring = meshes.filter((mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh && mesh.instanceMatrix.usage === THREE.DynamicDrawUsage);
    const far = meshes.filter((mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh
      && mesh.userData.kind === 'sharptail-rooted-middle-sward');
    expect(ring.reduce((sum, mesh) => sum + mesh.count, 0)).toBeGreaterThan(4000);
    expect(ring.length).toBeLessThan(225);
    expect(far.length).toBeGreaterThan(0);
    const triangles = (mesh: THREE.InstancedMesh) =>
      (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * mesh.count;
    const storedTriangles = far.reduce((sum, mesh) => sum + triangles(mesh), 0);
    expect(storedTriangles).toBeGreaterThan(50000);
    expect(storedTriangles).toBeLessThanOrEqual(quality === 'lite'
      ? SHARPTAIL_MID_SWARD_BUDGET.liteTriangles : SHARPTAIL_MID_SWARD_BUDGET.highTriangles);
    expect(far.some(mesh => mesh.visible)).toBe(true);
    expect(far.some(mesh => !mesh.visible)).toBe(true);
    // Stored instances cover the whole prairie and western exterior. Count
    // the entire submitted chunks in actual views, not one shared base mesh.
    camera.fov = 70; camera.aspect = 16 / 9; camera.updateProjectionMatrix();
    const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4();
    let maximumSubmitted = 0;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
      camera.lookAt(point.x + Math.sin(angle) * 100, camera.position.y, point.z + Math.cos(angle) * 100);
      camera.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      maximumSubmitted = Math.max(maximumSubmitted, far.filter(mesh => mesh.visible && frustum.intersectsObject(mesh))
        .reduce((sum, mesh) => sum + triangles(mesh), 0));
    }
    expect(maximumSubmitted).toBeGreaterThan(1000);
    expect(maximumSubmitted).toBeLessThan(quality === 'lite' ? 104000 : 195000);
    const matrix = new THREE.Matrix4();
    for (const mesh of ring.filter(mesh => mesh.count > 0)) {
      mesh.getMatrixAt(0, matrix);
      const [x, y, z] = [matrix.elements[12], matrix.elements[13], matrix.elements[14]];
      expect(Math.hypot(x - point.x, z - point.z)).toBeLessThan(90);
      expect(Math.abs(y - landscape.heightAtWorld(x, z))).toBeLessThan(.09);
    }
    grass.dispose(ctx); expect(ctx.scene.children).toHaveLength(0);
  });
});

function woodyFixture(quality: Quality, fixtureArea = area) {
  const landscape = new LandscapeModel(fixtureArea);
  const system = new PropertyHabitatSystem(landscape);
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0 } as Ctx;
  system.init(ctx);
  return { system, ctx, landscape, meshes: ctx.scene.children as THREE.InstancedMesh[] };
}

describe('Sharptail shelterbelts', () => {
  it('uses slender deciduous crowns and readable open shrubs within bounded geometry budgets', () => {
    const { trunk, crown } = sharptailTreeGeometry(), shrub = sharptailShrubGeometry();
    const crownSize = crown.boundingBox!.getSize(new THREE.Vector3());
    const shrubSize = shrub.boundingBox!.getSize(new THREE.Vector3());
    expect(Math.max(crownSize.x, crownSize.z) / crownSize.y).toBeLessThan(.8);
    expect(trunk.attributes.position.count / 3 + crown.attributes.position.count / 3).toBeLessThanOrEqual(170);
    expect(shrub.attributes.position.count / 3).toBeLessThanOrEqual(260);
    expect(shrubSize.y).toBeGreaterThan(.6);
    expect(shrubSize.y).toBeLessThan(.9);
    expect(Math.max(shrubSize.x, shrubSize.z)).toBeGreaterThan(shrubSize.y * .9);
    expect(Math.max(shrubSize.x, shrubSize.z)).toBeLessThan(shrubSize.y * 1.5);
    expect(trunk.boundingBox!.min.y).toBeLessThanOrEqual(0);
    expect(Math.abs(shrub.boundingBox!.min.y)).toBeLessThan(.025);
    for (const geometry of [trunk, crown, shrub]) geometry.dispose();
  });
  it('rejects a whole tree when a route clears the trunk but would clip its crown', () => {
    const before = woodyFixture('lite'), matrix = new THREE.Matrix4();
    const trunks = before.meshes.find(mesh => mesh.name.includes('trunk'))!;
    trunks.getMatrixAt(0, matrix);
    const point = before.landscape.worldToProperty(matrix.elements[12], matrix.elements[14], { x: 0, y: 0 });
    const scale = new THREE.Vector3().setFromMatrixScale(matrix).y;
    // Between the former trunk-only radius and the crown footprint.
    const offset = (3.4 + scale * .82 * .775) / PROPERTY_PX_TO_M;
    const crossing = woodyFixture('lite', { ...area, trails: [...area.trails, {
      id: 'clearance-fixture', points: [{ x: point.x - 30, y: point.y + offset }, { x: point.x + 30, y: point.y + offset }],
    }] });
    const remainingTrunks = crossing.meshes.find(mesh => mesh.name.includes('trunk'))!;
    const remainingCrowns = crossing.meshes.find(mesh => mesh.name.includes('canopy'))!;
    expect(remainingTrunks.count).toBeLessThan(trunks.count);
    expect(remainingCrowns.count).toBe(remainingTrunks.count);
    expect(Array.from(remainingCrowns.instanceMatrix.array)).toEqual(Array.from(remainingTrunks.instanceMatrix.array));
    before.system.dispose(before.ctx); crossing.system.dispose(crossing.ctx);
  });
  it('keeps paired trees north of the Shack approaches with the same roots on both quality tiers', () => {
    const high = woodyFixture('high'), lite = woodyFixture('lite');
    const matrix = new THREE.Matrix4();
    for (const fixture of [high, lite]) {
      const trunks = fixture.meshes.find(mesh => mesh.name.includes('trunk'))!;
      const crowns = fixture.meshes.find(mesh => mesh.name.includes('canopy'))!;
      expect(trunks.count).toBeGreaterThan(30); expect(trunks.count).toBeLessThan(60);
      expect(crowns.count).toBe(trunks.count);
      expect(Array.from(crowns.instanceMatrix.array)).toEqual(Array.from(trunks.instanceMatrix.array));
      for (let i = 0; i < trunks.count; i++) {
        trunks.getMatrixAt(i, matrix);
        const point = fixture.landscape.worldToProperty(matrix.elements[12], matrix.elements[14], { x: 0, y: 0 });
        expect(point.y).toBeLessThan(300);
      }
    }
    const roots = (fixture: ReturnType<typeof woodyFixture>) => Array.from(fixture.meshes.find(mesh => mesh.name.includes('trunk'))!.instanceMatrix.array);
    expect(roots(lite)).toEqual(roots(high));
    for (const fixture of [high, lite]) fixture.system.dispose(fixture.ctx);
  });
});
