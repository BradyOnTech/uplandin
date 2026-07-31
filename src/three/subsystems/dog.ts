import * as THREE from 'three';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';

/*
 * DOG subsystem — the reason the game exists.
 *
 * A segmented low-poly English Setter (A Short Hike's shape language:
 * flat-shaded tapered prisms, strong silhouette, zero realism) rendered
 * on top of the LIVE sim dog from hunt3d. The sim is truth: position,
 * heading, state and gait come from Dog.update exactly as the 2D
 * FieldScene consumed them; this file only decides what the truth looks
 * like.
 *
 *  - BODY: hex-lofted torso (deep chest, thick forequarters, waist tuck,
 *    haunch), boxed neck sunk wide into the chest, dropped triangular ear
 *    flaps (the #1 dog identifier — the silhouette survives front and 3/4
 *    angles), rigid flag tail with notched feathering facets, four
 *    two-segment legs. White coat off the palette's pale role with dark
 *    head patches and a sparse belton ticking suggestion. ~0.55 m at the
 *    shoulder, ~490 tris, 15 draw calls.
 *  - LIGHTING (round 11 rebuild — the audit-gated coat): Lambert under
 *    the scene sun/hemisphere, plus four committed terms measured by
 *    tools3d/audit-dog-light.mjs against hard thresholds:
 *      (1) headroom normalization — uAlbedoK scales the near-white coat
 *          so a full-sun facet lands on the responsive part of the ACES
 *          curve instead of the flat shoulder that erased three rounds
 *          of modeling;
 *      (2) a POSITIONAL core shadow along the flat sun axis across the
 *          dog's own body (the torso is a hex prism — broadside views
 *          are ONE facet, and only a positional term can split a flat
 *          facet the way the dog's sun-ward half really shadows its lee
 *          half at a 6-degree sun), a narrow committed terminator band
 *          relieved under backlight;
 *      (3) warm sun paint on grazing sun-facing facets and on the
 *          sun-ward end (forward scatter), swelling when the camera
 *          faces the sun — the 270-melt fix;
 *      (4) the shade mass re-lit by the hour's shadow tint (mauve-gray
 *          at dawn, violet at lastlight — the roles the grass cores
 *          breathe), graded by sky exposure, plus a hot backlit rim.
 *    Albedo roles come from strawPale — never #fff, and nothing renders
 *    effectively fullbright (audit clip gate <= 2%).
 *  - GROUNDING: dog meshes never render into the shadow map (the grazing-
 *    sun splat read as a burn mark); one soft contact ellipse (multiply-
 *    blended, terrain-draped per vertex, body-parented, leaned/stretched
 *    along the sun azimuth) grounds the torso. Feet plant EXACTLY — paw
 *    markers are measured through the full transform chain against the
 *    terrain under each paw, and the root sinks by the lowest standing
 *    paw's clearance. Grass opens around the dog via partingPoint().
 *  - LOCOMOTION: distance-driven gait (the 2D lesson — legs turn exactly
 *    as fast as the ground moves): the stride phase advances per meter
 *    traveled, never per second, so the dog never moonwalks. Diagonal
 *    trot pairs, a 4-beat rotary gallop on 'run', body bob, ear bounce,
 *    tail carriage by gait, a lean into turns.
 *  - THE POINT: sim state 'pointing' (and 'honoring') freezes the classic
 *    — body rigid and horizontal, tail STRAIGHT UP, head locked on the
 *    pointed bird's world position, left foreleg lifted and folded. The
 *    game's money shot; every parameter here serves that silhouette.
 *  - Determinism: all idle motion (wag, breath, ear flops) keys off
 *    ctx.time and is DISABLED under ?capture=1, where smoothing snaps to
 *    targets — a captured pose is a pure function of the sim seed.
 *
 * Per-frame: one sim read, ~20 group-transform writes, zero allocations.
 */

/** Local stream for coat flecks/build jitter — never ctx.rng. */
const DOG_ART_SEED = 0x5e77e6;

/* ------------------------------ geometry ------------------------------ */

type V3 = readonly [number, number, number];

/** Cross-section for z-axis parts (torso, neck, tail, head boxes). */
interface SectZ {
  x: number;
  y: number;
  z: number;
  hw: number;
  hh: number;
}

/** Cross-section for y-axis parts (legs, ears). */
interface SectY {
  x: number;
  y: number;
  z: number;
  hw: number;
  hd: number;
}

class PartBuilder {
  private pos: number[] = [];
  private col: number[] = [];

  tri(a: V3, b: V3, c: V3, color: THREE.Color): void {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: THREE.Color): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** Same quad emitted with both windings — thin fins/ears read from both sides. */
  quad2(a: V3, b: V3, c: V3, d: V3, color: THREE.Color): void {
    this.quad(a, b, c, d, color);
    this.quad(d, c, b, a, color);
  }

  /**
   * Tapered box along z: s0 = rear section, s1 = front (s1.z > s0.z).
   * Optional per-face colors (top/bottom/side/cap) paint patches for free.
   */
  boxZ(
    s0: SectZ,
    s1: SectZ,
    c: { side: THREE.Color; top?: THREE.Color; bottom?: THREE.Color; front?: THREE.Color; back?: THREE.Color },
  ): void {
    const A0: V3 = [s0.x - s0.hw, s0.y - s0.hh, s0.z];
    const B0: V3 = [s0.x + s0.hw, s0.y - s0.hh, s0.z];
    const C0: V3 = [s0.x + s0.hw, s0.y + s0.hh, s0.z];
    const D0: V3 = [s0.x - s0.hw, s0.y + s0.hh, s0.z];
    const A1: V3 = [s1.x - s1.hw, s1.y - s1.hh, s1.z];
    const B1: V3 = [s1.x + s1.hw, s1.y - s1.hh, s1.z];
    const C1: V3 = [s1.x + s1.hw, s1.y + s1.hh, s1.z];
    const D1: V3 = [s1.x - s1.hw, s1.y + s1.hh, s1.z];
    this.quad(A1, B1, C1, D1, c.front ?? c.side); // +z
    this.quad(B0, A0, D0, C0, c.back ?? c.side); // -z
    this.quad(D1, C1, C0, D0, c.top ?? c.side); // +y
    this.quad(A0, B0, B1, A1, c.bottom ?? c.side); // -y
    this.quad(B0, C0, C1, B1, c.side); // +x
    this.quad(D0, A0, A1, D1, c.side); // -x
  }

  /** Tapered box along -y: s0 = upper section, s1 = lower (s1.y < s0.y). */
  boxY(s0: SectY, s1: SectY, color: THREE.Color): void {
    const A0: V3 = [s0.x - s0.hw, s0.y, s0.z - s0.hd];
    const B0: V3 = [s0.x + s0.hw, s0.y, s0.z - s0.hd];
    const C0: V3 = [s0.x + s0.hw, s0.y, s0.z + s0.hd];
    const D0: V3 = [s0.x - s0.hw, s0.y, s0.z + s0.hd];
    const A1: V3 = [s1.x - s1.hw, s1.y, s1.z - s1.hd];
    const B1: V3 = [s1.x + s1.hw, s1.y, s1.z - s1.hd];
    const C1: V3 = [s1.x + s1.hw, s1.y, s1.z + s1.hd];
    const D1: V3 = [s1.x - s1.hw, s1.y, s1.z + s1.hd];
    this.quad(D1, C1, C0, D0, color); // +z
    this.quad(B1, A1, A0, B0, color); // -z
    this.quad(C1, B1, B0, C0, color); // +x
    this.quad(A1, D1, D0, A0, color); // -x
    this.quad(A1, B1, C1, D1, color); // -y
    this.quad(D0, C0, B0, A0, color); // +y
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return geo;
  }
}

/** Hex ring in the x-y plane — top vertex, flanks, keel. Dog-ish section. */
const HEX_ANG = [90, 150, 210, 270, 330, 30].map((d) => (d * Math.PI) / 180);

function hexRing(s: SectZ, out: V3[]): void {
  for (let i = 0; i < 6; i++) {
    out[i] = [s.x + Math.cos(HEX_ANG[i]) * s.hw, s.y + Math.sin(HEX_ANG[i]) * s.hh, s.z];
  }
}

