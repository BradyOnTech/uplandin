import * as THREE from 'three';

/** A point in a bird's model space: +Z forward, +Y up, the carry grip at the origin. */
export type BirdPoint = [number, number, number];

/** Flat-shaded, vertex-coloured triangle soup for one bird part. Faces are
 * wound to face `outward`, so a part never shows its inside at a bank. */
export class BirdMesh {
  readonly positions: number[] = [];
  private colors: number[] = [];
  private tint = new THREE.Color();

  face(points: BirdPoint[], color: number, outward: BirdPoint): void {
    // Newell's normal: sound even when a clipped patch starts on a straight run.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0, z0] = points[i], [x1, y1, z1] = points[(i + 1) % points.length];
      nx += (y0 - y1) * (z0 + z1); ny += (z0 - z1) * (x0 + x1); nz += (x0 - x1) * (y0 + y1);
    }
    const reverse = nx * outward[0] + ny * outward[1] + nz * outward[2] < 0;
    this.tint.setHex(color);
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[0], b = points[reverse ? i + 1 : i], c = points[reverse ? i : i + 1];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-12) continue;
      for (const p of [a, b, c]) { this.positions.push(...p); this.colors.push(this.tint.r, this.tint.g, this.tint.b); }
    }
  }

  build(species: string): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.species = species;
    return geometry;
  }
}

/** One cross-section of a lofted body: centre height, half width and half depth at z. */
export interface BirdSection { z: number; y: number; w: number; h: number }

/** Rings of `sides` points round each section, starting on the back. */
export function birdRings(sections: readonly BirdSection[], sides: number): BirdPoint[][] {
  return sections.map(s => Array.from({ length: sides }, (_, i): BirdPoint => {
    const angle = Math.PI / 2 + i * Math.PI * 2 / sides;
    return [Math.cos(angle) * s.w, s.y + Math.sin(angle) * s.h, s.z];
  }));
}

/** The lofted section at `z`, interpolated between its neighbours. */
export function birdSectionAt(sections: readonly BirdSection[], z: number): BirdSection {
  const i = Math.max(0, Math.min(sections.length - 2, sections.findIndex(s => s.z > z) - 1));
  const a = sections[i], b = sections[i + 1], t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
  return { z, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
}

/** Angle of a ring facet's centre round the body (pi/2 on the back). */
export function facetAngle(side: number, sides: number): number {
  return Math.PI / 2 + (side + .5) * Math.PI * 2 / sides;
}

type SurfacePoint = [number, number]; // y, z

/**
 * Paint a marking onto the body surface already in `mesh`: the side-view
 * polygon (y, z) is clipped to each shell triangle and lifted just proud of
 * it, so a bar or a face patch follows the facets rather than floating over
 * an ideal ellipsoid or cutting through the breast.
 */
export function birdPatcher(mesh: BirdMesh) {
  const shell = mesh.positions.slice();
  return (side: number, polygon: SurfacePoint[], color: number, lift = .00018): void => {
    for (let i = 0; i < shell.length; i += 9) {
      if (Math.max(side * shell[i], side * shell[i + 3], side * shell[i + 6]) < 1e-8) continue;
      const triangle: SurfacePoint[] = [[shell[i + 1], shell[i + 2]], [shell[i + 4], shell[i + 5]], [shell[i + 7], shell[i + 8]]];
      const [a, b, c] = triangle;
      const determinant = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(determinant) < 1e-12) continue;
      let clipped = polygon;
      for (let edge = 0; edge < 3 && clipped.length; edge++) {
        const start = triangle[edge], end = triangle[(edge + 1) % 3];
        const distance = (p: SurfacePoint) => Math.sign(determinant)
          * ((end[0] - start[0]) * (p[1] - start[1]) - (end[1] - start[1]) * (p[0] - start[0]));
        const input = clipped; clipped = [];
        for (let j = 0; j < input.length; j++) {
          const p = input[j], q = input[(j + 1) % input.length], dp = distance(p), dq = distance(q);
          if (dp >= 0) clipped.push(p);
          // Strictly across only: a corner lying on the edge is kept once, not twice.
          if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
            const t = dp / (dp - dq);
            clipped.push([THREE.MathUtils.lerp(p[0], q[0], t), THREE.MathUtils.lerp(p[1], q[1], t)]);
          }
        }
      }
      clipped = clipped.filter((p, j) => {
        const q = clipped[(j + 1) % clipped.length];
        return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-7;
      });
      if (clipped.length < 3) continue;
      // A patch that only grazes this facet along an edge or at a corner adds nothing.
      let area = 0;
      for (let j = 0; j < clipped.length; j++) {
        const p = clipped[j], q = clipped[(j + 1) % clipped.length];
        area += p[0] * q[1] - q[0] * p[1];
      }
      if (Math.abs(area) < 2e-10) continue;
      const points = clipped.map(([y, z]): BirdPoint => {
        const u = ((b[1] - c[1]) * (y - c[0]) + (c[0] - b[0]) * (z - c[1])) / determinant;
        const v = ((c[1] - a[1]) * (y - c[0]) + (a[0] - c[0]) * (z - c[1])) / determinant;
        return [u * shell[i] + v * shell[i + 3] + (1 - u - v) * shell[i + 6] + side * lift, y, z];
      });
      mesh.face(points, color, [side, 0, 0]);
    }
  };
}
