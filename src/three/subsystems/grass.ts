import * as THREE from 'three';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
import type { TerrainSystem } from './terrain';

/*
 * GRASS subsystem: the field itself — the single system a walking-through-
 * fields hunting game lives or dies on.
 *
 *  - GROWN, not instanced: placement is a jittered grid (Poisson-style
 *    spacing, no star-field doubles) gated by a layered fertility field.
 *    Below the bare threshold nothing grows — genuinely bare dirt reads
 *    between knots. A fine knot field spawns 2–3 tufts clustered within
 *    half a meter, so the field is knots → fringes → dirt, never a lawn.
 *  - Three geometry variants per tile (three instanced meshes): common
 *    arcing tufts, sparse tall seed-head stalks, low broadleaf forbs.
 *    Blades are two-segment arcs with blunt mid-width tips — no sub-pixel
 *    stipple tips to shimmer in motion.
 *  - Contact grounding: every variant bakes a dark soil skirt fan (t=0,
 *    normals up) under the blades — a contact-shadow blob that rides the
 *    instance matrix for zero extra draw calls, plus dark root colors.
 *  - Ground agreement: tuft base colors sample the SAME noise fields the
 *    terrain paints with (same seed/offsets) plus terrain.heightAt crown
 *    bleaching, so grass and ground stay one patchwork print.
 *  - Lighting: Lambert with normals forced straight up (tufts shade like
 *    the ground they grow from) + a directional cheat in the vertex
 *    shader: sun-facing lean catches a warm rim at the tip, the away side
 *    cools toward the TOD shadow tint. Dawn/evening blades answer the sun.
 *  - Distance: albedo dissolves fully into the per-TOD haze and each
 *    instance scale-collapses to its root inside the LAST THIRD of draw
 *    distance (staggered per instance) — no burnt hedge, no popping.
 *  - Wind in the vertex shader: two traveling waves times a slow gust
 *    field; the camera parts blades inside ~1.2 m so quads never clip the
 *    eye.
 *
 * Per-frame work is two uniform writes and a cell check. All placement
 * happens at init or on a 20 m cell crossing (one ring of tiles, a few ms).
 */

const TILE = 20; // meters — tile grid cell for the roaming open field
const WORLD_LIMIT = 235; // stay on the 480 m terrain plate

interface QualityCfg {
  /** Active open-field radius around the camera (m). */
  radius: number;
  /** Jittered-grid spacing between candidate tuft sites (m). */
  cellStep: number;
  /** Instance capacity per tile per variant. */
  capOpen: number;
  capStalk: number;
  capForb: number;
  /** Per-instance collapse thresholds hash into [near, far] — last third. */
  openFadeNear: number;
  openFadeFar: number;
  /** Cover tufts per m² inside a patch. */
  coverDensity: number;
  coverFadeNear: number;
  coverFadeFar: number;
}

const CFG: Record<'high' | 'lite', QualityCfg> = {
  high: {
    radius: 70,
    cellStep: 0.75,
    capOpen: 1400,
    capStalk: 110,
    capForb: 200,
    openFadeNear: 46,
    openFadeFar: 68,
    coverDensity: 3.0,
    coverFadeNear: 85,
    coverFadeFar: 125,
  },
  lite: {
    radius: 46,
    cellStep: 1.0,
    capOpen: 820,
    capStalk: 70,
    capForb: 130,
    openFadeNear: 30,
    openFadeFar: 44,
    coverDensity: 2.0,
    coverFadeNear: 60,
    coverFadeFar: 95,
  },
};

