import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import type { Quality } from '../engine';

export const QUAIL_TERRAIN_TILE = 128;
export const QUAIL_GROUND_DIVISIONS = Object.freeze({ near: 64, far: 16 });
export const quailGroundNearDistance = (quality: Quality): number => quality === 'high' ? 145 : 105;
export interface QuailGroundTile {
  x: number; y: number; width: number; depth: number;
  centerX: number; centerZ: number;
}
const tiles = new WeakMap<LandscapeModel, QuailGroundTile[]>();

/** The renderer and road attributes use these same float32 world tile centers. */
export function quailGroundTiles(landscape: LandscapeModel): readonly QuailGroundTile[] {
  const saved = tiles.get(landscape); if (saved) return saved;
  const result: QuailGroundTile[] = []; const bounds = landscape.area.world;
  for (let y = bounds.y; y < bounds.y + bounds.h; y += QUAIL_TERRAIN_TILE) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x += QUAIL_TERRAIN_TILE) {
      const width = Math.min(QUAIL_TERRAIN_TILE, bounds.x + bounds.w - x);
      const depth = Math.min(QUAIL_TERRAIN_TILE, bounds.y + bounds.h - y);
      const center = landscape.propertyToWorld(x + width / 2, y + depth / 2, { x: 0, z: 0 });
      result.push({ x, y, width, depth, centerX: Math.fround(center.x), centerZ: Math.fround(center.z) });
    }
  }
  tiles.set(landscape, result); return result;
}

export function quailGroundTileAt(landscape: LandscapeModel, x: number, y: number): QuailGroundTile {
  const bounds = landscape.area.world;
  const columns = Math.ceil(bounds.w / QUAIL_TERRAIN_TILE), rows = Math.ceil(bounds.h / QUAIL_TERRAIN_TILE);
  const column = Math.max(0, Math.min(columns - 1, Math.floor((x - bounds.x) / QUAIL_TERRAIN_TILE)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((y - bounds.y) / QUAIL_TERRAIN_TILE)));
  return quailGroundTiles(landscape)[row * columns + column];
}

/** Strict comparison is mirrored by the road shader: equality selects far. */
export function quailGroundUsesNear(centerX: number, centerZ: number, cameraX: number, cameraZ: number, nearDistance: number): boolean {
  return Math.hypot(centerX - cameraX, centerZ - cameraZ) < nearDistance;
}

interface Grid { x: Float32Array; z: Float32Array; heights: Map<number, number>; divisions: number }
const grids = new WeakMap<QuailGroundTile, Map<number, Grid>>();
function gridFor(landscape: LandscapeModel, tile: QuailGroundTile, divisions: number): Grid {
  let levels = grids.get(tile); if (!levels) { levels = new Map(); grids.set(tile, levels); }
  const saved = levels.get(divisions); if (saved) return saved;
  const x = new Float32Array(divisions + 1), z = new Float32Array(divisions + 1);
  for (let i = 0; i <= divisions; i++) {
    const point = landscape.propertyToWorld(tile.x + i / divisions * tile.width, tile.y + i / divisions * tile.depth, { x: 0, z: 0 });
    x[i] = point.x; z[i] = point.z;
  }
  const grid = { x, z, heights: new Map<number, number>(), divisions }; levels.set(divisions, grid); return grid;
}
function cellAt(axis: Float32Array, coordinate: number): number {
  let low = 0, high = axis.length - 1;
  while (low + 1 < high) { const middle = (low + high) >> 1; if (coordinate < axis[middle]) high = middle; else low = middle; }
  return low;
}

/** Interpolate the actual float32 grid triangles, not the analytic heightfield.
 * The diagonal matches buildQuailTerrainGeometry: (00,01,10), (10,01,11). */
