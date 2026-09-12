import * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Quality } from '../engine';

type Point = readonly [number, number, number];
type Composition = { id: string; kind: 'trailhead' | 'cairn' | 'vista'; x: number; y: number; heading: number; radius: number };
export interface ChukarLandmarkObstacle { x: number; z: number; radius: number }
export interface ChukarLandmarkClearance { x: number; y: number; radius: number }

/** All placement lives in shared property coordinates, never the current spawn frame. */
function compositions(area: AreaConfig): Composition[] {
  if (area.id !== 'chukar-ridge') return [];
  const result: Composition[] = [];
  const offset = (x: number, y: number, heading: number, forward: number, right: number) => ({
    x: x + (Math.cos(heading) * forward - Math.sin(heading) * right) / PROPERTY_PX_TO_M,
    y: y + (Math.sin(heading) * forward + Math.cos(heading) * right) / PROPERTY_PX_TO_M,
  });
  area.dropPoints.forEach((drop, index) => {
    result.push({ id: `${drop.id}-trailhead`, kind: 'trailhead', ...offset(drop.position.x, drop.position.y, drop.heading, 11, index ? -8.5 : 8.5), heading: drop.heading, radius: 4.2 });
    const trail = area.trails.find(path => Math.hypot(path.points[0].x - drop.position.x, path.points[0].y - drop.position.y) < 2);
    const toward = trail?.points[1];
    const distance = toward ? Math.min(84, Math.hypot(toward.x - drop.position.x, toward.y - drop.position.y) * PROPERTY_PX_TO_M * .68) : 70;
    const heading = toward ? Math.atan2(toward.y - drop.position.y, toward.x - drop.position.x) : drop.heading;
    result.push({ id: `${drop.id}-turn-cairn`, kind: 'cairn', ...offset(drop.position.x, drop.position.y, heading, distance, index ? 5.7 : -5.7), heading, radius: 2.6 });
  });
  const feature = area.landmarks.find(landmark => landmark.id === 'area-feature');
  if (feature) result.push({ id: 'rimrock-tank-overlook', kind: 'vista', x: feature.position.x - 25 / PROPERTY_PX_TO_M, y: feature.position.y + 17 / PROPERTY_PX_TO_M, heading: -.72, radius: 9.5 });
  const junction = area.trails[0]?.points.at(-1);
  if (junction) result.push({ id: 'upper-trail-cairn', kind: 'cairn', x: junction.x - 7 / PROPERTY_PX_TO_M, y: junction.y + 6 / PROPERTY_PX_TO_M, heading: -.4, radius: 2.6 });
  for(const landmark of area.landmarks)if(['lower-sage-bench','rim-overlook'].includes(landmark.id)){
    result.push({id:landmark.id+'-cairn',kind:'cairn',x:landmark.position.x+7,y:landmark.position.y+8,heading:-.5,radius:2.6});
  }
  return result;
}

/** Scenery exclusion circles: x/y are property coordinates, radius is metres. */
export function chukarLandmarkClearance(area: AreaConfig): ChukarLandmarkClearance[] {
  return compositions(area).map(({ x, y, radius }) => ({ x, y, radius }));
}

/** One static vertex-colour batch for stone, worn wood and small hardware. */
class LandmarkSurface {
  private positions: number[] = [];
  private colors: number[] = [];
  private color = new THREE.Color();

  triangle(a: Point, b: Point, c: Point, color: number, value = 1): void {
    this.color.setHex(color).multiplyScalar(value);
    for (const p of [a, b, c]) { this.positions.push(...p); this.colors.push(this.color.r, this.color.g, this.color.b); }
  }

  quad(a: Point, b: Point, c: Point, d: Point, color: number, value = 1): void {
    this.triangle(a, b, c, color, value); this.triangle(a, c, d, color, value);
  }

