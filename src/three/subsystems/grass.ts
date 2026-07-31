import * as THREE from 'three';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
import type { DogSystem } from './dog';
import type { Hunt3DSystem } from './hunt3d';
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
 *  - THE COVER IS THE SIM'S COVER: patches come from hunt3d (the game's
 *    area.patches mapped to world meters) — the visibly dense cover is
 *    exactly where the birds hide and the dog hunts. Density tiers:
 *    DENSE waist-high tussocks inside a patch, a MEDIUM fringe ring of
 *    taller boosted tufts around it, SPARSE open field, BARE fertility
 *    breaks — plus 2-3 GAME TRAILS: narrow worn low-density paths
 *    connecting the nearest patches, deterministic from the fixed layout.
 *    Near-camera cover density rides the roaming tiles (V_COVER variant);
 *    a sparse large-crown static layer per patch carries the 50-105 m
 *    dark-mass read.
 *
 * Per-frame work is two uniform writes and a cell check. All placement
 * happens at init or on a 20 m cell crossing (one ring of tiles, a few ms).
 */

const TILE = 20; // meters — tile grid cell for the roaming open field
const WORLD_LIMIT = 235; // stay on the 480 m terrain plate
// One shared drill direction for the whole farm's stubble rows (radians).
const ROW_YAW = 0.42;

interface QualityCfg {
  /** Active open-field radius around the camera (m). */
  radius: number;
  /** Jittered-grid spacing between candidate tuft sites (m). */
  cellStep: number;
  /** Body-tuft lattice spacing (m) — the continuous grass mass. */
  tuftStep: number;
  /** Blade width multiplier — lite trades count for width. */
  bladeWide: number;
  /** Instance capacity per tile per variant. */
  capOpen: number;
  capStalk: number;
  capForb: number;
  capTuft: number;
  /** Per-instance collapse thresholds hash into [near, far] — last third. */
  openFadeNear: number;
  openFadeFar: number;
  /** Lattice spacing (m) between tussock sites inside cover (tile fill). */
  coverStep: number;
  /** Instance capacity per tile for the V_COVER tussocks. */
  capCover: number;
  /** Static far-read tussocks per m² of patch footprint (sparse, big). */
  coverFarDensity: number;
  coverFadeNear: number;
  coverFadeFar: number;
  /**
   * Tuft meshes render into the shadow map ('high' only — the depth pass
   * re-renders every caster). 'lite' keeps its contact shadows from the
   * baked soil skirts under each tuft instead.
   */
  castShadow: boolean;
}

