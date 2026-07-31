import * as THREE from 'three';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
import type { TerrainSystem } from './terrain';

/*
 * GRASS subsystem: the field itself — the single system a walking-through-
 * fields hunting game lives or dies on.
 *
 *  - Instanced blade-fan tufts. Open field: sparse, knee-high, walkable.
 *    Cover: dense, waist-high, visibly darker olive — bird-holding cover a
 *    hunter reads at 80 yards. ~6 ragged elliptical patches, deterministic
 *    from ctx.rng (sim wiring comes later; coverAt(x,z) is the query).
 *  - Lighting: MeshLambertMaterial with every normal forced straight UP so
 *    each tuft shades exactly like the ground it grows from — grass and
 *    terrain stay one print across all five times of day, no material split.
 *    A baked root→tip vertex-color gradient (dark cool root, warm pale tip)
 *    carries the depth that normals would have.
 *  - Wind in the vertex shader: phase from world position, two traveling
 *    waves times a slow gust field, so waves ROLL across the field rather
 *    than every blade metronoming in sync.
 *  - The camera wades through it: blades inside ~1.2 m push radially away
 *    from the camera and duck, so quads never clip through the eye.
 *  - Distance: open-field tufts live in a roaming grid of pooled
 *    InstancedMesh tiles around the camera, refilled deterministically from
 *    a per-tile hash seed whenever the camera crosses a cell (identical
 *    placement every visit — no reshuffle). Each instance collapses to its
 *    root at a per-instance hashed distance, giving progressive thinning
 *    with zero pop and zero alpha sorting; beyond that the terrain's straw
 *    patchwork carries the field to the horizon.
 *
 * Per-frame work is two uniform writes and a cell check. All placement
 * happens at init or on a 20 m cell crossing (one row of tiles, a few ms).
 */

const TILE = 20; // meters — tile grid cell for the roaming open field
const WORLD_LIMIT = 235; // stay on the 480 m terrain plate

interface QualityCfg {
  /** Active open-field radius around the camera (m). */
  radius: number;
  /** Open tufts attempted per tile (density × TILE²). */
  openPerTile: number;
  /** Per-instance fade thresholds are hashed into [near, far]. */
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
    openPerTile: 1400, // attempts; clump gate accepts ~45% (≈1.6 / m²)
    openFadeNear: 38,
    openFadeFar: 68,
    coverDensity: 3.0,
    coverFadeNear: 140,
    coverFadeFar: 200,
  },
  lite: {
    radius: 46,
    openPerTile: 1050, // attempts; clump gate accepts ~45% (≈1.2 / m²)
    openFadeNear: 24,
    openFadeFar: 44,
    coverDensity: 2.0,
    coverFadeNear: 90,
    coverFadeFar: 140,
  },
};

