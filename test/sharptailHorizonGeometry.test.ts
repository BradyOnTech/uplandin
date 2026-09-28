import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { PropertyTerrain } from '../src/three/subsystems/propertyTerrain';
import { buildSharptailHorizonGeometries } from '../src/three/subsystems/sharptailHorizonGeometry';

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