function triangleHeight(landscape: LandscapeModel, tile: QuailGroundTile, divisions: number, worldX: number, worldZ: number): number {
  const grid = gridFor(landscape, tile, divisions), ix = cellAt(grid.x, worldX), iz = cellAt(grid.z, worldZ);
  const u = THREE.MathUtils.clamp((worldX - grid.x[ix]) / (grid.x[ix + 1] - grid.x[ix]), 0, 1);
  const v = THREE.MathUtils.clamp((worldZ - grid.z[iz]) / (grid.z[iz + 1] - grid.z[iz]), 0, 1);
  const height = (x: number, z: number) => {
    const key = z * (divisions + 1) + x; let saved = grid.heights.get(key);
    if (saved === undefined) {
      saved = Math.fround(landscape.heightAtProperty(tile.x + x / divisions * tile.width, tile.y + z / divisions * tile.depth));
      grid.heights.set(key, saved);
    }
    return saved;
  };
  if (u + v <= 1) { const h = height(ix, iz); return h + u * (height(ix + 1, iz) - h) + v * (height(ix, iz + 1) - h); }
  const h = height(ix + 1, iz + 1); return h + (1 - u) * (height(ix, iz + 1) - h) + (1 - v) * (height(ix + 1, iz) - h);
}

export function sampleQuailGroundHeights(landscape: LandscapeModel, propertyX: number, propertyY: number, owner?: QuailGroundTile): {
  nearY: number; farY: number; tileCenterX: number; tileCenterZ: number;
} {
  const tile = owner ?? quailGroundTileAt(landscape, propertyX, propertyY);
  const world = landscape.propertyToWorld(propertyX, propertyY, { x: 0, z: 0 });
  const x = Math.fround(world.x), z = Math.fround(world.z);
  return { nearY: triangleHeight(landscape, tile, QUAIL_GROUND_DIVISIONS.near, x, z),
    farY: triangleHeight(landscape, tile, QUAIL_GROUND_DIVISIONS.far, x, z), tileCenterX: tile.centerX, tileCenterZ: tile.centerZ };
}

interface RoadVertex { x: number; z: number; rgba: number[]; source?: number }
/** Split only terrain-seam crossings. Every resulting road triangle belongs
 * to one tile, including duplicated boundary vertices, so mixed terrain LODs
 * cannot interpolate the neighboring tile's lower height into that triangle.
 * Clipping keeps the same XZ footprint, interpolated color/alpha and draw order.
 * Adjacent terrain LODs can still have different boundary heights; this follows
 * their existing step rather than introducing a separate terrain-stitching system. */