/** Deterministic per-tile seed so a tile refills identically every visit. */
function hashTile(tx: number, tz: number): number {
  let h = 0x9e3779b9 ^ Math.imul(tx, 374761393) ^ Math.imul(tz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic 2D value noise for clump structure (world-stable). */
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

interface Tile {
  mesh: THREE.InstancedMesh;
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
`;

const GRASS_PROJECT_VERTEX = /* glsl */ `
// Grass tufts: instance matrices are world-space (mesh sits at the origin).
vec4 gWorld = instanceMatrix * vec4( transformed, 1.0 );
vec3 gRoot = vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ], instanceMatrix[ 3 ][ 2 ] );
float gT = uv.y;        // 0 at root, 1 at tip
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

// Staggered distance collapse: each tuft folds to its root at a hashed
// per-instance threshold inside [uFade.x, uFade.y] — progressive thinning,
// no fade line, no pop, no alpha sorting.
float gInstD = distance( gRoot.xz, cameraPosition.xz );
float gRand = fract( sin( dot( gRoot.xz, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
float gFadeEnd = mix( uFade.x, uFade.y, gRand );
float gKeep = 1.0 - smoothstep( gFadeEnd - 7.0, gFadeEnd, gInstD );
gWorld.xyz = mix( gRoot, gWorld.xyz, gKeep );

// Directional light cheat: blades leaning toward the sun catch a warm rim
// at the tip, the away side cools and drops — light with a direction, even
// without real grass shadows. Shadow cores take the TOD's cool tint.
vec2 gLean = gWorld.xz - gRoot.xz;
float gFace = dot( gLean, uSunXZ ) / max( length( gLean ), 1e-4 );
vColor.rgb *= mix( uShadowTint, vec3( 1.0 ), gT );
vColor.rgb = mix( vColor.rgb, uRimColor, clamp( gFace, 0.0, 1.0 ) * gT * uRimStrength );
vColor.rgb *= 1.0 - 0.22 * clamp( -gFace, 0.0, 1.0 ) * gT * uRimStrength;

// Aerial perspective: past ~60% of draw distance the albedo dissolves into
// the TOD haze so far silhouettes melt into atmosphere instead of burning
// to a near-black hedge under the ridge line.
float gHaze = smoothstep( uHazeRange.x, uHazeRange.y, gInstD );
vColor.rgb = mix( vColor.rgb, uHaze, gHaze * 0.85 );

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
  [key: string]: { value: unknown };
}

export class GrassSystem implements Subsystem {
  readonly id = 'grass';

  private cfg!: QualityCfg;
  private terrain!: TerrainSystem;
  // Clump structure: knots of dense grass and genuinely bare dirt patches
  // (two octaves, ~14 m and ~5 m) — the anti-lawn.
  private clumpNoise = makeNoise(4127);

  private openGeo!: THREE.BufferGeometry;
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
  private oliveMid = new THREE.Color(P.oliveMid);
  private olive = new THREE.Color(P.olive);
  private oliveDeep = new THREE.Color(P.oliveDeep);
  private rimPale = new THREE.Color(P.strawPale);

  init(ctx: Ctx): void {
    this.cfg = CFG[ctx.quality];
    this.terrain = ctx.get<TerrainSystem>('terrain');

    // Tuft geometries (built once from ctx.rng, shared by every mesh).
    this.openGeo = this.buildTuft(ctx.rng, {
      blades: 7,
      twoSeg: false,
      hMin: 0.38,
      hMax: 0.66,
      spread: 0.05,
      width: 0.032,
      root: [0.52, 0.5, 0.45],
      tip: [1.12, 1.06, 0.82],
    });
    this.coverGeo = this.buildTuft(ctx.rng, {
      blades: 8,
      twoSeg: true,
      hMin: 0.62,
      hMax: 0.95,
      spread: 0.1,
      width: 0.045,
      root: [0.38, 0.4, 0.35],
      tip: [1.0, 0.97, 0.7],
    });

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
    const capacity = this.cfg.openPerTile;
    for (let i = 0; i < this.offsets.length; i++) {
      const mesh = new THREE.InstancedMesh(this.openGeo, this.openMat, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      ctx.scene.add(mesh);
      const tile: Tile = { mesh };
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
      ctx.scene.remove(tile.mesh);
      tile.mesh.dispose();
    }
    for (const mesh of this.patchMeshes) {
      ctx.scene.remove(mesh);
      mesh.dispose();
    }
    this.pool.length = 0;
    this.free.length = 0;
    this.active.clear();
    this.patchMeshes.length = 0;
    this.openGeo.dispose();
    this.coverGeo.dispose();
    this.openMat.dispose();
    this.coverMat.dispose();
  }

  /* ---------------------------------------------------------------- */

  private makeUniforms(windAmp: number, fadeNear: number, fadeFar: number): GrassUniforms {
    return {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(0.74, 0.67).normalize() },
      uWindAmp: { value: windAmp },
      uPartRadius: { value: 1.2 },
      uFade: { value: new THREE.Vector2(fadeNear, fadeFar) },
      uHaze: { value: new THREE.Color(P.grassHazeDawn) },
      uHazeRange: { value: new THREE.Vector2(fadeFar * 0.55, fadeFar) },
      uShadowTint: { value: new THREE.Color(P.shadowNeutral) },
      uSunXZ: { value: new THREE.Vector2(1, 0) },
      uRimColor: { value: new THREE.Color(P.sunLow) },
      uRimStrength: { value: 0.5 },
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
      // Rim: the sun color pulled toward pale straw so tips warm without
      // going neon; strength rides the TOD's horizon heat.
      u.uRimColor.value.setHex(spec.sunColor).lerp(this.rimPale, 0.4);
      u.uRimStrength.value = 0.15 + 0.45 * spec.hotStrength;
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
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );',
      );
    };
    return mat;
  }

  /** Blade-fan tuft geometry: non-indexed triangles, all normals up. */
  private buildTuft(
    rng: () => number,
    opts: {
      blades: number;
      twoSeg: boolean;
      hMin: number;
      hMax: number;
      spread: number;
      width: number;
      root: [number, number, number];
      tip: [number, number, number];
    },
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];

    const shade = (t: number): [number, number, number] => [
      opts.root[0] + (opts.tip[0] - opts.root[0]) * t,
      opts.root[1] + (opts.tip[1] - opts.root[1]) * t,
      opts.root[2] + (opts.tip[2] - opts.root[2]) * t,
    ];
    const push = (x: number, y: number, z: number, t: number, phase: number) => {
      positions.push(x, y, z);
      const [r, g, b] = shade(t);
      colors.push(r, g, b);
      uvs.push(phase, t);
    };

    for (let i = 0; i < opts.blades; i++) {
      const ang = ((i + rng() * 0.7) / opts.blades) * Math.PI * 2;
      // Mixed verticality — a share of near-vertical blades breaks the
      // even star-splay that reads as aloe instead of grass.
      const lean = rng() < 0.4 ? 0.03 + rng() * 0.08 : 0.1 + rng() * 0.28;
      const h = opts.hMin + rng() * (opts.hMax - opts.hMin);
      const r0 = opts.spread * (0.3 + rng() * 0.7);
      const ox = Math.sin(ang);
      const oz = Math.cos(ang);
      const rx = ox * r0;
      const rz = oz * r0;
      const sx = Math.cos(ang);
      const sz = -Math.sin(ang);
      const w = opts.width * (0.8 + rng() * 0.4);
      const phase = rng();

      if (!opts.twoSeg) {
        // Single triangle: two root corners, one tip.
        const tx = rx + ox * Math.sin(lean) * h;
        const ty = Math.cos(lean) * h;
        const tz = rz + oz * Math.sin(lean) * h;
        push(rx - (sx * w) / 2, 0, rz - (sz * w) / 2, 0, phase);
        push(rx + (sx * w) / 2, 0, rz + (sz * w) / 2, 0, phase);
        push(tx, ty, tz, 1, phase);
      } else {
        // Two segments: root quad + tip triangle, tip leaning further out.
        const mT = 0.55;
        const mx = rx + ox * Math.sin(lean) * h * mT;
        const my = Math.cos(lean) * h * mT;
        const mz = rz + oz * Math.sin(lean) * h * mT;
        const lean2 = lean * 1.8;
        const tx = mx + ox * Math.sin(lean2) * h * (1 - mT);
        const ty = my + Math.cos(lean2) * h * (1 - mT);
        const tz = mz + oz * Math.sin(lean2) * h * (1 - mT);
        const mw = w * 0.55;
        const r0l = [rx - (sx * w) / 2, 0, rz - (sz * w) / 2] as const;
        const r0r = [rx + (sx * w) / 2, 0, rz + (sz * w) / 2] as const;
        const ml = [mx - (sx * mw) / 2, my, mz - (sz * mw) / 2] as const;
        const mr = [mx + (sx * mw) / 2, my, mz + (sz * mw) / 2] as const;
        push(...r0l, 0, phase);
        push(...r0r, 0, phase);
        push(...mr, mT, phase);
        push(...r0l, 0, phase);
        push(...mr, mT, phase);
        push(...ml, mT, phase);
        push(...ml, mT, phase);
        push(...mr, mT, phase);
        push(tx, ty, tz, 1, phase);
      }
    }

    const geo = new THREE.BufferGeometry();
    const count = positions.length / 3;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    // Every normal straight up: tufts shade like the ground they grow from.
    const normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) normals[i * 3 + 1] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.computeBoundingSphere();
    return geo;
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
    // evening/lastlight look -x), the rest scattered in a ring.
    this.patches.push(mk(12, 78, 18, 12));
    this.patches.push(mk(-52, 28, 16, 11));
    for (let i = 0; i < 4; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const d = 40 + ctx.rng() * 100;
      const cx = THREE.MathUtils.clamp(Math.sin(a) * d, -180, 180);
      const cz = THREE.MathUtils.clamp(Math.cos(a) * d, -180, 180);
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
        // Kept warm-olive, not black — burnt-looking cover reads as scorched
        // brush, and the whole patch must still sit in October light.
        this.c.copy(this.khaki).lerp(this.oliveMid, 0.45 + rng() * 0.45);
        this.c.lerp(this.olive, s * (0.2 + rng() * 0.18));
        if (rng() < 0.08) this.c.lerp(this.oliveDeep, 0.25);
        this.c.multiplyScalar(0.95 + rng() * 0.3);
        cols.push(this.c.clone());
      }
      if (mats.length === 0) continue;
      const mesh = new THREE.InstancedMesh(this.coverGeo, this.coverMat, mats.length);
      for (let i = 0; i < mats.length; i++) {
        mesh.setMatrixAt(i, mats[i]);
        mesh.setColorAt(i, cols[i]);
      }
      mesh.castShadow = false;
      mesh.receiveShadow = false;
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
      tile.mesh.count = 0;
      tile.mesh.visible = false;
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

  /** Deterministic tile fill: same tile, same tufts, every visit. */
  private fillTile(tile: Tile, tx: number, tz: number): void {
    const mesh = tile.mesh;
    const rng = mulberry32(hashTile(tx, tz));
    let n = 0;
    for (let i = 0; i < this.cfg.openPerTile; i++) {
      const x = (tx + rng()) * TILE;
      const z = (tz + rng()) * TILE;
      const skipCover = rng() < 0.85; // cover keeps a little open straw mixed in
      if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
      if (skipCover && this.coverAt(x, z) > 0.35) continue; // cover owns it
      // Clumped, not uniform: knots of grass, thin fringes, bare dirt.
      const clump =
        0.68 * this.clumpNoise(x * 0.07, z * 0.07) + 0.32 * this.clumpNoise(x * 0.21 + 90, z * 0.21 + 90);
      const density = clump * clump * 1.7 + 0.06;
      if (rng() > density) continue;
      const y = this.terrain.heightAt(x, z) - 0.04;
      // Slight random lean breaks the bowling-pin verticality.
      this.e.set((rng() - 0.5) * 0.2, rng() * Math.PI * 2, (rng() - 0.5) * 0.2);
      this.q.setFromEuler(this.e);
      // Taller and fuller in the knots, stunted at the fringes.
      const vigor = 0.72 + clump * 0.55;
      const sxz = (0.6 + rng() * 0.55) * vigor;
      this.s.set(sxz, (0.55 + rng() * 0.8) * vigor, sxz);
      this.v.set(x, y, z);
      this.m.compose(this.v, this.q, this.s);
      mesh.setMatrixAt(n, this.m);
      // Straw↔khaki base with pale-gold and green-tinged sprinkles.
      this.c.copy(this.straw).lerp(this.khaki, rng() * 0.55);
      const pick = rng();
      if (pick < 0.12) this.c.lerp(this.strawLight, 0.25 + rng() * 0.2);
      else if (pick < 0.2) this.c.lerp(this.oliveMid, 0.25 + rng() * 0.22);
      this.c.multiplyScalar(0.9 + rng() * 0.32);
      mesh.setColorAt(n, this.c);
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (n > 0) mesh.computeBoundingSphere();
  }
}
