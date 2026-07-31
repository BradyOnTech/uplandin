import * as THREE from 'three';
import { mulberry32 } from '../../game/math';
import type { RNG } from '../../game/types';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';
import type { TerrainSystem } from './terrain';

/*
 * FLORA subsystem: the midground mass the round-1 critics said was missing.
 * Every frame was near grass -> empty plain -> far ridge; this system fills
 * the 30-120 m band with flat-shaded, palette-disciplined silhouettes so a
 * frame composes in 4-5 depth planes with an eye path and an anchor:
 *
 *  - Bur oaks: three authored low-poly shapes (stout trunk, blobby clumped
 *    canopy, one asymmetric side lobe — A Short Hike shape language),
 *    placed in loose groves along the hero sightlines, never scattered.
 *  - One LANDMARK oak (1.7x scale) parked at the thirds intersection of the
 *    dawn-field frame; one windmill-scale grand snag on the evening frame's
 *    right third, silhouetted by the low sun.
 *  - Plum-thicket shrub clusters riding the fence rows and patch edges.
 *  - Cattail stands seeded into genuine terrain swales (heightAt < ~1.6 m),
 *    so the wet-ground prop grows where the ground reads wet.
 *  - Fence lines: leaning posts with sagging wire hints, one run sweeping
 *    diagonally toward the landmark oak (the dawn eye path), one receding
 *    into the evening sun notch.
 *  - Deadfall logs and fieldstone rocks (moved here from terrain.ts) as
 *    near-midground occluders, rejected off the capture sightline axes.
 *
 * All geometry is authored once (per-face baked vertex color, flat-shaded
 * Lambert), then instanced or merged: ~10 draw calls for the whole layer.
 * Everything is static — no update(), zero per-frame work. Placement is
 * deterministic from fixed local seeds so the composition is repeatable
 * regardless of subsystem boot order.
 */

/* ------------------------------------------------------------------ */
/* Transform + assembly helpers                                        */
/* ------------------------------------------------------------------ */

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();

/** Compose a TRS matrix into a shared scratch (consumed immediately). */
function xform(
  px: number, py: number, pz: number,
  rx: number, ry: number, rz: number,
  sx: number, sy: number, sz: number,
): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(px, py, pz);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

/** Matrix stretching a unit +x box between two points (wire segments). */
function xformSpan(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  th: number,
): THREE.Matrix4 {
  _dir.set(x1 - x0, y1 - y0, z1 - z0);
  const len = _dir.length();
  _q.setFromUnitVectors(_xAxis, _dir.normalize());
  _p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  _s.set(len, th, th);
  return _m.compose(_p, _q, _s);
}

/**
 * Accumulates transformed primitives into one non-indexed geometry with a
 * baked FLAT color per face — the painted-facet look. Sources are cloned,
 * so callers dispose their own primitives.
 */
class Asm {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private c = new THREE.Color();

  add(
    src: THREE.BufferGeometry,
    m: THREE.Matrix4 | null,
    faceColor: (out: THREE.Color, cy: number, ny: number) => void,
  ): void {
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) {
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
      faceColor(this.c, cy, ny);
      for (let k = 0; k < 3; k++) {
        this.pos.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
        this.nor.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k));
        this.col.push(this.c.r, this.c.g, this.c.b);
      }
    }
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

/* ------------------------------------------------------------------ */
/* Capture sightlines: prop scatter must not squat on a hero axis      */
/* ------------------------------------------------------------------ */

// [originX, originZ, dirX, dirZ] — mirrors the poses in tools3d/capture.mjs.
const HERO_AXES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 40, 0, 1],            // dawn-field
  [0, 40, 0.996, 0.087],    // dawn-into-sun
  [0, 40, -0.996, -0.087],  // evening-field
  [10, 20, -1, 0],          // lastlight
  [20, 10, 0.342, 0.94],    // noon-open
  [-60, -20, -0.5, 0.866],  // dawn-ridge
];