export function groundQuailTrackGeometry(landscape: LandscapeModel, source: THREE.BufferGeometry): THREE.BufferGeometry {
  const original = source.getAttribute('position'), tint = source.getAttribute('color'), originalIndices = source.index!;
  const input: RoadVertex[] = Array.from({ length: original.count }, (_, i) => ({ x: original.getX(i), z: original.getZ(i),
    rgba: [tint.getX(i), tint.getY(i), tint.getZ(i), tint.getW(i)], source: i }));
  const owners = quailGroundTiles(landscape).map((tile) => {
    const a = landscape.propertyToWorld(tile.x, tile.y, { x: 0, z: 0 });
    const b = landscape.propertyToWorld(tile.x + tile.width, tile.y + tile.depth, { x: 0, z: 0 });
    return { tile, minX: Math.fround(a.x), maxX: Math.fround(b.x), minZ: Math.fround(a.z), maxZ: Math.fround(b.z) };
  });
  const positions: number[] = [], colors: number[] = [], far: number[] = [], indices: number[] = [];
  const seen = new Map<string, number>(); let splitTriangles = 0;
  const emit = (p: RoadVertex, tile: QuailGroundTile): number => {
    const x = Math.fround(p.x), z = Math.fround(p.z), rgba = p.rgba.map(Math.fround);
    const key = `${tile.x},${tile.y}/${p.source === undefined ? `${x},${z}/${rgba.join(',')}` : p.source}`;
    const saved = seen.get(key); if (saved !== undefined) return saved;
    const property = landscape.worldToProperty(x, z, { x: 0, y: 0 });
    const ground = sampleQuailGroundHeights(landscape, property.x, property.y, tile), index = positions.length / 3;
    positions.push(x, ground.nearY + .032, z); colors.push(...rgba); far.push(ground.farY + .032, ground.tileCenterX, ground.tileCenterZ);
    seen.set(key, index); return index;
  };
  const clip = (polygon: RoadVertex[], axis: 'x' | 'z', boundary: number, minimum: boolean): RoadVertex[] => {
    const result: RoadVertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const insideA = minimum ? a[axis] >= boundary : a[axis] <= boundary;
      const insideB = minimum ? b[axis] >= boundary : b[axis] <= boundary;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (boundary - a[axis]) / (b[axis] - a[axis]);
        result.push({ x: axis === 'x' ? boundary : a.x + (b.x - a.x) * t,
          z: axis === 'z' ? boundary : a.z + (b.z - a.z) * t,
          rgba: a.rgba.map((value, k) => value + (b.rgba[k] - value) * t) });
      }
    }
    return result;
  };
  for (let i = 0; i < originalIndices.count; i += 3) {
    const triangle = [input[originalIndices.getX(i)], input[originalIndices.getX(i + 1)], input[originalIndices.getX(i + 2)]];
    const minX = Math.min(...triangle.map((p) => p.x)), maxX = Math.max(...triangle.map((p) => p.x));
    const minZ = Math.min(...triangle.map((p) => p.z)), maxZ = Math.max(...triangle.map((p) => p.z));
    const owner = owners.find((o) => minX >= o.minX && maxX <= o.maxX && minZ >= o.minZ && maxZ <= o.maxZ);
    if (owner) { indices.push(...triangle.map((p) => emit(p, owner.tile))); continue; }
    splitTriangles++;
    for (const o of owners) {
      if (maxX < o.minX || minX > o.maxX || maxZ < o.minZ || minZ > o.maxZ) continue;
      let polygon = clip(triangle, 'x', o.minX, true); polygon = clip(polygon, 'x', o.maxX, false);
      polygon = clip(polygon, 'z', o.minZ, true); polygon = clip(polygon, 'z', o.maxZ, false);
      for (let n = 1; n < polygon.length - 1; n++) {
        const a = polygon[0], b = polygon[n], c = polygon[n + 1];
        if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-10) continue;
        indices.push(emit(a, o.tile), emit(b, o.tile), emit(c, o.tile));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('quailFarGround', new THREE.Float32BufferAttribute(far, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const bounds = geometry.boundingSphere!;
  for (let i = 0; i < positions.length / 3; i++) bounds.radius = Math.max(bounds.radius,
    Math.hypot(positions[i * 3] - bounds.center.x, far[i * 3] - bounds.center.y, positions[i * 3 + 2] - bounds.center.z));
  geometry.userData.quailGroundFit = { originalVertices: original.count, vertices: positions.length / 3,
    originalTriangles: originalIndices.count / 3, triangles: indices.length / 3, splitOriginalTriangles: splitTriangles,
    farGroundAttributeBytes: far.length * Float32Array.BYTES_PER_ELEMENT };
  return geometry;
}

/** Compose after surface detail so height also reaches standard shadow coords.
 * The road receives shadows and never casts them; no depth-material variant is needed. */
export function applyQuailTrackGroundLod(material: THREE.MeshLambertMaterial, quality: Quality): void {
  const surfaceDetail = material.onBeforeCompile; const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    surfaceDetail.call(this, shader, renderer);
    shader.uniforms.uQuailGroundNearDistance = { value: quailGroundNearDistance(quality) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 quailFarGround;
      uniform float uQuailGroundNearDistance;
    `).replace('#include <begin_vertex>', `#include <begin_vertex>
      if (length(quailFarGround.yz - cameraPosition.xz) >= uQuailGroundNearDistance) transformed.y = quailFarGround.x;
    `);
  };
  material.customProgramCacheKey = () => `${previousKey}|quail-road-ground-lod-v1`;
}
