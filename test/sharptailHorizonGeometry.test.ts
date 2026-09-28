import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { PropertyTerrain } from '../src/three/subsystems/propertyTerrain';
import { buildSharptailHorizonGeometries, sampleSharptailHorizonSurface } from '../src/three/subsystems/sharptailHorizonGeometry';

const area = getArea('sharptail-prairie');

function build(entry = 'west-track') {
  const landscape = new LandscapeModel(area, entry), terrain = new PropertyTerrain(landscape);
  const surface = terrain.prairieCanopySurface()!;
  const geometries = buildSharptailHorizonGeometries(landscape, (_landscape, x, y, out) => surface.paint(x, y, out));
  surface.material.dispose();
  terrain.dispose({ scene: new THREE.Scene() } as Parameters<PropertyTerrain['dispose']>[0]);
  return { landscape, geometries };
}

function edge(geometry: THREE.BufferGeometry, worldZ: number, minX: number, maxX: number): number[][] {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), colors = geometry.getAttribute('color');
  const vertices: number[][] = [];
  for (let i = 0; i < positions.count; i++) {
    if (positions.getZ(i) !== worldZ || positions.getX(i) < minX || positions.getX(i) > maxX) continue;
    vertices.push([positions.getX(i), positions.getY(i), positions.getZ(i),
      normals.getX(i), normals.getY(i), normals.getZ(i), colors.getX(i), colors.getY(i), colors.getZ(i)]);
  }
  return vertices.sort((a, b) => a[0] - b[0]);
}