/** Loft hex sections rear→front (increasing z) with pointed end caps. */
function loftZ(
  b: PartBuilder,
  sections: SectZ[],
  colors: THREE.Color[],
  capRear: V3,
  capFront: V3,
  capRearC: THREE.Color,
  capFrontC: THREE.Color,
): void {
  const rings: V3[][] = sections.map((s) => {
    const r: V3[] = new Array(6);
    hexRing(s, r);
    return r;
  });
  for (let k = 0; k < rings.length - 1; k++) {
    const rear = rings[k];
    const front = rings[k + 1];
    for (let j = 0; j < 6; j++) {
      const j2 = (j + 1) % 6;
      b.quad(rear[j], rear[j2], front[j2], front[j], colors[k]);
    }
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (let j = 0; j < 6; j++) {
    const j2 = (j + 1) % 6;
    b.tri(first[j2], first[j], capRear, capRearC); // rear cap (faces -z)
    b.tri(last[j], last[j2], capFront, capFrontC); // front cap (faces +z)
  }
}

/* --------------------------- proportions (m) --------------------------- */
// A 0.55 m setter, nose +z. Pivots are where groups attach; geometry is
// built in each group's local space with the origin AT the joint.

const FORE_X = 0.068;
const FORE_Y = 0.415;
const FORE_Z = 0.155;
const HIND_X = 0.066;
const HIND_Y = 0.43;
const HIND_Z = -0.27;
const NECK_PIVOT: V3 = [0, 0.46, 0.2];
const NECK_TOP: V3 = [0, 0.15, 0.11]; // head joint in neck-local space
const TAIL_PIVOT: V3 = [0, 0.465, -0.33];

/**
 * Torso loft sections, rear→front: rump, hip, waist tuck, heart girth,
 * shoulder/prosternum. Round 7: the chest DEEPENED and the forequarters
 * THICKENED — the off-profile mandate. The heart girth is the widest,
 * deepest ring on the dog and the prosternum stays broad so a front or
 * three-quarter view reads chest mass, not a spindle.
 */
// Round 9: the beam widened again — heart girth and prosternum pushed
// toward a third of the torso's side-view depth so the front and
// three-quarter reads carry real chest mass, not a keel.
const TORSO_SECTS: SectZ[] = [
  { x: 0, y: 0.44, z: -0.33, hw: 0.055, hh: 0.075 },
  { x: 0, y: 0.43, z: -0.24, hw: 0.084, hh: 0.11 },
  { x: 0, y: 0.445, z: -0.06, hw: 0.076, hh: 0.1 },
  { x: 0, y: 0.42, z: 0.13, hw: 0.116, hh: 0.148 },
  { x: 0, y: 0.415, z: 0.27, hw: 0.1, hh: 0.13 },
];

/** Gait cycle tuning. Stride = meters of ground per full leg cycle. */
interface GaitCfg {
  stride: number;
  swing: number;
  fold: number;
  bob: number;
  rock: number;
  /** Per-leg phase offsets FL, FR, HL, HR. */
  off: readonly [number, number, number, number];
  tail: number;
  wag: number;
  wagHz: number;
  neck: number;
  head: number;
}

const HALF = Math.PI;
const GAITS: Record<'run' | 'trot' | 'track', GaitCfg> = {
  // Rotary-gallop flavored 4-beat: near-paired hinds driving, fronts
  // reaching — the big quartering stride.
  run: {
    stride: 1.55, swing: 0.8, fold: 1.25, bob: 0.028, rock: 0.05,
    off: [0, 0.55, HALF + 0.35, HALF + 0.9],
    tail: 0.25, wag: 0.1, wagHz: 5, neck: 0.06, head: 0.04,
  },
  // Diagonal 2-beat trot — level tail, level back, workmanlike.
  trot: {
    stride: 1.0, swing: 0.55, fold: 0.85, bob: 0.018, rock: 0.015,
    off: [0, HALF, HALF, 0],
    tail: 0.12, wag: 0.16, wagHz: 6, neck: 0.0, head: 0.02,
  },
  // Making game: crouched, fast-legged creep — tail HIGH and cracking,
  // head reaching down the scent cone.
  track: {
    stride: 0.62, swing: 0.34, fold: 0.5, bob: 0.008, rock: 0.01,
    off: [0, HALF, HALF, 0],
    tail: 0.95, wag: 0.3, wagHz: 9, neck: 0.42, head: 0.1,
  },
};

/** Neutral standing joint angles: FL, FR upper/lower then HL, HR. */
const NEUTRAL_U = [-0.03, -0.03, -0.22, -0.22];
const NEUTRAL_L = [0.06, 0.06, 0.45, 0.45];

/** exp-smoothing toward a target; snap = capture determinism. */
function approach(cur: number, target: number, rate: number, dt: number, snap: boolean): number {
  if (snap) return target;
  return target + (cur - target) * Math.exp(-rate * dt);
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class DogSystem implements Subsystem {
  readonly id = 'dog';

  private hunt!: Hunt3DSystem;
  private terrain!: TerrainSystem;
  private mat?: THREE.MeshLambertMaterial;
  private geos: THREE.BufferGeometry[] = [];

  private root = new THREE.Group();
  private body = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private earL = new THREE.Group();
  private earR = new THREE.Group();
  /** Tail root (hip joint) and flag (mid-tail joint) — the carriage angle
   *  splits across both so the flag CURVES out of the topline (round 9). */
  private tailRoot = new THREE.Group();
  private tailFlag = new THREE.Group();
  /** Flag-tip marker — the droop clamp measures THIS against terrain. */
  private tailTip = new THREE.Object3D();
  /** FL, FR, HL, HR — upper pivots at shoulder/hip, lower at knee/hock. */
  private legU: THREE.Group[] = [];
  private legL: THREE.Group[] = [];
  /** Paw-tip markers (lower-leg local) — exact planting + capture audit. */
  private pawTips: THREE.Object3D[] = [];
  private pawV = new THREE.Vector3();

  private frozen = false;
  /** Sun-answer uniforms shared by the one coat material. */
  private tone = {
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uAlbedoK: { value: 1 },
    uWarmK: { value: 0 },
    uCoolK: { value: 0 },
    uCoolTint: { value: new THREE.Color(P.shadowNeutral) },
    uRimColor: { value: new THREE.Color(0) },
    uRimK: { value: 0 },
    uSunPaintK: { value: 0 },
    uShadeFillK: { value: 0 },
    /** Dog body center, world — anchors the positional core-shadow axis. */
    uDogCtrW: { value: new THREE.Vector3() },
  };
  private creamScratch = new THREE.Color(P.cream);
  /** Scratch for the headroom normalization's luminance reads. */
  private lumScratch = new THREE.Color();

  // Contact-shadow ellipse (the grounding — dog meshes never cast).
  private shadowGrp = new THREE.Group();
  private shadowGeo?: THREE.RingGeometry;
  private shadowMat?: THREE.ShaderMaterial;
  /** Unit-disc rest positions (xz) — the per-frame conform reads these. */
  private shadowBase?: Float32Array;
  /** World-space shadow direction (away from the sun), set per TOD. */
  private shadowDirX = 0;
  private shadowDirZ = -1;
  /** Center shift away from the sun / elongation along it (per TOD). */
  private shadowLean = 0.06;
  private shadowStretch = 0.2;
  /** Cross-axis half-width — tightens as the along-axis stretches. */
  private shadowWidth = 0.42;

  // Smoothed pose state.
  private yaw = 0;
  private roll = 0;
  private slopePitch = 0;
  private slopeRoll = 0;
  private bodyPitch = 0;
  private bob = 0;
  private neckPitch = 0;
  private headPitch = 0;
  private headYaw = 0;
  private tailPitch = -0.55;
  private tailYaw = 0;
  private earFlop = 0;
  private uAng = [0, 0, 0, 0];
  private lAng = [0, 0, 0, 0];
  private phase = 0;
  private yawRate = 0;
  /** Cover-parting radius fed to grass — widens on point (bug 4). */
  private partR = 1.3;

  // Preallocated scratch.
  private posW = { x: 0, z: 0 };
  private birdW = { x: 0, z: 0 };
  private lastX = 0;
  private lastZ = 0;
  private hasLast = false;

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.terrain = ctx.get<TerrainSystem>('terrain');
    const high = ctx.quality === 'high';

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // ROUND 7, item 1 — the coat takes the WORLD's light. The flora facet
    // recipe sized for a white coat: sun-facing facets take a warm lift,
    // shade facets multiply toward the hour's SHADOW TINT (mauve-gray at
    // dawn, violet at lastlight — the same palette roles the grass cores
    // breathe), and a sun-colored rim keeps the lit edge alive at the
    // golden hours. The Lambert base under the scene sun/hemisphere does
    // the actual modeling — no more fullbright emissive cheat.
    const tone = this.tone;
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tone);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGWposR11;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\tvGWposR11 = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSunDirW;\nuniform float uAlbedoK;\nuniform float uWarmK;\nuniform float uCoolK;\n' +
            'uniform vec3 uCoolTint;\nuniform vec3 uRimColor;\nuniform float uRimK;\n' +
            'uniform float uSunPaintK;\nuniform float uShadeFillK;\nuniform vec3 uDogCtrW;\nvarying vec3 vGWposR11;',
        )
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n' +
            '\tvec3 gWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );\n' +
            '\tvec3 gVW = normalize( ( vec4( normalize( vViewPosition ), 0.0 ) * viewMatrix ).xyz );\n' +
            // ROUND 11 — HEADROOM NORMALIZATION, the real cause of three
            // rounds of paper-white: a near-white albedo under the dawn
            // key (4.0) and exposure (1.42) parked the ENTIRE coat on the
            // flat shoulder of the ACES curve, where a 2:1 lit-vs-shade
            // radiance difference tone-maps to a 0.95 display ratio — the
            // audit measured the ring at ratios 0.93-1.09 (angle 135 was
            // INVERTED). No tint multiplier can survive that compression.
            // uAlbedoK (set per TOD below) scales the coat's albedo so a
            // full-sun facet lands ~1.3 pre-tonemap — the responsive part
            // of the curve — and the N-dot-L modeling that was always
            // there becomes VISIBLE. The dog still reads white because the
            // lit coat sits far above everything else in frame.
            '\tdiffuseColor.rgb *= uAlbedoK;\n' +
            // Committed plateau split at the terminator (the flora round-6
            // lesson): one lit face, one shade face, a few degrees of
            // anti-aliased transition between them. The warm term is a HUE
            // shift (gain ~1.0), not a lift — gain was re-spending the
            // headroom the normalization just bought.
            '\tfloat gSplit = smoothstep( -0.15, 0.3, dot( gWN, uSunDirW ) );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.18, 1.02, 0.80 ), gSplit * uWarmK );\n' +
            // ROUND 11 — POSITIONAL CORE SHADOW. The audit's column
            // profiles found the geometric truth behind three flat-white
            // rounds: the torso is a hex prism, so a broadside ring view
            // is ONE flat facet — and every normal-based term is constant
            // across a flat facet. But at a 6-degree sun the dog's
            // sun-ward half really does shadow its lee half, so gPosSun —
            // the fragment's position along the FLAT sun axis across the
            // dog's own body (uDogCtrW, +-0.45 m) — carries the split
            // that facet normals cannot: the lee END of the dog commits
            // to shade even mid-facet.
            '\tvec3 gSFlat = normalize( vec3( uSunDirW.x, 0.0, uSunDirW.z ) );\n' +
            '\tfloat gPosSun = clamp( dot( vGWposR11 - uDogCtrW, gSFlat ) / 0.45, -1.0, 1.0 );\n' +
            // Midpoint shifted sun-ward (0.45): when the body lies across
            // the sun axis the whole dog sits near gPosSun 0, and the
            // core shadow must already be biting there or broadside views
            // stay one flat tone (audit iteration 3: ratio 0.98 at 90).
            // A NARROW committed transition (0.42 -> -0.02): the earlier
            // 0.84-body-length ramp left a wide mid-tone strip that
            // diluted both centroid halves at every angle. The band is
            // still anti-aliased, but the coat now breaks into two
            // committed tones — the house terminator style. Backlight
            // relieves it (translucency): the 270 wrap needs the sun-ward
            // slice alive when the camera faces the sun.
            '\tfloat gPosShade = smoothstep( 0.42, -0.02, gPosSun );\n' +
            '\tfloat gBackPre = clamp( dot( -gVW, uSunDirW ), 0.0, 1.0 );\n' +
            '\tgPosShade *= 1.0 - 0.5 * gBackPre * gBackPre;\n' +
            // MOMENT ROUND, item 5 — the shade mass is MODELED, not one
            // flat multiply: shade facets grade by SKY EXPOSURE — an
            // up-facing rump catches the dawn vault, flanks fall off,
            // undersides sink. Round 11: the shade weight is the UNION of
            // the facet term and the positional core shadow, and the sink
            // deepens (tint * 0.75) — the shade-fill light below re-lights
            // the mass in the hour's shadow tint, so committing the
            // multiply reads as one painted shade tone, never a hole.
            '\tfloat gSky = clamp( gWN.y * 0.5 + 0.5, 0.0, 1.0 );\n' +
            '\tfloat gShadeW = max( 1.0 - gSplit, gPosShade );\n' +
            // gSky ceiling capped at 0.8 (round 11): the up-facing topline
            // and raised flag ran a pale glowing stripe across BOTH halves
            // of every ring view — skylight on the back stays a whisper.
            '\tvec3 gShadeTint = uCoolTint * mix( 0.66, 0.8, gSky ) * 0.75;\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), gShadeTint, gShadeW * uCoolK );\n' +
            // The core shadow takes one further VALUE step the tint mix
            // cannot reach (ACES compresses display ratios ~0.6 power —
            // a 0.5 radiance step lands as 0.87 on screen): direct sun
            // falling on the lee half is sunk like the real self-shadow
            // it stands in.
            '\tdiffuseColor.rgb *= 1.0 - gPosShade * uCoolK * 0.6;\n' +
            // Away-from-sun step deepened 0.22 -> 0.36 (round 11): on the
            // backlit ring angles both centroid halves are shade — the
            // sun-ward half must still win via the facets that lean toward
            // the sun, so the squarely-away facets take a real step down.
            '\tfloat gAway = clamp( ( -dot( gWN, uSunDirW ) - 0.1 ) * 1.1, 0.0, 1.0 );\n' +
            '\tdiffuseColor.rgb *= 1.0 - gAway * uCoolK * 0.36;',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
            '\tfloat gBack = gBackPre;\n' +
            '\tfloat gSF = dot( gWN, uSunDirW );\n' +
            // ROUND 11 — SUN PAINT: an analytic warm band on the GRAZING
            // sun-facing facets (the terminator side). Lambert's own N-dot-L
            // gives these facets almost nothing at a 6-degree sun, which is
            // why the sun-ward half of every broadside ring view measured
            // as dark as the shade half (audit: 135 ratio 1.14, INVERTED).
            // The band fades out on full-sun facets (Lambert already owns
            // them, and adding there would re-clip) and swells ~2x when the
            // camera looks toward the sun — the translucent glow of backlit
            // coat hair, and the fix for the 270 melt.
            // The terminator band yields to the positional core shadow —
            // ungated it painted the lee half of the end-on rump (ring
            // 135) and propped up the exact half the split must sink.
            '\tfloat gPaint = smoothstep( -0.02, 0.25, gSF ) * ( 1.0 - smoothstep( 0.35, 0.75, gSF ) ) * ( 1.0 - gPosShade * 0.85 );\n' +
            // Positional wrap: the sun-ward END of the body carries the
            // warm paint even where the facet normal looks away (forward
            // scatter through backlit coat hair) — the term that makes the
            // 270 view read "lit animal" instead of grey ghost. Swells
            // with backlight, whispers on side views.
            // Gated by the POSITIONAL shade only — iteration 4 gated on
            // gShadeW, and at backlit angles every facet is normal-shade,
            // which nuked the wrap exactly where the 270 melt needed it.
            '\tfloat gPosLit = smoothstep( -0.2, 0.55, gPosSun ) * ( 1.0 - gPosShade );\n' +
            '\tfloat gPaintW = min( gPaint + gPosLit * ( 0.75 + 1.0 * gBack * gBack ), 1.3 );\n' +
            '\ttotalEmissiveRadiance += uRimColor * ( gPaintW * uSunPaintK * ( 1.0 + 1.8 * gBack * gBack ) );\n' +
            // ROUND 11 — SHADE FILL: the shade mass is LIT by the hour's
            // shadow tint (the same role the grass cores breathe), graded
            // by sky exposure so the rump catches the vault and the belly
            // sinks. Additive light on shade facets only — the multiply
            // above sinks Lambert's leftovers, this re-lights them mauve:
            // a committed two-tone body, never an unlit black hole, and
            // never a lift on the lit side (ratio numerator untouched).
            '\ttotalEmissiveRadiance += uCoolTint * ( gShadeW * uShadeFillK * mix( 0.5, 1.1, gSky ) );\n' +
            // Low-sun rim: the hot edge on glancing sun-facing facets that
            // keeps the white coat alive when the camera faces the sunrise.
            // Round 11: the rim answers BACKLIGHT — when the camera looks
            // toward the sun (the 135/180/225 vanish angles) the edge
            // burns ~2x hotter, and side views drop to a whisper; the
            // sun-facing gate tightened (0.3 floor -> 0.15) so the rim
            // stays on the sun-ward silhouette instead of wrapping the
            // whole outline symmetrically. Capped so no rim pixel can
            // push the coat back into clipping.
            '\tfloat gRim = pow( 1.0 - abs( dot( gWN, gVW ) ), 2.5 ) * clamp( gSF * 0.95 + 0.05, 0.0, 1.0 );\n' +
            '\ttotalEmissiveRadiance += uRimColor * min( gRim * uRimK * ( 0.5 + 1.4 * gBack * gBack ), 0.8 );',
        );
    };
    const applyTod = (tod: TimeOfDay): void => {
      const spec = TOD[tod];
      const silh = spec.grassLumCap < 1;
      const lowSun = THREE.MathUtils.clamp(1 - (spec.sunElevation - 2) / 13, 0, 1);
      // Sky-fill whisper: enough that the coat never renders slate-blue
      // under the vault (iteration-2 measure: an ambientSky fill turned
      // the noon dog pewter), never enough to go fullbright again.
      // Round 11: 0.075 -> 0.045 — with the headroom normalization below
      // the lit coat's radiance dropped ~2.5x, so the old flat additive
      // dose became HALF the shade side's light and pinned both centroid
      // halves of every backlit ring view to the same value (the audit's
      // ratio-1.0 melt at 270). The whisper only guards against slate.
      this.mat!.emissive.setHex(spec.fogColor).lerp(this.creamScratch, 0.4);
      this.mat!.emissiveIntensity = silh ? 0.04 : 0.035;
      // ROUND 11 — HEADROOM NORMALIZATION (see the shader block): scale
      // the coat's albedo so a full-sun facet lands ~1.3 pre-tonemap
      // under THIS hour's total light (key + fill + hemisphere, times the
      // hour's exposure), i.e. on the responsive part of the ACES curve
      // (~0.90 display) instead of the flat shoulder that erased three
      // rounds of modeling. Pure scalar on palette roles; the silhouette
      // hours clamp to 1 (their light budget is already dim).
      const lum = (hex: number): number => {
        this.lumScratch.setHex(hex);
        return 0.2126 * this.lumScratch.r + 0.7152 * this.lumScratch.g + 0.0722 * this.lumScratch.b;
      };
      const coatLum = lum(P.strawPale) * 1.05;
      const lightLum =
        spec.sunIntensity * lum(spec.sunColor) +
        spec.fillIntensity * lum(spec.fillColor) +
        spec.ambientIntensity * 0.5 * (lum(spec.ambientSky) + lum(spec.ambientGround));
      this.tone.uAlbedoK.value = THREE.MathUtils.clamp(
        1.2 / (coatLum * spec.exposure * lightLum),
        0.2,
        1.0,
      );
      const el = THREE.MathUtils.degToRad(spec.sunElevation);
      const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
      this.tone.uSunDirW.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      this.tone.uWarmK.value = 0.3 + spec.floraWarm * 0.5;
      // Shade facets take the hour's shadow tint — the same role the grass
      // roots multiply toward, so dog and field sit in ONE light. The tint
      // is deepened (x0.78) because the palette shadow roles are pale
      // multipliers sized for grass roots; on the bright coat they need
      // real darkening to read as the mauve-gray shade mass at all.
      this.tone.uCoolTint.value.setHex(spec.grassShadow).multiplyScalar(0.78);
      // Round 11: the shade multiply COMMITS (0.34+0.42 -> 0.42+0.4 on
      // lowSun) — Lambert's leftover on shade facets is sunk hard and the
      // shade-fill emissive below re-lights the mass with the hour's
      // shadow tint: two committed tones, not one compressed ramp.
      this.tone.uCoolK.value = silh ? 0.6 : 0.58 + lowSun * 0.45;
      // Round 11 sun paint / shade fill doses (see shader): both lean on
      // lowSun — at noon the high sun models the coat by itself.
      this.tone.uSunPaintK.value = silh ? 0.05 : 0.2 + lowSun * 0.55;
      this.tone.uShadeFillK.value = silh ? 0.02 : 0.05 + lowSun * 0.07;
      // Rim rides the hour's sun color — HOT at the golden hours: the
      // backlit money shot lives on this one warm edge.
      this.tone.uRimColor.value.setHex(spec.sunColor);
      this.tone.uRimK.value = (silh ? 0.3 : 0.12) + lowSun * 1.25;
      // Contact ellipse answers the sun via CENTER LEAN + ELONGATION along
      // the shadow azimuth; the disc itself stays parented to the dog's
      // transform (mechanic round, bug 1: the old free-floating flat disc
      // buried itself under curved terrain and only a detached downhill
      // sliver survived — the blob read a body-length off the dog).
      this.shadowDirX = -Math.sin(az);
      this.shadowDirZ = -Math.cos(az);
      // ROUND 9, item 2 — LOW-SUN SHADOW STRETCH: the ellipse scales along
      // the sun axis by ~1/tan(sunElevation), clamped, so a 6-degree dawn
      // sun rakes a LONG shadow off the dog while noon stays a tight blob.
      // (shear factor s means length multiplier 1+s along the axis.)
      const stretchMult = THREE.MathUtils.clamp(
        1 / Math.tan(Math.max(el, 0.03)),
        1.1,
        4.2,
      );
      this.shadowStretch = stretchMult - 1;
      // Center walks away from the sun just far enough that the DARK CORE
      // (inner 30% of the falloff) starts under the paws and runs away
      // from the sun — anchored at the feet, not a detached streak.
      this.shadowLean = 0.05 + Math.max(0, 0.62 * stretchMult * 0.3 - 0.25);
      // Long shadows are narrow beams: the cross-axis tightens as the
      // along-axis stretches, so dawn reads as a raking shadow, not a
      // wider smear of the noon blob.
      this.shadowWidth = 0.42 / (1 + 0.3 * this.shadowStretch);
      const su = this.shadowMat!.uniforms;
      (su.uTint.value as THREE.Color).setHex(spec.grassShadow).multiplyScalar(0.45);
      // Low sun leans harder on the contact shadow: it is the only shadow
      // the dog throws, and the long dawn rake must survive dark stubble.
      su.uK.value = silh ? 0.14 : 0.46 + lowSun * 0.32;
    };

    // Contact ellipse build: a unit disc, multiply-blended radial falloff —
    // it darkens whatever it hovers over (soil, skirts, blades) the way a
    // soft blob shadow should, and costs one draw call. The disc is
    // TERRAIN-CONFORMED per frame (29 verts draped onto heightAt) and its
    // footprint follows the BODY yaw — a per-torso blob that sits under the
    // dog in every pose, TOD and heading, instead of a flat free disc that
    // z-buries under any terrain bulge. Falloff radius rides the uvs (the
    // positions now carry the drape, not the unit disc).
    // Ring-subdivided disc (round 9): a center+rim fan spans meters once
    // the low-sun stretch kicks in, and any terrain bulge between center
    // and rim buried the whole mid-span — interior rings keep the drape
    // ON the ground along the full length of the raking shadow.
    this.shadowGeo = new THREE.RingGeometry(0.001, 1, 24, 6);
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.shadowBase = new Float32Array(this.shadowGeo.attributes.position.array);
    this.shadowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTint: { value: new THREE.Color(P.shadowNeutral) },
        uK: { value: 0.4 },
      },
      vertexShader:
        'varying vec2 vXY;\n' +
        'void main() {\n' +
        '\tvXY = uv * 2.0 - 1.0;\n' +
        '\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n' +
        '}',
      fragmentShader:
        'uniform vec3 uTint;\nuniform float uK;\nvarying vec2 vXY;\n' +
        'void main() {\n' +
        '\tfloat gFall = 1.0 - smoothstep( 0.42, 1.0, length( vXY ) );\n' +
        '\tgl_FragColor = vec4( mix( vec3( 1.0 ), uTint, gFall * uK ), 1.0 );\n' +
        '}',
      blending: THREE.MultiplyBlending,
      transparent: true,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadowMesh.frustumCulled = false; // bounds change per frame; one quad fan
    this.shadowGrp.add(shadowMesh);
    ctx.scene.add(this.shadowGrp);

    applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => applyTod(e.detail)) as EventListener);

    this.buildBody(high);

    this.root.add(this.body);
    ctx.scene.add(this.root);

    // CAPTURE AUDIT (mechanic round): under ?capture=1 the dog publishes a
    // read-only measurement handle — terrain queries plus live paw/shadow
    // world positions — so tools3d scripts can MEASURE planting and shadow
    // registration instead of trusting claims. Tooling-only; allocations
    // here never run in gameplay frames.
    if (this.frozen) {
      (window as unknown as { __dogAudit?: unknown }).__dogAudit = {
        // Capture-only lens: gameplay-point shoots at honest follow range
        // with a slightly longer lens (reduced FOV) so the dog holds a
        // meaningful share of frame. Never runs outside ?capture=1.
        setFov: (deg: number) => {
          ctx.camera.fov = deg;
          ctx.camera.updateProjectionMatrix();
        },
        // Round 11 light audit: hide ONLY the dog's body meshes (the
        // contact shadow, grass parting and everything else stay put) so
        // tools3d/audit-dog-light.mjs can isolate coat pixels by diffing
        // a with-dog and a without-dog render of the same frame.
        setBodyVisible: (v: boolean) => {
          this.root.visible = v;
        },
        // World -> screen-pixel projection through the live camera: the
        // light audit derives its sun-side/shade-side split axis from
        // MEASURED projections instead of a hand-derived camera-space
        // convention (which round 11 got wrong twice).
        project: (wx: number, wy: number, wz: number) => {
          this.pawV.set(wx, wy, wz).project(ctx.camera);
          return {
            x: (this.pawV.x * 0.5 + 0.5) * ctx.renderer.domElement.clientWidth,
            y: (0.5 - this.pawV.y * 0.5) * ctx.renderer.domElement.clientHeight,
          };
        },
        heightAt: (wx: number, wz: number) => this.terrain.heightAt(wx, wz),
        slopeAt: (wx: number, wz: number) => {
          const s = 0.6;
          const dx = this.terrain.heightAt(wx + s, wz) - this.terrain.heightAt(wx - s, wz);
          const dz = this.terrain.heightAt(wx, wz + s) - this.terrain.heightAt(wx, wz - s);
          return Math.hypot(dx, dz) / (2 * s);
        },
        state: () => {
          this.root.updateMatrixWorld(true);
          const paws = this.pawTips.map((tip, i) => {
            tip.getWorldPosition(this.pawV);
            const g = this.terrain.heightAt(this.pawV.x, this.pawV.z);
            return { i, x: this.pawV.x, y: this.pawV.y, z: this.pawV.z, gap: this.pawV.y - g };
          });
          return {
            root: { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z },
            yaw: this.yaw,
            state: this.hunt.dog().state,
            gait: this.hunt.dog().gait,
            shadow: {
              x: this.shadowGrp.position.x,
              y: this.shadowGrp.position.y,
              z: this.shadowGrp.position.z,
            },
            paws,
          };
        },
      };
    }
    // First placement so frame 0 isn't a dog at the origin.
    this.update(ctx, 1 / 60);
  }

  /**
   * GROUNDING CONTRACT — grass reads this via ctx.get('dog') and opens a
   * second parting point around it (the same mechanism that parts blades
   * for the camera). World meters; r is the body-parting radius.
   */
  partingPoint(out: { x: number; z: number; r: number }): void {
    out.x = this.lastX;
    out.z = this.lastZ;
    out.r = this.partR;
  }

  /* ------------------------------- build ------------------------------- */

  private mesh(geo: THREE.BufferGeometry, _high: boolean): THREE.Mesh {
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, this.mat!);
    // NEVER into the shadow map (round 7, item 2): at a grazing dawn sun
    // the segmented body smeared into a noisy splat that read as a burn
    // mark. The contact ellipse is the dog's grounding on every tier.
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  private buildBody(high: boolean): void {
    const rng = mulberry32(DOG_ART_SEED);
    // Coat roles: warm white straight off strawPale (the palette's palest
    // warm — any cream/gray lerp reads slate under the blue sky ambient),
    // patches an oxblood-charcoal near-black, warm shading underneath.
    const coat = new THREE.Color(P.strawPale).multiplyScalar(1.05);
    const coatDim = new THREE.Color(P.strawPale).multiplyScalar(0.88);
    // Round 9, item 4: lower legs and paws step DOWN in value so the
    // articulation (knee/hock joints, four separate columns) reads inside
    // the white mass, not only in silhouette.
    const legShade = new THREE.Color(P.strawPale).multiplyScalar(0.8);
    const pawShade = new THREE.Color(P.strawPale).multiplyScalar(0.68);
    const patch = new THREE.Color(P.oxblood).lerp(new THREE.Color(P.charcoal), 0.42);
    const nose = new THREE.Color(P.charcoal).multiplyScalar(0.55);
    const tick = patch.clone().lerp(coat, 0.12);

    // TORSO — hex loft with belly/keel shading and the belton suggestion.
    {
      const b = new PartBuilder();
      const secC = [coatDim, coat, coat, coat];
      loftZ(
        b, TORSO_SECTS, secC,
        [0, 0.455, -0.36], [0, 0.41, 0.29],
        coatDim, coat,
      );
      // Belton ticking: a sparse handful of dark surface flecks on the
      // flanks + one saddle patch at the left hip. Suggestion, not noise.
      const fleck = (zt: number, ang: number, s: number, col: THREE.Color): void => {
        // Interpolate the loft at parameter zt ∈ [0,1] rear→front.
        const f = zt * (TORSO_SECTS.length - 1);
        const k = Math.min(TORSO_SECTS.length - 2, Math.floor(f));
        const t = f - k;
        const s0 = TORSO_SECTS[k];
        const s1 = TORSO_SECTS[k + 1];
        const cx = s0.x + (s1.x - s0.x) * t;
        const cy = s0.y + (s1.y - s0.y) * t;
        const cz = s0.z + (s1.z - s0.z) * t;
        const hw = s0.hw + (s1.hw - s0.hw) * t;
        const hh = s0.hh + (s1.hh - s0.hh) * t;
        const px = cx + Math.cos(ang) * hw;
        const py = cy + Math.sin(ang) * hh;
        // Ellipse outward normal in x-y.
        let nx = Math.cos(ang) * hh;
        let ny = Math.sin(ang) * hw;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        const ox = px + nx * 0.006;
        const oy = py + ny * 0.006;
        // Tangents: around the ring, and along the body.
        const tx = -ny;
        const ty = nx;
        const a: V3 = [ox - tx * s - 0, oy - ty * s, cz - s];
        const bq: V3 = [ox + tx * s, oy + ty * s, cz - s];
        const c: V3 = [ox + tx * s, oy + ty * s, cz + s];
        const d: V3 = [ox - tx * s, oy - ty * s, cz + s];
        b.quad(a, bq, c, d, col);
      };
      // Saddle patch over the left hip — the classic broken blanket.
      fleck(0.22, (200 * Math.PI) / 180, 0.052, patch);
      fleck(0.3, (165 * Math.PI) / 180, 0.036, patch);
      for (let i = 0; i < 11; i++) {
        const side = rng() < 0.5;
        const ang = ((side ? 155 : 335) + rng() * 55) * (Math.PI / 180);
        fleck(0.12 + rng() * 0.75, ang, 0.011 + rng() * 0.009, tick);
      }
      this.body.add(this.mesh(b.build(), high));
    }

    // NECK — raked ~40° forward-up, baked into geometry (group stays at
    // identity when standing so the pivot math reads clean). Round 7: the
    // base sits WIDE and DEEP inside the chest so neck and forequarters
    // read as one connected mass from every angle, never a stick on a box.
    {
      const b = new PartBuilder();
      b.boxZ(
        { x: 0, y: -0.075, z: -0.075, hw: 0.068, hh: 0.105 },
        { x: 0, y: NECK_TOP[1] - 0.015, z: NECK_TOP[2] + 0.015, hw: 0.04, hh: 0.054 },
        { side: coat, bottom: coatDim },
      );
      const m = this.mesh(b.build(), high);
      this.neck.add(m);
    }
    this.neck.position.set(NECK_PIVOT[0], NECK_PIVOT[1], NECK_PIVOT[2]);
    this.body.add(this.neck);

    // HEAD — white skull with dark patches at the eyes/ears, white muzzle,
    // charcoal nose: at 20 m the read is a white dog with a marked face,
    // not a featureless dark blob.
    {
      const b = new PartBuilder();
      // Skull: white dome, occiput via taper.
      b.boxZ(
        { x: 0, y: 0.012, z: -0.045, hw: 0.04, hh: 0.036 },
        { x: 0, y: 0.008, z: 0.075, hw: 0.049, hh: 0.046 },
        { side: coat, top: coat, bottom: coatDim, back: coat },
      );
      // Eye/cheek patches: dark quads proud of the skull sides.
      for (const s of [-1, 1]) {
        b.quad2(
          [s * 0.0505, 0.036, 0.062], [s * 0.0505, 0.038, 0.005],
          [s * 0.0505, -0.012, -0.002], [s * 0.0505, -0.014, 0.058],
          patch,
        );
      }
      // Muzzle: square setter flews, slightly below skull axis.
      b.boxZ(
        { x: 0, y: -0.008, z: 0.07, hw: 0.031, hh: 0.032 },
        { x: 0, y: -0.002, z: 0.185, hw: 0.024, hh: 0.026 },
        { side: coat, bottom: coatDim },
      );
      // Nose leather.
      b.boxZ(
        { x: 0, y: 0.006, z: 0.183, hw: 0.017, hh: 0.016 },
        { x: 0, y: 0.004, z: 0.208, hw: 0.013, hh: 0.012 },
        { side: nose, front: nose },
      );
      this.head.add(this.mesh(b.build(), high));
    }
    this.head.position.set(NECK_TOP[0], NECK_TOP[1], NECK_TOP[2]);
    this.neck.add(this.head);

    // EARS — dropped TRIANGULAR flaps (round 7, item 3: ears are the #1
    // dog identifier). Wide-based, flared off the skull so the silhouette
    // reads dog from the front and three-quarter, not just perfect side
    // view. Two facets each with a slight fold; double-sided quads.
    for (const side of [-1, 1]) {
      const b = new PartBuilder();
      // Base edge hugs the skull top; the flap widens to the fold then
      // tapers to a blunt hanging tip, drifting outward as it drops.
      b.quad2(
        [0, 0.004, -0.032], [0, 0.004, 0.032],
        [side * 0.012, -0.078, 0.04], [side * 0.012, -0.078, -0.04],
        patch,
      );
      b.quad2(
        [side * 0.012, -0.078, -0.04], [side * 0.012, -0.078, 0.04],
        [side * 0.022, -0.132, 0.011], [side * 0.022, -0.132, -0.011],
        patch,
      );
      const grp = side < 0 ? this.earL : this.earR;
      grp.add(this.mesh(b.build(), high));
      grp.position.set(side * 0.046, 0.042, 0.012);
      grp.rotation.z = side * -0.52; // flare off the skull — reads front-on
      grp.rotation.y = side * 0.18;
      this.head.add(grp);
    }

    // TAIL — round 9, item 4: the flag no longer hinges 90 degrees off the
    // hip. A short tapered ROOT segment blends out of the rump and takes
    // ~45% of the carriage angle; the FLAG (bone + notched feathering)
    // hangs off its end and takes the rest — a raised point-flag now
    // CURVES out of the topline instead of kinking. Round 9, item 3 gave
    // the tip a full sunHigh whitening so the flag survived the gameplay
    // read; round 11 TAMES it (lerp 0.35) — the near-white albedo was a
    // fullbright element that ignored every shade term and propped up the
    // lee half of the ring views. The flag now earns its range read from
    // the sun paint and rim, which it catches proudly above the cover.
    const flagTip = new THREE.Color(P.strawPale).multiplyScalar(1.05);
    {
      const b = new PartBuilder();
      // Root: rump-thick at the hip, tapering to the flag joint.
      b.boxZ(
        { x: 0, y: -0.004, z: -0.105, hw: 0.02, hh: 0.024 },
        { x: 0, y: -0.006, z: 0.025, hw: 0.034, hh: 0.042 },
        { side: coat, bottom: coatDim },
      );
      this.tailRoot.add(this.mesh(b.build(), high));
    }
    {
      const b = new PartBuilder();
      // Straight bone, joint -> tip, no saber droop: the flag pole.
      // Tip thickened (0.008 -> 0.012) and capped bright.
      b.boxZ(
        { x: 0, y: 0, z: -0.3, hw: 0.012, hh: 0.014 },
        { x: 0, y: 0, z: 0, hw: 0.022, hh: 0.026 },
        { side: coat, back: flagTip },
      );
      // Three feathering facets off the underside, each ending in a notch
      // (the sawtooth trailing edge of real setter feathering), emitted as
      // TWO layers in a WIDER shallow V (2.2 -> 2.8 spread) so the flag
      // keeps presence when the camera lines up with its plane. The last
      // facet — the tip lock — takes the bright flagTip role.
      for (const lx of [-0.012, 0.012]) {
        const yb = lx < 0 ? 0 : -0.008; // layered locks, not a mirror
        b.quad2(
          [lx, -0.018, -0.035], [lx, -0.022, -0.115],
          [lx * 2.8, -0.108 + yb, -0.081], [lx * 2.8, -0.09 + yb, -0.028],
          coat,
        );
        b.quad2(
          [lx, -0.024, -0.12], [lx, -0.028, -0.207],
          [lx * 2.8, -0.102 + yb, -0.173], [lx * 2.8, -0.114 + yb, -0.105],
          coatDim,
        );
        b.quad2(
          [lx, -0.03, -0.212], [lx, -0.036, -0.3],
          [lx * 2.8, -0.08 + yb, -0.26], [lx * 2.8, -0.094 + yb, -0.192],
          flagTip,
        );
      }
      this.tailFlag.add(this.mesh(b.build(), high));
    }
    this.tailRoot.position.set(TAIL_PIVOT[0], TAIL_PIVOT[1], TAIL_PIVOT[2]);
    // The flag reads at gameplay range or it doesn't exist: +18% so the
    // raised tip clears the cover line the parting can't duck (bug 4).
    this.tailRoot.scale.setScalar(1.18);
    this.tailFlag.position.set(0, 0, -0.095);
    this.tailRoot.add(this.tailFlag);
    this.tailTip.position.set(0, 0, -0.305);
    this.tailFlag.add(this.tailTip);
    this.body.add(this.tailRoot);

    // LEGS — two segments each, origin at the joint, geometry down -y.
    for (let i = 0; i < 4; i++) {
      const fore = i < 2;
      const side = i % 2 === 0 ? -1 : 1;
      const upper = new THREE.Group();
      const lower = new THREE.Group();
      {
        const b = new PartBuilder();
        if (fore) {
          // Thick forequarters (round 7): a real forearm mass under the
          // widened chest, tapering to the wrist. Top extended up into the
          // chest mass (bug 2: at full swing the old 0.03 stub cleared the
          // torso underside and the shoulder read dislocated).
          b.boxY(
            { x: 0, y: 0.09, z: -0.006, hw: 0.045, hd: 0.068 },
            { x: 0, y: -0.195, z: 0.004, hw: 0.021, hd: 0.027 },
            coat,
          );
        } else {
          // Haunch: broad thigh mass tapering to the stifle. Top buried
          // deep in the hip ring so the joint stays SOCKETED through the
          // whole gait cycle (bug 2: the hind detached at max swing).
          b.boxY(
            { x: 0, y: 0.11, z: -0.012, hw: 0.04, hd: 0.095 },
            { x: 0, y: -0.205, z: 0.01, hw: 0.02, hd: 0.03 },
            coat,
          );
        }
        upper.add(this.mesh(b.build(), high));
      }
      {
        const b = new PartBuilder();
        // Hind cannon lengthened 0.21 -> 0.28 (mechanic round, bug 3): with
        // the fore nearly straight at stance, the angulated hind could only
        // reach 0.365 of the 0.409 m drop — the exact planting solver
        // proved both hinds hovering 8 cm on point once the fore stopped
        // being buried to hide it. Dogs' hind legs run longer than fore.
        const len = fore ? 0.2 : 0.28;
        b.boxY(
          { x: 0, y: 0, z: 0, hw: 0.017, hd: 0.024 },
          { x: 0, y: -len + 0.03, z: -0.004, hw: 0.013, hd: 0.018 },
          legShade,
        );
        // Paw: small forward block, darkest step in the leg ramp.
        b.boxY(
          { x: 0, y: -len + 0.032, z: 0.012, hw: 0.022, hd: 0.036 },
          { x: 0, y: -len, z: 0.014, hw: 0.02, hd: 0.034 },
          pawShade,
        );
        lower.add(this.mesh(b.build(), high));
      }
      upper.position.set(
        side * (fore ? FORE_X : HIND_X),
        fore ? FORE_Y : HIND_Y,
        fore ? FORE_Z : HIND_Z,
      );
      lower.position.set(0, fore ? -0.195 : -0.205, 0);
      upper.add(lower);
      this.body.add(upper);
      this.legU.push(upper);
      this.legL.push(lower);
      // Paw-tip marker at the sole of the paw block: the planting solver
      // and the capture audit both measure THIS point against terrain.
      const tip = new THREE.Object3D();
      tip.position.set(0, -(fore ? 0.2 : 0.28), 0.014);
      lower.add(tip);
      this.pawTips.push(tip);
    }
  }

  /* ------------------------------- update ------------------------------ */

  update(ctx: Ctx, dt: number): void {
    const sd = this.hunt.dog();
    this.hunt.dogWorld(this.posW);
    const x = this.posW.x;
    const z = this.posW.z;
    const gy = this.terrain.heightAt(x, z);
    const snap = this.frozen;

    // Movement since last frame drives BOTH facing and stride phase — legs
    // turn exactly as fast as the ground moves.
    let dx = 0;
    let dz = 0;
    if (this.hasLast) {
      dx = x - this.lastX;
      dz = z - this.lastZ;
    }
    this.lastX = x;
    this.lastZ = z;
    this.hasLast = true;
    const moved = Math.hypot(dx, dz);

    const state = sd.state;
    const gait = sd.gait;
    const pointing = state === 'pointing' || state === 'honoring';

    // Facing: travel direction while moving; on point, square to the bird.
    let targetYaw = this.yaw;
    if (moved > 0.004) targetYaw = Math.atan2(dx, dz);
    let hasBird = false;
    if (pointing) {
      // Sim heading already faces the bird/point; prefer the exact bird line.
      targetYaw = Math.atan2(Math.cos(sd.heading), Math.sin(sd.heading));
      if (state === 'pointing' && sd.pointedBirdId !== null) {
        const birds = this.hunt.huntState().birds;
        for (let i = 0; i < birds.length; i++) {
          if (birds[i].id === sd.pointedBirdId) {
            this.hunt.simToWorld(birds[i].pos.x, birds[i].pos.y, this.birdW);
            targetYaw = Math.atan2(this.birdW.x - x, this.birdW.z - z);
            hasBird = true;
            break;
          }
        }
      }
    } else if (gait === 'still' && moved <= 0.004) {
      targetYaw = Math.atan2(Math.cos(sd.heading), Math.sin(sd.heading));
    }
    const dYaw = wrapAngle(targetYaw - this.yaw);
    const yawK = snap ? 1 : 1 - Math.exp(-10 * dt);
    this.yaw += dYaw * yawK;
    // Turn rate → lean into the turn (zeroed rigid when frozen/pointing).
    const rawRate = dt > 0 ? (dYaw * yawK) / dt : 0;
    this.yawRate = approach(this.yawRate, THREE.MathUtils.clamp(rawRate, -4, 4), 6, dt, snap);

    // Stride phase: distance-driven, per-gait stride length.
    const g = gait === 'run' || gait === 'trot' || gait === 'track' ? GAITS[gait] : GAITS.trot;
    if (moved > 0) this.phase = (this.phase + (moved / g.stride) * Math.PI * 2) % (Math.PI * 2 * 3);

    // Terrain slope under the spine (nose-down positive).
    const fx = Math.sin(this.yaw) * 0.3;
    const fz = Math.cos(this.yaw) * 0.3;
    const slope = Math.atan2(
      this.terrain.heightAt(x - fx, z - fz) - this.terrain.heightAt(x + fx, z + fz),
      0.6,
    );
    this.slopePitch = approach(this.slopePitch, THREE.MathUtils.clamp(slope, -0.4, 0.4), 8, dt, snap);
    // Lateral slope roll (mechanic round, bug 3): on a cross-slope the body
    // banks with the ground, so downhill-side paws can actually reach it —
    // without this the rigid-level body left daylight under the low side on
    // every cross-slope heading. Local +x is the dog's RIGHT flank; positive
    // rotation.z tips it up, so the roll target tracks (hRight - hLeft).
    const rxs = Math.cos(this.yaw) * 0.22;
    const rzs = -Math.sin(this.yaw) * 0.22;
    const lat = Math.atan2(
      this.terrain.heightAt(x + rxs, z + rzs) - this.terrain.heightAt(x - rxs, z - rzs),
      0.44,
    );
    this.slopeRoll = approach(this.slopeRoll, THREE.MathUtils.clamp(lat, -0.35, 0.35), 8, dt, snap);

    /* ---------------- pose targets by sim state/gait ---------------- */
    const time = snap ? 0 : ctx.time;
    let tBob = 0;
    let tPitch = 0;
    let tRoll = snap || pointing ? 0 : THREE.MathUtils.clamp(-this.yawRate * 0.05, -0.12, 0.12);
    let tNeck = 0;
    let tHeadP = 0;
    let tHeadY = 0;
    let tTailP = -0.55;
    let tTailY = 0;
    let tEar = 0;
    const tU = [NEUTRAL_U[0], NEUTRAL_U[1], NEUTRAL_U[2], NEUTRAL_U[3]];
    const tL = [NEUTRAL_L[0], NEUTRAL_L[1], NEUTRAL_L[2], NEUTRAL_L[3]];
    let rate = 10;

    if (pointing) {
      // THE POINT, round-7 refined: the whole dog LEANS at the scent —
      // crouched a hair, weight rolled onto the forehand, head and neck
      // dropped ~12 degrees toward the bird, tail a rigid raised flag.
      // Intensity lives in the lean, not in a mannequin standing tall.
      rate = 14;
      // Crouch eased (mechanic round, bug 4): -0.042 sank the topline and
      // flag below the cover line at gameplay framing; the lean now lives
      // in the pitch, not in a squat.
      tBob = -0.006;
      tPitch = 0.075; // nose-down pitch — weight on the forehand
      tRoll = 0;
      tNeck = 0.48; // dropped ~12 deg past round 6's level drive
      tTailP = 1.45; // the raised flag — near-vertical, proud of the grass
      tTailY = 0;
      tEar = 0.06;
      // Head locked on the bird's actual position — muzzle drives DOWN the
      // scent line (the dropped-head intensity of a real pointing setter).
      if (hasBird) {
        const bdx = this.birdW.x - x;
        const bdz = this.birdW.z - z;
        const horiz = Math.hypot(bdx, bdz);
        const headH = gy + 0.46; // head height once the dropped pose settles
        const birdY = this.terrain.heightAt(this.birdW.x, this.birdW.z) + 0.12;
        tHeadY = THREE.MathUtils.clamp(wrapAngle(Math.atan2(bdx, bdz) - this.yaw), -0.6, 0.6);
        tHeadP =
          THREE.MathUtils.clamp(Math.atan2(headH - birdY, Math.max(horiz, 0.5)) * 0.7, -0.05, 0.4) -
          tNeck * 0.55;
      } else {
        tHeadP = 0.08 - tNeck * 0.55; // honoring: muzzle down the line
      }
      // Left fore lifted FORWARD-UP with the carpus folded BACK under the
      // wrist — canine forelegs fold knee-back-then-forward. (Bug 2: the
      // old -1.35 swung the humerus 77 deg BACKWARD and the +2.1 fold then
      // wrapped the paw up past vertical — a backwards-bending pretzel.)
      // uAng > 0 swings the leg toward the nose; lAng > 0 folds the paw
      // back under it. The gap of daylight under the chest is half the
      // pose's read.
      tU[0] = 0.95;
      tL[0] = 1.9;
      // Hinds stretched back and extended — the driving stance of a real
      // intense point, and the reach that PLANTS them: the nose-down pitch
      // lifts the rear ~2 cm, and the neutral angulation left both hind
      // paws hovering exactly that far off the grade (probe-measured).
      tU[2] = -0.35;
      tU[3] = -0.35;
      tL[2] = 0.22;
      tL[3] = 0.22;
    } else if (gait === 'still') {
      if (sd.scentCheck) {
        // First-scent freeze: mid-stride statue, head snapped up the cone.
        rate = 16;
        const cfg = GAITS.track;
        for (let i = 0; i < 4; i++) {
          const th = this.phase + cfg.off[i];
          tU[i] = NEUTRAL_U[i] + cfg.swing * Math.sin(th) * 0.7;
          tL[i] = NEUTRAL_L[i] + cfg.fold * Math.max(0, Math.cos(th)) * 0.7;
        }
        tNeck = -0.12; // head UP — the "dog makes game" beat
        tHeadP = 0.1;
        tTailP = 0.55;
      } else if (state === 'retrieving') {
        // Mouthing the fall: head buried, tail level, hind end high.
        tNeck = 1.05;
        tHeadP = 0.35 - 1.05 * 0.55;
        tTailP = 0.2;
        tBob = -0.01;
        tPitch = 0.09;
      } else {
        // Heel / idle stand: easy tail, soft breathing.
        tTailP = -0.5 + (snap ? 0 : Math.sin(time * 1.4) * 0.04);
        tTailY = snap ? 0 : Math.sin(time * 1.1) * 0.1;
        tBob = snap ? 0 : Math.sin(time * 2.2) * 0.004;
        tHeadY = snap ? 0 : Math.sin(time * 0.4) * 0.2;
      }
    } else {
      // LOCOMOTION — legs, bob, tail and ears all keyed to the same
      // distance-driven phase.
      for (let i = 0; i < 4; i++) {
        const th = this.phase + g.off[i];
        tU[i] = NEUTRAL_U[i] + g.swing * Math.sin(th);
        tL[i] = NEUTRAL_L[i] + g.fold * Math.max(0, Math.cos(th - 0.35));
      }
      tBob = g.bob * Math.sin(this.phase * 2 + 0.8);
      tPitch = g.rock * Math.sin(this.phase + 2.2);
      tNeck = g.neck;
      tHeadP = g.head - g.neck * 0.55;
      tTailP = g.tail;
      tTailY = snap ? 0 : Math.sin(time * g.wagHz * 2) * g.wag;
      tEar = g.bob * 6 * Math.sin(this.phase * 2 + 2.2);
      // Cover work: inside a sim patch the tail cracks HIGH and busy —
      // the flag over the bluestem is how the handler tracks the dog.
      if (state === 'quartering') {
        const patches = this.hunt.coverPatches();
        for (let i = 0; i < patches.length; i++) {
          const p = patches[i];
          if (Math.abs(x - p.cx) < p.hx && Math.abs(z - p.cz) < p.hz) {
            tTailP = 0.85;
            tTailY = snap ? 0 : Math.sin(time * 16) * 0.38;
            break;
          }
        }
      }
      if (state === 'retrieving') {
        // Head-low carry/approach on the fetch.
        tNeck = 0.85;
        tHeadP = 0.15 - 0.85 * 0.55;
        tTailP = 0.15;
      }
      if (gait === 'track') tBob -= 0.03; // the stalking crouch
    }

    /* --------------------------- apply pose -------------------------- */
    this.bob = approach(this.bob, tBob, rate, dt, snap);
    this.bodyPitch = approach(this.bodyPitch, tPitch, rate, dt, snap);
    this.roll = approach(this.roll, tRoll, rate, dt, snap);
    this.neckPitch = approach(this.neckPitch, tNeck, rate, dt, snap);
    this.headPitch = approach(this.headPitch, tHeadP, rate, dt, snap);
    this.headYaw = approach(this.headYaw, tHeadY, rate, dt, snap);
    this.tailPitch = approach(this.tailPitch, tTailP, rate, dt, snap);
    this.tailYaw = approach(this.tailYaw, tTailY, rate, dt, snap);
    this.earFlop = approach(this.earFlop, tEar, rate, dt, snap);
    // Cover parting: wider on point so the frozen silhouette stands in a
    // real window instead of white-shard soup (bug 4); grass polls this
    // via partingPoint() every frame.
    this.partR = approach(this.partR, pointing ? 2.2 : 1.3, 6, dt, snap);
    for (let i = 0; i < 4; i++) {
      this.uAng[i] = approach(this.uAng[i], tU[i], rate + 4, dt, snap);
      this.lAng[i] = approach(this.lAng[i], tL[i], rate + 4, dt, snap);
      this.legU[i].rotation.x = -this.uAng[i];
      this.legL[i].rotation.x = this.lAng[i];
    }

    // Full pose FIRST, then measure: planting reads the real paw markers
    // through the real transform chain, so bob, crouch, body pitch, slope
    // pitch/roll and folded joints all count. (Mechanic round, bug 3: the
    // old two-cosine estimate ignored every body transform — on point it
    // buried the standing fore 5 cm and floated both hinds.)
    this.root.position.set(x, gy, z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(this.slopePitch, this.yaw, this.slopeRoll);
    this.body.position.y = this.bob;
    this.body.rotation.set(this.bodyPitch, 0, this.roll);
    this.neck.rotation.x = this.neckPitch;
    this.head.rotation.set(this.headPitch, this.headYaw, 0);
    // Carriage splits across root and flag joints (round 9): 45% at the
    // hip, 55% at the mid-tail joint — the raised flag curves, no kink.
    this.tailRoot.rotation.set(this.tailPitch * 0.45, this.tailYaw * 0.4, 0);
    this.tailFlag.rotation.set(this.tailPitch * 0.55, this.tailYaw * 0.6, 0);
    this.earL.rotation.x = this.earFlop;
    this.earR.rotation.x = this.earFlop;

    // FEET PLANTED: exact per-paw world clearance against the terrain UNDER
    // EACH PAW (not under the root), and the root sinks so the lowest
    // standing paw touches. A pure y-shift afterwards keeps it exact.
    let sink = Infinity;
    for (let i = 0; i < 4; i++) {
      if (pointing && i === 0) continue; // the lifted foreleg never plants
      this.pawTips[i].getWorldPosition(this.pawV);
      const gap = this.pawV.y - this.terrain.heightAt(this.pawV.x, this.pawV.z);
      if (gap < sink) sink = gap;
    }
    sink = THREE.MathUtils.clamp(sink, -0.07, 0.14);
    this.root.position.y = gy - sink;
    // Core-shadow anchor: the torso's world center (round 11 — the
    // positional sun-axis split in the coat shader measures from here).
    this.tone.uDogCtrW.value.set(x, gy - sink + 0.43, z);

    // TAIL DROOP CLAMP (round 9): the relaxed tail never spears into a
    // rising grade behind the dog — measure the flag tip against the
    // terrain under it and lift both joints just enough to clear.
    this.tailTip.getWorldPosition(this.pawV);
    const tipGap =
      this.pawV.y - this.terrain.heightAt(this.pawV.x, this.pawV.z) - 0.05;
    if (tipGap < 0) {
      // 0.47 m = flag reach from the hip pivot (0.4 local * 1.18 scale).
      const lift = Math.asin(Math.min(1, -tipGap / 0.47));
      this.tailRoot.rotation.x += lift * 0.45;
      this.tailFlag.rotation.x += lift * 0.55;
    }

    // Contact ellipse: draped onto the terrain vertex-by-vertex under the
    // torso — parented to the dog's x/z and yaw so it survives rotation and
    // every heading; the sun only leans the center and stretches the long
    // axis. (Bug 1: the old flat world-space disc z-buried under any
    // terrain bulge and read as a detached blob a body-length away.)
    const scx = x + this.shadowDirX * this.shadowLean;
    const scz = z + this.shadowDirZ * this.shadowLean;
    const scy = gy + 0.02;
    this.shadowGrp.position.set(scx, scy, scz);
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const base = this.shadowBase!;
    const posAttr = this.shadowGeo!.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < base.length; i += 3) {
      // Body-aligned footprint (half-width per TOD, half-length 0.62)...
      const sx = base[i] * this.shadowWidth;
      const sz = base[i + 2] * 0.62;
      let dxw = sx * cosY + sz * sinY;
      let dzw = -sx * sinY + sz * cosY;
      // ...sheared along the shadow azimuth as the sun drops.
      const along = dxw * this.shadowDirX + dzw * this.shadowDirZ;
      dxw += this.shadowDirX * along * this.shadowStretch;
      dzw += this.shadowDirZ * along * this.shadowStretch;
      arr[i] = dxw;
      arr[i + 1] = this.terrain.heightAt(scx + dxw, scz + dzw) + 0.04 - scy;
      arr[i + 2] = dzw;
    }
    posAttr.needsUpdate = true;
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.root);
    ctx.scene.remove(this.shadowGrp);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    this.mat?.dispose();
    this.mat = undefined;
    this.shadowGeo?.dispose();
    this.shadowGeo = undefined;
    this.shadowMat?.dispose();
    this.shadowMat = undefined;
  }
}
