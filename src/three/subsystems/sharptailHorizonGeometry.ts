import * as THREE from 'three';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';

type GroundPaint = (landscape: LandscapeModel, x: number, y: number, out: THREE.Color) => THREE.Color;

function axis(start: number, end: number, divisions: number): number[] {
  return Array.from({ length: divisions + 1 }, (_, i) => i === divisions ? end : start + (end - start) * i / divisions);
}

interface HorizonGrid {
  side: string;
  x: number[];
  y: number[];
  worldX: Float32Array;
  worldZ: Float32Array;
  heights: Map<number, number>;
}
const gridsByLandscape = new WeakMap<LandscapeModel, HorizonGrid[]>();

function horizonGrids(landscape: LandscapeModel): HorizonGrid[] {
  const saved = gridsByLandscape.get(landscape);
  if (saved) return saved;
  const bounds = landscape.area.world, margin = 1000;
  const west = axis(bounds.x - margin, bounds.x, 42);
  const middle = axis(bounds.x, bounds.x + bounds.w, 56);
  const east = axis(bounds.x + bounds.w, bounds.x + bounds.w + margin, 42);
  const across = [...west, ...middle.slice(1), ...east.slice(1)];
  const north = axis(bounds.y - margin, bounds.y, 42);
  const inside = axis(bounds.y, bounds.y + bounds.h, 32);
  const south = axis(bounds.y + bounds.h, bounds.y + bounds.h + margin, 42);
  const point = { x: 0, z: 0 };
  const grids = [
    { side: 'north', x: across, y: north },
    { side: 'south', x: across, y: south },
    { side: 'west', x: west, y: inside },
    { side: 'east', x: east, y: inside },
  ].map(grid => ({ ...grid,
    worldX: Float32Array.from(grid.x, x => landscape.propertyToWorld(x, 0, point).x),
    worldZ: Float32Array.from(grid.y, y => landscape.propertyToWorld(0, y, point).z),
    heights: new Map<number, number>(),
  }));
  gridsByLandscape.set(landscape, grids);
  return grids;
}

function gridHeight(landscape: LandscapeModel, grid: HorizonGrid, x: number, y: number): number {
  const key = y * grid.x.length + x;
  let height = grid.heights.get(key);
  if (height === undefined) {
    height = Math.fround(landscape.heightAtProperty(grid.x[x], grid.y[y]));
    grid.heights.set(key, height);
  }
  return height;
}

function cellAt(axis: Float32Array, value: number): number {
  let low = 0, high = axis.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (value < axis[middle]) high = middle; else low = middle;
  }
  return low;
}

export interface SharptailHorizonSurface { height: number; gradeX: number; gradeZ: number }
const surfaceWorld = { x: 0, z: 0 };

/** Sample the rendered Float32 triangle, including its geometric plane.
 * Property-yard inputs; height is metres and grades are metres/metre.
 * Returns false inside the property or beyond the exterior strips, leaving
 * out unchanged. Shared cached grid corners avoid building/raycasting meshes
 * for each decorative root. The playable landscape is never modified. */
export function sampleSharptailHorizonSurface(
  landscape: LandscapeModel, x: number, y: number, out: SharptailHorizonSurface,
): boolean {
  const bounds = landscape.area.world;
  if (landscape.area.id !== 'sharptail-prairie' || !Number.isFinite(x) || !Number.isFinite(y)
    || x < bounds.x - 1000 || x > bounds.x + bounds.w + 1000
    || y < bounds.y - 1000 || y > bounds.y + bounds.h + 1000
    || (x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h)) return false;
  const grids = horizonGrids(landscape);
  const grid = grids[y < bounds.y ? 0 : y > bounds.y + bounds.h ? 1 : x < bounds.x ? 2 : 3];
  landscape.propertyToWorld(x, y, surfaceWorld);
  // Instance transforms are also Float32, so their contact point shares
  // the same final X/Z rounding as the uploaded horizon vertices.
  const worldX = Math.fround(surfaceWorld.x), worldZ = Math.fround(surfaceWorld.z);
  const ix = cellAt(grid.worldX, worldX), iz = cellAt(grid.worldZ, worldZ);
  const dx = grid.worldX[ix + 1] - grid.worldX[ix], dz = grid.worldZ[iz + 1] - grid.worldZ[iz];
  const u = THREE.MathUtils.clamp((worldX - grid.worldX[ix]) / dx, 0, 1);
  const v = THREE.MathUtils.clamp((worldZ - grid.worldZ[iz]) / dz, 0, 1);
  const h10 = gridHeight(landscape, grid, ix + 1, iz), h01 = gridHeight(landscape, grid, ix, iz + 1);
  if (u + v <= 1) {
    const h00 = gridHeight(landscape, grid, ix, iz);
    out.gradeX = (h10 - h00) / dx; out.gradeZ = (h01 - h00) / dz;
    out.height = h00 + u * (h10 - h00) + v * (h01 - h00);
  } else {
    const h11 = gridHeight(landscape, grid, ix + 1, iz + 1);
    out.gradeX = (h11 - h01) / dx; out.gradeZ = (h11 - h10) / dz;
    out.height = h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }
  return true;
}

/** Four exterior strips share complete edge samples, not just corner points.
 * The old unequal grids required vertical skirts along visible hillsides.
 * Matching those edges removes the ledge itself; no interior skirt is drawn.
 * Heights and paint remain the same authoritative property-space functions.
 */
export function buildSharptailHorizonGeometries(landscape: LandscapeModel, paint: GroundPaint): THREE.BufferGeometry[] {
  const grids = horizonGrids(landscape);
  const world = { x: 0, z: 0 }, color = new THREE.Color();
  const normal = new THREE.Vector3();
  return grids.map(grid => {
    const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
    for (const [iy, y] of grid.y.entries()) for (const [ix, x] of grid.x.entries()) {
      landscape.propertyToWorld(x, y, world);
      positions.push(world.x, gridHeight(landscape, grid, ix, iy), world.z);
      // A one-yard central difference has the same stencil on either side
      // of a mesh join. Mesh-local face averaging would leave a light seam.
      const dx = (landscape.heightAtProperty(x + .5, y) - landscape.heightAtProperty(x - .5, y)) / PROPERTY_PX_TO_M;
      const dz = (landscape.heightAtProperty(x, y + .5) - landscape.heightAtProperty(x, y - .5)) / PROPERTY_PX_TO_M;
      normal.set(-dx, 1, -dz).normalize(); normals.push(normal.x, normal.y, normal.z);
      paint(landscape, x, y, color); colors.push(color.r, color.g, color.b);
    }
    const columns = grid.x.length;
    for (let z = 0; z < grid.y.length - 1; z++) for (let x = 0; x < columns - 1; x++) {
      const a = z * columns + x, b = a + columns;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    geometry.name = `Sharptail ${grid.side} horizon`;
    return geometry;
  });
}