/** Deterministic per-tile seed so a tile refills identically every visit. */
function hashTile(tx: number, tz: number): number {
  let h = 0x9e3779b9 ^ Math.imul(tx, 374761393) ^ Math.imul(tz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic 2D value noise (identical to terrain's — shared print). */
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/** One ragged-edged elliptical cover patch. */
interface CoverPatch {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  cos: number;
  sin: number;
  ph1: number;
  ph2: number;
}

/** Tuft variants: 0 = common tuft, 1 = seed-head stalk, 2 = low forb. */
const V_OPEN = 0;
const V_STALK = 1;
const V_FORB = 2;

interface Tile {
  meshes: [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];
}

/* ------------------------------------------------------------------ */
/* Shader injection: wind, camera parting, staggered distance collapse */
/* ------------------------------------------------------------------ */

const GRASS_UNIFORM_DECLS = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindAmp;
uniform float uPartRadius;
uniform vec2 uFade;
uniform vec3 uHaze;
uniform vec2 uHazeRange;
uniform vec3 uShadowTint;
uniform vec2 uSunXZ;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uDirStrength;
varying float vRim;
`;

const GRASS_FRAG_DECLS = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimGlow;
varying float vRim;
`;

const GRASS_PROJECT_VERTEX = /* glsl */ `
// Grass tufts: instance matrices are world-space (mesh sits at the origin).
vec4 gWorld = instanceMatrix * vec4( transformed, 1.0 );
vec3 gRoot = vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ], instanceMatrix[ 3 ][ 2 ] );
float gT = uv.y;        // 0 at root/skirt, 1 at tip
float gBend = gT * gT;  // stiff root, mobile tip

// Wind: two traveling waves riding a slow gust field. Phase comes from the
// world position (plus a per-blade jitter in uv.x) so waves roll across the
// field instead of the whole prairie metronoming in sync.
float gPhase = gWorld.x * 0.35 + gWorld.z * 0.24 + uv.x * 6.2831853;
float gSway = 0.62 * sin( uTime * 1.7 - gPhase ) + 0.38 * sin( uTime * 2.9 - gPhase * 1.63 );
float gGust = 0.55 + 0.45 * sin( uTime * 0.7 - ( gWorld.x * uWindDir.x + gWorld.z * uWindDir.y ) * 0.05 );
gWorld.xz += uWindDir * ( uWindAmp * gSway * gGust * gBend );

// Camera parting: blades inside uPartRadius push radially away and duck so
// the eye never clips through a quad while wading.
vec2 gAway = gWorld.xz - cameraPosition.xz;
float gCamD = length( gAway );
float gPart = 1.0 - smoothstep( 0.0, uPartRadius, gCamD );
gPart *= gPart;
gWorld.xz += ( gAway / max( gCamD, 1e-4 ) ) * gPart * 0.55 * gT;
gWorld.y -= gPart * 0.30 * gT;

// Distance collapse, confined to the LAST THIRD of draw distance: each
// tuft shrinks smoothly to its root over a 12 m window ending at a hashed
// per-instance threshold in [uFade.x, uFade.y] — progressive thinning, no
// fade line, no pop, no alpha sorting, and nothing survives past uFade.y.
float gInstD = distance( gRoot.xz, cameraPosition.xz );
float gRand = fract( sin( dot( gRoot.xz, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
float gFadeEnd = mix( uFade.x, uFade.y, gRand );
float gKeep = 1.0 - smoothstep( gFadeEnd - 12.0, gFadeEnd, gInstD );
gWorld.xyz = mix( gRoot, gWorld.xyz, gKeep );

// Directional two-tone: every blade is LIT or SHADE by its lean against
// the sun azimuth, full height — sun-facing blades take a warm lift and a
// tip rim, away blades cool toward the TOD shadow tint over their whole
// length. Light with a direction, even without real grass shadows.
vec2 gLean = gWorld.xz - gRoot.xz;
float gFace = dot( gLean, uSunXZ ) / max( length( gLean ), 1e-4 );
vColor.rgb *= mix( uShadowTint, vec3( 1.0 ), gT );   // root shadow core
float gLit = clamp( gFace, 0.0, 1.0 );
float gShade = clamp( -gFace, 0.0, 1.0 ) * uDirStrength;
vColor.rgb *= mix( vec3( 1.0 ), uShadowTint * 0.62, min( gShade * ( 0.45 + 0.55 * gT ), 0.85 ) );
vColor.rgb *= 1.0 + gLit * uDirStrength * 0.22 * ( 0.3 + 0.7 * gT );
// Backlight rim rides an EMISSIVE varying (albedo tints go black at dusk —
// translucent tips must glow at silhouette hour, not just recolor).
float gRim = min( gLit * gT * uRimStrength, 1.0 );

// Aerial perspective: across the far field the albedo dissolves fully into
// the TOD haze, so silhouettes melt into atmosphere instead of burning to
// a near-black hedge under the ridge line. The rim glow fades with it.
float gHaze = smoothstep( uHazeRange.x, uHazeRange.y, gInstD );
vColor.rgb = mix( vColor.rgb, uHaze, gHaze );
vRim = gRim * ( 1.0 - gHaze );

vec4 mvPosition = viewMatrix * gWorld;
gl_Position = projectionMatrix * mvPosition;
`;

interface GrassUniforms {
  uTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWindAmp: { value: number };
  uPartRadius: { value: number };
  uFade: { value: THREE.Vector2 };
  uHaze: { value: THREE.Color };
  uHazeRange: { value: THREE.Vector2 };
  uShadowTint: { value: THREE.Color };
  uSunXZ: { value: THREE.Vector2 };
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uDirStrength: { value: number };
  uRimGlow: { value: number };
  [key: string]: { value: unknown };
}

/* ------------------------------------------------------------------ */
/* Geometry builder                                                    */
/* ------------------------------------------------------------------ */

/** Accumulates flat-shaded, up-normal triangles with baked vertex color. */
class GeoBuilder {
  positions: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];

  /** One vertex: position, root→tip t, per-blade wind phase, color mult. */
  vert(x: number, y: number, z: number, t: number, phase: number, r: number, g: number, b: number): void {
    this.positions.push(x, y, z);
    this.colors.push(r, g, b);
    this.uvs.push(phase, t);
  }

  /**
   * Two-segment arcing blade with a blunt tip: root quad (full → mid width)
   * then a short tip triangle from mid width — the tip never collapses to a
   * sub-pixel spike that stipples at range. Color lerps rootC → tipC.
   */
  blade(
    rx: number,
    rz: number,
    ang: number,
    lean: number,
    h: number,
    w: number,
    rootC: readonly [number, number, number],
    tipC: readonly [number, number, number],
    bright: number,
    phase: number,
  ): void {
    const ox = Math.sin(ang);
    const oz = Math.cos(ang);
    const sx = Math.cos(ang);
    const sz = -Math.sin(ang);
    const mT = 0.55;
    const mx = rx + ox * Math.sin(lean) * h * mT;
    const my = Math.cos(lean) * h * mT;
    const mz = rz + oz * Math.sin(lean) * h * mT;
    const lean2 = lean * 2.3; // drooping tip — grass arcs, not spikes
    const tx = mx + ox * Math.sin(lean2) * h * (1 - mT);
    const ty = my + Math.cos(lean2) * h * (1 - mT);
    const tz = mz + oz * Math.sin(lean2) * h * (1 - mT);
    const mw = w * 0.6;
    const col = (t: number): [number, number, number] => [
      (rootC[0] + (tipC[0] - rootC[0]) * t) * bright,
      (rootC[1] + (tipC[1] - rootC[1]) * t) * bright,
      (rootC[2] + (tipC[2] - rootC[2]) * t) * bright,
    ];
    const [r0r, r0g, r0b] = col(0);
    const [mr, mg, mb] = col(mT);
    const [tr, tg, tb] = col(1);
    // Root quad.
    this.vert(rx - (sx * w) / 2, 0, rz - (sz * w) / 2, 0, phase, r0r, r0g, r0b);
    this.vert(rx + (sx * w) / 2, 0, rz + (sz * w) / 2, 0, phase, r0r, r0g, r0b);
    this.vert(mx + (sx * mw) / 2, my, mz + (sz * mw) / 2, mT, phase, mr, mg, mb);
    this.vert(rx - (sx * w) / 2, 0, rz - (sz * w) / 2, 0, phase, r0r, r0g, r0b);
    this.vert(mx + (sx * mw) / 2, my, mz + (sz * mw) / 2, mT, phase, mr, mg, mb);
    this.vert(mx - (sx * mw) / 2, my, mz - (sz * mw) / 2, mT, phase, mr, mg, mb);
    // Blunt tip triangle from mid width.
    this.vert(mx - (sx * mw) / 2, my, mz - (sz * mw) / 2, mT, phase, mr, mg, mb);
    this.vert(mx + (sx * mw) / 2, my, mz + (sz * mw) / 2, mT, phase, mr, mg, mb);
    this.vert(tx, ty, tz, 1, phase, tr, tg, tb);
  }

  /**
   * Contact-grounding skirt: a low fan of soil-dark triangles under the
   * tuft (t=0, no wind). Baked into the tuft geometry, it rides the
   * instance matrix — contact shadow with zero extra draw calls. Warm-dark
   * center melting to near-ground brightness at the rim.
   */
  skirt(radius: number, n: number, rng: () => number): void {
    const cy = 0.05; // slight dome so gentle slopes never float it
    const ey = 0.015;
    const c: [number, number, number] = [0.3, 0.27, 0.21];
    const e: [number, number, number] = [0.74, 0.69, 0.58];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const r0 = radius * (0.85 + rng() * 0.3);
      const r1 = radius * (0.85 + rng() * 0.3);
      this.vert(0, cy, 0, 0, 0, c[0], c[1], c[2]);
      this.vert(Math.sin(a0) * r0, ey, Math.cos(a0) * r0, 0, 0, e[0], e[1], e[2]);
      this.vert(Math.sin(a1) * r1, ey, Math.cos(a1) * r1, 0, 0, e[0], e[1], e[2]);
    }
  }

  /** Seed-head stalk: thin stem quad topped with a pale diamond head. */
  stalk(rx: number, rz: number, ang: number, lean: number, h: number, rng: () => number): void {
    const ox = Math.sin(ang);
    const oz = Math.cos(ang);
    const sx = Math.cos(ang);
    const sz = -Math.sin(ang);
    const w = 0.03;
    const phase = rng();
    const topT = 0.72;
    const tx = rx + ox * Math.sin(lean) * h;
    const ty = Math.cos(lean) * h;
    const tz = rz + oz * Math.sin(lean) * h;
    const stemR: [number, number, number] = [0.5, 0.46, 0.34];
    const stemT: [number, number, number] = [1.0, 0.92, 0.66];
    // Stem quad (root width → 60%).
    this.vert(rx - (sx * w) / 2, 0, rz - (sz * w) / 2, 0, phase, stemR[0], stemR[1], stemR[2]);
    this.vert(rx + (sx * w) / 2, 0, rz + (sz * w) / 2, 0, phase, stemR[0], stemR[1], stemR[2]);
    this.vert(tx + (sx * w * 0.3), ty, tz + (sz * w * 0.3), topT, phase, stemT[0], stemT[1], stemT[2]);
    this.vert(rx - (sx * w) / 2, 0, rz - (sz * w) / 2, 0, phase, stemR[0], stemR[1], stemR[2]);
    this.vert(tx + (sx * w * 0.3), ty, tz + (sz * w * 0.3), topT, phase, stemT[0], stemT[1], stemT[2]);
    this.vert(tx - (sx * w * 0.3), ty, tz - (sz * w * 0.3), topT, phase, stemT[0], stemT[1], stemT[2]);
    // Diamond seed head — the pale catch-light silhouette at the skyline.
    const hh = 0.16 * (0.85 + rng() * 0.3);
    const hw = 0.042;
    const head: [number, number, number] = [1.34, 1.26, 1.0];
    const headLo: [number, number, number] = [1.05, 0.96, 0.72];
    this.vert(tx, ty - hh * 0.25, tz, topT, phase, headLo[0], headLo[1], headLo[2]);
    this.vert(tx + sx * hw, ty + hh * 0.35, tz + sz * hw, 0.86, phase, head[0], head[1], head[2]);
    this.vert(tx, ty + hh, tz, 1, phase, head[0], head[1], head[2]);
    this.vert(tx, ty - hh * 0.25, tz, topT, phase, headLo[0], headLo[1], headLo[2]);
    this.vert(tx, ty + hh, tz, 1, phase, head[0], head[1], head[2]);
    this.vert(tx - sx * hw, ty + hh * 0.35, tz - sz * hw, 0.86, phase, head[0], head[1], head[2]);
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const count = this.positions.length / 3;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.positions), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.colors), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uvs), 2));
    // Every normal straight up: tufts shade like the ground they grow from.
    const normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) normals[i * 3 + 1] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

