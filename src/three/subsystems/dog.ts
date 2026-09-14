import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import { fieldTimeOfDay, P, type TimeOfDay } from '../palette';
import {
  englishSetterAppearance,
  type EnglishSetterAppearance,
  type EnglishSetterCoatId,
} from '../dogs/englishSetter';
import {
  germanShorthairedPointerAppearance,
  resolveGspCoat,
  type GermanShorthairedPointerAppearance,
} from '../dogs/germanShorthairedPointer';
import { createTwoBoneSolution, solveTwoBone, type TwoBoneSolution } from '../dogs/legIk';
import {
  breedStrideScale,
  createHuntMotionPose,
  writeHuntMotionPose,
} from '../dogs/huntMotion';
import {
  advanceLocomotionCycle,
  crossedStrideBoundary,
  createLocomotionPose,
  foreCarpusPitch,
  selectLocomotionGait,
  writeLocomotionPose,
  type FootContact,
  type LocomotionGait,
} from '../dogs/locomotion';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';

/*
 * DOG subsystem — the reason the game exists.
 *
 * Segmented low-poly bird dogs (A Short Hike's shape language: flat-shaded
 * tapered prisms, strong silhouette, zero photorealism) rendered on top of
 * the LIVE sim dog from hunt3d. The English Setter and German Shorthaired
 * Pointer share one action-ready skeleton while keeping breed-specific
 * proportions, coat construction, tail and motion character. The sim is
 * truth: position,
 * heading, state and gait come from Dog.update exactly as the 2D
 * FieldScene consumed them; this file only decides what the truth looks
 * like.
 *
 *  - BODY: hex-lofted torso (deep chest, thick forequarters, waist tuck,
 *    haunch), boxed neck sunk wide into the chest, dropped triangular ear
 *    flaps (the #1 dog identifier — the silhouette survives front and 3/4
 *    angles), rigid flag tail with notched feathering facets, four
 *    two-segment legs. White coat off the palette's pale role with one of
 *    the five standard belton marking palettes, plus a white blaze and
 *    muzzle. ~0.63 m at the shoulder, 568–580 tris and 27 draw calls with
 *    the articulated locomotion pivots.
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
 *    tail carriage by gait, a lean into turns. Supporting paws are locked
 *    in world space and the low-poly limb chains solve back to them; chest,
 *    loin, pelvis, scapulae, hocks and paws articulate independently.
 *  - THE POINT: sim state 'pointing' (and 'honoring') freezes the classic
 *    — body rigid and horizontal, tail STRAIGHT UP, head locked on the
 *    pointed bird's world position, left foreleg lifted and folded. The
 *    game's money shot; every parameter here serves that silhouette.
 *  - Determinism: all idle motion (wag, breath, ear flops) keys off
 *    ctx.time and is DISABLED under ?capture=1, where smoothing snaps to
 *    targets — a captured pose is a pure function of the sim seed.
 *
 * Per-frame: one sim read, ~40 group-transform writes, zero allocations.
 */

/* ------------------------------ geometry ------------------------------ */

type V3 = readonly [number, number, number];
type VisualDogBreed = 'english-setter' | 'gsp';
type DogAppearance = EnglishSetterAppearance | GermanShorthairedPointerAppearance;

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

  /** Same triangle emitted with both windings — rigid coat locks are thin. */
  tri2(a: V3, b: V3, c: V3, color: THREE.Color): void {
    this.tri(a, b, c, color);
    this.tri(c, b, a, color);
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
  closeRear = true,
  closeFront = true,
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
    if (closeRear) b.tri(first[j2], first[j], capRear, capRearC); // rear cap (faces -z)
    if (closeFront) b.tri(last[j], last[j2], capFront, capFrontC); // front cap (faces +z)
  }
}

function localSect(s: SectZ, pivot: V3): SectZ {
  return { x: s.x - pivot[0], y: s.y - pivot[1], z: s.z - pivot[2], hw: s.hw, hh: s.hh };
}