  box(center: Point, size: Point, color: number, yaw = 0, lean = 0): void {
    const rotation = new THREE.Euler(0, yaw, lean), matrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
    const vertices: Point[] = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(p => {
      const v = new THREE.Vector3(p[0] * size[0] / 2, p[1] * size[1] / 2, p[2] * size[2] / 2).applyMatrix4(matrix);
      return [v.x + center[0], v.y + center[1], v.z + center[2]];
    });
    const faces = [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];
    faces.forEach((face, i) => this.quad(vertices[face[0]], vertices[face[1]], vertices[face[2]], vertices[face[3]], color, [1,.95,.88,1.02,1.06,.79][i]));
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
}

export interface ChukarLandmarkComposition {
  root: THREE.Group;
  obstacles: ChukarLandmarkObstacle[];
  dispose(): void;
}

/**
 * Add beside the shared gates and tank, retaining their existing map identity.
 * The paths stay open; collision circles cover individual substantial pieces.
 */
export function createChukarLandmarks(landscape: LandscapeModel, quality: Quality): ChukarLandmarkComposition {
  const root = new THREE.Group(); root.name = 'Chukar Ridge trail landmarks';
  const obstacles: ChukarLandmarkObstacle[] = [];
  const surface = new LandmarkSurface();
  const sides = quality === 'high' ? 7 : 5;
  const rockPalette = [0x77736c, 0x908a7c, 0x686b67, 0xa19988, 0x817765];
  const scratch = { x: 0, z: 0 };

  const rock = (x: number, z: number, width: number, height: number, depth: number, yaw: number, seed: number, base?: number): number => {
    const rng = mulberry32(seed), ground = base ?? landscape.heightAtWorld(x, z);
    const stone = rockPalette[seed % rockPalette.length];
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const rings: Point[][] = [];
    const angular = Array.from({ length: sides }, (_, i) => ({ angle: i / sides * Math.PI * 2 + (rng() - .5) * .18, radius: .85 + rng() * .18 }));
    for (let level = 0; level < 3; level++) {
      const factor = [.79, 1, .64][level];
      rings.push(angular.map(({ angle, radius }) => {
        const rx = Math.cos(angle) * width * .5 * factor * radius + level * width * .035;
        const rz = Math.sin(angle) * depth * .5 * factor * radius - level * depth * .025;
        const wx = x + cos * rx + sin * rz, wz = z - sin * rx + cos * rz;
        // The bottom ring follows the actual slope; upper rings remain a
        // fractured solid instead of stretching the entire rock downhill.
        const bottom = base === undefined ? landscape.heightAtWorld(wx, wz) - Math.min(.19, height * .18) : base;
        const wy = level === 0 ? bottom : ground + height * (level === 1 ? .47 : .91) + (rng() - .5) * height * .12;
        return [wx, wy, wz];
      }));
    }
    for (let level = 0; level < 2; level++) for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      surface.quad(rings[level][i], rings[level + 1][i], rings[level + 1][next], rings[level][next], stone, .89 + rng() * .18);
    }
    const top: Point = [x + width * .07, ground + height * .94, z - depth * .05];
    const bottom: Point = [x, ground - Math.min(.19, height * .18), z];
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      surface.triangle(rings[2][i], top, rings[2][next], stone, 1.01 + rng() * .08);
      surface.triangle(rings[0][next], bottom, rings[0][i], stone, .8);
    }
    return ground + height * .89;
  };

  const cairn = (x: number, z: number, yaw: number, scale: number, seed: number) => {
    let base: number | undefined;
    for (let level = 0; level < 5; level++) {
      const width = (1.1 - level * .17) * scale, height = (.25 - level * .023) * scale;
      base = rock(x + Math.sin(level * 1.6) * .045 * scale, z + Math.cos(level * 2.1) * .04 * scale,
        width, height, width * .76, yaw + level * .71, seed + level * 31, base);
    }
    obstacles.push({ x, z, radius: .57 * scale });
  };

  const post = (x: number, z: number, heading: number) => {
    const base = landscape.heightAtWorld(x, z), yaw = -Math.PI / 2 - heading;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const local = (px: number, py: number, pz: number): Point => [x + px * cos + pz * sin, base + py, z - px * sin + pz * cos];
    surface.box(local(0, 1.03, 0), [.18, 2.25, .19], 0x797367, yaw, -.018);
    surface.box(local(0, 1.82, .02), [.94, .21, .075], 0x918677, yaw, -.025);
    surface.box(local(.04, 1.55, .02), [.71, .16, .074], 0x736c5c, yaw, .015);
    // A faded mountain mark faces the approach without inventing route text
    // or sending the hunter toward a side path that does not exist.
    surface.triangle(local(-.23,1.76,.062), local(.11,1.76,.062), local(-.04,1.89,.062), 0xbcb49b);
    surface.triangle(local(.02,1.76,.063), local(.29,1.76,.063), local(.15,1.85,.063), 0xa9a28b);
    // Grain splits and two blunt iron fixings share the same static batch.
    for (let i = 0; i < 3; i++) surface.box(local(-.045 + i * .037, .51 + i * .3, .098), [.005, .49 - i * .06, .004], 0x5b594f, yaw, -.006);
    for (const py of [1.55, 1.82]) surface.box(local(.025, py, .066), [.036, .038, .015], 0x494b47, yaw);
    obstacles.push({ x, z, radius: .19 });
  };

  compositions(landscape.area).forEach((anchor, index) => {
    const { x, z } = landscape.propertyToWorld(anchor.x, anchor.y, scratch);
    const seed = landscape.area.terrain.seed + index * 7919;
    const rng = mulberry32(seed), c = Math.cos(anchor.heading), s = Math.sin(anchor.heading);
    const offset = (forward: number, side: number) => ({ x: x + c * forward - s * side, z: z + s * forward + c * side });
    if (anchor.kind === 'trailhead') {
      post(x, z, anchor.heading);
      const center = offset(.45, 1.35); cairn(center.x, center.z, anchor.heading, 1.1, seed);
      const fallen = offset(1.3, -1.3), ground = landscape.heightAtWorld(fallen.x, fallen.z);
      surface.box([fallen.x, ground + .10, fallen.z], [1.8,.14,.18], 0x817665, -anchor.heading + .3, -.04);
      for (let n = 0; n < (quality === 'high' ? 7 : 4); n++) {
        const theta = rng() * Math.PI * 2, radius = 1.6 + rng() * 1.5, size = .26 + rng() * .37;
        const px = x + Math.cos(theta) * radius, pz = z + Math.sin(theta) * radius;
        rock(px, pz, size, size * .43, size * .74, rng() * Math.PI, seed + 300 + n);
      }
    } else if (anchor.kind === 'cairn') {
      cairn(x, z, anchor.heading, index === 5 ? 1.32 : .88, seed);
      for (let n = 0; n < (quality === 'high' ? 3 : 1); n++) {
        const p = offset(-.7 + n * .65, .9 + rng() * .4);
        rock(p.x, p.z, .42 + rng() * .23, .19, .35, rng() * Math.PI, seed + 300 + n);
      }
    } else {
      // A leaning monolith, fractured seat slab and unequal companions form
      // a recognizable perch beside the tank, rather than a ring of props.
      const cluster = [
        [-1.8,-1.1,3.5,3.8,2.7,-.25], [1.15,-.75,2.9,1.12,2.0,.28],
        [3.25,-1.45,2.1,1.8,1.7,.61], [-3.7,.85,1.9,.86,2.0,-.7],
        [.45,2.4,1.25,.59,1.7,.12], [4.65,.85,1.05,.55,1.3,.5],
        [-4.5,-2.3,1.1,.64,.8,-.4], [2.7,3.3,.84,.42,1.1,.9],
      ];
      cluster.slice(0, quality === 'high' ? 8 : 6).forEach(([forward, side, width, height, depth, yaw], n) => {
        const p = offset(forward, side);
        rock(p.x, p.z, width, height, depth, yaw + anchor.heading, seed + n * 29);
        obstacles.push({ x: p.x, z: p.z, radius: Math.max(width, depth) * .44 });
      });
      const marker = offset(4.8, -3.1); cairn(marker.x, marker.z, anchor.heading, .8, seed + 701);
    }
  });

  const geometry = surface.geometry();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.name = 'Chukar weathered stone and timber';
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Batched cairns, trail posts and overlook rocks';
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); root.add(mesh);
  root.userData.chukarLandmarks = { triangles: geometry.getAttribute('position').count / 3, drawCalls: 1, quality, placements: compositions(landscape.area) };
  return { root, obstacles, dispose() { geometry.dispose(); material.dispose(); root.removeFromParent(); } };
}