const CFG: Record<'high' | 'lite', QualityCfg> = {
  high: {
    // Round-5 coverage inversion (critic item 1): the active ring shrinks
    // (54, was 70) and the DENSITY inside it jumps ~2.4x — coverage where
    // the eye can resolve tufts, a hue-matched painted meadow band past the
    // fade line instead of a sparse speckle scatter to 80 m.
    radius: 54,
    cellStep: 0.75,
    tuftStep: 0.64,
    bladeWide: 1.0,
    // capTuft must NOT saturate: fillTile scans the lattice in grid order,
    // so a binding cap truncates the same corner of every tile — the round-
    // 4.x "straight-edged bald strip" artifact. Sized above the worst tile.
    capOpen: 420,
    capStalk: 90,
    capForb: 170,
    capTuft: 1650,
    openFadeNear: 40,
    openFadeFar: 58,
    coverStep: 1.0,
    capCover: 460,
    coverFarDensity: 0.06,
    coverFadeNear: 70,
    coverFadeFar: 105,
    castShadow: true,
  },
  lite: {
    radius: 38,
    cellStep: 1.0,
    tuftStep: 0.92,
    bladeWide: 1.45,
    capOpen: 300,
    capStalk: 60,
    capForb: 110,
    // Head-room above the worst-case fill (a binding cap truncates in grid
    // order — tile-aligned bald strips; see the high-tier note above).
    capTuft: 680,
    openFadeNear: 26,
    openFadeFar: 40,
    coverStep: 1.2,
    capCover: 320,
    coverFarDensity: 0.045,
    coverFadeNear: 55,
    coverFadeFar: 85,
    castShadow: false,
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

/** One game-trail segment: a worn line between two cover patches. */
interface TrailSeg {
  ax: number;
  az: number;
  /** Full segment vector a -> b. */
  dx: number;
  dz: number;
  len2: number;
}

/**
 * Tuft variants: 0 = stubble row, 1 = seed-head stalk, 2 = low forb,
 * 3 = the body tuft — the multi-blade bunch the whole field is made of,
 * 4 = the cover tussock — near-camera dense fill inside sim patches.
 */
const V_OPEN = 0;
const V_STALK = 1;
const V_FORB = 2;
const V_TUFT = 3;
const V_COVER = 4;
const N_VARIANTS = 5;

interface Tile {
  meshes: THREE.InstancedMesh[];
  /** Tile-grid coords of the current fill (for the shadow-radius check). */
  tx: number;
  tz: number;
}

/* ------------------------------------------------------------------ */
/* Shader injection: wind, camera parting, staggered distance collapse */
/* ------------------------------------------------------------------ */

const GRASS_UNIFORM_DECLS = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindAmp;
uniform float uPartRadius;
uniform vec3 uPart2;
uniform vec2 uFade;
uniform vec3 uHaze;
uniform vec2 uHazeRange;
uniform vec3 uShadowTint;
uniform vec2 uSunXZ;
uniform vec3 uSunDir3;
uniform float uBack;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uDirStrength;
uniform vec3 uSunHaze;
uniform float uSunHazeK;
uniform float uLumCap;
uniform float uLitRimK;
uniform vec3 uCoolTint;
uniform float uCoolK;
uniform float uCoolNear;
uniform vec2 uSunRange;
uniform float uCloudShK;
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

// Second parting point (round 7): the DOG's body radius — same push-and-
// duck the camera gets, fed per-frame from the dog subsystem (xy = world
// xz, z = radius). Blades open around the dog instead of clipping its
// torso, which is what plants the pointing silhouette IN the cover.
// Mechanic round (bug 4): push and duck DEEPENED — at gameplay framing the
// 0.5/0.38 window still left waist-high tips crossing the white topline
// and the point read as shard soup; blades inside the (now wider, dog-fed)
// radius bow out further and drop below the dog's back line.
vec2 gAway2 = gWorld.xz - uPart2.xy;
float gDogD = length( gAway2 );
float gPart2 = 1.0 - smoothstep( 0.0, uPart2.z, gDogD );
gPart2 *= gPart2;
gWorld.xz += ( gAway2 / max( gDogD, 1e-4 ) ) * gPart2 * 0.72 * gT;
gWorld.y -= gPart2 * 0.55 * gT;

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
// Root shadow core: the TOD tint TIMES a neutral bake-in — a meadow's
// bases sit in self-shadow at every hour, noon included (shadowNeutral
// alone left the noon mass flat and paper-pale).
vColor.rgb *= mix( uShadowTint * 0.75, vec3( 1.0 ), gT );
float gLit = clamp( gFace, 0.0, 1.0 );
float gShade = clamp( -gFace, 0.0, 1.0 ) * uDirStrength;
vColor.rgb *= mix( vec3( 1.0 ), uShadowTint * 0.62, min( gShade * ( 0.45 + 0.55 * gT ), 0.85 ) );
vColor.rgb *= 1.0 + gLit * uDirStrength * 0.22 * ( 0.3 + 0.7 * gT );
// TRUE backlight: how directly this blade sits between the camera and the
// sun. Facing the sun (dawn-into-sun, evening-field), tips take a warm
// translucency gradient and bases sink dark — the lit/backlit asymmetry
// that sells a low sun. gT*gT confines the glow to the top of the blade.
vec3 gViewDir = normalize( gWorld.xyz - cameraPosition );
float gBack = clamp( dot( gViewDir, uSunDir3 ), 0.0, 1.0 );
// Horizontal-alignment silhouette term (round 6, item 5): the 3D dot
// misses FOREGROUND blades in an into-sun frame — the camera looks DOWN
// at them while the sun sits at the horizon, so the dot never closes.
// A blade whose azimuth from the camera is within ~20 deg of the sun's
// (pow 8 gate) is between camera and sun regardless of pitch: it shows
// its shade side. uBack still gates the whole term off outside the
// golden hours.
vec2 gToS = gRoot.xz - cameraPosition.xz;
float gAzS = clamp( dot( gToS / max( length( gToS ), 1e-3 ), uSunXZ ), 0.0, 1.0 );
float gAzS4 = gAzS * gAzS * gAzS * gAzS;
// The gate WIDENS with proximity: a blade 4 m out still stands against the
// sun's whole glare region at 30 deg off-axis, while a far blade must sit
// tight under the disc. Silhouette hour keeps only the tight 3D term
// (uLitRimK is already 0 there) — the lastlight field is dark enough.
float gAzGate = mix( gAzS * gAzS * uLitRimK, gAzS4 * gAzS4, smoothstep( 5.0, 24.0, gInstD ) );
gBack = max( gBack * gBack, gAzGate * 0.9 ) * uBack;
// Round 6 (into-sun truth): a blade between camera and a low sun shows its
// SHADE side full-height — roots crush hard, tips keep more so the warm
// emissive rim stays the one bright edge. 0.38-on-roots-only left pale
// cream tufts floating in the dawn-into-sun frame.
vColor.rgb *= 1.0 - gBack * mix( 0.62, 0.28, gT );
// Backlight rim rides an EMISSIVE varying (albedo tints go black at dusk —
// translucent tips must glow at silhouette hour, not just recolor). The
// gLit term is NOT view-dependent, so uLitRimK gates it off at silhouette
// hour — after sunset only true backlight (between camera and sun) rims.
// Round 6: the rim is an EDGE, not a wash — gT^4 confines the glow to the
// last fifth of the blade (the gT^2 version painted the whole upper blade
// additive-white into a low sun, which is why into-sun frames read pale
// cream no matter how dark the albedo went), and the cap drops with it.
float gTip = gT * gT;
float gRim = min( ( gLit * 0.35 * uLitRimK + gBack * 1.3 ) * ( gTip * gTip ) * uRimStrength, 1.1 );

// Cool-mass tint (round 5): the sky's ambient carried into every blade the
// sun lobe does not claim — the lastlight field is a violet shadow mass
// with a warm wedge, not a gray carpet. Complement of the terrain's lobe.
vec2 gToC = gRoot.xz - cameraPosition.xz;
float gAzC = clamp( dot( gToC / max( length( gToC ), 1e-3 ), uSunXZ ), 0.0, 1.0 );
vColor.rgb = mix( vColor.rgb, uCoolTint * ( 0.5 + 0.5 * gT ), uCoolK * ( 1.0 - gAzC * gAzC * 0.85 ) );
// Warm wedge (round 5): grass answers the SAME drench lobe the terrain
// runs, at all distances — without this the wedge dies wherever tufts
// cover the ground (the lastlight orange pool, the dawn sun-side grade).
float gAzC4 = gAzC * gAzC * gAzC * gAzC;
float gWarm = gAzC4 * smoothstep( uSunRange.x, uSunRange.y, gInstD ) * uSunHazeK * 0.62;
vColor.rgb = mix( vColor.rgb, uSunHaze, gWarm );
// Round 6 (item 2), applied AFTER the warm wedge so it wins the near
// field: at silhouette hour the FOREGROUND tufts join the violet shadow
// mass even on the sunward axis — the azimuth gates above kept the
// lastlight camera's whole bottom half pale russet because it looks
// straight at the glow. Near tufts drop ~35% in value and take the
// vault's hue; the warm pool keeps the far wedge under the afterglow.
vColor.rgb = mix( vColor.rgb, uCoolTint * ( 0.55 + 0.35 * gT ), uCoolNear * ( 1.0 - smoothstep( 12.0, 40.0, gInstD ) ) );

// Silhouette-hour luminance ceiling — applied AFTER the warm wedge and
// cool-mass mixes (round 7, item 3): the wedge used to re-lighten tufts
// the cap had already tamed, scattering pink confetti across the violet
// mass. Capping last pins every foreground blade within a whisper of the
// soil beneath — warm HUE survives under the afterglow, extra VALUE does
// not. Effectively off in daylight (uLumCap >= 4).
float gLum = dot( vColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
vColor.rgb *= min( 1.0, uLumCap / max( gLum, 1e-4 ) );

// Aerial perspective: across the far field the albedo dissolves fully into
// the TOD haze, so silhouettes melt into atmosphere instead of burning to
// a near-black hedge under the ridge line. The haze itself warms toward
// the sun's color on the sun side (the drench lobe the terrain also runs),
// so grass and ground answer the same halo. The rim glow fades with it.
vec2 gToCam = gRoot.xz - cameraPosition.xz;
float gAzl = clamp( dot( gToCam / max( length( gToCam ), 1e-3 ), uSunXZ ), 0.0, 1.0 );
vec3 gHazeCol = mix( uHaze, uSunHaze, gAzl * gAzl * uSunHazeK );
float gHaze = smoothstep( uHazeRange.x, uHazeRange.y, gInstD );
vColor.rgb = mix( vColor.rgb, gHazeCol, gHaze );
// Drifting cloud shade (round 6): the IDENTICAL mask the terrain runs,
// same clock — tufts and the ground under them darken as one dapple.
float gCs = sin( gRoot.x * 0.085 + uTime * 0.14 ) * sin( gRoot.z * 0.058 + 1.7 + uTime * 0.14 * 0.73 );
vColor.rgb *= 1.0 - 0.2 * smoothstep( 0.3, 0.75, gCs ) * uCloudShK;
vRim = gRim * ( 1.0 - gHaze );

vec4 mvPosition = viewMatrix * gWorld;
gl_Position = projectionMatrix * mvPosition;
`;

interface GrassUniforms {
  uTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWindAmp: { value: number };
  uPartRadius: { value: number };
  uPart2: { value: THREE.Vector3 };
  uFade: { value: THREE.Vector2 };
  uHaze: { value: THREE.Color };
  uHazeRange: { value: THREE.Vector2 };
  uShadowTint: { value: THREE.Color };
  uSunXZ: { value: THREE.Vector2 };
  uSunDir3: { value: THREE.Vector3 };
  uBack: { value: number };
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uDirStrength: { value: number };
  uRimGlow: { value: number };
  uSunHaze: { value: THREE.Color };
  uSunHazeK: { value: number };
  uLumCap: { value: number };
  uCoolTint: { value: THREE.Color };
  uCoolK: { value: number };
  uCoolNear: { value: number };
  uSunRange: { value: THREE.Vector2 };
  uCloudShK: { value: number };
  uLitRimK: { value: number };
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
   * `droop` is the ABSOLUTE extra bend at the tip (radians): a near-upright
   * blade with droop ~1 folds its tip clean over — grass, never yucca.
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
    droop: number,
  ): void {
    const ox = Math.sin(ang);
    const oz = Math.cos(ang);
    const sx = Math.cos(ang);
    const sz = -Math.sin(ang);
    const mT = 0.55;
    const mx = rx + ox * Math.sin(lean) * h * mT;
    const my = Math.cos(lean) * h * mT;
    const mz = rz + oz * Math.sin(lean) * h * mT;
    const lean2 = lean + droop; // drooping tip — grass arcs, not spikes
    const tx = mx + ox * Math.sin(lean2) * h * (1 - mT);
    const ty = my + Math.cos(lean2) * h * (1 - mT);
    const tz = mz + oz * Math.sin(lean2) * h * (1 - mT);
    const mw = w * 0.6;
    // Clamped at 1.0: baked blade color never exceeds true albedo (the
    // over-unity tips were the specular-error whites of the spear look).
    const col = (t: number): [number, number, number] => [
      Math.min(1, (rootC[0] + (tipC[0] - rootC[0]) * t) * bright),
      Math.min(1, (rootC[1] + (tipC[1] - rootC[1]) * t) * bright),
      Math.min(1, (rootC[2] + (tipC[2] - rootC[2]) * t) * bright),
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
   * Thin cereal/bunchgrass stem. kT >= 1 gives a single straight clipped
   * stem (wheat stubble). Otherwise the stem is an ARC: three chained
   * quads whose direction eases from `tilt` at the root into `tilt + kink`
   * at the tip — the round-7 spear fix. A shaft that rises straight and
   * then elbows once reads as a thorn at every distance; grass bends in a
   * curve, stiff at the root, softening through the top. `kT` hints where
   * the bend gathers (lower = the arc starts earlier). kink ~1.5-2.2 rad
   * still folds a broken straggler clean over. Blunt ends, never a spike.
   * Baked color is clamped at 1.0 — no specular-error whites at the tips.
   */
  stem(
    rx: number,
    rz: number,
    ang: number,
    tilt: number,
    h: number,
    w: number,
    kT: number,
    kink: number,
    rootC: readonly [number, number, number],
    tipC: readonly [number, number, number],
    bright: number,
    phase: number,
  ): void {
    const ox = Math.sin(ang);
    const oz = Math.cos(ang);
    const sx = Math.cos(ang);
    const sz = -Math.sin(ang);
    const col = (t: number): [number, number, number] => [
      Math.min(1, (rootC[0] + (tipC[0] - rootC[0]) * t) * bright),
      Math.min(1, (rootC[1] + (tipC[1] - rootC[1]) * t) * bright),
      Math.min(1, (rootC[2] + (tipC[2] - rootC[2]) * t) * bright),
    ];
    if (kT >= 1) {
      // Single straight clipped stem (harvested stubble) — a short quad.
      const mx = rx + ox * Math.sin(tilt) * h;
      const my = Math.cos(tilt) * h;
      const mz = rz + oz * Math.sin(tilt) * h;
      const wm = w * 0.55;
      const [r0r, r0g, r0b] = col(0);
      const [mr, mg, mb] = col(1);
      this.vert(rx - (sx * w) / 2, 0, rz - (sz * w) / 2, 0, phase, r0r, r0g, r0b);
      this.vert(rx + (sx * w) / 2, 0, rz + (sz * w) / 2, 0, phase, r0r, r0g, r0b);
      this.vert(mx + (sx * wm) / 2, my, mz + (sz * wm) / 2, 1, phase, mr, mg, mb);
      this.vert(rx - (sx * w) / 2, 0, rz - (sz * w) / 2, 0, phase, r0r, r0g, r0b);
      this.vert(mx + (sx * wm) / 2, my, mz + (sz * wm) / 2, 1, phase, mr, mg, mb);
      this.vert(mx - (sx * wm) / 2, my, mz - (sz * wm) / 2, 1, phase, mr, mg, mb);
      return;
    }
    // Arcing stem: direction angle eases into the full kink with a power
    // curve anchored by kT — segment ends land at ~[7%, 50%, 100%] of the
    // bend for the default kT band, a real arc instead of an elbow.
    const nodes = [0, 0.45, 0.75, 1] as const;
    const widths = [1, 0.78, 0.56, 0.4] as const;
    const bendAt = (t: number): number => {
      const b = Math.max(0, (t - kT * 0.55) / (1 - kT * 0.55));
      return Math.pow(b, 1.5);
    };
    let cx = rx;
    let cy = 0;
    let cz = rz;
    let [pr, pg, pb] = col(0);
    for (let s = 0; s < 3; s++) {
      const t0 = nodes[s];
      const t1 = nodes[s + 1];
      const th = tilt + kink * bendAt(t1);
      const nx = cx + ox * Math.sin(th) * h * (t1 - t0);
      const ny = cy + Math.cos(th) * h * (t1 - t0);
      const nz = cz + oz * Math.sin(th) * h * (t1 - t0);
      const w0 = w * widths[s];
      const w1 = w * widths[s + 1];
      const [nr, ng, nb] = col(t1);
      this.vert(cx - (sx * w0) / 2, cy, cz - (sz * w0) / 2, t0, phase, pr, pg, pb);
      this.vert(cx + (sx * w0) / 2, cy, cz + (sz * w0) / 2, t0, phase, pr, pg, pb);
      this.vert(nx + (sx * w1) / 2, ny, nz + (sz * w1) / 2, t1, phase, nr, ng, nb);
      this.vert(cx - (sx * w0) / 2, cy, cz - (sz * w0) / 2, t0, phase, pr, pg, pb);
      this.vert(nx + (sx * w1) / 2, ny, nz + (sz * w1) / 2, t1, phase, nr, ng, nb);
      this.vert(nx - (sx * w1) / 2, ny, nz - (sz * w1) / 2, t1, phase, nr, ng, nb);
      cx = nx;
      cy = ny;
      cz = nz;
      pr = nr;
      pg = ng;
      pb = nb;
    }
  }

  /**
   * Contact-grounding skirt: a low fan of soil-dark triangles under the
   * tuft (t=0, no wind). Baked into the tuft geometry, it rides the
   * instance matrix — contact shadow with zero extra draw calls. Warm-dark
   * center melting to near-ground brightness at the rim. Optional center
   * offset and ellipse factors let a row-shaped footprint stay grounded.
   */
  skirt(radius: number, n: number, rng: () => number, cx = 0, cz = 0, ex = 1, ez = 1): void {
    const cy = 0.05; // slight dome so gentle slopes never float it
    const ey = 0.015;
    // Duff-dark thatch, not chocolate: the contact shadow under a tuft is
    // dead grass in shade — it must agree with the repainted duff ground.
    // Center deepened a notch (item 12): shadow pooling under tufts is what
    // keeps flat noon light from reading as stamped texture.
    const c: [number, number, number] = [0.33, 0.3, 0.22];
    const e: [number, number, number] = [0.74, 0.69, 0.57];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const r0 = radius * (0.85 + rng() * 0.3);
      const r1 = radius * (0.85 + rng() * 0.3);
      this.vert(cx, cy, cz, 0, 0, c[0], c[1], c[2]);
      this.vert(cx + Math.sin(a0) * r0 * ex, ey, cz + Math.cos(a0) * r0 * ez, 0, 0, e[0], e[1], e[2]);
      this.vert(cx + Math.sin(a1) * r1 * ex, ey, cz + Math.cos(a1) * r1 * ez, 0, 0, e[0], e[1], e[2]);
    }
  }

  /**
   * Seed-head stalk, round-7 spear fix. The old build was a dead-straight
   * pole capped with an upright 4 cm diamond baked over-unity — at dawn a
   * rank of them read as soldiers with lances. Now the stem is a three-
   * segment ARC that gathers a nod in its top fifth, and the head is a
   * slim husk aligned WITH the nodding tip direction — wheat bowing its
   * head, clamped well under white: a straw catch-light, never a star.
   */
  stalk(rx: number, rz: number, ang: number, lean: number, h: number, rng: () => number): void {
    const ox = Math.sin(ang);
    const oz = Math.cos(ang);
    const sx = Math.cos(ang);
    const sz = -Math.sin(ang);
    const w = 0.03;
    const phase = rng();
    const stemR: [number, number, number] = [0.5, 0.46, 0.34];
    const stemT: [number, number, number] = [0.9, 0.83, 0.58];
    const nod = 0.35 + rng() * 0.5;
    const nodes = [0, 0.5, 0.8, 1] as const;
    const widths = [1, 0.75, 0.55, 0.42] as const;
    const angleAt = (t: number): number =>
      lean + nod * Math.pow(Math.max(0, (t - 0.5) / 0.5), 1.6);
    const col = (t: number): [number, number, number] => [
      stemR[0] + (stemT[0] - stemR[0]) * t,
      stemR[1] + (stemT[1] - stemR[1]) * t,
      stemR[2] + (stemT[2] - stemR[2]) * t,
    ];
    let cx = rx;
    let cy = 0;
    let cz = rz;
    let [pr, pg, pb] = col(0);
    for (let s = 0; s < 3; s++) {
      const t0 = nodes[s];
      const t1 = nodes[s + 1];
      const th = angleAt(t1);
      const nx = cx + ox * Math.sin(th) * h * (t1 - t0);
      const ny = cy + Math.cos(th) * h * (t1 - t0);
      const nz = cz + oz * Math.sin(th) * h * (t1 - t0);
      const w0 = w * widths[s];
      const w1 = w * widths[s + 1];
      // uv.y compressed to 0.72 over the stem so the head keeps the old
      // tip range (wind mobility and shader tip terms stay unchanged).
      const [nr, ng, nb] = col(t1);
      this.vert(cx - (sx * w0) / 2, cy, cz - (sz * w0) / 2, t0 * 0.72, phase, pr, pg, pb);
      this.vert(cx + (sx * w0) / 2, cy, cz + (sz * w0) / 2, t0 * 0.72, phase, pr, pg, pb);
      this.vert(nx + (sx * w1) / 2, ny, nz + (sz * w1) / 2, t1 * 0.72, phase, nr, ng, nb);
      this.vert(cx - (sx * w0) / 2, cy, cz - (sz * w0) / 2, t0 * 0.72, phase, pr, pg, pb);
      this.vert(nx + (sx * w1) / 2, ny, nz + (sz * w1) / 2, t1 * 0.72, phase, nr, ng, nb);
      this.vert(nx - (sx * w1) / 2, ny, nz - (sz * w1) / 2, t1 * 0.72, phase, nr, ng, nb);
      cx = nx;
      cy = ny;
      cz = nz;
      pr = nr;
      pg = ng;
      pb = nb;
    }
    // Nodding husk: a slim lozenge riding the tip DIRECTION, not the
    // vertical — its long axis continues the arc.
    const thT = angleAt(1);
    const dx = ox * Math.sin(thT);
    const dy = Math.cos(thT);
    const dz = oz * Math.sin(thT);
    const hh = 0.12 * (0.85 + rng() * 0.3);
    const hw = 0.028;
    const head: [number, number, number] = [0.9, 0.83, 0.6];
    const headLo: [number, number, number] = [0.76, 0.7, 0.5];
    const bx = cx - dx * hh * 0.25;
    const by = cy - dy * hh * 0.25;
    const bz = cz - dz * hh * 0.25;
    const mxx = cx + dx * hh * 0.35;
    const mxy = cy + dy * hh * 0.35;
    const mxz = cz + dz * hh * 0.35;
    const txx = cx + dx * hh;
    const txy = cy + dy * hh;
    const txz = cz + dz * hh;
    this.vert(bx, by, bz, 0.72, phase, headLo[0], headLo[1], headLo[2]);
    this.vert(mxx + sx * hw, mxy, mxz + sz * hw, 0.86, phase, head[0], head[1], head[2]);
    this.vert(txx, txy, txz, 1, phase, head[0], head[1], head[2]);
    this.vert(bx, by, bz, 0.72, phase, headLo[0], headLo[1], headLo[2]);
    this.vert(txx, txy, txz, 1, phase, head[0], head[1], head[2]);
    this.vert(mxx - sx * hw, mxy, mxz - sz * hw, 0.86, phase, head[0], head[1], head[2]);
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
  private hunt!: Hunt3DSystem;
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
  private trails: TrailSeg[] = [];

  private pool: Tile[] = [];
  private free: Tile[] = [];
  private active = new Map<number, Tile>();
  private offsets: Array<readonly [number, number]> = [];
  private lastCellX = Number.NaN;
  private lastCellZ = Number.NaN;
  /** Lazily-resolved dog system (undefined = not looked up yet). */
  private dogRef: DogSystem | null | undefined;
  private dogPart = { x: 0, z: 0, r: 1e-4 };

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
  // The terrain's sward paint (same recipe as terrain.ts): the haze target
  // is the GROUND the tufts dissolve into, tinted by the TOD's haze role.
  private swardTone = new THREE.Color(P.grassOlive).lerp(new THREE.Color(P.grassGold), 0.42);

  init(ctx: Ctx): void {
    this.cfg = CFG[ctx.quality];
    this.terrain = ctx.get<TerrainSystem>('terrain');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');

    this.buildVariantGeos(mulberry32(0x9e1d77), this.cfg.bladeWide);

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
    const caps = [this.cfg.capOpen, this.cfg.capStalk, this.cfg.capForb, this.cfg.capTuft, this.cfg.capCover];
    for (let i = 0; i < this.offsets.length; i++) {
      const mkMesh = (vi: number): THREE.InstancedMesh => {
        const geo = vi === V_COVER ? this.coverGeo : this.variantGeos[vi];
        const mesh = new THREE.InstancedMesh(geo, this.openMat, caps[vi]);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(caps[vi] * 3), 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.visible = false;
        // High tier: ONLY the sparse tall seed-head stalks render into the
        // shadow map (long readable streaks along the sun azimuth). The
        // round-6 shadow audit found the dense stubble casters were the
        // reason "nothing occludes light": at a 6-degree dawn every 20 cm
        // stem throws a 2-3 m shadow and thousands of them merge into one
        // wall-to-wall shadow blanket with a hard edge at the caster
        // radius — tree/fence/rock shadows had zero contrast against it.
        // Contact grounding for the mass stays with the baked soil skirts.
        mesh.castShadow = this.cfg.castShadow && vi === V_STALK;
        // Tree/prop shadows fall across the grass (sampled at the root
        // position — no swim): the cast-shadow corroboration item 2 asks for.
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        ctx.scene.add(mesh);
        return mesh;
      };
      const tile: Tile = {
        meshes: [mkMesh(V_OPEN), mkMesh(V_STALK), mkMesh(V_FORB), mkMesh(V_TUFT), mkMesh(V_COVER)],
        tx: 0,
        tz: 0,
      };
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
    // Dog parting point (round 7): the dog subsystem's documented
    // partingPoint() getter feeds the second parting uniform — resolved
    // lazily via ctx.get (never an import; null if the dog isn't running).
    if (this.dogRef === undefined) {
      try {
        this.dogRef = ctx.get<DogSystem>('dog');
      } catch {
        this.dogRef = null;
      }
    }
    if (this.dogRef) {
      this.dogRef.partingPoint(this.dogPart);
      this.openUniforms.uPart2.value.set(this.dogPart.x, this.dogPart.z, this.dogPart.r);
      this.coverUniforms.uPart2.value.set(this.dogPart.x, this.dogPart.z, this.dogPart.r);
    }
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
    this.patches.length = 0;
    this.trails.length = 0;
    for (const g of this.variantGeos) g.dispose();
    this.variantGeos.length = 0;
    this.coverGeo.dispose();
    this.openMat.dispose();
    this.coverMat.dispose();
  }

  /* ---------------------------------------------------------------- */

  /**
   * The tuft geometries (built once from a LOCAL seeded stream —
   * per-subsystem RNG contract). Round-4 mass pass: the field BODY is the
   * V_TUFT multi-blade bunch; stubble rows, bluestem sheaves and forbs are
   * variety WITHIN that mass, never the whole field. `wide` is the lite
   * tier's trade: fewer tufts, each with broader blades.
   */
  private buildVariantGeos(rng: () => number, wide: number): void {
    // V_OPEN — wheat-stubble row segment: two ragged drill rows of short
    // clipped stems with the odd taller straggler snapped over at the top.
    // Instanced with a COHERENT yaw (see placeTuft) so the rows run one
    // field direction — reads "harvested stubble", never a splay.
    {
      const b = new GeoBuilder();
      const rootC = [0.42, 0.38, 0.29] as const;
      // Cut ends stay STRAW (item 3): at 40-60 m these tips are exactly the
      // speckle static the critics flagged — they must sit near the tuft
      // band's own value, never pop white against the sward.
      const tipC = [0.95, 0.87, 0.6] as const;
      for (const rowZ of [-0.105, 0.105]) {
        const n = 4 + Math.floor(rng() * 2);
        for (let i = 0; i < n; i++) {
          const x = -0.27 + (i / (n - 1)) * 0.54 + (rng() - 0.5) * 0.08;
          const z = rowZ + (rng() - 0.5) * 0.07;
          const ang = rng() * Math.PI * 2;
          if (rng() < 0.2) {
            // Straggler the header missed: taller, folded clean over.
            b.stem(x, z, ang, (rng() - 0.5) * 0.14, 0.3 + rng() * 0.16, 0.03,
              0.62, 1.5 + rng() * 0.7, rootC, tipC, 0.92 + rng() * 0.2, rng());
          } else {
            b.stem(x, z, ang, (rng() - 0.5) * 0.26, 0.13 + rng() * 0.12, 0.034,
              1, 0, rootC, tipC, 0.9 + rng() * 0.28, rng());
          }
        }
      }
      b.skirt(0.15, 6, rng, 0, 0, 1.9, 0.85);
      this.variantGeos[V_OPEN] = b.build();
    }
    // V_STALK — wispy bluestem bunch: a sheaf of thin near-parallel stems
    // rising from a tight base and arcing out at the tips, a few carrying
    // pale seed heads, one snapped over — visible STEMS, not blades.
    {
      const b = new GeoBuilder();
      const rootC = [0.44, 0.4, 0.3] as const;
      // Straw tips, never over-unity — the pale sheaf reads dry grass, not
      // a fan of lit spears (round-7 spear fix).
      const tipC = [0.96, 0.88, 0.62] as const;
      const n = 7 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const ang = rng() * Math.PI * 2;
        const r0 = rng() * 0.055;
        // Deeper arc (0.65-1.2 rad, was 0.3-0.75): bluestem tips nod over.
        b.stem(Math.sin(ang) * r0, Math.cos(ang) * r0, ang, 0.04 + rng() * 0.16,
          0.5 + rng() * 0.38, 0.026, 0.6, 0.65 + rng() * 0.55,
          rootC, tipC, 0.9 + rng() * 0.25, rng());
      }
      for (let i = 0; i < 2; i++) {
        const ang = rng() * Math.PI * 2;
        b.stalk(Math.sin(ang) * 0.03, Math.cos(ang) * 0.03, ang, 0.05 + rng() * 0.1, 0.7 + rng() * 0.3, rng);
      }
      b.stem(0.02, 0.01, rng() * Math.PI * 2, 0.2, 0.5, 0.026, 0.5, 1.8 + rng() * 0.4,
        rootC, tipC, 0.95, rng());
      b.skirt(0.12, 5, rng);
      this.variantGeos[V_STALK] = b.build();
    }
    // V_FORB — low broadleaf weed: a few short HEAVILY drooped leaves
    // hugging the ground, greener than the grass — a ground-cover mound,
    // no longer a miniature agave.
    {
      const b = new GeoBuilder();
      const rootC = [0.42, 0.46, 0.3] as const;
      const tipC = [0.88, 0.98, 0.58] as const;
      for (let i = 0; i < 6; i++) {
        const ang = ((i + rng() * 0.9) / 6) * Math.PI * 2;
        const r0 = 0.03 + rng() * 0.05;
        b.blade(Math.sin(ang) * r0, Math.cos(ang) * r0, ang, 0.55 + rng() * 0.4,
          0.09 + rng() * 0.08, 0.075 * (0.8 + rng() * 0.4), rootC, tipC, 0.85 + rng() * 0.3, rng(),
          1.1 + rng() * 0.5);
      }
      b.skirt(0.12, 5, rng);
      this.variantGeos[V_FORB] = b.build();
    }
    // V_TUFT — the BODY of the field, round-5 rebuild (critic item 2: the
    // radiating-spike rosette read yucca/agave at every distance). A clump
    // of 8-10 FINE near-upright blades with drooping tips, laid out on two
    // crossed planes (the classic grass-card cross, done in geometry): each
    // plane carries 4-5 blades along a short row, tips arcing out to both
    // sides. Shafts rise, tips fold — the 10 m silhouette says grass.
    // Baked color stays a neutral straw ramp — the instance color carries
    // the hue family (straw-gold / olive-tinged / pale bleached).
    {
      const b = new GeoBuilder();
      const rootC = [0.4, 0.37, 0.28] as const;
      const tipC = [0.98, 0.91, 0.64] as const;
      const baseYaw = rng() * Math.PI;
      for (let p = 0; p < 2; p++) {
        const pa = baseYaw + p * (Math.PI / 2 + (rng() - 0.5) * 0.5);
        const dx = Math.cos(pa);
        const dz = -Math.sin(pa);
        const n = 4 + Math.floor(rng() * 2);
        for (let i = 0; i < n; i++) {
          const off = (i / (n - 1) - 0.5) * (0.17 + rng() * 0.07);
          const rx = dx * off + (rng() - 0.5) * 0.035;
          const rz = dz * off + (rng() - 0.5) * 0.035;
          // Tips arc out of the plane, alternating sides.
          const ang = pa + (i % 2 === 0 ? 1 : -1) * (Math.PI / 2) + (rng() - 0.5) * 0.9;
          const lean = 0.05 + rng() * 0.15; // near-upright shaft
          const droop = 0.65 + rng() * 0.85; // tip folds clean over
          const h = 0.2 + rng() * 0.26;
          const w = 0.034 * wide * (0.8 + rng() * 0.45);
          b.blade(rx, rz, ang, lean, h, w, rootC, tipC, 0.86 + rng() * 0.3, rng(), droop);
        }
      }
      b.skirt(0.14, 4, rng);
      this.variantGeos[V_TUFT] = b.build();
    }
    // Cover tussock — big bunchgrass fountain: many thin stems, outer ones
    // leaning further and arcing over, two seed stalks breaking the top —
    // the tall-cover silhouette a bird would actually hide under.
    {
      const b = new GeoBuilder();
      const rootC = [0.36, 0.37, 0.28] as const;
      const tipC = [0.94, 0.87, 0.6] as const;
      for (let i = 0; i < 7; i++) {
        const ang = rng() * Math.PI * 2;
        const r0 = Math.sqrt(rng()) * 0.1;
        const tilt = 0.05 + (r0 / 0.1) * 0.22 + rng() * 0.08;
        // The fountain commits (0.9-1.6 rad, was 0.5-1.1): every stem arcs
        // over — cover a dog would push into, not a bed of pikes.
        b.stem(Math.sin(ang) * r0, Math.cos(ang) * r0, ang, tilt,
          0.5 + rng() * 0.45, 0.034, 0.55, 0.9 + rng() * 0.7,
          rootC, tipC, 0.86 + rng() * 0.26, rng());
      }
      b.stalk(0.04, 0.01, rng() * Math.PI * 2, 0.04 + rng() * 0.07, 1.0 + rng() * 0.3, rng);
      b.skirt(0.2, 6, rng);
      this.coverGeo = b.build();
    }
  }

  private makeUniforms(windAmp: number, fadeNear: number, fadeFar: number): GrassUniforms {
    return {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(0.74, 0.67).normalize() },
      uWindAmp: { value: windAmp },
      uPartRadius: { value: 1.2 },
      // Dog parting point: xy = world xz, z = radius (epsilon until the
      // dog subsystem reports in — smoothstep needs a nonzero edge).
      uPart2: { value: new THREE.Vector3(0, 0, 1e-4) },
      uFade: { value: new THREE.Vector2(fadeNear, fadeFar) },
      uHaze: { value: new THREE.Color(P.grassHazeDawn) },
      // Haze completes just before the collapse window ends, so shrinking
      // tufts are already ground-colored when they go — clumps dissolve
      // into the painted meadow band, never into speckle static (item 3).
      uHazeRange: { value: new THREE.Vector2(fadeFar * 0.52, fadeFar * 0.95) },
      uShadowTint: { value: new THREE.Color(P.shadowNeutral) },
      uSunXZ: { value: new THREE.Vector2(1, 0) },
      uSunDir3: { value: new THREE.Vector3(1, 0, 0) },
      uBack: { value: 0.5 },
      uRimColor: { value: new THREE.Color(P.sunLow) },
      uRimStrength: { value: 0.5 },
      uDirStrength: { value: 0.6 },
      uRimGlow: { value: 0.4 },
      uSunHaze: { value: new THREE.Color(P.glowGold) },
      uSunHazeK: { value: 0 },
      uLumCap: { value: 4 },
      uLitRimK: { value: 1 },
      uCoolTint: { value: new THREE.Color(P.duskGroundViolet) },
      uCoolK: { value: 0 },
      uCoolNear: { value: 0 },
      uSunRange: { value: new THREE.Vector2(10, 80) },
      uCloudShK: { value: 0 },
    };
  }

  /** Re-key the atmosphere uniforms off the TOD spec (haze, shadow, rim). */
  private applyTod(tod: TimeOfDay): void {
    const spec = TOD[tod];
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
    const el = THREE.MathUtils.degToRad(spec.sunElevation);
    for (const u of [this.openUniforms, this.coverUniforms]) {
      // Haze target = the terrain's sward paint pulled toward the TOD haze
      // role: a tuft at the fade line lands on the same albedo the ground
      // is painted, so the hand-off is invisible (item 3).
      u.uHaze.value.setHex(spec.grassHaze).lerp(this.swardTone, 0.5);
      u.uShadowTint.value.setHex(spec.grassShadow);
      u.uSunXZ.value.set(Math.sin(az), Math.cos(az));
      // True sun direction (world) for the view-dependent backlight; its
      // strength rides the TOD's glow — hot at the golden hours, a whisper
      // at noon (a strong noon backlight bleaches the whole midfield).
      u.uSunDir3.value.set(
        Math.sin(az) * Math.cos(el),
        Math.sin(el),
        Math.cos(az) * Math.cos(el),
      );
      u.uBack.value = spec.glowStrength;
      // Rim: the sun color pulled slightly toward pale straw; strength rides
      // the TOD's horizon heat hard — dawn/evening blades must answer the
      // sun; noon keeps only a whisper (a hot rim at noon bleaches tips).
      // Rim keeps the SUN'S hue (a heavy pale lerp bleached the backlit
      // tips white through ACES — the glow must read warm, not confetti).
      u.uRimColor.value.setHex(spec.sunColor).lerp(this.rimPale, 0.12);
      u.uRimStrength.value = 0.12 + 0.75 * spec.hotStrength;
      // Two-tone strength: strong at the golden hours, present at noon.
      u.uDirStrength.value = 0.4 + 0.5 * spec.hotStrength;
      // Emissive backlight scale rides the sun-glow — HOT at the golden
      // hours (item 8: tips between camera and a horizon sun must glow
      // translucent-warm), but once the sun sits below the ridge line
      // (silhouette hour) the additive rim collapses to a whisper — the
      // round-4 lastlight glitter was exactly this term left uncapped.
      u.uRimGlow.value = spec.glowStrength * (spec.grassLumCap < 1 ? 0.12 : 0.8);
      // Sun drench on the far-field haze (same lobe the terrain runs).
      u.uSunHaze.value.setHex(spec.groundSunTint);
      u.uSunHazeK.value = Math.min(1, spec.groundSunK * 1.2);
      // Silhouette-hour clamps: luminance ceiling + kill the non-view-
      // dependent rim term once the sun is at the horizon.
      u.uLumCap.value = spec.grassLumCap;
      u.uLitRimK.value = spec.sunElevation <= 3 ? 0 : 1;
      // Cool-mass: unlit blades carry the sky's ambient (lastlight violet).
      u.uCoolTint.value.setHex(spec.groundCoolTint);
      u.uCoolK.value = spec.groundCoolK;
      // Silhouette-hour foreground override (round 6, item 2): the bottom
      // third of the lastlight frame is the violet shadow mass, not tan.
      u.uCoolNear.value = spec.grassLumCap < 1 ? 0.72 : 0;
      u.uSunRange.value.set(spec.groundSunNear, spec.groundSunFar);
      // Cloud dapples: same gate as the terrain (full deck + high sun).
      u.uCloudShK.value =
        spec.cloudAmount * THREE.MathUtils.clamp((spec.sunElevation - 15) / 20, 0, 1);
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

  /**
   * The SIM's cover patches, mapped to world meters by hunt3d — the visible
   * cover is exactly where the birds hide and the dog hunts. Each axis-
   * aligned sim rect becomes a ragged ellipse (radii 1.3x the half extents
   * so the dense core blankets the rect; softened harmonics keep the edge
   * organic without carving deep into where a bird might sit). Patches
   * whose ellipse never reaches the terrain plate are skipped — their
   * birds live beyond the world edge this phase.
   *
   * The static mesh built here is the FAR read only: sparse, large-crown
   * tussocks that keep a patch reading as a dark huntable mass from ~50 m
   * out to the 105 m cover fade. Full waist-high density near the camera
   * comes from the roaming tiles' V_COVER variant (fillTile).
   */
  private buildPatches(ctx: Ctx): void {
    // Local stream for the ragged-edge phases (per-subsystem RNG contract).
    const prng = mulberry32(0xc0f3e1);
    for (const wp of this.hunt.coverPatches()) {
      const rx = wp.hx * 1.3;
      const rz = wp.hz * 1.3;
      // Two phase draws ALWAYS consumed so a patch list change upstream
      // (or the plate clip below) never re-rolls every other edge.
      const ph1 = prng() * Math.PI * 2;
      const ph2 = prng() * Math.PI * 2;
      if (Math.abs(wp.cx) - rx * 1.4 > WORLD_LIMIT || Math.abs(wp.cz) - rz * 1.4 > WORLD_LIMIT) continue;
      this.patches.push({ cx: wp.cx, cz: wp.cz, rx, rz, cos: 1, sin: 0, ph1, ph2 });
    }
    this.buildTrails();

    for (const p of this.patches) {
      const ext = Math.max(p.rx, p.rz) * 1.45;
      const attempts = Math.ceil(this.cfg.coverFarDensity * (2 * ext) * (2 * ext));
      const mats: THREE.Matrix4[] = [];
      const cols: THREE.Color[] = [];
      const rng = mulberry32(hashTile(Math.round(p.cx * 7), Math.round(p.cz * 7)));
      for (let i = 0; i < attempts; i++) {
        const x = p.cx + (rng() * 2 - 1) * ext;
        const z = p.cz + (rng() * 2 - 1) * ext;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        const s = this.coverAt(x, z);
        if (rng() > s * 1.25) continue;
        // Game trails wear through the far layer too.
        const tr = this.trailAt(x, z);
        if (tr > 0 && rng() < tr * 0.9) continue;
        const y = this.terrain.heightAt(x, z) - 0.05;
        this.e.set(0, rng() * Math.PI * 2, 0);
        this.q.setFromEuler(this.e);
        // Large crowns: each far tussock stands for several near ones, so
        // the sparse layer still closes into a mass at 60+ m.
        const sxz = (0.8 + rng() * 0.5) * 1.25;
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
      // Tussock patches never cast (round-6 shadow audit): at grazing dawn
      // elevation their dense 1 m fountains merged into a solid shadow
      // smear across the hero frames — the same blanket the stubble made.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh);
      this.patchMeshes.push(mesh);
    }
  }

  /** Ellipse boundary distance from center along a unit direction. */
  private ellipseRadiusToward(p: CoverPatch, dx: number, dz: number): number {
    const lx = dx * p.cos + dz * p.sin;
    const lz = -dx * p.sin + dz * p.cos;
    return 1 / Math.sqrt((lx / p.rx) ** 2 + (lz / p.rz) ** 2 || 1e-6);
  }

  /**
   * GAME TRAILS: 2-3 narrow worn paths connecting the patches nearest the
   * world origin, each running from just inside one patch's fringe to just
   * inside the next — where birds and deer actually travel between cover.
   * Deterministic: the patch layout is fixed by the area, so the trails
   * are too. trailAt() thins every planting layer along them.
   */
  private buildTrails(): void {
    // Patches nearest the world origin hunt for a partner each: the
    // closest patch they do NOT overlap (the quail-fields scatter piles
    // several patches into one block — a trail between overlapping cover
    // would be an invisible stub inside it). The gap between edges is
    // where the worn line crosses open ground.
    const order = this.patches
      .map((_, i) => i)
      .sort(
        (a, b) =>
          Math.hypot(this.patches[a].cx, this.patches[a].cz) -
          Math.hypot(this.patches[b].cx, this.patches[b].cz),
      );
    const used = new Set<string>();
    for (const ia of order) {
      if (this.trails.length >= 3) break;
      const a = this.patches[ia];
      let bestJ = -1;
      let bestGap = Infinity;
      for (const ib of order) {
        if (ib === ia || used.has(`${Math.min(ia, ib)}-${Math.max(ia, ib)}`)) continue;
        const b = this.patches[ib];
        const dist = Math.hypot(b.cx - a.cx, b.cz - a.cz) || 1;
        const dx = (b.cx - a.cx) / dist;
        const dz = (b.cz - a.cz) / dist;
        const gap = dist - this.ellipseRadiusToward(a, dx, dz) - this.ellipseRadiusToward(b, -dx, -dz);
        // Needs real open ground between the edges to read as a trail.
        if (gap >= 4 && gap < bestGap) {
          bestGap = gap;
          bestJ = ib;
        }
      }
      if (bestJ < 0) continue;
      used.add(`${Math.min(ia, bestJ)}-${Math.max(ia, bestJ)}`);
      const b = this.patches[bestJ];
      let dx = b.cx - a.cx;
      let dz = b.cz - a.cz;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // Start/end pulled 30% inside each patch edge: the trail visibly
      // enters the cover, the way a worn run disappears into ragweed.
      const ra = this.ellipseRadiusToward(a, dx, dz) * 0.7;
      const rb = this.ellipseRadiusToward(b, -dx, -dz) * 0.7;
      const ax = a.cx + dx * ra;
      const az = a.cz + dz * ra;
      const sx = b.cx - dx * rb - ax;
      const sz = b.cz - dz * rb - az;
      this.trails.push({ ax, az, dx: sx, dz: sz, len2: sx * sx + sz * sz || 1 });
    }
  }

  /** Trail wear at a point: 1 on the centerline, 0 beyond ~1.2 m. */
  private trailAt(x: number, z: number): number {
    let best = 0;
    for (let i = 0; i < this.trails.length; i++) {
      const t = this.trails[i];
      const px = x - t.ax;
      const pz = z - t.az;
      let u = (px * t.dx + pz * t.dz) / t.len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = px - t.dx * u;
      const ez = pz - t.dz * u;
      const d2 = ex * ex + ez * ez;
      if (d2 > 1.96) continue; // beyond 1.4 m of the line
      const w = 1 - THREE.MathUtils.smoothstep(Math.sqrt(d2), 0.5, 1.4);
      if (w > best) best = w;
    }
    return best;
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
    // Shadow casting is confined to the tiles near the camera: a half-meter
    // tuft's cast shadow is invisible beyond ~40 m, and the shadow depth
    // pass re-renders every caster at full geometry (the whole-field
    // version blew the 1.5M-tri budget). Ground-hugging forbs never cast.
    if (this.cfg.castShadow) {
      const cx = ctx.camera.position.x;
      const cz = ctx.camera.position.z;
      for (const tile of this.active.values()) {
        const dx = (tile.tx + 0.5) * TILE - cx;
        const dz = (tile.tz + 0.5) * TILE - cz;
        const near = dx * dx + dz * dz < 40 * 40;
        tile.meshes[V_OPEN].castShadow = false; // blanket culprit — never casts
        tile.meshes[V_STALK].castShadow = near;
        tile.meshes[V_FORB].castShadow = false;
        // The body mass never casts — its skirts fake contact shadows and
        // its instance count would double the depth pass for nothing.
        tile.meshes[V_TUFT].castShadow = false;
        // Tussocks never cast (round-6 audit: dense fountains at grazing
        // dawn elevation merge into a solid shadow smear).
        tile.meshes[V_COVER].castShadow = false;
      }
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
    // Feathered world edge: density thins over the last dozen meters of the
    // plate instead of stopping on a razor-straight rectangle line.
    const lim = Math.max(Math.abs(px), Math.abs(pz));
    if (lim > WORLD_LIMIT) return false;
    if (lim > WORLD_LIMIT - 12 && rng() < (lim - (WORLD_LIMIT - 12)) / 12) return false;
    // Game trails: a worn line keeps only scattered, trampled runts.
    const trail = this.trailAt(px, pz);
    if (trail > 0) {
      if (rng() < trail * 0.93) return false;
      vigor *= 1 - 0.55 * trail;
    }
    const y = this.terrain.heightAt(px, pz) - 0.04;
    // Stubble rows share ONE field direction (drilled, harvested land);
    // everything else scatters its yaw freely.
    const yaw = vi === V_OPEN ? ROW_YAW + (rng() - 0.5) * 0.3 : rng() * Math.PI * 2;
    this.e.set((rng() - 0.5) * 0.16, yaw, (rng() - 0.5) * 0.16);
    this.q.setFromEuler(this.e);
    const sxz = vigor * (0.85 + rng() * 0.3);
    this.s.set(sxz, vigor * (0.8 + rng() * 0.4), sxz);
    this.v.set(px, y, pz);
    this.m.compose(this.v, this.q, this.s);

    // Grass-band base color + per-variant character.
    this.groundColorAt(px, pz, y);
    if (vi === V_TUFT) {
      // The body mass carries the 2-3 hue variants the meadow needs:
      // straw-gold heart, olive-tinged runs, pale bleached crowns.
      const fam = rng();
      if (fam < 0.45) this.c.lerp(this.grassGold, 0.28 + rng() * 0.22);
      else if (fam < 0.88) this.c.lerp(this.grassOlive, 0.38 + rng() * 0.32);
      else this.c.lerp(this.strawPale, 0.26 + rng() * 0.22);
    } else if (vi === V_FORB) {
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
   * Deterministic tile fill: same tile, same tufts, every visit. Round-4
   * mass inversion: the field IS grass — a near-continuous body-tuft
   * lattice where fertility only carves the bare exceptions — with the
   * round-3 stubble clumps, bluestem stalks and forbs riding inside that
   * mass as variety. Bare dirt is a patch inside grass, never the default.
   */
  private fillTile(tile: Tile, tx: number, tz: number): void {
    tile.tx = tx;
    tile.tz = tz;
    const rng = mulberry32(hashTile(tx, tz));
    const counts = [0, 0, 0, 0, 0];
    const caps = [this.cfg.capOpen, this.cfg.capStalk, this.cfg.capForb, this.cfg.capTuft, this.cfg.capCover];

    // THE BODY: continuous tuft mass on a fine jittered grid. ~85% of
    // sites grow (the Firewatch meadow coverage the fw-* stills hold);
    // below the bare line almost nothing does, with a thin thinning
    // fringe just above it so bald patches keep ragged edges.
    const tStep = this.cfg.tuftStep;
    const tCells = Math.floor(TILE / tStep);
    for (let gx = 0; gx < tCells; gx++) {
      for (let gz = 0; gz < tCells; gz++) {
        const x = tx * TILE + (gx + 0.08 + rng() * 0.84) * tStep;
        const z = tz * TILE + (gz + 0.08 + rng() * 0.84) * tStep;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        // Inside cover the MEADOW KEEPS RUNNING (coverage is the whole
        // ballgame — round 5, item 1): only a third of body tufts yield
        // their spot to tussocks. Cover reads dense/dark by the fringe
        // boost below + tussocks ON TOP of grass, never grass replaced
        // by dirt-and-reeds.
        const cs = this.coverAt(x, z);
        if (rng() < 0.35 * THREE.MathUtils.smoothstep(cs, 0.12, 0.6)) continue;
        // MEDIUM tier — the fringe ring: body tufts around a patch stand
        // taller and rankier, so cover grades patch -> fringe -> open the
        // way real edge habitat does (and the eye reads where to hunt).
        // The boost PEAKS at the ring and relaxes toward the heart — the
        // interior stays a gold meadow the tussocks darken, not a reed bed.
        const fringe =
          THREE.MathUtils.smoothstep(cs, 0.04, 0.5) *
          (1 - 0.6 * THREE.MathUtils.smoothstep(cs, 0.55, 0.95));
        const macro = this.clumpNoise(x * 0.055 + 40, z * 0.055 + 40);
        const meso = this.clumpNoise(x * 0.16 + 700, z * 0.16 + 700);
        const fertile = macro * 0.62 + meso * 0.38;
        // Coverage is the whole ballgame (item 1): bald patches survive but
        // TIGHTER, and even they keep a scatter of runts — noon is the
        // audit light, and soil must be the exception glimpsed between
        // clumps, never the subject.
        // Bald patches shrink to true exceptions (0.17, was 0.21 — the
        // macro minima were carving subject-sized dirt lots into the noon
        // frame), and even they keep readable runts.
        if (fertile < 0.17) {
          if (rng() > 0.62) continue; // thin runts even on the bald spots
        } else if (fertile < 0.23 && rng() < (0.23 - fertile) / 0.12) {
          continue; // ragged fringe around the bald spot
        }
        // Drift structure: a mid-scale wave thins the mass slightly in the
        // troughs and doubles tufts on the crests, so the body reads as
        // overlapping DRIFTS of grass, not one tuft per lattice site.
        const drift = this.clumpNoise(x * 0.09 + 5100, z * 0.09 + 5100);
        if (drift < 0.3 && rng() < 0.22) continue;
        // Vigor floors at ~0.69x: bald-zone runts stay SHORT, not invisible.
        // Fringe tufts take a rank-growth boost (up to +45% height).
        const vigor =
          (0.8 + 0.45 * THREE.MathUtils.clamp((fertile - 0.3) / 0.3, -0.28, 1)) *
          (0.85 + rng() * 0.35) *
          (1 + 0.32 * fringe);
        if (this.placeTuft(tile, counts, caps, V_TUFT, x, z, vigor, rng) && fringe > 0.1) {
          // Fringe hue: rank edge growth leans olive toward the patch.
          const mesh = tile.meshes[V_TUFT];
          this.c.lerp(this.grassOlive, fringe * 0.35);
          mesh.setColorAt(counts[V_TUFT] - 1, this.c);
        }
        if (drift > 0.52 && rng() < 0.5) {
          const a2 = rng() * Math.PI * 2;
          const d2 = 0.3 + rng() * 0.3;
          this.placeTuft(tile, counts, caps, V_TUFT,
            x + Math.sin(a2) * d2, z + Math.cos(a2) * d2,
            vigor * (0.7 + rng() * 0.4), rng);
        }
        // The fringe thickens: an extra tuft crowds in along the edge band.
        if (fringe > 0.15 && fringe < 0.9 && rng() < 0.35 * fringe) {
          const a3 = rng() * Math.PI * 2;
          const d3 = 0.25 + rng() * 0.3;
          this.placeTuft(tile, counts, caps, V_TUFT,
            x + Math.sin(a3) * d3, z + Math.cos(a3) * d3,
            vigor * (0.75 + rng() * 0.35), rng);
        }
      }
    }
    // Clump lattice: candidate centers every ~2.7x the round-2 site step.
    const cStep = this.cfg.cellStep * 2.7;
    const cells = Math.floor(TILE / cStep);
    for (let gx = 0; gx < cells; gx++) {
      for (let gz = 0; gz < cells; gz++) {
        const x = tx * TILE + (gx + 0.1 + rng() * 0.8) * cStep;
        const z = tz * TILE + (gz + 0.1 + rng() * 0.8) * cStep;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        // Cover boundary is FEATHERED: open stubble thins across the patch
        // fringe instead of stopping on a contour — and the patch interior
        // keeps a real understory (birds hide in structure, not on dirt).
        if (rng() < 0.45 * THREE.MathUtils.smoothstep(this.coverAt(x, z), 0.12, 0.6)) continue;

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

        // One stubble clump — VARIETY riding inside the tuft mass now, so
        // leaner than round 3: 3-8 stems, big heart, runt fringe, a shared
        // per-clump hue lean.
        const n = Math.round((3.5 + rng() * 5.5) * (0.55 + 0.45 * edge));
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

    // A light sprinkle of runt stubble and green forbs threaded through
    // the tuft mass — the third hue family showing between gold tufts.
    const gStep = this.cfg.cellStep * 1.6;
    const gCells = Math.floor(TILE / gStep);
    for (let gx = 0; gx < gCells; gx++) {
      for (let gz = 0; gz < gCells; gz++) {
        if (rng() < 0.68) continue;
        const x = tx * TILE + (gx + 0.1 + rng() * 0.8) * gStep;
        const z = tz * TILE + (gz + 0.1 + rng() * 0.8) * gStep;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        if (rng() < 0.4 * THREE.MathUtils.smoothstep(this.coverAt(x, z), 0.12, 0.6)) continue;
        const macro = this.clumpNoise(x * 0.055 + 40, z * 0.055 + 40);
        const meso = this.clumpNoise(x * 0.16 + 700, z * 0.16 + 700);
        const fertile = macro * 0.62 + meso * 0.38;
        if (fertile < 0.3) continue;
        const vi = rng() < 0.3 ? V_FORB : V_OPEN;
        this.placeTuft(tile, counts, caps, vi, x, z, 0.35 + rng() * 0.3, rng);
      }
    }

    // DENSE tier — waist-high tussocks filling the sim's cover patches at
    // full density near the camera (the static per-patch layer is only the
    // sparse far read). Acceptance ramps with cover strength so the patch
    // heart packs solid while the rim stays ragged; game trails wear
    // narrow walkable lines straight through.
    const cvStep = this.cfg.coverStep;
    const cvCells = Math.floor(TILE / cvStep);
    const coverMesh = tile.meshes[V_COVER];
    for (let gx = 0; gx < cvCells; gx++) {
      for (let gz = 0; gz < cvCells; gz++) {
        if (counts[V_COVER] >= caps[V_COVER]) break;
        const x = tx * TILE + (gx + 0.1 + rng() * 0.8) * cvStep;
        const z = tz * TILE + (gz + 0.1 + rng() * 0.8) * cvStep;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        const s = this.coverAt(x, z);
        if (s < 0.08) continue;
        if (rng() > THREE.MathUtils.smoothstep(s, 0.08, 0.7)) continue;
        const trail = this.trailAt(x, z);
        if (trail > 0 && rng() < trail * 0.95) continue;
        const y = this.terrain.heightAt(x, z) - 0.05;
        this.e.set(0, rng() * Math.PI * 2, 0);
        this.q.setFromEuler(this.e);
        const sxz = (0.78 + rng() * 0.5) * (1 - 0.3 * trail);
        // Height rides cover strength: fringe tussocks knee-high, the
        // heart waist-high — the tier step a hunter reads at a glance.
        const sy = (0.68 + 0.42 * s) * (0.85 + rng() * 0.35) * (1 - 0.4 * trail);
        this.s.set(sxz, sy, sxz);
        this.v.set(x, y, z);
        this.m.compose(this.v, this.q, this.s);
        // Deeper olive than the far layer: near-camera tussocks are the
        // DENSE tier's paint — visibly darker ground a dog gets sent into
        // (kept a stop above round-1's charred hedge; haze still wins far).
        this.c.copy(this.khaki).lerp(this.oliveMid, 0.4 + rng() * 0.4);
        this.c.lerp(this.olive, s * (0.3 + rng() * 0.2));
        if (rng() < 0.12) this.c.lerp(this.oliveDeep, 0.2);
        this.c.multiplyScalar(0.98 + rng() * 0.26);
        coverMesh.setMatrixAt(counts[V_COVER], this.m);
        coverMesh.setColorAt(counts[V_COVER], this.c);
        counts[V_COVER]++;
      }
    }

    for (let vi = 0; vi < N_VARIANTS; vi++) {
      const mesh = tile.meshes[vi];
      mesh.count = counts[vi];
      mesh.visible = counts[vi] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (counts[vi] > 0) mesh.computeBoundingSphere();
    }
  }
}