function nearHeroAxis(x: number, z: number, r: number): boolean {
  for (const [ox, oz, dx, dz] of HERO_AXES) {
    const rx = x - ox;
    const rz = z - oz;
    const t = rx * dx + rz * dz;
    if (t < 12 || t > 110) continue;
    const px = rx - t * dx;
    const pz = rz - t * dz;
    if (px * px + pz * pz < r * r) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Art-directed placement tables (clusters and lines, never scatter)   */
/* ------------------------------------------------------------------ */

// Bur oaks: [x, z, variant, scale, keepOnLite]. Grove A sits far screen-
// right of dawn-field, grove B mid screen-left layering with the landmark,
// grove C west for evening/lastlight/dawn-ridge, a far treeline pair past
// the dawn horizon swell, one lone oak on the dawn-into-sun axis edge, and
// two dressing oaks south for free-roam.
const OAKS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-52, 104, 0, 1.15, 1],
  [-63, 96, 1, 0.9, 0],
  [-58, 116, 2, 1.05, 1],
  [36, 76, 1, 1.0, 1],
  [45, 86, 2, 0.85, 0],
  [-86, 50, 0, 1.15, 1],
  [-96, 41, 2, 0.95, 0],
  [-82, 61, 1, 1.05, 1],
  [-30, 155, 0, 1.2, 1],
  [-16, 163, 1, 0.95, 0],
  [85, 18, 0, 1.05, 1],
  [10, -85, 2, 1.1, 0],
  [24, -96, 0, 0.9, 0],
];

// Plum thickets: [x, z, keepOnLite] — fence-row clusters on the dawn eye
// path, a west cluster for evening left-third, dressing near the grand snag
// and on the noon sightline's right.
const SHRUBS: ReadonlyArray<readonly [number, number, number]> = [
  [-38, 67, 1], [-33, 71, 0], [-27, 75, 1], [-13, 84, 0], [-5, 89, 1], [3, 94, 0],
  [10, 74, 1], [16, 80, 0], [13, 86, 1],
  [-55, 58, 1], [-60, 53, 0], [-52, 63, 1], [-48, 50, 1],
  [-80, 20, 1], [-84, 26, 0],
  [-48, 4, 1], [-53, -2, 0], [-44, 10, 1],
  [55, 55, 1], [61, 48, 0], [52, 62, 1],
];

// Fence runs: [x0, z0, x1, z1]. Run 1 sweeps diagonally across dawn-field
// toward the landmark oak; run 2 recedes into the evening sun notch.
const FENCES: ReadonlyArray<readonly [number, number, number, number]> = [
  // Dawn eye path: a DIAGONAL — enters the frame at the lower left a few
  // meters ahead of the dawn camera (0,40) and recedes into depth toward
  // the landmark oak (26,96), leading the eye instead of striping the
  // horizon (round-2: a prop wasted as a horizon-parallel stripe).
  [-16, 45, 24, 94],
  [-30, 30, -105, 12],
];

export class FloraSystem implements Subsystem {
  readonly id = 'flora';

  private terrain!: TerrainSystem;
  private mat?: THREE.MeshLambertMaterial;
  private objs: THREE.Mesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  // Scratch (init-time reuse; no per-frame work exists in this system).
  private im = new THREE.Matrix4();
  private iq = new THREE.Quaternion();
  private ie = new THREE.Euler();
  private iv = new THREE.Vector3();
  private is = new THREE.Vector3();
  private ic = new THREE.Color();

  init(ctx: Ctx): void {
    this.terrain = ctx.get<TerrainSystem>('terrain');
    const high = ctx.quality === 'high';
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    this.buildOaks(high, ctx);
    this.buildLandmark(ctx);
    this.buildSnags(ctx);
    this.buildShrubs(high, ctx);
    this.buildCattails(high, ctx);
    this.buildDeadfall(high, ctx);
    this.buildFence(ctx);
    this.buildRocks(high, ctx);
  }

  dispose(ctx: Ctx): void {
    for (const o of this.objs) {
      ctx.scene.remove(o);
      if (o instanceof THREE.InstancedMesh) o.dispose();
    }
    for (const g of this.geos) g.dispose();
    this.mat?.dispose();
    this.objs.length = 0;
    this.geos.length = 0;
    this.mat = undefined;
  }