describe('joined Sharptail exterior terrain', () => {
  it.each(['west-track', 'south-gate'])('samples actual triangle heights and plane gradients without meshes at %s', entry => {
    const { landscape, geometries } = build(entry);
    const material = new THREE.MeshBasicMaterial(), meshes = geometries.map(geometry => new THREE.Mesh(geometry, material));
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    const world = { x: 0, z: 0 }, out = { height: 0, gradeX: 0, gradeZ: 0 };
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), bary = new THREE.Vector3();
    let heights = 0, planes = 0;
    try {
      // Include every exterior strip, joined edges, opposite cell triangles,
      // and the curved shoulder where analytic roots floated over a metre.
      for (const y of [-1000, -913.4, -.01, 0, 211.9, 614.8928, 800, 800.01, 1173.2, 1800]) {
        for (const x of [-1000, -841.3, -173.4528, -13.7, -.01, 412.3, 1400.01, 1713.9, 2400]) {
          if (!sampleSharptailHorizonSurface(landscape, x, y, out)) continue;
          landscape.propertyToWorld(x, y, world);
          ray.ray.origin.set(Math.fround(world.x), 1000, Math.fround(world.z));
          const hit = ray.intersectObjects(meshes, false)[0];
          expect(hit).toBeDefined();
          expect(out.height).toBeCloseTo(hit.point.y, 5); heights++;
          const positions = (hit.object as THREE.Mesh).geometry.getAttribute('position'), face = hit.face!;
          a.fromBufferAttribute(positions, face.a); b.fromBufferAttribute(positions, face.b); c.fromBufferAttribute(positions, face.c);
          THREE.Triangle.getBarycoord(hit.point, a, b, c, bary);
          // On a shared edge either face can legitimately own the ray hit.
          if (Math.min(bary.x, bary.y, bary.z) > .00001) {
            expect(out.gradeX).toBeCloseTo(-face.normal.x / face.normal.y, 5);
            expect(out.gradeZ).toBeCloseTo(-face.normal.z / face.normal.y, 5); planes++;
          }
        }
      }
      expect(heights).toBeGreaterThan(70); expect(planes).toBeGreaterThan(30);
      for (const [x, y] of [[0, 0], [100, 500], [1400, 800], [-1001, 400], [500, 1801], [NaN, 0]]) {
        out.height = 42; out.gradeX = 12; out.gradeZ = 6;
        expect(sampleSharptailHorizonSurface(landscape, x, y, out)).toBe(false);
        expect(out).toEqual({ height: 42, gradeX: 12, gradeZ: 6 });
      }
    } finally { geometries.forEach(geometry => geometry.dispose()); material.dispose(); }
  });

  it('shares every position, lighting normal and ground color along all four strip joins', () => {
    const { landscape, geometries } = build();
    const [north, south, west, east] = geometries;
    for (const y of [area.world.y, area.world.y + area.world.h]) {
      for (const [min, max, side] of [[-1000, 0, west], [1400, 2400, east]] as const) {
        const a = landscape.propertyToWorld(min, y, { x: 0, z: 0 });
        const b = landscape.propertyToWorld(max, y, { x: 0, z: 0 });
        const horizontal = y === area.world.y ? north : south;
        const across = edge(horizontal, Math.fround(a.z), Math.fround(a.x), Math.fround(b.x));
        const along = edge(side, Math.fround(a.z), Math.fround(a.x), Math.fround(b.x));
        expect(across.length).toBeGreaterThan(30);
        expect(across).toEqual(along);
      }
    }
    geometries.forEach(geometry => geometry.dispose());
  });

  it('covers the exterior with bounded cells and no vertical skirt faces within four draw calls', () => {
    const { landscape, geometries } = build();
    let triangles = 0, minProjectedArea = Infinity, maxCellSpan = 0, projectedArea = 0;
    let maxGroundError = 0, maxNormalError = 0, minUp = Infinity, finite = true;
    const property = { x: 0, y: 0 };
    for (const geometry of geometries) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), index = geometry.index!;
      triangles += index.count / 3;
      for (let i = 0; i < p.count; i++) {
        landscape.worldToProperty(p.getX(i), p.getZ(i), property);
        const expected = landscape.heightAtProperty(property.x, property.y);
        maxGroundError = Math.max(maxGroundError, Math.abs(p.getY(i) - expected));
        maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1));
        minUp = Math.min(minUp, n.getY(i));
        finite &&= [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)].every(Number.isFinite);
        expect(property.x <= area.world.x + .001 || property.x >= area.world.x + area.world.w - .001
          || property.y <= area.world.y + .001 || property.y >= area.world.y + area.world.h - .001).toBe(true);
      }
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        const x = [p.getX(a), p.getX(b), p.getX(c)], z = [p.getZ(a), p.getZ(b), p.getZ(c)];
        const twiceArea = (z[1] - z[0]) * (x[2] - x[0]) - (x[1] - x[0]) * (z[2] - z[0]);
        minProjectedArea = Math.min(minProjectedArea, twiceArea);
        projectedArea += twiceArea / 2;
        maxCellSpan = Math.max(maxCellSpan, Math.max(...x) - Math.min(...x), Math.max(...z) - Math.min(...z));
      }
    }
    expect(geometries).toHaveLength(4);
    expect(triangles).toBeLessThan(32000);
    expect(maxCellSpan / PROPERTY_PX_TO_M).toBeLessThan(30);
    // A seam skirt would have zero projected area, and therefore fail this
    // test even if another deeper skirt happened to conceal its edge gap.
    expect(minProjectedArea).toBeGreaterThan(0);
    const bounds = area.world;
    const expectedArea = ((bounds.w + 2000) * (bounds.h + 2000) - bounds.w * bounds.h) * PROPERTY_PX_TO_M ** 2;
    expect(Math.abs(projectedArea - expectedArea) / expectedArea).toBeLessThan(1e-6);
    expect(finite).toBe(true);
    expect(maxGroundError).toBeLessThan(.001);
    expect(maxNormalError).toBeLessThan(1e-6);
    expect(minUp).toBeGreaterThan(0);
    geometries.forEach(geometry => geometry.dispose());
  });

  it('preserves the same exterior surface and shading when entering from another parking place', () => {
    const west = build('west-track'), south = build('south-gate');
    let heightError = 0, positionError = 0;
    const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
    for (let strip = 0; strip < west.geometries.length; strip++) {
      const first = west.geometries[strip], second = south.geometries[strip];
      expect(first.index!.array).toEqual(second.index!.array);
      expect(first.getAttribute('normal').array).toEqual(second.getAttribute('normal').array);
      expect(first.getAttribute('color').array).toEqual(second.getAttribute('color').array);
      const p = first.getAttribute('position'), q = second.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        west.landscape.worldToProperty(p.getX(i), p.getZ(i), a);
        south.landscape.worldToProperty(q.getX(i), q.getZ(i), b);
        heightError = Math.max(heightError, Math.abs(p.getY(i) - q.getY(i)));
        positionError = Math.max(positionError, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      }
    }
    expect(heightError).toBe(0);
    expect(positionError).toBeLessThan(.001);
    [...west.geometries, ...south.geometries].forEach(geometry => geometry.dispose());
  });
});
