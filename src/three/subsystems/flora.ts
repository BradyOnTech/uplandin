import * as THREE from 'three';
import { mulberry32 } from '../../game/math';
import type { RNG } from '../../game/types';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
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
    // The corridor starts just BEHIND the camera: a prop 6 m out fills a
    // third of the frame as an unlit near-black mass (round-3's dawn-ridge
    // left foreground) — the near field is part of the sightline.
    if (t < -4 || t > 110) continue;
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
  private poolMat?: THREE.MeshBasicMaterial;
  private objs: THREE.Mesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  // Contact-occlusion pool specs: [x, z, rx, rz, yaw] collected while props
  // place, then baked into ONE terrain-conforming multiply-blend mesh.
  private pools: Array<readonly [number, number, number, number, number]> = [];
  // Painted two-tone uniforms (item 9/11): facets turn with the sun — warm
  // toward it, cooled violet away — updated per TOD, shared by every prop.
  private tone = {
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uWarmK: { value: 0 },
    uCoolK: { value: 0 },
  };
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
    // Two-tone sun answer: baked vertex colors are hue/value structure, but
    // the LIGHT DIRECTION is painted here — sun-facing facets take a warm
    // multiplier, shade facets cool toward violet, so canopies and the hero
    // snag visibly turn with the same sun the sky shows. (Flat-shaded
    // normal arrives in view space; viewMatrix^T rotates it back to world.)
    const tone = this.tone;
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tone);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSunDirW;\nuniform float uWarmK;\nuniform float uCoolK;',
        )
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n' +
            '\tvec3 gWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );\n' +
            '\tfloat gSF = dot( gWN, uSunDirW );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.32, 1.12, 0.82 ), clamp( gSF, 0.0, 1.0 ) * uWarmK );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.60, 0.64, 0.80 ), clamp( -gSF, 0.0, 1.0 ) * uCoolK );',
        );
    };
    // Minimum sky-fill ambient: near-camera props must never render as an
    // unlit black mass — a whisper of the TOD's sky ambient rides the
    // emissive channel (scaled by ambient intensity, so lastlight's
    // silhouettes stay silhouettes).
    const applyTod = (tod: TimeOfDay): void => {
      const spec = TOD[tod];
      this.mat!.emissive.setHex(spec.ambientSky);
      // Capped: lastlight drives a strong violet hemisphere to lift the
      // GROUND, but props must stay silhouettes — the emissive whisper
      // must not scale up with it.
      this.mat!.emissiveIntensity = 0.11 * Math.min(spec.ambientIntensity, 0.85);
      const el = THREE.MathUtils.degToRad(spec.sunElevation);
      const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
      this.tone.uSunDirW.value.set(
        Math.sin(az) * Math.cos(el),
        Math.sin(el),
        Math.cos(az) * Math.cos(el),
      );
      this.tone.uWarmK.value = spec.floraWarm;
      this.tone.uCoolK.value = spec.floraCool;
    };
    applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => applyTod(e.detail)) as EventListener);

    this.buildOaks(high, ctx);
    this.buildLandmark(ctx);
    this.buildSnags(ctx);
    this.buildShrubs(high, ctx);
    this.buildCattails(high, ctx);
    this.buildDeadfall(high, ctx);
    this.buildFence(ctx);
    this.buildRocks(high, ctx);
    this.buildContactPools(ctx);
  }

  dispose(ctx: Ctx): void {
    for (const o of this.objs) {
      ctx.scene.remove(o);
      if (o instanceof THREE.InstancedMesh) o.dispose();
    }
    for (const g of this.geos) g.dispose();
    this.mat?.dispose();
    this.poolMat?.dispose();
    this.objs.length = 0;
    this.geos.length = 0;
    this.pools.length = 0;
    this.mat = undefined;
    this.poolMat = undefined;
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
      // Committed underside shade (item 3): canopies hold a dark belly the
      // way noon-open's clouds already shade — that IS the tree's shadow.
      if (ny < -0.15) out.multiplyScalar(0.6);
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
    const base = new THREE.Color(P.oxblood).lerp(new THREE.Color(P.olive), 0.55).lerp(new THREE.Color(P.warmGray), 0.3);
    const top = base.clone().lerp(new THREE.Color(P.khaki), 0.5).multiplyScalar(1.2);
    const dark = new THREE.Color(P.oliveDeep);
    const face = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(base).lerp(dark, rng() * 0.2);
      out.lerp(top, Math.max(ny, 0) * (0.4 + rng() * 0.3));
      if (ny < -0.2) out.multiplyScalar(0.68);
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

  /**
   * Deadfall log, round-4 finish pass (item 6: the old one read as an
   * untextured gray plank in a hero foreground): warm weathered brown wood
   * with silvering confined to the top, dark bark ridge strips running the
   * length, pale cut-end discs, a slight elliptical squash (settled into
   * the ground), and stub branches. Facet variance carries the "texture".
   */
  private buildLog(seed: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    // Weathered deadfall brown: warm gray pulled toward dark russet heart-
    // wood — never the flat fence-gray that read as a placeholder plank.
    const wood = new THREE.Color(P.warmGray).lerp(new THREE.Color(P.russetDeep), 0.32);
    const silver = new THREE.Color(P.stoneGray).lerp(new THREE.Color(P.warmGray), 0.35);
    const bark = new THREE.Color(P.charcoal).lerp(new THREE.Color(P.russetDeep), 0.35);
    const cut = new THREE.Color(P.khaki).lerp(new THREE.Color(P.stoneGray), 0.4);
    const face = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(wood).lerp(silver, Math.max(ny, 0) * (0.45 + rng() * 0.25));
      if (ny < -0.3) out.multiplyScalar(0.55);
      out.multiplyScalar(0.88 + rng() * 0.24);
    };
    const barkFace = (out: THREE.Color): void => {
      out.copy(bark).multiplyScalar(0.8 + rng() * 0.3);
    };
    const cutFace = (out: THREE.Color): void => {
      out.copy(cut).multiplyScalar(0.9 + rng() * 0.2);
    };
    const len = 4.5 + rng() * 2.5;
    const r0 = 0.17;
    const r1 = 0.29;
    const trunk = new THREE.CylinderGeometry(r0, r1, len, 8, 1, true);
    trunk.rotateZ(Math.PI / 2); // lie along +x
    a.add(trunk, xform(0, 0.24, 0, 0.35 + rng() * 0.5, 0, 0, 1, 0.82, 1), face);
    trunk.dispose();
    // Pale cut/broken end discs — sawn-wood value break at both ends.
    for (const [ex, er] of [[len / 2, r0], [-len / 2, r1]] as const) {
      const disc = new THREE.CircleGeometry(er * 0.94, 8);
      disc.rotateY(ex > 0 ? Math.PI / 2 : -Math.PI / 2);
      a.add(disc, xform(ex, 0.24, 0, 0, 0, 0, 1, 0.82, 1), cutFace);
      disc.dispose();
    }
    // Bark ridge strips: thin darker runs along the length at varied rolls
    // — the facet break-up that keeps the barrel from reading as a plank.
    for (let i = 0; i < 4; i++) {
      const roll = (i / 4) * Math.PI * 2 + rng() * 0.8;
      const rr = (r0 + r1) * 0.5 * 0.94;
      const sl = len * (0.35 + rng() * 0.4);
      const strip = new THREE.BoxGeometry(sl, 0.045, 0.1 + rng() * 0.06);
      strip.translate((rng() - 0.5) * len * 0.35, Math.sin(roll) * rr, Math.cos(roll) * rr * 0.82);
      a.add(strip, xform(0, 0.24, 0, 0, 0, 0, 1, 1, 1), barkFace);
      strip.dispose();
    }
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
   * Dead snag, FORMS rebuild — "a tree that died", not a plank:
   *  - swept tapered trunk: three stacked segments, each leaning further
   *    into the prevailing wind, so the silhouette curves;
   *  - splintered break at the crown (two shards, not a clean cylinder cap);
   *  - root flare buttresses grounding the base;
   *  - 2-3 committed branch GESTURES with elbows: a long low arm that kicks
   *    up at the wrist, a counter arm higher, a stub near the top.
   * Weathered grey-brown driftwood with silvering toward the crown.
   */
  private buildSnag(seed: number, h: number, girth: number, nBranch: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    const bark = new THREE.Color(P.warmGray).lerp(new THREE.Color(P.stoneGray), 0.35);
    const silver = new THREE.Color(P.stoneGray).lerp(new THREE.Color(P.cream), 0.2);
    const face = (out: THREE.Color, cy: number): void => {
      out.copy(bark).lerp(silver, THREE.MathUtils.clamp(cy / h, 0, 1) * (0.35 + 0.2 * rng()));
      out.multiplyScalar(0.82 + rng() * 0.2);
    };
    // Swept trunk: segment bases chain; lean accumulates in the +x plane
    // (the mesh's rotation.y stages which way the sweep faces on-site).
    const radii = [0.42 * girth, 0.27 * girth, 0.15 * girth, 0.06 * girth];
    const segH = [0.38 * h, 0.33 * h, 0.29 * h];
    const joints: Array<[number, number, number, number]> = []; // x,y,z,r at seg base
    let bx = 0;
    let by = 0;
    let tilt = 0.04 + rng() * 0.03;
    for (let i = 0; i < 3; i++) {
      joints.push([bx, by, 0, radii[i]]);
      const st = new THREE.CylinderGeometry(radii[i + 1], radii[i], segH[i], 7, 1);
      st.translate(0, segH[i] / 2, 0);
      st.rotateZ(-tilt); // -z rotation leans the +y axis toward +x
      st.translate(bx, by, 0);
      a.add(st, null, face);
      st.dispose();
      bx += Math.sin(tilt) * segH[i];
      by += Math.cos(tilt) * segH[i];
      tilt += 0.05 + rng() * 0.06;
    }
    // Splintered crown: two shards past the break, one long one short —
    // tight to the trunk line (wide splay reads as a teepee of planks).
    for (const [len, dTilt, yaw] of [
      [h * 0.11, 0.05, 0],
      [h * 0.055, -0.2, 1.3],
    ] as const) {
      const sh = new THREE.CylinderGeometry(0.02, radii[3] * 1.2, len, 4, 1);
      sh.translate(0, len / 2, 0);
      sh.rotateZ(-(tilt + dTilt));
      sh.rotateY(yaw);
      sh.translate(bx, by, 0);
      a.add(sh, null, face);
      sh.dispose();
    }
    // Root flare: three short buttresses hugging the trunk base — grounding,
    // not a splay of dark spikes.
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + rng() * 0.9;
      const bl = (0.55 + rng() * 0.25) * girth;
      const bt = new THREE.CylinderGeometry(0.05, 0.2 * girth, bl, 4, 1);
      bt.translate(0, bl / 2, 0);
      bt.rotateZ(0.6 + rng() * 0.18);
      bt.rotateY(ang);
      bt.translate(0, 0.1, 0);
      a.add(bt, null, face);
      bt.dispose();
    }
    // Branch gestures with ELBOWS. Yaw 0 reaches along the trunk's sweep;
    // the counter arm opposes it — asymmetric balance that reads at 30 m.
    const gestures: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
      // jointIdx, yaw, pitch1 (from vertical), lenA/h, elbow kick, lenB/h
      [1, 0.5, 1.3, 0.3, -0.62, 0.22],
      [2, -2.5, 0.95, 0.2, -0.5, 0.14],
      [2, 1.9, 0.62, 0.11, -0.32, 0.07],
    ];
    for (let g = 0; g < Math.min(nBranch, gestures.length); g++) {
      const [ji, yaw0, p1, lA, kick, lB] = gestures[g];
      const yaw = yaw0 + (rng() - 0.5) * 0.3;
      const [jx, jy, jz, jr] = joints[ji];
      const lenA = lA * h;
      const lenB = lB * h;
      const r0 = Math.min(jr * 0.55, 0.16 * girth);
      const armA = new THREE.CylinderGeometry(r0 * 0.5, r0, lenA, 5, 1);
      armA.translate(0, lenA / 2, 0);
      armA.rotateZ(-p1);
      armA.rotateY(yaw);
      armA.translate(jx, jy, jz);
      a.add(armA, null, face);
      armA.dispose();
      // Elbow position, then the forearm kicks back toward vertical.
      const ex = jx + Math.cos(yaw) * Math.sin(p1) * lenA;
      const ey = jy + Math.cos(p1) * lenA;
      const ez = jz - Math.sin(yaw) * Math.sin(p1) * lenA;
      const p2 = p1 + kick;
      const armB = new THREE.CylinderGeometry(0.025, r0 * 0.55, lenB, 4, 1);
      armB.translate(0, lenB / 2, 0);
      armB.rotateZ(-p2);
      armB.rotateY(yaw + (rng() - 0.5) * 0.4);
      armB.translate(ex, ey, ez);
      a.add(armB, null, face);
      armB.dispose();
    }
    return a.build();
  }

  /** Grounding cluster for an anchor prop: low boulders + a brush blob. */
  private buildBaseCluster(seed: number): THREE.BufferGeometry {
    const rng = mulberry32(seed);
    const a = new Asm();
    // Lifted a half stop: the grounding rocks must READ as rocks at dawn,
    // not as more unlit mass under the anchor.
    const stone = new THREE.Color(P.stoneGray).lerp(new THREE.Color(P.warmGray), 0.3);
    const brush = new THREE.Color(P.oxblood).lerp(new THREE.Color(P.olive), 0.55).lerp(new THREE.Color(P.warmGray), 0.45);
    const brushTop = brush.clone().lerp(new THREE.Color(P.khaki), 0.5).multiplyScalar(1.15);
    const stoneFace = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(stone).multiplyScalar(0.88 + rng() * 0.25 + Math.max(ny, 0) * 0.22);
    };
    const brushFace = (out: THREE.Color, _cy: number, ny: number): void => {
      out.copy(brush).lerp(brushTop, Math.max(ny, 0) * (0.4 + rng() * 0.3));
      out.multiplyScalar(0.95 + rng() * 0.2);
    };
    for (let i = 0; i < 4; i++) {
      const ang = rng() * Math.PI * 2;
      const d = 0.9 + rng() * 1.7;
      const rock = new THREE.DodecahedronGeometry(1, 0);
      const sc = 0.6 + rng() * 0.7;
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

  /**
   * Instance a geometry over a placement list. Returns the mesh. poolR > 0
   * records a contact-occlusion pool per instance (radius scales with the
   * instance; poolAspect < 1 stretches it along the instance yaw for logs).
   */
  private instance(
    ctx: Ctx,
    geo: THREE.BufferGeometry,
    spots: ReadonlyArray<readonly [number, number, number, number]>, // x, z, scale, yaw
    sink: number,
    castShadow: boolean,
    rng: RNG,
    poolR = 0,
    poolAspect = 1,
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
      if (poolR > 0) this.pools.push([x, z, poolR * sc, poolR * sc * poolAspect, yaw] as const);
    }
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
    this.objs.push(mesh);
    return mesh;
  }

  /**
   * Contact-occlusion pools (item 8, the cheapest fix in the set): one
   * merged fan mesh, every vertex conformed to heightAt, multiply-blended
   * onto whatever ground pixels lie under it — a soft dark pool beneath
   * every canopy, post, rock, snag and log, so props sit IN the field at
   * every hour, including shadowless noon. Center multiplies ~0.56 (a
   * slightly cool occlusion), feathering to 1.0 (no-op) at the rim.
   */
  private buildContactPools(ctx: Ctx): void {
    const SEG = 10;
    const pos: number[] = [];
    const col: number[] = [];
    const dark: readonly [number, number, number] = [0.5, 0.49, 0.54];
    const mid: readonly [number, number, number] = [0.7, 0.69, 0.74];
    for (const [x, z, rx, rz, yaw] of this.pools) {
      const cy = this.groundY(x, z) + 0.05;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const ring = (a: number, f: number): [number, number, number] => {
        const lx = Math.cos(a) * rx * f;
        const lz = Math.sin(a) * rz * f;
        const wx = x + lx * cosY + lz * sinY;
        const wz = z - lx * sinY + lz * cosY;
        return [wx, Math.min(this.groundY(wx, wz), cy - 0.02) + 0.06, wz];
      };
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2;
        const a1 = ((i + 1) / SEG) * Math.PI * 2;
        const i0 = ring(a0, 0.45);
        const i1 = ring(a1, 0.45);
        const o0 = ring(a0, 1);
        const o1 = ring(a1, 1);
        // Inner disc (flat dark core).
        pos.push(x, cy, z, ...i1, ...i0);
        col.push(...dark, ...mid, ...mid);
        // Feather ring: mid -> no-op white rim.
        pos.push(...i0, ...i1, ...o1, ...i0, ...o1, ...o0);
        col.push(...mid, ...mid, 1, 1, 1, ...mid, 1, 1, 1, 1, 1, 1);
      }
    }
    if (pos.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.computeBoundingSphere();
    this.geos.push(geo);
    this.poolMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      blending: THREE.MultiplyBlending,
      // Required by WebGLState for MultiplyBlending (with alpha=1 the blend
      // reduces to pure src*dst); without it three logs an error and leaves
      // the previous blend state — the pools rendered as opaque pale fans.
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, this.poolMat);
    mesh.renderOrder = 2; // after the order-0 opaque ground/props/grass
    mesh.frustumCulled = false; // spans the map; the one mesh is cheap
    ctx.scene.add(mesh);
    this.objs.push(mesh);
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
      if (spots.length) this.instance(ctx, geos[v], spots, 0.35, true, rng, 3.1);
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
    this.pools.push([26, 96, 7.0, 7.0, 0] as const);
  }

  /** The hero snag (dawn-ridge focal anchor) + the modest dawn-field snag. */
  private buildSnags(ctx: Ctx): void {
    const specs: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
      // x, z, seed, height, girth, branches, stage yaw (rad)
      // HERO: parked exactly on dawn-ridge's right-third line at ~30 m
      // (camera -60,-20 looking az -30; also evening/lastlight right third).
      // Stage yaw faces the trunk sweep across both key sightlines.
      [-84.5, 0.5, 41, 12.0, 2.4, 3, -1.22],
      [-26, 118, 42, 7.6, 1.1, 3, 0.6], // dawn-field counterweight right of center
    ];
    for (const [x, z, seed, h, girth, nb, ry] of specs) {
      const geo = this.buildSnag(seed, h, girth, nb);
      this.geos.push(geo);
      const mesh = new THREE.Mesh(geo, this.mat!);
      mesh.position.set(x, this.groundY(x, z) - 0.2, z);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      ctx.scene.add(mesh);
      this.objs.push(mesh);
      this.pools.push([x, z, 1.1 * girth, 1.1 * girth, 0] as const);
    }
    // Ground the hero snag: boulders and low brush at its feet — an
    // anchor stands IN the field, not plunked on it like a flagpole.
    const base = this.buildBaseCluster(4243);
    this.geos.push(base);
    const bx = -84.5;
    const bz = 0.5;
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
    this.instance(ctx, geo, spots, 0.25, high, rng, 1.8);
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
    // Feathered stand edges: dense hearts, runty fringe stands trailing off
    // radially — never a square clot of equal-sized props.
    const spots: Array<readonly [number, number, number, number]> = [];
    for (const [wx, wz] of wet) {
      const n = high ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * 8;
        const fringe = d / 8;
        spots.push([
          wx + Math.sin(a) * d, wz + Math.cos(a) * d,
          (1.0 - 0.4 * fringe) * (0.85 + rng() * 0.3), rng() * Math.PI * 2,
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
      // 14 m, not 5: a log inside ~10 m of a hero camera fills the bottom
      // third of frame and reads prop-shop (round-3 noon-open's plank).
      if (nearHeroAxis(x, z, 14)) continue;
      spots.push([x, z, 0.8 + rng() * 0.5, rng() * Math.PI * 2] as const);
    }
    this.instance(ctx, geo, spots, 0.06, high, rng, 2.3, 0.33);
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
        this.pools.push([x, z, 0.42, 0.42, 0] as const);
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
      // Capped: a 1.8-scale boulder squatting shadow-side at a frame edge
      // reads as an unlit mass at dawn (round-3 dawn-ridge left edge).
      const sc = 0.35 + rng() * rng() * 0.95;
      if (nearHeroAxis(x, z, sc > 0.8 ? 12 : 5)) continue;
      this.ie.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      this.iq.setFromEuler(this.ie);
      this.is.set(sc * (0.8 + rng() * 0.5), sc * (0.5 + rng() * 0.4), sc);
      this.iv.set(x, this.groundY(x, z) + sc * 0.15, z);
      mesh.setMatrixAt(placed, this.im.compose(this.iv, this.iq, this.is));
      this.ic.copy(stone).lerp(warm, rng() * 0.6).multiplyScalar(0.95 + rng() * 0.3);
      mesh.setColorAt(placed, this.ic);
      this.pools.push([x, z, 1.25 * sc, 1.25 * sc, 0] as const);
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