  /* ---------------------------------------------------------------- */
  /* Authored assets                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Bur oak: stout trunk, a couple of reaching limbs, clumped squashed-
   * icosahedron canopy with an asymmetric side lobe. Dark October canopy —
   * olive-deep with russet facets — so it reads as a silhouette mass
   * against the dawn/evening sky, top faces warmed for painted light.
   */
  private buildOak(seed: number, variant: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    const bark = new THREE.Color(P.charcoal);
    const barkWarm = new THREE.Color(P.warmGray);
    const olive = new THREE.Color(P.olive);
    const russet = new THREE.Color(P.russet);
    const russetDeep = new THREE.Color(P.russetDeep);
    // October bur oak: warm olive-russet, NOT charcoal — round-2's first
    // pass read as boulders. Committed autumn hues, lifted luminance; the
    // fog + cool ambient will still silhouette them against the dawn sky.
    // Green-olive canopies (the noon frame's second hue family; e3-5's
    // treeline is green against straw): variants 0/1 commit to canopy
    // green, variant 2 keeps the russet-october outlier.
    const base = new THREE.Color(P.canopyGreen);
    if (variant === 0) base.lerp(new THREE.Color(P.oliveMid), 0.3);
    else if (variant === 1) base.lerp(new THREE.Color(P.olive), 0.35);
    else base.copy(russetDeep).lerp(new THREE.Color(P.canopyGreen), 0.45);
    const top = base.clone().lerp(new THREE.Color(P.khaki), 0.5).multiplyScalar(1.22);

    const barkFace = (out: THREE.Color, cy: number): void => {
      out.copy(bark).lerp(barkWarm, rng() * 0.45)
        .multiplyScalar(0.8 + Math.min(Math.max(cy, 0) / 3, 1) * 0.25);
    };
    const leafFace = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(base).lerp(olive, rng() * 0.25);
      if (rng() < 0.1) out.lerp(russet, 0.22); // quiet autumn flecks, not neon
      out.lerp(top, Math.max(ny, 0) * (0.45 + rng() * 0.25));
      if (ny < -0.15) out.multiplyScalar(0.78);
      out.multiplyScalar(1.0 + rng() * 0.18);
    };

    const trunkH = 3.7 + rng() * 0.5;
    const trunk = new THREE.CylinderGeometry(0.26, 0.6, trunkH, 6, 1);
    a.add(trunk, xform(0, trunkH / 2, 0, (rng() - 0.5) * 0.12, rng() * Math.PI, (rng() - 0.5) * 0.12, 1, 1, 1), barkFace);
    trunk.dispose();

    const nLimb = 2 + (variant === 1 ? 1 : 0);
    for (let i = 0; i < nLimb; i++) {
      const len = 2.2 + rng() * 1.2;
      const limb = new THREE.CylinderGeometry(0.09, 0.18, len, 5, 1);
      limb.translate(0, len / 2, 0);
      limb.rotateZ(0.7 + rng() * 0.5);
      limb.rotateY((i / nLimb) * Math.PI * 2 + rng());
      limb.translate(0, trunkH * 0.85, 0);
      a.add(limb, null, barkFace);
      limb.dispose();
    }