function localPoint(v: V3, pivot: V3): V3 {
  return [v[0] - pivot[0], v[1] - pivot[1], v[2] - pivot[2]];
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
const PELVIS_PIVOT: V3 = [0, 0.455, -0.06];
// The fore chain must reach both the ground and its forward touchdown.
// Its old 0.385 m total was shorter than the 0.415 m shoulder height,
// which guaranteed a floating paw whenever locomotion stopped sinking the
// whole body. Long setter limbs retain a little flex at vertical support.
const FORE_UPPER_LEN = 0.245;
const FORE_LOWER_LEN = 0.195;
const FORE_CARPUS_LEN = 0.055;
const HIND_UPPER_LEN = 0.205;
const HIND_SHANK_LEN = 0.16;
const HIND_HOCK_LEN = 0.12;
const PAW_SOLE_Y = -0.014;

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
const SETTER_TORSO_SECTS: SectZ[] = [
  { x: 0, y: 0.44, z: -0.33, hw: 0.055, hh: 0.075 },
  { x: 0, y: 0.435, z: -0.24, hw: 0.088, hh: 0.115 },
  // The admitted profile's abdomen rises decisively behind the ribcage.
  // Narrowing AND lifting this ring creates a setter tuck instead of a
  // rectangular terrier belly while keeping the level topline.
  { x: 0, y: 0.455, z: -0.06, hw: 0.072, hh: 0.085 },
  // Brisket reaches the elbow at the heart girth; the user-supplied
  // three-quarter view confirms that the forechest is broad, not spindle.
  { x: 0, y: 0.415, z: 0.13, hw: 0.118, hh: 0.15 },
  { x: 0, y: 0.42, z: 0.27, hw: 0.108, hh: 0.135 },
];

/** Taut, short-coated GSP wedge: deep sternum, decisive tuck, strong loin. */
const GSP_TORSO_SECTS: SectZ[] = [
  { x: 0, y: 0.438, z: -0.315, hw: 0.064, hh: 0.084 },
  { x: 0, y: 0.435, z: -0.225, hw: 0.096, hh: 0.12 },
  { x: 0, y: 0.462, z: -0.055, hw: 0.068, hh: 0.073 },
  { x: 0, y: 0.414, z: 0.125, hw: 0.116, hh: 0.154 },
  { x: 0, y: 0.425, z: 0.255, hw: 0.106, hh: 0.136 },
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
  readonly id: string;

  constructor(
    private readonly visualBreed: VisualDogBreed,
    private readonly coatId: string,
    private readonly slot = 0,
  ) {
    this.id = slot === 0 ? 'dog' : `dog-${slot + 1}`;
  }

  private hunt!: Hunt3DSystem;
  private terrain!: TerrainSystem;
  private mat?: THREE.MeshLambertMaterial;
  private markingMat?: THREE.MeshLambertMaterial;
  private appearance!: DogAppearance;
  private geos: THREE.BufferGeometry[] = [];

  private root = new THREE.Group();
  private body = new THREE.Group();
  /** Stable ribcage plus a caudal loin/pelvis pivot; low-poly surfaces stay rigid. */
  private chest = new THREE.Group();
  private pelvis = new THREE.Group();
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
  /** FL, FR, HL, HR — carrier, upper, lower, distal carpus/hock, independent paw. */
  private limbCarrier: THREE.Group[] = [];
  private legU: THREE.Group[] = [];
  private legL: THREE.Group[] = [];
  private legD: THREE.Group[] = [];
  private paws: THREE.Group[] = [];
  /** Paw-tip markers (paw local) — exact planting + capture audit. */
  private pawTips: THREE.Object3D[] = [];
  private pawV = new THREE.Vector3();
  private pawTargetW = new THREE.Vector3();
  private pawTargetL = new THREE.Vector3();
  private footLocks = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** Released stance locks blend into authored swing for a quiet toe-off. */
  private releaseLocks = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private releaseT = [1, 1, 1, 1];
  private footLocked = [false, false, false, false];
  private priorContact: FootContact[] = ['swing', 'swing', 'swing', 'swing'];
  private ik: TwoBoneSolution[] = [
    createTwoBoneSolution(),
    createTwoBoneSolution(),
    createTwoBoneSolution(),
    createTwoBoneSolution(),
  ];

  private frozen = false;
  /** Capture-only neutral conformation pose for profile review. */
  private reviewNeutral = false;
  /** Capture-only gait override; null in all live gameplay. */
  private reviewLocomotionGait: LocomotionGait | null = null;
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
  private shadowWidth = 0.48;

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
  /** The new rig bends at the loin instead of scaling one torso block. */
  private pelvisPitch = 0;
  private pelvisRoll = 0;
  private chestYaw = 0;
  private pelvisYaw = 0;
  private loinPitch = 0;
  private scapulaZ = [0, 0];
  private scapulaPitch = [0, 0];
  private shoulderZ = 0;
  private shoulderY = 0;
  private hipZ = 0;
  private hipY = 0;
  /** Smoothed double-suspension weight: 0 supported, 1 airborne. */
  private flight = 0;
  /** Smoothed y correction from the contact solver; removes framewise hops. */
  private groundOffset = 0;
  private locomotion = createLocomotionPose();
  private huntMotion = createHuntMotionPose();
  private locomotionGait: LocomotionGait = 'walk';
  private pendingLocomotionGait: LocomotionGait = 'walk';
  private locomotionCycle = 0;
  /** Seconds remaining in the body-pose crossfade after a stride-safe change. */
  private gaitTransitionRemaining = 0;
  private solveDt = 0;
  private speedMps = 0;
  private gallopLead: 'left' | 'right' = 'left';
  private pendingGallopLead: 'left' | 'right' = 'left';
  private uAng = [0, 0, 0, 0];
  private lAng = [0, 0, 0, 0];
  private dAng = [0, 0, 0, 0];
  private pawAng = [0, 0, 0, 0];
  private phase = 0;
  private yawRate = 0;
  /** Cover-parting radius fed to grass — widens on point (bug 4). */
  private partR = 1.7;

  // Preallocated scratch.
  private posW = { x: 0, z: 0 };
  private birdW = { x: 0, z: 0 };
  private lastX = 0;
  private lastZ = 0;
  private hasLast = false;

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.appearance = this.visualBreed === 'gsp'
      ? germanShorthairedPointerAppearance(resolveGspCoat(this.coatId))
      : englishSetterAppearance(this.coatId as EnglishSetterCoatId);
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.terrain = ctx.get<TerrainSystem>('terrain');
    const high = ctx.quality === 'high';

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // Colored markings need ordinary scene lighting. The coat's aggressive
    // white-specific headroom/rim shader turns orange albedo back into pale
    // cream at dawn, so ears, plates and ticking use this companion material.
    this.markingMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      // A small warm bounce keeps the orange head readable when the dog
      // faces away from the dawn key; it is not a fullbright coat.
      emissive: this.appearance.markingEmissive,
      emissiveIntensity: this.appearance.markingEmissiveIntensity,
    });
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
            // Normalize only the pale coat. Applying the white-coat
            // headroom scalar to orange patches desaturated them into the
            // same beige value as the body under low sun.
            '\tfloat gAlbedoHi = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) );\n' +
            '\tfloat gCoatMask = smoothstep( 0.55, 0.78, gAlbedoHi );\n' +
            '\tdiffuseColor.rgb *= mix( 1.0, uAlbedoK, gCoatMask );\n' +
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
            '\ttotalEmissiveRadiance += uRimColor * ( gPaintW * uSunPaintK * ( 1.0 + 1.8 * gBack * gBack ) ) * mix( 0.18, 1.0, gCoatMask );\n' +
            // ROUND 11 — SHADE FILL: the shade mass is LIT by the hour's
            // shadow tint (the same role the grass cores breathe), graded
            // by sky exposure so the rump catches the vault and the belly
            // sinks. Additive light on shade facets only — the multiply
            // above sinks Lambert's leftovers, this re-lights them mauve:
            // a committed two-tone body, never an unlit black hole, and
            // never a lift on the lit side (ratio numerator untouched).
            '\ttotalEmissiveRadiance += uCoolTint * ( gShadeW * uShadeFillK * mix( 0.5, 1.1, gSky ) ) * mix( 0.18, 1.0, gCoatMask );\n' +
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
            '\ttotalEmissiveRadiance += uRimColor * min( gRim * uRimK * ( 0.5 + 1.4 * gBack * gBack ), 0.8 ) * mix( 0.18, 1.0, gCoatMask );',
        );
    };
    const applyTod = (tod: TimeOfDay): void => {
      // Keep the dog on the same area-aware light recipe as the sky, terrain,
      // grass, birds, and gun.  The shared TOD is still the fallback, while
      // authored properties such as Quail, Chukar, and Cattail Coverts can
      // carry their own sky/fill balance without making the dog a separate
      // light source.
      const spec = fieldTimeOfDay(this.hunt.huntState().areaId, tod);
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
      this.shadowWidth = 0.48 / (1 + 0.3 * this.shadowStretch);
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
      premultipliedAlpha: true,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadowMesh.frustumCulled = false; // bounds change per frame; one quad fan
    this.shadowGrp.add(shadowMesh);
    ctx.scene.add(this.shadowGrp);

    applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => applyTod(e.detail)) as EventListener);

    this.pelvis.position.set(PELVIS_PIVOT[0], PELVIS_PIVOT[1], PELVIS_PIVOT[2]);
    this.body.add(this.chest, this.pelvis);
    this.buildBody(high);
    this.publishSculptRuntime();

    // Shared ~0.63 m gameplay shoulder scale. Breed identity lives in the
    // local proportions; the planting solver measures the scaled paw chain
    // before grounding it.
    this.root.scale.setScalar(1.15);
    this.root.add(this.body);
    ctx.scene.add(this.root);

    // CAPTURE AUDIT (mechanic round): under ?capture=1 the dog publishes a
    // read-only measurement handle — terrain queries plus live paw/shadow
    // world positions — so tools3d scripts can MEASURE planting and shadow
    // registration instead of trusting claims. Tooling-only; allocations
    // here never run in gameplay frames.
    if (this.frozen && this.slot === 0) {
      const isolationVisibility = new Map<THREE.Object3D, boolean>();
      const normalBackground = ctx.scene.background;
      const reviewBackground = new THREE.Color(0x363a3a);
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
        // Clean turntable evidence for the img2threejs silhouette and
        // multi-angle gates. This hides the world, contact shadow, and
        // viewmodel while preserving the live dog, camera, and lights.
        // It exists only in capture mode and never changes gameplay.
        setIsolated: (v: boolean) => {
          if (v) {
            isolationVisibility.clear();
            for (const child of ctx.scene.children) {
              if (child === this.root || child instanceof THREE.Light) continue;
              isolationVisibility.set(child, child.visible);
              child.visible = false;
            }
            ctx.scene.background = reviewBackground;
          } else {
            for (const [child, visible] of isolationVisibility) child.visible = visible;
            isolationVisibility.clear();
            ctx.scene.background = normalBackground;
          }
        },
        setReviewNeutral: (v: boolean) => {
          this.reviewNeutral = v;
        },
        /** Freeze any locomotion law at a normalized phase for gait review. */
        setLocomotionPhase: (gait: LocomotionGait, cycle: number) => {
          this.reviewLocomotionGait = gait;
          this.locomotionGait = gait;
          this.pendingLocomotionGait = gait;
          this.locomotionCycle = ((cycle % 1) + 1) % 1;
          this.phase = this.locomotionCycle * Math.PI * 2;
          this.footLocked.fill(false);
          this.priorContact.fill('swing');
          this.releaseT.fill(1);
        },
        /** Backward-compatible gallop-only capture hook. */
        setGallopPhase: (cycle: number) => {
          this.reviewLocomotionGait = 'gallop';
          this.locomotionGait = 'gallop';
          this.pendingLocomotionGait = 'gallop';
          this.locomotionCycle = ((cycle % 1) + 1) % 1;
          this.phase = this.locomotionCycle * Math.PI * 2;
          this.footLocked.fill(false);
          this.priorContact.fill('swing');
          this.releaseT.fill(1);
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
        modelStats: () => {
          let drawCalls = 0;
          let triangles = 0;
          const parts: Array<{ name: string; kind: 'part'; module: 'dog'; triangles: number }> = [];
          this.root.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            drawCalls++;
            const geo = obj.geometry;
            const partTriangles = geo.index
              ? geo.index.count / 3
              : (geo.getAttribute('position')?.count ?? 0) / 3;
            triangles += partTriangles;
            parts.push({ name: obj.name, kind: 'part', module: 'dog', triangles: partTriangles });
          });
          return { drawCalls, triangles, parts, unnamedMeshes: parts.filter((part) => !part.name).length };
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
            state: this.hunt.dog(this.slot).state,
            gait: this.hunt.dog(this.slot).gait,
            scent: {
              stage: this.hunt.dog(this.slot).scentStage,
              progress: this.hunt.dog(this.slot).scentProgress,
            },
            breed: this.hunt.dog(this.slot).profile.breed.id,
            gallop: {
              cycle: this.locomotion.cycle,
              flight: this.flight,
              stretch: 1 + this.loinPitch,
              gait: this.locomotionGait,
              lead: this.gallopLead,
              speedMps: this.speedMps,
              contacts: this.locomotion.feet.map((foot) => foot.contact),
              locked: [...this.footLocked],
              joints: {
                upper: [...this.uAng],
                lower: [...this.lAng],
                distal: [...this.dAng],
                paw: [...this.pawAng],
              },
            },
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

  private mesh(
    geo: THREE.BufferGeometry,
    _high: boolean,
    material: THREE.Material = this.mat!,
  ): THREE.Mesh {
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, material);
    // NEVER into the shadow map (round 7, item 2): at a grazing dawn sun
    // the segmented body smeared into a noisy splat that read as a burn
    // mark. The contact ellipse is the dog's grounding on every tier.
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  private buildBody(high: boolean): void {
    // Each breed shares one sculpt across its accepted coats. Appearance
    // modules own palettes and pattern rules; anatomy branches on breed,
    // never on a color name.
    const a = this.appearance;
    const gsp = this.visualBreed === 'gsp';
    const gspAppearance = gsp ? a as GermanShorthairedPointerAppearance : null;
    const torsoSects = gsp ? GSP_TORSO_SECTS : SETTER_TORSO_SECTS;
    const coat = new THREE.Color(a.ground);
    const coatDim = new THREE.Color(a.groundDim);
    // Round 9, item 4: lower legs and paws step DOWN in value so the
    // articulation (knee/hock joints, four separate columns) reads inside
    // the white mass, not only in silhouette.
    const legShade = new THREE.Color(a.legShade);
    const pawShade = new THREE.Color(a.pawShade);
    // Dawn's four-stop key lifts albedo hard; these deliberately deep base
    // values land as the intended marking color after lighting/ACES.
    const patch = new THREE.Color(a.primary);
    const patchDeep = new THREE.Color(a.primaryDeep);
    const setterAppearance = gsp ? null : a as EnglishSetterAppearance;
    const tanPoint = setterAppearance?.tanPoint === undefined
      ? undefined
      : new THREE.Color(setterAppearance.tanPoint);
    const tanPointDeep = setterAppearance?.tanPointDeep === undefined
      ? tanPoint
      : new THREE.Color(setterAppearance.tanPointDeep);
    const nose = new THREE.Color(a.nose);
    const eye = new THREE.Color(a.eye);

    // TORSO — two overlapping rigid low-poly masses joined at the short
    // loin. The neutral silhouette is the accepted Setter sculpt, but the
    // pelvis can now gather under the ribcage instead of scaling one block.
    {
      const b = new PartBuilder();
      loftZ(
        b, torsoSects.slice(2), [coat, coat],
        [0, 0.455, -0.066], [0, 0.41, 0.29],
        coat, coat,
        true,
        true,
      );
      // Setter furnishings are silhouette, not a fur texture. Two shallow
      // layers of rigid triangular locks put a few purposeful notches under
      // the brisket and belly while leaving the profile's tuck exposed.
      if (!gsp) {
        for (const sx of [-1, 1]) {
          const x = sx * 0.043;
          const ox = sx * 0.052;
          // Chest feather: deepest ahead of the elbow.
          b.tri2([x, 0.365, 0.245], [x, 0.33, 0.105], [ox, 0.255, 0.175], coatDim);
          // Belly locks shorten toward the loin, producing the saw-tooth
          // setter coat edge visible in both admitted standing references.
          b.tri2([x, 0.365, 0.1], [x, 0.37, -0.025], [ox, 0.31, 0.025], coatDim);
        }
      }
      this.chest.add(this.mesh(b.build(), high));
    }
    {
      const b = new PartBuilder();
      const sections = [
        ...torsoSects.slice(0, 3),
        // The front of the pelvis narrows inside the overlapping loin
        // sleeve; its closed edge can rotate without exposing an open ring.
        { x: 0, y: 0.45, z: 0.012, hw: 0.066, hh: 0.077 },
      ].map((s) => localSect(s, PELVIS_PIVOT));
      loftZ(
        b, sections, [coatDim, coat, coat],
        localPoint([0, 0.455, -0.36], PELVIS_PIVOT),
        localPoint([0, 0.45, 0.018], PELVIS_PIVOT),
        coatDim, coat,
        true,
        true,
      );
      // The caudal belly feather belongs to the pelvis so it follows the
      // gather instead of floating across the loin seam.
      if (!gsp) {
        for (const sx of [-1, 1]) {
          const x = sx * 0.043;
          const ox = sx * 0.052;
          b.tri2(
            localPoint([x, 0.38, -0.035], PELVIS_PIVOT),
            localPoint([x, 0.39, -0.16], PELVIS_PIVOT),
            localPoint([ox, 0.335, -0.105], PELVIS_PIVOT),
            coatDim,
          );
        }
      }
      this.pelvis.add(this.mesh(b.build(), high));
    }
    {
      // Short overlapping loin sleeve: hides the rigid-segment seam while
      // leaving the pelvis free to rotate underneath. It is intentionally
      // faceted and only a hand-span long, not a rubber torso stretch.
      const b = new PartBuilder();
      loftZ(
        b,
        [
          { x: 0, y: 0.452, z: -0.115, hw: 0.076, hh: 0.089 },
          { x: 0, y: 0.448, z: 0.018, hw: 0.08, hh: 0.099 },
        ],
        [coat],
        [0, 0.452, -0.12],
        [0, 0.448, 0.023],
        coat,
        coat,
      );
      this.chest.add(this.mesh(b.build(), high));
    }

    // Coat pattern overlays: restrained belton diamonds for the Setter;
    // denser irregular ticking plus broad asymmetrical liver/black plates
    // for a roan or patched GSP. Solid GSPs need no overlay at all.
    if (!(gsp && gspAppearance!.pattern === 'solid')) {
      const front = new PartBuilder();
      const rear = new PartBuilder();
      const sideFlecks: ReadonlyArray<readonly [number, number, number, number, number, boolean]> = gsp
        ? [
            [0.113, 0.49, 0.22, 0.008, 0.012, false],
            [0.119, 0.44, 0.18, 0.006, 0.01, true],
            [0.116, 0.38, 0.12, 0.007, 0.011, false],
            [0.101, 0.5, 0.07, 0.006, 0.01, true],
            [0.086, 0.425, 0.015, 0.008, 0.013, false],
            [0.074, 0.49, -0.045, 0.006, 0.01, true],
            [0.088, 0.47, -0.11, 0.007, 0.011, false],
            [0.094, 0.405, -0.17, 0.006, 0.009, true],
            [0.088, 0.49, -0.22, 0.008, 0.012, false],
            [0.068, 0.435, -0.29, 0.006, 0.01, true],
          ]
        : [
            [0.109, 0.45, 0.205, 0.014, 0.022, false],
            [0.113, 0.405, 0.135, 0.01, 0.015, true],
            [0.096, 0.49, 0.055, 0.012, 0.019, false],
            [0.078, 0.43, -0.035, 0.009, 0.014, true],
            [0.086, 0.485, -0.125, 0.013, 0.018, false],
            [0.084, 0.405, -0.205, 0.01, 0.016, true],
            [0.061, 0.46, -0.29, 0.009, 0.013, false],
          ];
      for (const side of [-1, 1]) {
        for (let i = 0; i < sideFlecks.length; i++) {
          const [xr, y, z, hy, hz, deep] = sideFlecks[i];
          // Offset the two sides so the pattern is individual, not mirrored.
          const dz = side < 0 ? 0 : ((i % 3) - 1) * 0.014;
          const x = side * (xr + 0.002);
          const points: [V3, V3, V3, V3] = [
            [x, y + hy, z + dz], [x, y, z + hz + dz],
            [x, y - hy, z + dz], [x, y, z - hz + dz],
          ];
          if (z < PELVIS_PIVOT[2]) {
            rear.quad2(
              localPoint(points[0], PELVIS_PIVOT), localPoint(points[1], PELVIS_PIVOT),
              localPoint(points[2], PELVIS_PIVOT), localPoint(points[3], PELVIS_PIVOT),
              deep ? patchDeep : patch,
            );
          } else {
            front.quad2(points[0], points[1], points[2], points[3], deep ? patchDeep : patch);
          }
        }
      }
      if (gsp) {
        // Large breed-defining plates remain faceted and flush to the
        // short coat. Different extents on each flank avoid a mirrored toy.
        for (const side of [-1, 1]) {
          const dz = side < 0 ? 0 : -0.022;
          front.quad2(
            [side * 0.1085, 0.495, 0.19 + dz],
            [side * 0.104, 0.48, 0.09 + dz],
            [side * 0.103, 0.395, 0.105 + dz],
            [side * 0.112, 0.385, 0.185 + dz],
            patch,
          );
          rear.quad2(
            localPoint([side * 0.091, 0.495, -0.15 - dz], PELVIS_PIVOT),
            localPoint([side * 0.075, 0.47, -0.265 - dz], PELVIS_PIVOT),
            localPoint([side * 0.073, 0.385, -0.245 - dz], PELVIS_PIVOT),
            localPoint([side * 0.091, 0.395, -0.16 - dz], PELVIS_PIVOT),
            patchDeep,
          );
        }
      }
      // A few dorsal flecks keep the coat believable from the player's
      // elevated three-quarter view.
      const topFlecks: ReadonlyArray<readonly [number, number, number, number, number, boolean]> = gsp
        ? [
            [-0.045, 0.566, 0.19, 0.01, 0.015, true],
            [0.038, 0.568, 0.1, 0.008, 0.013, false],
            [-0.025, 0.546, -0.04, 0.009, 0.014, false],
            [0.04, 0.554, -0.17, 0.008, 0.012, true],
            [-0.02, 0.54, -0.275, 0.007, 0.01, false],
          ]
        : [
            [-0.042, 0.563, 0.17, 0.014, 0.02, true],
            [0.05, 0.559, 0.075, 0.012, 0.018, false],
            [-0.025, 0.543, -0.09, 0.011, 0.017, false],
            [0.034, 0.551, -0.235, 0.01, 0.014, true],
          ];
      for (const [x, y, z, hx, hz, deep] of topFlecks) {
        const points: [V3, V3, V3, V3] = [
          [x - hx, y, z], [x, y, z + hz],
          [x + hx, y, z], [x, y, z - hz],
        ];
        if (z < PELVIS_PIVOT[2]) {
          rear.quad2(
            localPoint(points[0], PELVIS_PIVOT), localPoint(points[1], PELVIS_PIVOT),
            localPoint(points[2], PELVIS_PIVOT), localPoint(points[3], PELVIS_PIVOT),
            deep ? patchDeep : patch,
          );
        } else {
          front.quad2(points[0], points[1], points[2], points[3], deep ? patchDeep : patch);
        }
      }
      this.chest.add(this.mesh(front.build(), high, this.markingMat!));
      this.pelvis.add(this.mesh(rear.build(), high, this.markingMat!));
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
    this.chest.add(this.neck);

    // HEAD — white skull with dark patches at the eyes/ears, white muzzle,
    // charcoal nose: at 20 m the read is a white dog with a marked face,
    // not a featureless dark blob.
    {
      const b = new PartBuilder();
      // Faceted organic skull: broad through the eyes, tapered into the
      // occiput and stop. The former box made the orange plate read as a
      // literal rectangle even when its colors were correct.
      loftZ(
        b,
        gsp
          ? [
              { x: 0, y: 0.008, z: -0.076, hw: 0.04, hh: 0.037 },
              { x: 0, y: 0.012, z: -0.002, hw: 0.061, hh: 0.052 },
              { x: 0, y: 0.004, z: 0.094, hw: 0.05, hh: 0.043 },
            ]
          : [
              { x: 0, y: 0.008, z: -0.072, hw: 0.034, hh: 0.034 },
              { x: 0, y: 0.012, z: -0.005, hw: 0.056, hh: 0.051 },
              { x: 0, y: 0.006, z: 0.088, hw: 0.046, hh: 0.042 },
            ],
        [patchDeep, patch],
        [0, 0.008, -0.086], [0, 0.006, 0.098],
        patchDeep, patch,
      );
      // Narrow white blaze laid over the crown, matching the reference's
      // orange eye plates without covering the whole head white.
      if (!gsp || gspAppearance!.headBlaze) {
        const blazeWidth = gsp ? 0.008 : 0.012;
        b.quad2(
          [-blazeWidth, 0.0635, -0.038], [-blazeWidth * 0.8, 0.052, 0.082],
          [blazeWidth * 0.8, 0.052, 0.082], [blazeWidth, 0.0635, -0.038],
          coat,
        );
      }
      // Tiny warm eye beads sit proud of the dark cheek patches. They are
      // deliberately diamonds in the same mesh: visible at macro range,
      // zero extra draw calls, and still palette-locked.
      for (const s of [-1, 1]) {
        const x = s * 0.053;
        b.quad2(
          [x, 0.036, 0.061], [x, 0.027, 0.073],
          [x, 0.018, 0.061], [x, 0.027, 0.049],
          eye,
        );
      }
      // Blue-belton-and-tan: small eyebrows and cheek points distinguish a
      // true tricolor while the black ears/skull and white blaze stay intact.
      if (!gsp && tanPoint && tanPointDeep) {
        for (const s of [-1, 1]) {
          const x = s * 0.0545;
          b.quad2(
            [x, 0.052, 0.035], [x, 0.046, 0.052],
            [x, 0.039, 0.035], [x, 0.045, 0.019],
            tanPoint,
          );
          b.quad2(
            [x, 0.018, 0.078], [x, 0.004, 0.102],
            [x, -0.018, 0.084], [x, -0.004, 0.062],
            tanPointDeep,
          );
        }
      }
      // Long but softly tapered white muzzle with pendant lower flews.
      loftZ(
        b,
        [
          { x: 0, y: -0.008, z: 0.07, hw: 0.037, hh: 0.035 },
          { x: 0, y: -0.012, z: 0.145, hw: 0.032, hh: 0.032 },
          { x: 0, y: -0.004, z: 0.21, hw: 0.025, hh: 0.026 },
        ],
        [gsp ? patchDeep : coatDim, gsp ? patch : coat],
        [0, -0.008, 0.062], [0, -0.004, 0.217],
        gsp ? patchDeep : coatDim, gsp ? patch : coat,
      );
      // Nose leather.
      b.boxZ(
        { x: 0, y: 0.005, z: 0.2, hw: gsp ? 0.022 : 0.018, hh: gsp ? 0.02 : 0.017 },
        { x: 0, y: 0.003, z: 0.228, hw: gsp ? 0.018 : 0.014, hh: gsp ? 0.016 : 0.013 },
        { side: nose, front: nose },
      );
      this.head.add(this.mesh(b.build(), high, this.markingMat!));
    }
    this.head.position.set(NECK_TOP[0], NECK_TOP[1], NECK_TOP[2]);
    // The admitted profile and user three-quarter both carry a visibly
    // long, substantial setter head. The old game-scale head read as a
    // generic pin at hunter distance; a uniform 10% lift preserves its
    // pivots while letting the skull/muzzle ratio survive the grass.
    this.head.scale.setScalar(gsp ? 1.06 : 1.1);
    this.neck.add(this.head);

    // EARS — broad, low-set orange flaps. A six-sided outline reads as the
    // rounded, feathered Setter ear; the former two stacked quads looked
    // like a rectangular card pasted to the cheek.
    for (const side of [-1, 1]) {
      const b = new PartBuilder();
      const center: V3 = [side * 0.014, -0.075, 0];
      const outline: V3[] = gsp
        ? [
            [0, 0.004, -0.034],
            [0, 0.004, 0.034],
            [side * 0.012, -0.045, 0.058],
            [side * 0.022, -0.112, 0.035],
            [side * 0.021, -0.132, -0.008],
            [side * 0.011, -0.074, -0.054],
          ]
        : [
            [0, 0.004, -0.032],
            [0, 0.004, 0.032],
            [side * 0.014, -0.055, 0.058],
            [side * 0.028, -0.14, 0.028],
            [side * 0.026, -0.165, -0.014],
            [side * 0.014, -0.09, -0.056],
          ];
      for (let i = 0; i < outline.length; i++) {
        const color = i >= 2 && i <= 4 ? patchDeep : patch;
        b.tri2(center, outline[i], outline[(i + 1) % outline.length], color);
      }
      const grp = side < 0 ? this.earL : this.earR;
      grp.add(this.mesh(b.build(), high, this.markingMat!));
      grp.position.set(side * 0.046, 0.042, 0.012);
      grp.rotation.z = side * (gsp ? -0.24 : -0.52);
      grp.rotation.y = side * (gsp ? 0.08 : 0.18);
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
    const tailCoat = gsp ? patch : coat;
    const tailDim = gsp ? patchDeep : coatDim;
    const flagTip = tailCoat.clone();
    {
      const b = new PartBuilder();
      // Root: rump-thick at the hip, tapering to the flag joint.
      b.boxZ(
        { x: 0, y: -0.004, z: gsp ? -0.065 : -0.105, hw: gsp ? 0.018 : 0.02, hh: gsp ? 0.021 : 0.024 },
        { x: 0, y: -0.006, z: 0.025, hw: gsp ? 0.029 : 0.034, hh: gsp ? 0.035 : 0.042 },
        { side: tailCoat, bottom: tailDim },
      );
      this.tailRoot.add(this.mesh(b.build(), high));
    }
    {
      const b = new PartBuilder();
      // Straight bone, joint -> tip, no saber droop: the flag pole.
      // Tip thickened (0.008 -> 0.012) and capped bright.
      b.boxZ(
        { x: 0, y: 0, z: gsp ? -0.11 : -0.3, hw: gsp ? 0.009 : 0.012, hh: gsp ? 0.011 : 0.014 },
        { x: 0, y: 0, z: 0, hw: gsp ? 0.018 : 0.022, hh: gsp ? 0.022 : 0.026 },
        { side: tailCoat, back: flagTip },
      );
      // Three feathering facets off the underside, each ending in a notch
      // (the sawtooth trailing edge of real setter feathering), emitted as
      // TWO layers in a shallow V so the flag keeps presence when the
      // camera lines up with its plane. The close img2threejs review
      // exposed the old deep saw edge as a white pinecone in the point;
      // these locks stay shallow and the last takes the bright tip role.
      if (!gsp) {
        for (const lx of [-0.012, 0.012]) {
          const yb = lx < 0 ? 0 : -0.008; // layered locks, not a mirror
          b.quad2(
            [lx, -0.018, -0.035], [lx, -0.022, -0.115],
            [lx * 2.2, -0.078 + yb, -0.081], [lx * 2.2, -0.066 + yb, -0.028],
            coat,
          );
          b.quad2(
            [lx, -0.024, -0.12], [lx, -0.028, -0.207],
            [lx * 2.2, -0.082 + yb, -0.173], [lx * 2.2, -0.075 + yb, -0.105],
            coatDim,
          );
          b.quad2(
            [lx, -0.03, -0.212], [lx, -0.036, -0.3],
            [lx * 2.2, -0.066 + yb, -0.26], [lx * 2.2, -0.072 + yb, -0.192],
            flagTip,
          );
        }
      }
      this.tailFlag.add(this.mesh(b.build(), high));
    }
    this.tailRoot.position.set(
      TAIL_PIVOT[0] - PELVIS_PIVOT[0],
      TAIL_PIVOT[1] - PELVIS_PIVOT[1],
      TAIL_PIVOT[2] - PELVIS_PIVOT[2],
    );
    // The flag reads at gameplay range or it doesn't exist: +18% so the
    // raised tip clears the cover line the parting can't duck (bug 4).
    this.tailRoot.scale.setScalar(gsp ? 1 : 1.18);
    this.tailFlag.position.set(0, 0, gsp ? -0.055 : -0.095);
    this.tailRoot.add(this.tailFlag);
    this.tailTip.position.set(0, 0, gsp ? -0.115 : -0.305);
    this.tailFlag.add(this.tailTip);
    this.pelvis.add(this.tailRoot);

    // LEGS — low-poly surfaces with an anatomical transform hierarchy.
    // Fore carriers stand in for the muscular scapular attachment; the
    // hind chain has a distinct shank and hock/cannon; every paw can plant
    // and orient independently without adding texture or surface detail.
    for (let i = 0; i < 4; i++) {
      const fore = i < 2;
      const side = i % 2 === 0 ? -1 : 1;
      const carrier = new THREE.Group();
      const upper = new THREE.Group();
      const lower = new THREE.Group();
      const distal = new THREE.Group();
      const paw = new THREE.Group();
      {
        const b = new PartBuilder();
        if (fore) {
          // The chest owns the shoulder mass; only the moving humerus/forearm
          // surface follows this joint. A huge buried rotating cap becomes
          // a spike once a real reaching gait replaces the old small sine.
          b.boxY(
            { x: 0, y: 0.045, z: -0.006, hw: 0.034, hd: 0.048 },
            { x: 0, y: -FORE_UPPER_LEN, z: 0.004, hw: 0.021, hd: 0.027 },
            coat,
          );
        } else {
          // The pelvis loft owns the haunch. This narrower mobile thigh can
          // fold deeply under the loin without rotating a rump-sized wedge
          // out through the dog's back.
          b.boxY(
            { x: 0, y: 0.04, z: -0.008, hw: gsp ? 0.036 : 0.032, hd: gsp ? 0.058 : 0.052 },
            { x: 0, y: -HIND_UPPER_LEN, z: 0.01, hw: gsp ? 0.022 : 0.02, hd: gsp ? 0.033 : 0.03 },
            coat,
          );
          // Rear furnishings trail from the broad thigh but stop above the
          // hock, so the angled working anatomy stays readable. Mirrored
          // thin locks live in the upper-leg mesh and add no draw calls.
          if (!gsp) {
            for (const sx of [-1, 1]) {
              const x = sx * 0.024;
              const ox = sx * 0.032;
              b.tri2([x, 0.018, -0.035], [x, -0.07, -0.025], [ox, -0.11, -0.075], coatDim);
              b.tri2([x, -0.065, -0.025], [x, -0.155, -0.015], [ox, -0.18, -0.065], coatDim);
            }
          }
        }
        upper.add(this.mesh(b.build(), high));
      }
      {
        const b = new PartBuilder();
        const len = fore ? FORE_LOWER_LEN : HIND_SHANK_LEN;
        b.boxY(
          { x: 0, y: 0, z: 0, hw: 0.017, hd: 0.024 },
          { x: 0, y: -len + 0.018, z: -0.004, hw: 0.013, hd: 0.018 },
          legShade,
        );
        // Setter furnishings run DOWN the leg, not just off the thigh: short
        // mirrored locks trail the rear edge of the forearm/shank and stop
        // above the wrist/hock so both working joints stay readable. Same
        // zero-draw-call pattern as the thigh locks; coatDim steps them down
        // in value so the articulation reads inside the white mass.
        // +32 tris total (tri2 both windings), no new meshes.
        if (!gsp) {
          const top = fore ? -0.015 : -0.008;
          const mid = fore ? -0.095 : -0.068;
          const bot = fore ? -0.16 : -0.132;
          const zTop = fore ? -0.024 : -0.019;
          const zMid = fore ? -0.021 : -0.017;
          for (const sx of [-1, 1]) {
            const x = sx * 0.014;
            const ox = sx * 0.021;
            b.tri2([x, top, zTop], [x, mid, zMid], [ox, mid - 0.028, zMid - 0.028], coatDim);
            b.tri2([x, mid, zMid], [x, bot, zMid + 0.003], [ox, bot - 0.02, zMid - 0.024], coatDim);
          }
        }
        lower.add(this.mesh(b.build(), high));
      }
      if (fore) {
        // The wrist/pastern is a small but essential third link. In a run
        // it folds the paw under the chest during recovery, then opens for
        // a quiet plant; leaving this joint rigid made each foreleg read as
        // one long stick pivoting like a mechanical horse leg.
        const b = new PartBuilder();
        b.boxY(
          { x: 0, y: 0.008, z: 0, hw: 0.013, hd: 0.018 },
          { x: 0, y: -FORE_CARPUS_LEN + 0.008, z: 0.003, hw: 0.011, hd: 0.015 },
          legShade,
        );
        distal.add(this.mesh(b.build(), high));
      } else {
        const b = new PartBuilder();
        b.boxY(
          { x: 0, y: 0.012, z: 0, hw: 0.014, hd: 0.019 },
          { x: 0, y: -HIND_HOCK_LEN + 0.012, z: 0.004, hw: 0.012, hd: 0.016 },
          legShade,
        );
        distal.add(this.mesh(b.build(), high));
      }
      {
        const b = new PartBuilder();
        b.boxZ(
          { x: 0, y: 0.006, z: gsp ? -0.022 : -0.026, hw: gsp ? 0.019 : 0.021, hh: gsp ? 0.013 : 0.014 },
          { x: 0, y: 0.004, z: gsp ? 0.05 : 0.058, hw: gsp ? 0.017 : 0.019, hh: 0.012 },
          { side: pawShade, top: legShade, bottom: pawShade },
        );
        paw.add(this.mesh(b.build(), high));
      }

      carrier.position.set(
        side * (fore ? FORE_X : HIND_X),
        fore ? FORE_Y : HIND_Y - PELVIS_PIVOT[1],
        fore ? FORE_Z : HIND_Z - PELVIS_PIVOT[2],
      );
      upper.position.set(0, 0, 0);
      lower.position.set(0, -(fore ? FORE_UPPER_LEN : HIND_UPPER_LEN), 0);
      distal.position.set(0, -(fore ? FORE_LOWER_LEN : HIND_SHANK_LEN), 0);
      paw.position.set(0, -(fore ? FORE_CARPUS_LEN : HIND_HOCK_LEN), 0);
      carrier.add(upper);
      upper.add(lower);
      lower.add(distal);
      distal.add(paw);
      (fore ? this.chest : this.pelvis).add(carrier);
      this.limbCarrier.push(carrier);
      this.legU.push(upper);
      this.legL.push(lower);
      this.legD.push(distal);
      this.paws.push(paw);
      // The sole marker, not the ankle, is the terrain/contact contract.
      const tip = new THREE.Object3D();
      tip.position.set(0, PAW_SOLE_Y, 0.018);
      paw.add(tip);
      this.pawTips.push(tip);
    }
  }

  /**
   * Lock supporting paws in world space and solve the low-poly chains back
   * to those targets. Swing paws follow the authored clearance arc toward
   * a terrain-aware touchdown. No allocation occurs in this render path.
   */
  private solveLocomotionLegs(): void {
    this.root.updateMatrixWorld(true);
    const scaleY = this.root.scale.y;
    const pawPivotHeight = -PAW_SOLE_Y * scaleY;

    for (let i = 0; i < 4; i++) {
      const fore = i < 2;
      const foot = this.locomotion.feet[i];
      const supporting = foot.contact !== 'swing';
      const carrier = this.limbCarrier[i];
      // The scapula carrier already contributes this translation. Remove
      // it from the child target so shoulder glide cannot double-count paw
      // travel or create a release pop at toe-off.
      const targetZ = fore ? foot.z - this.scapulaZ[i] : foot.z;
      const nominalDrop = fore
        ? FORE_UPPER_LEN + FORE_LOWER_LEN + FORE_CARPUS_LEN
        : HIND_UPPER_LEN + HIND_SHANK_LEN + HIND_HOCK_LEN;

      if (supporting) {
        this.releaseT[i] = 1;
        if (!this.footLocked[i] || this.priorContact[i] === 'swing') {
          this.pawTargetL.set(0, -nominalDrop, targetZ);
          this.pawTargetW.copy(this.pawTargetL);
          carrier.localToWorld(this.pawTargetW);
          this.pawTargetW.y =
            this.terrain.heightAt(this.pawTargetW.x, this.pawTargetW.z) + pawPivotHeight;
          this.footLocks[i].copy(this.pawTargetW);
          this.footLocked[i] = true;
        }
        this.pawTargetW.copy(this.footLocks[i]);
      } else {
        if (this.priorContact[i] !== 'swing' && this.footLocked[i]) {
          this.releaseLocks[i].copy(this.footLocks[i]);
          this.releaseT[i] = 0;
        }
        this.footLocked[i] = false;
        this.pawTargetL.set(0, -nominalDrop, targetZ);
        this.pawTargetW.copy(this.pawTargetL);
        carrier.localToWorld(this.pawTargetW);
        this.pawTargetW.y =
          this.terrain.heightAt(this.pawTargetW.x, this.pawTargetW.z) +
          pawPivotHeight +
          foot.lift * scaleY;
        if (this.releaseT[i] < 1) {
          const rawBlend = THREE.MathUtils.clamp(this.releaseT[i], 0, 1);
          const blend = rawBlend * rawBlend * (3 - 2 * rawBlend);
          this.pawTargetW.lerpVectors(this.releaseLocks[i], this.pawTargetW, blend);
          this.releaseT[i] = Math.min(1, this.releaseT[i] + this.solveDt / 0.14);
        }
      }

      this.pawTargetL.copy(this.pawTargetW);
      carrier.worldToLocal(this.pawTargetL);
      // Small lateral reach keeps a planted paw in place through a turn;
      // the sagittal solver sees the corresponding radial drop.
      const abduct = THREE.MathUtils.clamp(
        Math.atan2(this.pawTargetL.x, Math.max(0.05, -this.pawTargetL.y)),
        -0.22,
        0.22,
      );
      const sagittalY = -Math.hypot(this.pawTargetL.y, this.pawTargetL.x);

      if (fore) {
        // Solve the two long bones to the wrist rather than directly to
        // the paw. The independently authored carpus can then fold in
        // swing while the sole still reaches the exact terrain target.
        const carpusAbsolute = foreCarpusPitch(this.locomotionGait, foot);
        const wristY = sagittalY + Math.cos(carpusAbsolute) * FORE_CARPUS_LEN;
        const wristZ = this.pawTargetL.z - Math.sin(carpusAbsolute) * FORE_CARPUS_LEN;
        const solved = solveTwoBone(
          wristY,
          wristZ,
          FORE_UPPER_LEN,
          FORE_LOWER_LEN,
          -1,
          this.ik[i],
        );
        this.uAng[i] = solved.upper;
        this.lAng[i] = solved.lower;
        const distalRelative = solved.lowerAbsolute - carpusAbsolute;
        this.dAng[i] = distalRelative;
        this.pawAng[i] = foot.solePitch + carpusAbsolute;
        this.legU[i].rotation.set(-solved.upper, 0, abduct);
        this.legL[i].rotation.x = solved.lower;
        this.legD[i].rotation.x = distalRelative;
        this.paws[i].rotation.x = this.pawAng[i];
      } else {
        // During stance the cannon is nearly vertical; it folds forward in
        // swing so the hind paw clears without pulling the pelvis upward.
        const distalAbsolute = supporting
          ? -0.08
          : -0.22 + Math.sin(foot.swing * Math.PI) * 0.34;
        const ankleY = sagittalY + Math.cos(distalAbsolute) * HIND_HOCK_LEN;
        const ankleZ = this.pawTargetL.z - Math.sin(distalAbsolute) * HIND_HOCK_LEN;
        const solved = solveTwoBone(
          ankleY,
          ankleZ,
          HIND_UPPER_LEN,
          HIND_SHANK_LEN,
          1,
          this.ik[i],
        );
        const distalRelative = solved.lowerAbsolute - distalAbsolute;
        this.uAng[i] = solved.upper;
        this.lAng[i] = solved.lower;
        this.dAng[i] = distalRelative;
        this.pawAng[i] = foot.solePitch + distalAbsolute;
        this.legU[i].rotation.set(-solved.upper, 0, abduct);
        this.legL[i].rotation.x = solved.lower;
        this.legD[i].rotation.x = distalRelative;
        this.paws[i].rotation.x = this.pawAng[i];
      }
      this.priorContact[i] = foot.contact;
    }
  }

  /**
   * img2threejs action-ready hand-off. Uplandin keeps several visual
   * features integral to a parent mesh to keep the game budget tiny,
   * but every independently animated segment is named and addressable.
   * The integralComponents map makes that optimization explicit instead
   * of pretending the nose, eyes, furnishings, shoulder and pelvis are
   * detachable meshes.
   */
  private publishSculptRuntime(): void {
    this.root.name = `${this.visualBreed}-root`;
    this.root.userData.breedId = this.visualBreed;
    this.root.userData.coatId = this.appearance.id;
    this.root.userData.coatLabel = this.appearance.label;

    const entries: Array<[string, THREE.Group]> = [
      ['torso', this.body],
      ['ribcage', this.chest],
      ['pelvis', this.pelvis],
      ['neck', this.neck],
      ['head', this.head],
      ['ear-l', this.earL],
      ['ear-r', this.earR],
      ['tail-root', this.tailRoot],
      ['tail-flag', this.tailFlag],
      ['fore-leg-l', this.legU[0]],
      ['fore-leg-r', this.legU[1]],
      ['hind-leg-l', this.legU[2]],
      ['hind-leg-r', this.legU[3]],
      ['fore-lower-l', this.legL[0]],
      ['fore-lower-r', this.legL[1]],
      ['hind-lower-l', this.legL[2]],
      ['hind-lower-r', this.legL[3]],
      ['scapula-l', this.limbCarrier[0]],
      ['scapula-r', this.limbCarrier[1]],
      ['fore-carpus-l', this.legD[0]],
      ['fore-carpus-r', this.legD[1]],
      ['hind-hock-l', this.legD[2]],
      ['hind-hock-r', this.legD[3]],
      ['fore-paw-l', this.paws[0]],
      ['fore-paw-r', this.paws[1]],
      ['hind-paw-l', this.paws[2]],
      ['hind-paw-r', this.paws[3]],
    ];
    const nodes: Record<string, THREE.Object3D> = { root: this.root };
    const meshes: Record<string, THREE.Mesh> = {};
    for (const [id, group] of entries) {
      group.name = `${id}__pivot`;
      group.userData.sculptComponentId = id;
      nodes[id] = group;
      const mesh = group.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
      if (mesh) {
        mesh.name = id;
        mesh.userData.sculptComponentId = id;
        meshes[id] = mesh;
      }
    }
    for (let i = 0; i < this.pawTips.length; i++) {
      const id = i < 2 ? `fore-paw-${i === 0 ? 'l' : 'r'}` : `hind-paw-${i === 2 ? 'l' : 'r'}`;
      this.pawTips[i].name = `${id}__sole`;
      this.pawTips[i].userData.sculptComponentId = id;
      nodes[id] = this.paws[i];
      nodes[`${id}-sole`] = this.pawTips[i];
    }

    this.root.userData.sculptRuntime = {
      nodes,
      meshes,
      sockets: {
        withers: this.neck,
        poll: this.head,
        'ear-left': this.earL,
        'ear-right': this.earR,
        'tail-base': this.tailRoot,
        'tail-mid': this.tailFlag,
        'fore-left': this.limbCarrier[0],
        'fore-right': this.limbCarrier[1],
        'hip-left': this.limbCarrier[2],
        'hip-right': this.limbCarrier[3],
      },
      colliders: {
        torso: { type: 'capsule', scale: [0.24, 0.3, 0.66] },
        head: { type: 'capsule', scale: [0.11, 0.13, 0.29] },
      },
      destructionGroups: {},
      integralComponents: this.visualBreed === 'gsp'
        ? {
            torso: ['short-coat-ticking', 'coat-plates'],
            head: ['muzzle', 'nose', 'eye-l', 'eye-r'],
          }
        : {
            torso: ['belly-feather', 'belton-flecks'],
            head: ['muzzle', 'nose', 'eye-l', 'eye-r'],
            'hind-leg-l': ['hind-feather-l'],
            'hind-leg-r': ['hind-feather-r'],
          },
    };
  }

  /* ------------------------------- update ------------------------------ */

  update(ctx: Ctx, dt: number): void {
    const sd = this.hunt.dog(this.slot);
    // Capture advances the frozen sim in large explicit batches; its render
    // loop must show the exact latest snapshot. Live play interpolates the
    // adjacent 30 Hz snapshots using the engine alpha.
    if (this.frozen) this.hunt.dogWorld(this.posW, this.slot);
    else this.hunt.dogRenderWorld(ctx.fixedAlpha, this.posW, this.slot);
    const x = this.posW.x;
    const z = this.posW.z;
    const gy = this.terrain.heightAt(x, z);
    const snap = this.frozen;
    this.solveDt = dt;

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
    this.yaw = wrapAngle(this.yaw + dYaw * yawK);
    // Turn rate → lean into the turn (zeroed rigid when frozen/pointing).
    const rawRate = dt > 0 ? (dYaw * yawK) / dt : 0;
    this.yawRate = approach(this.yawRate, THREE.MathUtils.clamp(rawRate, -4, 4), 6, dt, snap);

    // Physical pace selects the footfall law. Hunt state remains an intent
    // overlay (track head-low, retrieve carriage, cover tail) instead of
    // forcing an impossible gait at the wrong world speed.
    const g = gait === 'run' || gait === 'trot' || gait === 'track' ? GAITS[gait] : GAITS.trot;
    const rawSpeed = dt > 1e-5 ? moved / dt : 0;
    this.speedMps = approach(this.speedMps, rawSpeed, 8, dt, snap);
    if (snap) {
      this.locomotionGait = this.reviewLocomotionGait ??
        (gait === 'run' ? 'gallop' : gait === 'trot' ? 'trot' : 'walk');
      this.pendingLocomotionGait = this.locomotionGait;
    } else if (moved > 1e-5) {
      this.pendingLocomotionGait = selectLocomotionGait(this.speedMps, this.locomotionGait);
    }
    if (Math.abs(this.yawRate) > 0.35) {
      this.pendingGallopLead = this.yawRate > 0 ? 'right' : 'left';
    }
    let strideScale = breedStrideScale(sd.profile.breed.motion, this.locomotionGait);
    const previousCycle = this.locomotionCycle;
    const nextCycle = advanceLocomotionCycle(
      this.locomotionCycle,
      moved,
      this.locomotionGait,
      strideScale,
    );
    const strideBoundary = crossedStrideBoundary(previousCycle, nextCycle, moved);
    this.locomotionCycle = nextCycle;
    if (!snap && strideBoundary) {
      if (this.pendingLocomotionGait !== this.locomotionGait) {
        this.locomotionGait = this.pendingLocomotionGait;
        this.gaitTransitionRemaining = 0.35;
      }
      if (this.pendingGallopLead !== this.gallopLead) {
        this.gallopLead = this.pendingGallopLead;
        this.gaitTransitionRemaining = Math.max(this.gaitTransitionRemaining, 0.3);
      }
      strideScale = breedStrideScale(sd.profile.breed.motion, this.locomotionGait);
    }
    this.gaitTransitionRemaining = Math.max(0, this.gaitTransitionRemaining - dt);
    this.phase = this.locomotionCycle * Math.PI * 2;

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
    let tFlight = 0;
    let tShoulderZ = 0;
    let tShoulderY = 0;
    let tHipZ = 0;
    let tHipY = 0;
    let tPelvisPitch = 0;
    let tPelvisRoll = 0;
    let tChestYaw = 0;
    let tPelvisYaw = 0;
    let tLoinPitch = 0;
    const tScapulaZ = [0, 0];
    const tScapulaPitch = [0, 0];
    let locomoting = false;
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
      tTailP = this.visualBreed === 'gsp'
        ? 0.16 // docked field tail: firm and just above horizontal
        : 1.45; // the raised Setter flag — near-vertical, proud of the grass
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
        tTailP = this.visualBreed === 'gsp' ? 0.18 : 0.55;
      } else if (sd.scentStage === 'locking') {
        // The shared sim gives the renderer a short settle before the point
        // becomes authoritative. Ease weight onto the forehand, raise the
        // flag and fold the pointing foreleg instead of snapping between two
        // unrelated still poses.
        const p = sd.scentProgress * sd.scentProgress * (3 - 2 * sd.scentProgress);
        const pointTail = this.visualBreed === 'gsp' ? 0.16 : 1.45;
        rate = 13;
        tBob = -0.006 * p;
        tPitch = 0.075 * p;
        tRoll = 0;
        tNeck = THREE.MathUtils.lerp(0.18, 0.48, p);
        tHeadP = THREE.MathUtils.lerp(0.02, 0.08 - 0.48 * 0.55, p);
        tTailP = THREE.MathUtils.lerp(this.visualBreed === 'gsp' ? 0.12 : 0.3, pointTail, p);
        tTailY = 0;
        tEar = 0.06 * p;
        tU[0] = THREE.MathUtils.lerp(NEUTRAL_U[0], 0.95, p);
        tL[0] = THREE.MathUtils.lerp(NEUTRAL_L[0], 1.9, p);
        tU[2] = tU[3] = THREE.MathUtils.lerp(NEUTRAL_U[2], -0.35, p);
        tL[2] = tL[3] = THREE.MathUtils.lerp(NEUTRAL_L[2], 0.22, p);
      } else if (sd.raptorDuty === 'guarding') {
        // Sphinx-like down stay: forelegs extended, hocks folded, head up.
        // Preserve the existing ground-contact correction and blend into it.
        rate = 4; tBob = -.28 + Math.sin(time * 2.0) * .002;
        tPitch = 0; tRoll = 0; tNeck = -.12; tHeadP = .04;
        tHeadY = Math.sin(time * .55) * .30; tTailP = -.35; tTailY = 0;
        tU[0] = tU[1] = 1.22; tL[0] = tL[1] = .05;
        tU[2] = tU[3] = -1.12; tL[2] = tL[3] = -2.3;
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
      // LOCOMOTION — explicit foot contacts and supported body motion.
      // Joint angles are solved from terrain-aware paw targets after the
      // body hierarchy is positioned below.
      const motion = writeLocomotionPose(
        this.locomotionGait,
        this.locomotionCycle,
        this.gallopLead,
        this.locomotion,
        strideScale,
      );
      const searchMotion = writeHuntMotionPose(
        sd.profile.breed.motion,
        state,
        gait,
        this.locomotionCycle,
        this.yawRate,
        this.huntMotion,
      );
      const verticalMotion = sd.profile.breed.motion.verticalMotion;
      locomoting = true;
      tBob = motion.bodyY * verticalMotion;
      tPitch = motion.chestPitch * verticalMotion;
      tPelvisPitch = motion.pelvisPitch * verticalMotion;
      tPelvisRoll = motion.pelvisRoll + searchMotion.pelvisRoll;
      tChestYaw = searchMotion.chestYaw;
      tPelvisYaw = searchMotion.pelvisYaw;
      tLoinPitch = motion.loinPitch * verticalMotion;
      tFlight = motion.flight;
      tScapulaZ[0] = motion.scapulaZ[0];
      tScapulaZ[1] = motion.scapulaZ[1];
      tScapulaPitch[0] = motion.scapulaPitch[0];
      tScapulaPitch[1] = motion.scapulaPitch[1];
      // Stabilized attentive head; faster motion lowers it only enough to
      // free the shoulder reach. The ears lag the chest instead of sharing
      // a metronomic bounce channel.
      tNeck = this.locomotionGait === 'gallop' ? 0.1 : this.locomotionGait === 'canter' ? 0.055 : 0;
      tHeadP = -tNeck * 0.55 - tPitch * 0.45;
      tHeadY = searchMotion.headYaw;
      tEar = -tPitch * 1.8 - motion.flight * 0.18;
      tTailP = this.locomotionGait === 'gallop' ? 0.04 : this.locomotionGait === 'canter' ? 0.03 : 0.02;
      tTailY =
        (snap ? 0 : THREE.MathUtils.clamp(-this.yawRate * 0.035, -0.12, 0.12)) +
        searchMotion.tailYaw;
      rate = this.locomotionGait === 'gallop' ? 18 : this.locomotionGait === 'canter' ? 16 : 14;
      if (this.gaitTransitionRemaining > 0) rate = Math.min(rate, 10);
      // Cover work: inside a sim patch the tail cracks HIGH and busy —
      // the flag over the bluestem is how the handler tracks the dog.
      if (state === 'quartering') {
        // A Setter's white flag is the handler's natural locator in tall
        // cover. Carry it above level even on the open cast; work inside a
        // patch raises it higher and adds the fast crack below.
        if (gait === 'run') {
          // At gallop the tail is also a counterweight: let the sampled
          // pitch stream behind the spine instead of pinning it upright.
          tTailP += 0.04;
        } else {
          tTailP = Math.max(tTailP, 0.1);
        }
        const patches = this.hunt.coverPatches();
        for (let i = 0; i < patches.length; i++) {
          const p = patches[i];
          if (Math.abs(x - p.cx) < p.hx && Math.abs(z - p.cz) < p.hz) {
            if (gait === 'run') {
              tTailP += 0.03;
              tTailY += snap ? 0 : Math.sin(time * 8) * 0.06;
            } else {
              tTailP = 0.16;
              tTailY = snap ? 0 : Math.sin(time * 8) * 0.1;
            }
            break;
          }
        }
      }
      if (state === 'tracking' && sd.scentStage === 'locating') {
        // Tightening casts: attentive head rides slightly above the back and
        // counter-scans while the body follows the real lateral scent path.
        const p = sd.scentProgress;
        const freedom = sd.profile.breed.motion.headFreedom;
        tNeck = THREE.MathUtils.lerp(-0.08, 0.1, p);
        tHeadP = 0.04 - tNeck * 0.55;
        tHeadY += Math.sin(p * Math.PI * 3.4) * (1 - p) * 0.16 * freedom;
        tTailP = this.visualBreed === 'gsp' ? 0.13 : 0.24;
        tTailY += Math.sin(p * Math.PI * 3.4 + Math.PI) * 0.08 * sd.profile.breed.motion.tailAction;
      } else if (state === 'tracking' && sd.scentStage === 'stalking') {
        // Confidence turns into a controlled crouch. The topline stays firm;
        // neck reach, forehand weight and a quieting tail carry the intent.
        const p = sd.scentProgress;
        tBob -= 0.012 + p * 0.018;
        tPitch += 0.018 + p * 0.042;
        tNeck = 0.2 + p * 0.22;
        tHeadP = 0.05 - tNeck * 0.55;
        tTailP = THREE.MathUtils.lerp(
          this.visualBreed === 'gsp' ? 0.12 : 0.3,
          this.visualBreed === 'gsp' ? 0.16 : 0.72,
          p,
        );
        tTailY *= 1 - p * 0.8;
      }
      if (state === 'retrieving') {
        // Head-low carry/approach on the fetch.
        tNeck = 0.85;
        tHeadP = 0.15 - 0.85 * 0.55;
        tTailP = 0.15;
      }
      if (gait === 'track' && sd.scentStage !== 'stalking') tBob -= 0.03;
    }

    // img2threejs conformation evidence needs a neutral, load-bearing
    // stance rather than an arbitrary gait phase. This override exists
    // only behind the capture audit and leaves the live animation law
    // untouched; all four limbs use their authored neutral joint angles.
    if (this.reviewNeutral) {
      for (let i = 0; i < 4; i++) {
        tU[i] = NEUTRAL_U[i];
        tL[i] = NEUTRAL_L[i];
      }
      tBob = 0;
      tPitch = 0;
      tRoll = 0;
      tNeck = 0;
      tHeadP = 0;
      tHeadY = 0;
      tTailP = 0;
      tTailY = 0;
      tEar = 0;
      tFlight = 0;
      tShoulderZ = 0;
      tShoulderY = 0;
      tHipZ = 0;
      tHipY = 0;
      tPelvisPitch = 0;
      tPelvisRoll = 0;
      tChestYaw = 0;
      tPelvisYaw = 0;
      tLoinPitch = 0;
      tScapulaZ[0] = tScapulaZ[1] = 0;
      tScapulaPitch[0] = tScapulaPitch[1] = 0;
      locomoting = false;
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
    this.flight = approach(this.flight, tFlight, rate + 6, dt, snap);
    this.shoulderZ = approach(this.shoulderZ, tShoulderZ, rate + 2, dt, snap);
    this.shoulderY = approach(this.shoulderY, tShoulderY, rate + 2, dt, snap);
    this.hipZ = approach(this.hipZ, tHipZ, rate + 2, dt, snap);
    this.hipY = approach(this.hipY, tHipY, rate + 2, dt, snap);
    this.pelvisPitch = approach(this.pelvisPitch, tPelvisPitch, rate + 2, dt, snap);
    this.pelvisRoll = approach(this.pelvisRoll, tPelvisRoll, rate + 2, dt, snap);
    this.chestYaw = approach(this.chestYaw, tChestYaw, rate + 2, dt, snap);
    this.pelvisYaw = approach(this.pelvisYaw, tPelvisYaw, rate + 2, dt, snap);
    this.loinPitch = approach(this.loinPitch, tLoinPitch, rate + 2, dt, snap);
    for (let side = 0; side < 2; side++) {
      this.scapulaZ[side] = approach(this.scapulaZ[side], tScapulaZ[side], rate + 4, dt, snap);
      this.scapulaPitch[side] = approach(
        this.scapulaPitch[side],
        tScapulaPitch[side],
        rate + 4,
        dt,
        snap,
      );
    }
    // Cover parting: wider on point so the frozen silhouette stands in a
    // real window instead of white-shard soup (bug 4); grass polls this
    // via partingPoint() every frame.
    this.partR = approach(this.partR, pointing ? 2.4 : 1.7, 6, dt, snap);
    for (let i = 0; i < 4; i++) {
      this.uAng[i] = approach(this.uAng[i], tU[i], rate + 4, dt, snap);
      this.lAng[i] = approach(this.lAng[i], tL[i], rate + 4, dt, snap);
      if (!locomoting) {
        this.legU[i].rotation.x = -this.uAng[i];
        this.legU[i].rotation.z = 0;
        this.legL[i].rotation.x = this.lAng[i];
        this.legD[i].rotation.x = 0;
        this.paws[i].rotation.x = 0;
        this.footLocked[i] = false;
        this.releaseT[i] = 1;
        this.priorContact[i] = 'swing';
      }
    }

    // Full pose FIRST, then measure: planting reads the real paw markers
    // through the real transform chain, so bob, crouch, body pitch, slope
    // pitch/roll and folded joints all count. (Mechanic round, bug 3: the
    // old two-cosine estimate ignored every body transform — on point it
    // buried the standing fore 5 cm and floated both hinds.)
    if (locomoting) this.groundOffset = approach(this.groundOffset, 0, 24, dt, snap);
    this.root.position.set(x, gy + (locomoting ? this.groundOffset : 0), z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(this.slopePitch, this.yaw, this.slopeRoll);
    this.body.position.y = this.bob;
    this.body.rotation.set(this.bodyPitch, 0, this.roll);
    this.body.scale.set(1, 1, 1);
    this.chest.rotation.y = this.chestYaw;
    // The pelvis is authored as an absolute supported pitch. Convert it to
    // a relative loin rotation because the body root already carries the
    // ribcage pitch.
    this.pelvis.rotation.set(
      this.pelvisPitch + this.loinPitch - this.bodyPitch,
      this.pelvisYaw,
      this.pelvisRoll,
    );
    // Independent scapular carriers glide along and rotate against the
    // ribcage. Hinds remain socketed in the moving pelvis.
    for (let i = 0; i < 4; i++) {
      const fore = i < 2;
      const side = i % 2 === 0 ? -1 : 1;
      this.limbCarrier[i].position.set(
        side * (fore ? FORE_X : HIND_X),
        fore ? FORE_Y + this.shoulderY : HIND_Y - PELVIS_PIVOT[1] + this.hipY,
        fore
          ? FORE_Z + this.shoulderZ + this.scapulaZ[i]
          : HIND_Z - PELVIS_PIVOT[2] + this.hipZ,
      );
      this.limbCarrier[i].rotation.x = fore ? this.scapulaPitch[i] : 0;
    }
    this.neck.position.set(
      NECK_PIVOT[0],
      NECK_PIVOT[1] + this.shoulderY * 0.35,
      NECK_PIVOT[2] + this.shoulderZ * 0.55,
    );
    this.tailRoot.position.set(
      TAIL_PIVOT[0] - PELVIS_PIVOT[0],
      TAIL_PIVOT[1] - PELVIS_PIVOT[1] + this.hipY * 0.35,
      TAIL_PIVOT[2] - PELVIS_PIVOT[2] + this.hipZ * 0.4,
    );
    this.neck.rotation.x = this.neckPitch;
    this.head.rotation.set(this.headPitch, this.headYaw, 0);
    // Carriage splits across root and flag joints (round 9): 45% at the
    // hip, 55% at the mid-tail joint — the raised flag curves, no kink.
    this.tailRoot.rotation.set(this.tailPitch * 0.45, this.tailYaw * 0.4, 0);
    this.tailFlag.rotation.set(this.tailPitch * 0.55, this.tailYaw * 0.6, 0);
    this.earL.rotation.x = this.earFlop;
    this.earR.rotation.x = this.earFlop * 0.86 - this.yawRate * 0.008;

    if (locomoting) this.solveLocomotionLegs();
    this.root.updateMatrixWorld(true);

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
    // Adult-scale geometry needs the full measured correction; the former
    // narrow clamp buried a scaled dog below the sward.
    sink = THREE.MathUtils.clamp(sink, -0.18, 0.24);
    // A real gallop has two periods with no supporting paw. The previous
    // unconditional correction dragged the body down until one folded paw
    // touched, visually deleting both suspension phases. Blend the planting
    // correction out while airborne; bob + folded limbs then carry the dog
    // cleanly over the terrain before support returns.
    // Locomotion feet solve to explicit terrain targets and stance locks;
    // moving the whole torso afterward would break those contacts. Static
    // poses keep the exact legacy grounding correction.
    if (!locomoting) {
      this.groundOffset = approach(this.groundOffset, -sink, 24, dt, snap);
      this.root.position.y = gy + this.groundOffset;
    }
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
      const tailReach = this.visualBreed === 'gsp' ? 0.17 : 0.47;
      const lift = Math.asin(Math.min(1, -tipGap / tailReach));
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
    this.markingMat?.dispose();
    this.markingMat = undefined;
    this.shadowGeo?.dispose();
    this.shadowGeo = undefined;
    this.shadowMat?.dispose();
    this.shadowMat = undefined;
  }
}