export class GrassSystem implements Subsystem {
  readonly id = 'grass';

  private cfg!: QualityCfg;
  private terrain!: TerrainSystem;
  // Clump structure: knots of dense grass and genuinely bare dirt patches —
  // the anti-lawn. Fertility (macro+meso) decides WHERE grass grows at all;
  // the fine knot field decides where it bunches 2–3 tufts tight.
  private clumpNoise = makeNoise(4127);
  // The terrain's own paint fields (same seed, same offsets): grass base
  // color samples the ground's patchwork so field and floor agree.
  private groundNoise = makeNoise(1971);

  private variantGeos: THREE.BufferGeometry[] = [];
  private coverGeo!: THREE.BufferGeometry;
  private openMat!: THREE.MeshLambertMaterial;
  private coverMat!: THREE.MeshLambertMaterial;
  private openUniforms!: GrassUniforms;
  private coverUniforms!: GrassUniforms;

  private patches: CoverPatch[] = [];
  private patchMeshes: THREE.InstancedMesh[] = [];

  private pool: Tile[] = [];
  private free: Tile[] = [];
  private active = new Map<number, Tile>();
  private offsets: Array<readonly [number, number]> = [];
  private lastCellX = Number.NaN;
  private lastCellZ = Number.NaN;

  // Preallocated scratch — nothing allocated per frame, and rebuilds reuse.
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private releaseScratch: number[] = [];
  private wanted = new Set<number>();