    const blobs: number[][] =
      variant === 0
        ? [
            [0, 5.9, 0, 2.9, 2.2, 2.7],
            [-2.3, 5.0, 0.4, 1.9, 1.6, 1.8],
            [2.1, 5.3, -0.5, 2.1, 1.7, 1.9],
            [0.6, 7.3, 0.5, 1.7, 1.4, 1.6],
            [-1.0, 4.2, -1.7, 1.5, 1.2, 1.5],
          ]
        : variant === 1
          ? [
              [0, 6.5, 0, 2.2, 2.1, 2.1],
              [1.6, 5.2, 0.6, 1.8, 1.6, 1.7],
              [-1.9, 5.9, -0.3, 1.6, 1.5, 1.5],
              [0.3, 8.0, -0.2, 1.4, 1.2, 1.3],
            ]
          : [
              [-1.4, 5.3, 0, 2.5, 1.9, 2.3],
              [1.9, 5.8, 0.2, 2.2, 1.7, 2.0],
              [0.3, 6.9, -0.4, 1.8, 1.4, 1.7],
              [3.4, 4.7, -0.3, 1.3, 1.1, 1.2],
            ];
    for (const [bx, by, bz, sx, sy, sz] of blobs) {
      const blob = new THREE.IcosahedronGeometry(1, 0);
      a.add(
        blob,
        xform(
          bx + (rng() - 0.5) * 0.4, by + (rng() - 0.5) * 0.3, bz + (rng() - 0.5) * 0.4,
          rng() * Math.PI, rng() * Math.PI, rng() * Math.PI,
          sx, sy, sz,
        ),
        leafFace,
      );
      blob.dispose();
    }
    return a.build();
  }

  /** Plum thicket: a tight cluster of low blobs, oxblood-russet, no trunk. */
  private buildShrub(seed: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    // Muted wine-olive brush lifted into the scene's shadow palette (warm
    // dark brown + sky bounce) — never 3 stops darker than the field.
    const base = new THREE.Color(P.oxblood).lerp(new THREE.Color(P.olive), 0.55).lerp(new THREE.Color(P.warmGray), 0.18);
    const top = base.clone().lerp(new THREE.Color(P.khaki), 0.5).multiplyScalar(1.2);
    const dark = new THREE.Color(P.oliveDeep);
    const face = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(base).lerp(dark, rng() * 0.2);
      out.lerp(top, Math.max(ny, 0) * (0.4 + rng() * 0.3));
      if (ny < -0.2) out.multiplyScalar(0.82);
      out.multiplyScalar(1.0 + rng() * 0.22);
    };
    const n = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rng();
      const d = rng() * 1.3;
      const blob = new THREE.IcosahedronGeometry(1, 0);
      a.add(
        blob,
        xform(
          Math.sin(ang) * d, 0.5 + rng() * 0.4, Math.cos(ang) * d,
          rng() * Math.PI, rng() * Math.PI, rng() * Math.PI,
          0.85 + rng() * 0.65, 0.5 + rng() * 0.35, 0.85 + rng() * 0.65,
        ),
        face,
      );
      blob.dispose();
    }
    return a.build();
  }

  /** Cattail stand: a dozen leaning stalks with russet sausage heads. */
  private buildCattailStand(seed: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    const stalkC = new THREE.Color(P.khaki).lerp(new THREE.Color(P.straw), 0.4);
    const headC = new THREE.Color(P.russetDeep).lerp(new THREE.Color(P.oxblood), 0.3);
    const leafC = new THREE.Color(P.straw).lerp(new THREE.Color(P.oliveMid), 0.45);
    const stalkFace = (out: THREE.Color): void => {
      out.copy(stalkC).multiplyScalar(0.85 + rng() * 0.3);
    };
    const headFace = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(headC).multiplyScalar(0.85 + rng() * 0.25 + Math.max(ny, 0) * 0.2);
    };
    const leafFace = (out: THREE.Color): void => {
      out.copy(leafC).multiplyScalar(0.8 + rng() * 0.35);
    };
    const n = 12 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const ang = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * 1.4;
      const x = Math.sin(ang) * d;
      const z = Math.cos(ang) * d;
      const h = 1.5 + rng() * 0.8;
      const tilt = (rng() - 0.5) * 0.16;
      const tilt2 = (rng() - 0.5) * 0.16;
      const stalk = new THREE.CylinderGeometry(0.018, 0.032, h, 4, 1, true);
      a.add(stalk, xform(x, h / 2, z, tilt, 0, tilt2, 1, 1, 1), stalkFace);
      stalk.dispose();
      if (rng() < 0.75) {
        const head = new THREE.CylinderGeometry(0.05, 0.06, 0.3, 5, 1);
        a.add(head, xform(x + tilt2 * h, h - 0.1, z + tilt * h, tilt, 0, tilt2, 1, 1, 1), headFace);
        head.dispose();
      }
    }
    for (let i = 0; i < 6; i++) {
      const ang = rng() * Math.PI * 2;
      const leaf = new THREE.BoxGeometry(0.05, 1.3 + rng() * 0.5, 0.015);
      a.add(
        leaf,
        xform(Math.sin(ang) * 0.7, 0.6, Math.cos(ang) * 0.7, (rng() - 0.5) * 0.5, rng() * Math.PI, (rng() - 0.5) * 0.5, 1, 1, 1),
        leafFace,
      );
      leaf.dispose();
    }
    return a.build();
  }

  /** Deadfall log: tapered trunk lying down, silvered top, stub branches. */
  private buildLog(seed: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    const wood = new THREE.Color(P.warmGray).lerp(new THREE.Color(P.charcoal), 0.22);
    const silver = new THREE.Color(P.stoneGray);
    const face = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(wood).lerp(silver, Math.max(ny, 0) * (0.3 + rng() * 0.2));
      if (ny < -0.3) out.multiplyScalar(0.65);
      out.multiplyScalar(0.88 + rng() * 0.24);
    };
    const len = 4.5 + rng() * 2.5;
    const trunk = new THREE.CylinderGeometry(0.16, 0.28, len, 7, 1);
    trunk.rotateZ(Math.PI / 2); // lie along +x
    a.add(trunk, xform(0, 0.22, 0, 0, 0, 0, 1, 1, 1), face);
    trunk.dispose();
    for (let i = 0; i < 2; i++) {
      const bl = 0.7 + rng() * 0.9;
      const br = new THREE.CylinderGeometry(0.04, 0.09, bl, 4, 1);
      br.translate(0, bl / 2, 0);
      br.rotateZ(0.5 + rng() * 1.6);
      br.rotateX((rng() - 0.5) * 1.2);
      br.translate((rng() - 0.5) * len * 0.7, 0.3, 0);
      a.add(br, null, face);
      br.dispose();
    }
    return a.build();
  }

  /**
   * Dead snag, round-3 rebuild: warm weathered-brown bark with sky-bounce
   * silvering up the trunk (a silhouette 3+ stops darker than the scene
   * reads as a compositing error in soft light), a massive trunk, and a
   * FEW committed asymmetric branch gestures clustered on one side —
   * shape authorship, not a bottle brush.
   */
  private buildSnag(seed: number, h: number, girth: number, nBranch: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    // Weathered grey-brown driftwood — never terra-cotta, never charcoal,
    // never birch-white: the scene's shadow palette plus sky bounce.
    const bark = new THREE.Color(P.warmGray).lerp(new THREE.Color(P.stoneGray), 0.35);
    const silver = new THREE.Color(P.stoneGray);
    const face = (out: THREE.Color, cy: number): void => {
      out.copy(bark).lerp(silver, Math.max(cy / h, 0) * (0.3 + 0.25 * rng()));
      out.multiplyScalar(0.78 + rng() * 0.22);
    };
    const trunk = new THREE.CylinderGeometry(0.1 * girth, 0.45 * girth, h, 6, 1);
    a.add(trunk, xform(0, h / 2, 0, 0.015, rng() * Math.PI, 0.045, 1, 1, 1), face);
    trunk.dispose();
    // Branch gestures share one favored side of the trunk (windthrow bias):
    // LONG reaching arms starting mid-trunk, each thinner than the last —
    // the silhouette must read at 25 m as three committed strokes.
    // Yaws fan across ~200° so the gestures read from every hero azimuth:
    // two arms shoulder one side, the third counters — asymmetric balance.
    const arc = rng() * Math.PI * 2;
    const yawFan = [0, 0.85, 2.9];
    for (let b = 0; b < nBranch; b++) {
      const bl = (3.0 + rng() * 2.4) * Math.sqrt(girth) * (1 - 0.16 * b);
      const br = new THREE.CylinderGeometry(0.05, 0.15 * girth * (1 - 0.2 * b), bl, 4, 1);
      br.translate(0, bl / 2, 0);
      br.rotateZ(0.7 + rng() * 0.5);
      br.rotateY(arc + yawFan[b % 3] + (rng() - 0.5) * 0.5);
      br.translate(0, h * (0.38 + (0.48 * b) / Math.max(nBranch - 1, 1)), 0);
      a.add(br, null, face);
      br.dispose();
    }
    return a.build();
  }

  /** Grounding cluster for an anchor prop: low boulders + a brush blob. */
  private buildBaseCluster(seed: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    const stone = new THREE.Color(P.stoneGray).lerp(new THREE.Color(P.warmGray), 0.45);
    const brush = new THREE.Color(P.oxblood).lerp(new THREE.Color(P.olive), 0.55);
    const brushTop = brush.clone().lerp(new THREE.Color(P.khaki), 0.5).multiplyScalar(1.15);
    const stoneFace = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(stone).multiplyScalar(0.82 + rng() * 0.25 + Math.max(ny, 0) * 0.2);
    };
    const brushFace = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(brush).lerp(brushTop, Math.max(ny, 0) * (0.4 + rng() * 0.3));
      out.multiplyScalar(0.95 + rng() * 0.2);
    };
    for (let i = 0; i < 3; i++) {
      const ang = rng() * Math.PI * 2;
      const d = 0.9 + rng() * 1.6;
      const rock = new THREE.DodecahedronGeometry(1, 0);
      const sc = 0.5 + rng() * 0.6;
      a.add(
        rock,
        xform(
          Math.sin(ang) * d, sc * 0.25, Math.cos(ang) * d,
          rng() * Math.PI, rng() * Math.PI, rng() * Math.PI,
          sc * (0.9 + rng() * 0.4), sc * 0.6, sc,
        ),
        stoneFace,
      );
      rock.dispose();
    }
    for (let i = 0; i < 3; i++) {
      const ang = rng() * Math.PI * 2;
      const d = rng() * 1.4;
      const blob = new THREE.IcosahedronGeometry(1, 0);
      a.add(
        blob,
        xform(
          Math.sin(ang) * d, 0.4 + rng() * 0.2, Math.cos(ang) * d,
          rng() * Math.PI, rng() * Math.PI, rng() * Math.PI,
          0.7 + rng() * 0.5, 0.45 + rng() * 0.25, 0.7 + rng() * 0.5,
        ),
        brushFace,
      );
      blob.dispose();
    }
    return a.build();
  }

  /* ---------------------------------------------------------------- */
  /* Placement                                                         */
  /* ---------------------------------------------------------------- */

  private groundY(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  /** Instance a geometry over a placement list. Returns the mesh. */
  private instance(
    ctx: Ctx,
    geo: THREE.BufferGeometry,
    spots: ReadonlyArray<readonly [number, number, number, number]>, // x, z, scale, yaw
    sink: number,
    castShadow: boolean,
    rng: RNG,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, this.mat!, spots.length);
    for (let i = 0; i < spots.length; i++) {
      const [x, z, sc, yaw] = spots[i];
      this.ie.set(0, yaw, 0);
      this.iq.setFromEuler(this.ie);
      this.is.set(sc, sc * (0.92 + rng() * 0.18), sc);
      this.iv.set(x, this.groundY(x, z) - sink, z);
      mesh.setMatrixAt(i, this.im.compose(this.iv, this.iq, this.is));
      this.ic.setScalar(0.92 + rng() * 0.16);
      mesh.setColorAt(i, this.ic);
    }
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
    this.objs.push(mesh);
    return mesh;
  }

  private buildOaks(high: boolean, ctx: Ctx): void {
    const rng = mulberry32(3301);
    const geos = [this.buildOak(101, 0), this.buildOak(202, 1), this.buildOak(303, 2)];
    for (const g of geos) this.geos.push(g);
    for (let v = 0; v < 3; v++) {
      const spots: Array<readonly [number, number, number, number]> = [];
      for (const [x, z, variant, sc, keep] of OAKS) {
        if (variant !== v) continue;
        if (!high && keep === 0) continue;
        spots.push([x, z, sc, rng() * Math.PI * 2] as const);
      }
      if (spots.length) this.instance(ctx, geos[v], spots, 0.35, true, rng);
    }
  }

  /** The dawn-field anchor: a lone landmark bur oak at the thirds point. */
  private buildLandmark(ctx: Ctx): void {
    const geo = this.buildOak(777, 0);
    this.geos.push(geo);
    const mesh = new THREE.Mesh(geo, this.mat!);
    mesh.position.set(26, this.groundY(26, 96) - 0.45, 96);
    mesh.scale.set(2.1, 1.9, 2.1);
    mesh.rotation.y = 1.2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ctx.scene.add(mesh);
    this.objs.push(mesh);
  }

  /** Grand snag on the evening third + the modest dawn-field snag. */
  private buildSnags(ctx: Ctx): void {
    const specs: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
      // x, z, seed, height, girth, branches
      // Windmill-scale anchor: pulled off the dawn-ridge sightline center
      // onto its left third (and still the evening/lastlight right third),
      // triple trunk mass, three committed gestures.
      [-81, -2, 41, 12.0, 2.4, 3],
      [-26, 118, 42, 7.6, 1.1, 3], // dawn-field counterweight right of center
    ];
    for (const [x, z, seed, h, girth, nb] of specs) {
      const geo = this.buildSnag(seed, h, girth, nb);
      this.geos.push(geo);
      const mesh = new THREE.Mesh(geo, this.mat!);
      mesh.position.set(x, this.groundY(x, z) - 0.2, z);
      mesh.rotation.y = seed * 1.7;
      mesh.castShadow = true;
      ctx.scene.add(mesh);
      this.objs.push(mesh);
    }
    // Ground the grand snag: boulders and low brush at its feet — an
    // anchor stands IN the field, not plunked on it like a flagpole.
    const base = this.buildBaseCluster(4243);
    this.geos.push(base);
    const bx = -81;
    const bz = -2;
    const baseMesh = new THREE.Mesh(base, this.mat!);
    baseMesh.position.set(bx, this.groundY(bx, bz) - 0.15, bz);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    ctx.scene.add(baseMesh);
    this.objs.push(baseMesh);
  }

  private buildShrubs(high: boolean, ctx: Ctx): void {
    const rng = mulberry32(6011);
    const geo = this.buildShrub(505);
    this.geos.push(geo);
    const spots: Array<readonly [number, number, number, number]> = [];
    for (const [x, z, keep] of SHRUBS) {
      if (!high && keep === 0) continue;
      spots.push([
        x + (rng() - 0.5) * 3, z + (rng() - 0.5) * 3,
        0.8 + rng() * 0.7, rng() * Math.PI * 2,
      ] as const);
    }
    this.instance(ctx, geo, spots, 0.25, high, rng);
  }

  /**
   * Cattails grow where the ground is genuinely low: sample the midground
   * annulus for swale spots (heightAt < 1.6 m), biased into the quadrants
   * the capture frames look at, then plant 3-4 stands per wet spot.
   */
  private buildCattails(high: boolean, ctx: Ctx): void {
    const rng = mulberry32(5711);
    const geo = this.buildCattailStand(606);
    this.geos.push(geo);
    const spotMax = high ? 4 : 2;
    const wet: Array<[number, number]> = [];
    for (let i = 0; i < 600 && wet.length < spotMax; i++) {
      const a = rng() * Math.PI * 2;
      const d = 35 + rng() * 80;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (!(z > 25 || x < -25)) continue; // face the hero frames
      if (this.groundY(x, z) > 1.6) continue;
      if (nearHeroAxis(x, z, 5)) continue;
      if (wet.some((s) => Math.hypot(s[0] - x, s[1] - z) < 30)) continue;
      wet.push([x, z]);
    }
    const spots: Array<readonly [number, number, number, number]> = [];
    for (const [wx, wz] of wet) {
      const n = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        spots.push([
          wx + (rng() - 0.5) * 7, wz + (rng() - 0.5) * 7,
          0.85 + rng() * 0.4, rng() * Math.PI * 2,
        ] as const);
      }
    }
    if (spots.length) this.instance(ctx, geo, spots, 0.12, false, rng);
  }

  private buildDeadfall(high: boolean, ctx: Ctx): void {
    const rng = mulberry32(8231);
    const geo = this.buildLog(707);
    this.geos.push(geo);
    const count = high ? 10 : 5;
    const spots: Array<readonly [number, number, number, number]> = [];
    for (let i = 0; i < 80 && spots.length < count; i++) {
      const a = rng() * Math.PI * 2;
      const d = 24 + rng() * 66;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (nearHeroAxis(x, z, 5)) continue;
      spots.push([x, z, 0.8 + rng() * 0.5, rng() * Math.PI * 2] as const);
    }
    this.instance(ctx, geo, spots, 0.06, high, rng);
  }

  /** Fence lines: leaning posts + two sagging wire ribbons per span. */
  private buildFence(ctx: Ctx): void {
    const rng = mulberry32(4441);
    const a = new Asm();
    // Silvered weathered posts — pale enough to catch light and read as a
    // line at 40-80 m, dark charcoal wire hints between.
    const postC = new THREE.Color(P.warmGray).lerp(new THREE.Color(P.stoneGray), 0.5);
    const wireC = new THREE.Color(P.charcoal).multiplyScalar(0.7);
    const postFace = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(postC).multiplyScalar(0.85 + rng() * 0.35 + Math.max(ny, 0) * 0.15);
    };
    const wireFace = (out: THREE.Color): void => {
      out.copy(wireC);
    };
    const postGeo = new THREE.BoxGeometry(0.2, 1.5, 0.16);
    const wireGeo = new THREE.BoxGeometry(1, 0.04, 0.04);

    for (const [x0, z0, x1, z1] of FENCES) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(len / 3.4));
      let px = 0;
      let pz = 0;
      let py = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t + (rng() - 0.5) * 0.5;
        const z = z0 + (z1 - z0) * t + (rng() - 0.5) * 0.5;
        const y = this.groundY(x, z);
        a.add(
          postGeo,
          xform(x, y + 0.68, z, (rng() - 0.5) * 0.14, rng() * Math.PI, (rng() - 0.5) * 0.14, 1, 0.92 + rng() * 0.16, 1),
          postFace,
        );
        if (i > 0) {
          for (const wh of [1.06, 0.68]) {
            // Three segments per span with a parabolic sag hint.
            const sag = 0.1 + rng() * 0.06;
            let lx = px;
            let ly = py + wh;
            let lz = pz;
            for (let s2 = 1; s2 <= 3; s2++) {
              const u = s2 / 3;
              const cx = px + (x - px) * u;
              const cz = pz + (z - pz) * u;
              const cy = py + wh + (y - py) * u - sag * 4 * u * (1 - u);
              a.add(wireGeo, xformSpan(lx, ly, lz, cx, cy, cz, 1), wireFace);
              lx = cx;
              ly = cy;
              lz = cz;
            }
          }
        }
        px = x;
        pz = z;
        py = y;
      }
    }
    postGeo.dispose();
    wireGeo.dispose();

    const geo = a.build();
    this.geos.push(geo);
    const mesh = new THREE.Mesh(geo, this.mat!);
    mesh.castShadow = true;
    ctx.scene.add(mesh);
    this.objs.push(mesh);
  }

  /** Fieldstone rocks (moved from terrain.ts), kept off the hero axes. */
  private buildRocks(high: boolean, ctx: Ctx): void {
    const rng = mulberry32(9137);
    const count = high ? 28 : 16;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    this.geos.push(geo);
    const mesh = new THREE.InstancedMesh(geo, this.mat!, count);
    const stone = new THREE.Color(P.stoneGray);
    const warm = new THREE.Color(P.warmGray);
    let placed = 0;
    for (let i = 0; i < 400 && placed < count; i++) {
      const ang = rng() * Math.PI * 2;
      const d = 22 + rng() * 85;
      const x = Math.sin(ang) * d;
      const z = Math.cos(ang) * d;
      const sc = 0.35 + rng() * rng() * 1.5;
      if (nearHeroAxis(x, z, sc > 0.9 ? 9 : 5)) continue;
      this.ie.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      this.iq.setFromEuler(this.ie);
      this.is.set(sc * (0.8 + rng() * 0.5), sc * (0.5 + rng() * 0.4), sc);
      this.iv.set(x, this.groundY(x, z) + sc * 0.15, z);
      mesh.setMatrixAt(placed, this.im.compose(this.iv, this.iq, this.is));
      this.ic.copy(stone).lerp(warm, rng() * 0.6).multiplyScalar(0.85 + rng() * 0.3);
      mesh.setColorAt(placed, this.ic);
      placed++;
    }
    mesh.count = placed;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
    this.objs.push(mesh);
  }
}