  // Palette anchors (created once).
  private straw = new THREE.Color(P.straw);
  private khaki = new THREE.Color(P.khaki);
  private strawLight = new THREE.Color(P.strawLight);
  private strawPale = new THREE.Color(P.strawPale);
  private oliveMid = new THREE.Color(P.oliveMid);
  private olive = new THREE.Color(P.olive);
  private oliveDeep = new THREE.Color(P.oliveDeep);
  private rimPale = new THREE.Color(P.strawPale);
  // Round-3 hue separation: tufts live in the straw-gold band with olive
  // undertones — a different material from the brown soil under them.
  private grassGold = new THREE.Color(P.grassGold);
  private grassOlive = new THREE.Color(P.grassOlive);
  private forbGreen = new THREE.Color(P.forbGreen);

  init(ctx: Ctx): void {
    this.cfg = CFG[ctx.quality];
    this.terrain = ctx.get<TerrainSystem>('terrain');

    this.buildVariantGeos(ctx.rng);

    this.openUniforms = this.makeUniforms(0.09, this.cfg.openFadeNear, this.cfg.openFadeFar);
    this.coverUniforms = this.makeUniforms(0.13, this.cfg.coverFadeNear, this.cfg.coverFadeFar);
    this.openMat = this.makeMaterial(this.openUniforms);
    this.coverMat = this.makeMaterial(this.coverUniforms);

    this.buildPatches(ctx);

    // Tile pool sized to the worst-case active set (+ margin ring).
    const n = Math.ceil(this.cfg.radius / TILE) + 1;
    for (let dx = -n; dx <= n; dx++) {
      for (let dz = -n; dz <= n; dz++) {
        const d = Math.hypot((dx + 0.5) * TILE, (dz + 0.5) * TILE);
        if (d <= this.cfg.radius + TILE * 0.5) this.offsets.push([dx, dz] as const);
      }
    }
    const caps = [this.cfg.capOpen, this.cfg.capStalk, this.cfg.capForb];
    for (let i = 0; i < this.offsets.length; i++) {
      const mkMesh = (vi: number): THREE.InstancedMesh => {
        const mesh = new THREE.InstancedMesh(this.variantGeos[vi], this.openMat, caps[vi]);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(caps[vi] * 3), 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.visible = false;
        mesh.castShadow = false;
        // Tree/prop shadows fall across the grass (sampled at the root
        // position — no swim): the cast-shadow corroboration item 2 asks for.
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        ctx.scene.add(mesh);
        return mesh;
      };
      const tile: Tile = { meshes: [mkMesh(V_OPEN), mkMesh(V_STALK), mkMesh(V_FORB)] };
      this.pool.push(tile);
      this.free.push(tile);
    }

    this.applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => this.applyTod(e.detail)) as EventListener);

    this.rebuild(ctx);
  }

  /**
   * Cover strength at a point: 0 in the open, →1 in the heart of a patch.
   * Ragged elliptical edges from two angular harmonics. The sim wires into
   * this later; the dog and birds will read the same field the eye does.
   */
  coverAt(x: number, z: number): number {
    let best = 0;
    for (let i = 0; i < this.patches.length; i++) {
      const p = this.patches[i];
      const dx = x - p.cx;
      const dz = z - p.cz;
      const lx = dx * p.cos + dz * p.sin;
      const lz = -dx * p.sin + dz * p.cos;
      const ex = lx / p.rx;
      const ez = lz / p.rz;
      const rho = Math.sqrt(ex * ex + ez * ez);
      if (rho > 1.5) continue;
      const th = Math.atan2(ez, ex);
      const edge = 1 + 0.22 * Math.sin(3 * th + p.ph1) + 0.14 * Math.sin(6 * th + p.ph2);
      const s = THREE.MathUtils.clamp((edge - rho) / (edge * 0.35), 0, 1);
      if (s > best) best = s;
    }
    return best;
  }

  update(ctx: Ctx): void {
    this.openUniforms.uTime.value = ctx.time;
    this.coverUniforms.uTime.value = ctx.time;
    const cx = Math.floor(ctx.camera.position.x / TILE);
    const cz = Math.floor(ctx.camera.position.z / TILE);
    if (cx !== this.lastCellX || cz !== this.lastCellZ) this.rebuild(ctx);
  }

  dispose(ctx: Ctx): void {
    for (const tile of this.pool) {
      for (const mesh of tile.meshes) {
        ctx.scene.remove(mesh);
        mesh.dispose();
      }
    }
    for (const mesh of this.patchMeshes) {
      ctx.scene.remove(mesh);
      mesh.dispose();
    }
    this.pool.length = 0;
    this.free.length = 0;
    this.active.clear();
    this.patchMeshes.length = 0;
    for (const g of this.variantGeos) g.dispose();
    this.variantGeos.length = 0;
    this.coverGeo.dispose();
    this.openMat.dispose();
    this.coverMat.dispose();
  }

  /* ---------------------------------------------------------------- */

  /** The four tuft geometries (built once from ctx.rng, shared by meshes). */
  private buildVariantGeos(rng: () => number): void {
    // V_OPEN — common arcing tuft: 6 blades, mixed height and verticality,
    // clustered root footprint, soil skirt underneath.
    {
      const b = new GeoBuilder();
      const rootC = [0.4, 0.4, 0.33] as const;
      const tipC = [1.18, 1.12, 0.86] as const;
      for (let i = 0; i < 6; i++) {
        const ang = ((i + rng() * 0.8) / 6) * Math.PI * 2;
        const lean = rng() < 0.35 ? 0.05 + rng() * 0.1 : 0.16 + rng() * 0.3;
        const h = 0.36 + rng() * 0.32;
        const r0 = 0.05 * (0.3 + rng() * 0.7);
        b.blade(Math.sin(ang) * r0, Math.cos(ang) * r0, ang, lean, h, 0.05 * (0.85 + rng() * 0.4), rootC, tipC, 0.9 + rng() * 0.25, rng());
      }
      b.skirt(0.17, 6, rng);
      this.variantGeos[V_OPEN] = b.build();
    }
    // V_STALK — tall seed-head stalks with a couple of base blades: the
    // occasional taller silhouette that breaks the even grass line.
    {
      const b = new GeoBuilder();
      const rootC = [0.42, 0.42, 0.34] as const;
      const tipC = [1.1, 1.02, 0.74] as const;
      for (let i = 0; i < 3; i++) {
        const ang = ((i + rng()) / 3) * Math.PI * 2;
        b.stalk(Math.sin(ang) * 0.03, Math.cos(ang) * 0.03, ang, 0.03 + rng() * 0.09, 0.85 + rng() * 0.4, rng);
      }
      for (let i = 0; i < 3; i++) {
        const ang = rng() * Math.PI * 2;
        b.blade(Math.sin(ang) * 0.04, Math.cos(ang) * 0.04, ang, 0.2 + rng() * 0.3, 0.3 + rng() * 0.2, 0.05, rootC, tipC, 0.9 + rng() * 0.2, rng());
      }
      b.skirt(0.13, 5, rng);
      this.variantGeos[V_STALK] = b.build();
    }
    // V_FORB — low broadleaf weed: wide short leaves splaying flat, greener
    // than the grass. Ground-hugging texture between tufts.
    {
      const b = new GeoBuilder();
      const rootC = [0.42, 0.46, 0.32] as const;
      const tipC = [0.98, 1.08, 0.66] as const;
      for (let i = 0; i < 8; i++) {
        const ang = ((i + rng() * 0.9) / 8) * Math.PI * 2;
        const lean = 0.5 + rng() * 0.45;
        const h = 0.13 + rng() * 0.12;
        b.blade(Math.sin(ang) * 0.02, Math.cos(ang) * 0.02, ang, lean, h, 0.085 * (0.8 + rng() * 0.4), rootC, tipC, 0.85 + rng() * 0.3, rng());
      }
      b.skirt(0.14, 6, rng);
      this.variantGeos[V_FORB] = b.build();
    }
    // Cover tuft — taller, fuller, darker-rooted, one baked seed stalk so
    // the cover skyline gets catch-light heads instead of a mown hedge top.
    {
      const b = new GeoBuilder();
      const rootC = [0.34, 0.36, 0.28] as const;
      const tipC = [1.02, 0.98, 0.7] as const;
      for (let i = 0; i < 9; i++) {
        const ang = ((i + rng() * 0.8) / 9) * Math.PI * 2;
        const lean = rng() < 0.4 ? 0.04 + rng() * 0.1 : 0.14 + rng() * 0.3;
        const h = 0.6 + rng() * 0.35;
        const r0 = 0.1 * (0.3 + rng() * 0.7);
        b.blade(Math.sin(ang) * r0, Math.cos(ang) * r0, ang, lean, h, 0.062 * (0.85 + rng() * 0.4), rootC, tipC, 0.88 + rng() * 0.26, rng());
      }
      b.stalk(0, 0, rng() * Math.PI * 2, 0.04 + rng() * 0.06, 1.05 + rng() * 0.25, rng);
      b.skirt(0.22, 6, rng);
      this.coverGeo = b.build();
    }
  }

  private makeUniforms(windAmp: number, fadeNear: number, fadeFar: number): GrassUniforms {
    return {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(0.74, 0.67).normalize() },
      uWindAmp: { value: windAmp },
      uPartRadius: { value: 1.2 },
      uFade: { value: new THREE.Vector2(fadeNear, fadeFar) },
      uHaze: { value: new THREE.Color(P.grassHazeDawn) },
      // Haze holds off until past half the draw distance: round-2's early
      // onset bleached the whole midfield to cream at noon.
      uHazeRange: { value: new THREE.Vector2(fadeFar * 0.55, fadeFar * 1.05) },
      uShadowTint: { value: new THREE.Color(P.shadowNeutral) },
      uSunXZ: { value: new THREE.Vector2(1, 0) },
      uRimColor: { value: new THREE.Color(P.sunLow) },
      uRimStrength: { value: 0.5 },
      uDirStrength: { value: 0.6 },
      uRimGlow: { value: 0.4 },
    };
  }

  /** Re-key the atmosphere uniforms off the TOD spec (haze, shadow, rim). */
  private applyTod(tod: TimeOfDay): void {
    const spec = TOD[tod];
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
    for (const u of [this.openUniforms, this.coverUniforms]) {
      u.uHaze.value.setHex(spec.grassHaze);
      u.uShadowTint.value.setHex(spec.grassShadow);
      u.uSunXZ.value.set(Math.sin(az), Math.cos(az));
      // Rim: the sun color pulled slightly toward pale straw; strength rides
      // the TOD's horizon heat hard — dawn/evening blades must answer the
      // sun; noon keeps only a whisper (a hot rim at noon bleaches tips).
      u.uRimColor.value.setHex(spec.sunColor).lerp(this.rimPale, 0.25);
      u.uRimStrength.value = 0.12 + 0.75 * spec.hotStrength;
      // Two-tone strength: strong at the golden hours, present at noon.
      u.uDirStrength.value = 0.4 + 0.5 * spec.hotStrength;
      // Emissive backlight scale rides the sun-glow (low sun = hot rims).
      u.uRimGlow.value = spec.glowStrength * 0.55;
    }
  }

  /**
   * Lambert with three injections: uniforms, the wind/part/fade vertex
   * displacement, and a fragment override that pins the shading normal to
   * straight-up (DoubleSide would otherwise flip backfaces dark — grass must
   * shade exactly like the ground it grows from, that is the whole trick).
   */
  private makeMaterial(uniforms: GrassUniforms): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + GRASS_UNIFORM_DECLS)
        .replace('#include <project_vertex>', GRASS_PROJECT_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GRASS_FRAG_DECLS)
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uRimColor * ( vRim * uRimGlow );',
        );
    };
    return mat;
  }

  /**
   * Base tuft color at a world point: sample the SAME fields the terrain
   * paints with (same seed and offsets) for spatial agreement, but remap
   * them into the grass band — straw-gold with olive/green undertones —
   * so tufts hue-separate from the brown soil they grow in. Writes this.c.
   */
  private groundColorAt(x: number, z: number, y: number): void {
    const patch = this.groundNoise(x * 0.016 + 700, z * 0.016 + 700);
    this.c.copy(this.grassGold).lerp(this.strawPale, Math.min(0.32, patch * 0.36));
    // Olive undertone everywhere, deepening in the terrain's cool sweeps.
    const cool = this.groundNoise(x * 0.011 + 1900, z * 0.011 + 1900);
    this.c.lerp(this.grassOlive, 0.2 + Math.max(0, (0.45 - cool)) * 0.9);
    // Dry runs go khaki-dry, matching the soil's dry patches.
    const dry = this.groundNoise(x * 0.021 + 4200, z * 0.021 + 4200);
    if (dry < 0.42) this.c.lerp(this.khaki, Math.min(0.45, (0.42 - dry) * 1.1));
    const hNorm = THREE.MathUtils.clamp((y - 8) / 8, 0, 1);
    this.c.lerp(this.strawPale, hNorm * 0.2);
  }

  /** ~6 ragged cover patches; first two parked where the shot set looks. */
  private buildPatches(ctx: Ctx): void {
    const mk = (cx: number, cz: number, rx: number, rz: number): CoverPatch => {
      const rot = ctx.rng() * Math.PI;
      return {
        cx,
        cz,
        rx,
        rz,
        cos: Math.cos(rot),
        sin: Math.sin(rot),
        ph1: ctx.rng() * Math.PI * 2,
        ph2: ctx.rng() * Math.PI * 2,
      };
    };
    // Two patches on the hero sight lines (dawn-field looks +z from z=40;
    // evening/lastlight look -x), the rest scattered in a ring. Kept inside
    // ~120 m of the origin so no stray patch burns on a far swell.
    this.patches.push(mk(12, 78, 18, 12));
    this.patches.push(mk(-52, 28, 16, 11));
    for (let i = 0; i < 4; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const d = 40 + ctx.rng() * 80;
      const cx = THREE.MathUtils.clamp(Math.sin(a) * d, -160, 160);
      const cz = THREE.MathUtils.clamp(Math.cos(a) * d, -160, 160);
      this.patches.push(mk(cx, cz, 10 + ctx.rng() * 12, 7 + ctx.rng() * 9));
    }

    for (const p of this.patches) {
      const ext = Math.max(p.rx, p.rz) * 1.45;
      const attempts = Math.ceil(this.cfg.coverDensity * (2 * ext) * (2 * ext));
      const mats: THREE.Matrix4[] = [];
      const cols: THREE.Color[] = [];
      const rng = mulberry32(hashTile(Math.round(p.cx * 7), Math.round(p.cz * 7)));
      for (let i = 0; i < attempts; i++) {
        const x = p.cx + (rng() * 2 - 1) * ext;
        const z = p.cz + (rng() * 2 - 1) * ext;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        const s = this.coverAt(x, z);
        if (rng() > s * 1.25) continue;
        const y = this.terrain.heightAt(x, z) - 0.05;
        this.e.set(0, rng() * Math.PI * 2, 0);
        this.q.setFromEuler(this.e);
        const sxz = 0.8 + rng() * 0.5;
        this.s.set(sxz, 0.85 + rng() * 0.4, sxz);
        this.v.set(x, y, z);
        mats.push(new THREE.Matrix4().compose(this.v, this.q, this.s));
        // Olive going darker toward the heart; khaki-tipped at the edge.
        // Kept warm-olive and LIGHT enough to survive dawn light + distance
        // haze — burnt-dark cover was round 1's "charred hedge" tell.
        this.c.copy(this.khaki).lerp(this.oliveMid, 0.3 + rng() * 0.4);
        this.c.lerp(this.olive, s * (0.15 + rng() * 0.15));
        if (rng() < 0.05) this.c.lerp(this.oliveDeep, 0.18);
        this.c.multiplyScalar(1.08 + rng() * 0.3);
        cols.push(this.c.clone());
      }
      if (mats.length === 0) continue;
      const mesh = new THREE.InstancedMesh(this.coverGeo, this.coverMat, mats.length);
      for (let i = 0; i < mats.length; i++) {
        mesh.setMatrixAt(i, mats[i]);
        mesh.setColorAt(i, cols[i]);
      }
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh);
      this.patchMeshes.push(mesh);
    }
  }

  /** Re-point the roaming tile grid at the camera's current cell. */
  private rebuild(ctx: Ctx): void {
    const ccx = Math.floor(ctx.camera.position.x / TILE);
    const ccz = Math.floor(ctx.camera.position.z / TILE);
    this.lastCellX = ccx;
    this.lastCellZ = ccz;

    this.wanted.clear();
    for (let i = 0; i < this.offsets.length; i++) {
      const [dx, dz] = this.offsets[i];
      this.wanted.add(this.key(ccx + dx, ccz + dz));
    }
    // Release tiles that drifted out of range.
    this.releaseScratch.length = 0;
    for (const k of this.active.keys()) {
      if (!this.wanted.has(k)) this.releaseScratch.push(k);
    }
    for (let i = 0; i < this.releaseScratch.length; i++) {
      const k = this.releaseScratch[i];
      const tile = this.active.get(k)!;
      this.active.delete(k);
      for (const mesh of tile.meshes) {
        mesh.count = 0;
        mesh.visible = false;
      }
      this.free.push(tile);
    }
    // Fill the newly wanted cells from the pool.
    for (let i = 0; i < this.offsets.length; i++) {
      const [dx, dz] = this.offsets[i];
      const tx = ccx + dx;
      const tz = ccz + dz;
      const k = this.key(tx, tz);
      if (this.active.has(k)) continue;
      const tile = this.free.pop();
      if (!tile) break; // pool exhausted — impossible by construction
      this.fillTile(tile, tx, tz);
      this.active.set(k, tile);
    }
  }

  private key(tx: number, tz: number): number {
    return (tx + 2048) * 4096 + (tz + 2048);
  }

  /** Place one tuft instance; returns false if the variant cap is full. */
  private placeTuft(
    tile: Tile,
    counts: number[],
    caps: number[],
    vi: number,
    px: number,
    pz: number,
    vigor: number,
    rng: () => number,
  ): boolean {
    if (counts[vi] >= caps[vi]) return false;
    const y = this.terrain.heightAt(px, pz) - 0.04;
    this.e.set((rng() - 0.5) * 0.16, rng() * Math.PI * 2, (rng() - 0.5) * 0.16);
    this.q.setFromEuler(this.e);
    const sxz = vigor * (0.85 + rng() * 0.3);
    this.s.set(sxz, vigor * (0.8 + rng() * 0.4), sxz);
    this.v.set(px, y, pz);
    this.m.compose(this.v, this.q, this.s);

    // Grass-band base color + per-variant character.
    this.groundColorAt(px, pz, y);
    if (vi === V_FORB) {
      // Green forbs — the third hue family scattered through the stubble.
      this.c.lerp(this.forbGreen, 0.55 + rng() * 0.3);
    } else if (vi === V_STALK) {
      this.c.lerp(this.strawLight, 0.2 + rng() * 0.2).multiplyScalar(1.05);
    } else {
      const p2 = rng();
      if (p2 < 0.12) this.c.lerp(this.strawLight, 0.2 + rng() * 0.2);
      else if (p2 < 0.3) this.c.lerp(this.grassOlive, 0.25 + rng() * 0.25);
    }
    this.c.multiplyScalar(0.9 + rng() * 0.26);

    const mesh = tile.meshes[vi];
    mesh.setMatrixAt(counts[vi], this.m);
    mesh.setColorAt(counts[vi], this.c);
    counts[vi]++;
    return true;
  }

  /**
   * Deterministic tile fill: same tile, same tufts, every visit. Round-3
   * structure inversion: grass grows in CLUMPS of 5-15 tufts (2-3x scale
   * swing from clump heart to fringe runts) on a coarse jittered lattice,
   * with a low ground-cover sprinkle of runts and green forbs between the
   * clumps — so bare soil reads as patches inside grass, never grass as
   * ornaments sprinkled on dirt.
   */
  private fillTile(tile: Tile, tx: number, tz: number): void {
    const rng = mulberry32(hashTile(tx, tz));
    const counts = [0, 0, 0];
    const caps = [this.cfg.capOpen, this.cfg.capStalk, this.cfg.capForb];
    // Clump lattice: candidate centers every ~2.7x the round-2 site step.
    const cStep = this.cfg.cellStep * 2.7;
    const cells = Math.floor(TILE / cStep);
    for (let gx = 0; gx < cells; gx++) {
      for (let gz = 0; gz < cells; gz++) {
        const x = tx * TILE + (gx + 0.1 + rng() * 0.8) * cStep;
        const z = tz * TILE + (gz + 0.1 + rng() * 0.8) * cStep;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        const skipCover = rng() < 0.85; // cover keeps a little open straw mixed in
        if (skipCover && this.coverAt(x, z) > 0.35) continue;

        // Fertility: macro meadows (~14 m) + meso patchiness (~5 m).
        const macro = this.clumpNoise(x * 0.055 + 40, z * 0.055 + 40);
        const meso = this.clumpNoise(x * 0.16 + 700, z * 0.16 + 700);
        const fertile = macro * 0.62 + meso * 0.38;
        if (fertile < 0.38) {
          // Genuinely bare dirt — at most a lone runt clinging on.
          if (fertile > 0.31 && rng() < 0.3) {
            this.placeTuft(tile, counts, caps, rng() < 0.45 ? V_FORB : V_OPEN,
              x + (rng() - 0.5) * cStep * 0.6, z + (rng() - 0.5) * cStep * 0.6,
              0.4 + rng() * 0.2, rng);
          }
          continue;
        }
        const edge = THREE.MathUtils.clamp((fertile - 0.38) / 0.24, 0, 1);

        // One clump: 5-15 tufts inside ~a meter, big in the heart, runts at
        // the fringe (2-3x scale swing), a shared per-clump hue lean.
        const n = Math.round((6 + rng() * 9) * (0.55 + 0.45 * edge));
        const clumpR = 0.72 + rng() * 0.6 + edge * 0.25;
        const clumpOlive = rng() * 0.3;
        for (let i = 0; i < n; i++) {
          const ang = rng() * Math.PI * 2;
          const d = Math.sqrt(rng()) * clumpR;
          const px = x + Math.sin(ang) * d;
          const pz = z + Math.cos(ang) * d;
          const core = 1 - d / clumpR; // 1 at heart, 0 at fringe
          const pick = rng();
          let vi = V_OPEN;
          if (pick < 0.05 && core > 0.5 && edge > 0.4) vi = V_STALK;
          else if (pick < 0.05 + 0.1 * (1 - core)) vi = V_FORB;
          const vigor = (0.45 + 0.85 * core * (0.7 + 0.3 * edge)) * (0.85 + rng() * 0.3);
          if (this.placeTuft(tile, counts, caps, vi, px, pz, vigor, rng)) {
            // Nudge the whole clump toward one shared hue so clumps read as
            // individuals — repaint the color placeTuft just wrote.
            const mesh = tile.meshes[vi];
            this.c.lerp(this.grassOlive, clumpOlive);
            mesh.setColorAt(counts[vi] - 1, this.c);
          }
        }
      }
    }

    // Ground cover between clumps: a fine sprinkle of runts and green forbs
    // over the fertile fringes, so clump gaps stay grassy, not bald.
    const gStep = this.cfg.cellStep * 1.6;
    const gCells = Math.floor(TILE / gStep);
    for (let gx = 0; gx < gCells; gx++) {
      for (let gz = 0; gz < gCells; gz++) {
        if (rng() < 0.45) continue;
        const x = tx * TILE + (gx + 0.1 + rng() * 0.8) * gStep;
        const z = tz * TILE + (gz + 0.1 + rng() * 0.8) * gStep;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        if (this.coverAt(x, z) > 0.35 && rng() < 0.85) continue;
        const macro = this.clumpNoise(x * 0.055 + 40, z * 0.055 + 40);
        const meso = this.clumpNoise(x * 0.16 + 700, z * 0.16 + 700);
        const fertile = macro * 0.62 + meso * 0.38;
        if (fertile < 0.3) continue;
        const vi = rng() < 0.3 ? V_FORB : V_OPEN;
        this.placeTuft(tile, counts, caps, vi, x, z, 0.35 + rng() * 0.3, rng);
      }
    }
    for (let vi = 0; vi < 3; vi++) {
      const mesh = tile.meshes[vi];
      mesh.count = counts[vi];
      mesh.visible = counts[vi] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (counts[vi] > 0) mesh.computeBoundingSphere();
    }
  }
}
