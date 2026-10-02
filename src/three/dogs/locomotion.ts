/**
 * Contact-first locomotion for the low-poly bird dog.
 *
 * The sampler describes feet and supported body motion, not Three.js
 * joints. The renderer may lock stance targets in world space and solve
 * the rig with IK while tests can inspect the gait without a scene.
 */

const TAU = Math.PI * 2;

/** 'bound' is chosen by the renderer, not by speed: the leaping gait of a
 * dog porpoising through cover taller than its back. */
export type LocomotionGait = 'walk' | 'trot' | 'canter' | 'gallop' | 'bound';
export type GallopLead = 'left' | 'right';
export type FootContact = 'swing' | 'touchdown' | 'stance' | 'toeoff';

/** FL, FR, HL, HR. */
export type FootTuple<T> = [T, T, T, T];

export interface FootPose {
  /** Phase since this paw's touchdown, normalized to one stride. */
  phase: number;
  contact: FootContact;
  /** Normalized support contribution. Zero during swing. */
  load: number;
  /** Normalized progress through stance. Zero during swing. */
  stance: number;
  /** Normalized progress through swing. Zero during stance. */
  swing: number;
  /** Paw target along the nose-to-tail axis, relative to its carrier. */
  z: number;
  /** Paw clearance above its terrain target. */
  lift: number;
  /** Desired sole pitch in body-local radians. */
  solePitch: number;
}

export interface LocomotionPose {
  gait: LocomotionGait;
  cycle: number;
  stride: number;
  feet: FootTuple<FootPose>;
  /** 0 when any foot supports the dog; 1 in a suspension interval. */
  flight: number;
  /** A bound's leap: 0 on the ground rising to 1 at the top of the arc. */
  rise: number;
  bodyY: number;
  chestPitch: number;
  pelvisPitch: number;
  pelvisRoll: number;
  loinPitch: number;
  /** Left/right shoulder-blade travel along the ribcage. */
  scapulaZ: [number, number];
  scapulaPitch: [number, number];
}

interface GaitSpec {
  stride: number;
  touchdown: FootTuple<number>;
  duty: FootTuple<number>;
  reachFront: FootTuple<number>;
  lift: FootTuple<number>;
  /** Share of each swing a paw stays trailing before it comes forward. */
  trail?: FootTuple<number>;
}

const WALK: GaitSpec = {
  stride: 0.72,
  // Lateral sequence: HL -> FL -> HR -> FR.
  touchdown: [0.25, 0.75, 0, 0.5],
  duty: [0.62, 0.62, 0.64, 0.64],
  reachFront: [0.17, 0.17, 0.13, 0.13],
  lift: [0.055, 0.055, 0.065, 0.065],
};

const TROT: GaitSpec = {
  stride: 0.94,
  // Diagonal pairs: FL+HR, then FR+HL.
  touchdown: [0, 0.5, 0.5, 0],
  duty: [0.43, 0.43, 0.43, 0.43],
  reachFront: [0.21, 0.21, 0.17, 0.17],
  lift: [0.075, 0.075, 0.085, 0.085],
};

const CANTER_LEFT: GaitSpec = {
  stride: 1.38,
  // Three beats plus suspension: trailing hind, diagonal pair, lead fore.
  // Left lead: HR -> HL+FR -> FL.
  touchdown: [0.54, 0.27, 0.27, 0],
  duty: [0.3, 0.33, 0.33, 0.32],
  reachFront: [0.235, 0.225, 0.17, 0.17],
  lift: [0.08, 0.08, 0.105, 0.105],
};

const CANTER_RIGHT: GaitSpec = {
  ...CANTER_LEFT,
  touchdown: [0.27, 0.54, 0, 0.27],
};

const GALLOP_LEFT: GaitSpec = {
  // Reference-calibrated against Rudi's slow-motion Setter pass: the dog
  // spends much more of the cycle in a long fore/aft silhouette than the
  // original compact 1.48 m stride allowed.
  stride: 1.9,
  // Transverse field gallop: trailing hind, lead hind, trailing fore,
  // lead fore. The measured fore/hind separations are deliberately clear.
  touchdown: [0.59, 0.5, 0.26, 0],
  duty: [0.21, 0.21, 0.2, 0.2],
  reachFront: [0.26, 0.26, 0.2, 0.2],
  // Fore paws skim and fold; excessive vertical clearance reads as a
  // high-stepping horse at this low-poly scale. The hocks need more room.
  lift: [0.09, 0.09, 0.135, 0.135],
};

const GALLOP_RIGHT: GaitSpec = {
  ...GALLOP_LEFT,
  touchdown: [0.5, 0.59, 0, 0.26],
};

/** Ground a bound covers on its feet (m): the fores sweep, then the hinds. */
const BOUND_GROUND_M = 0.9;
/** The reference bound: a 2.8 m stride, two thirds of it in the air. */
export const BOUND_STRIDE = 2.8;

/** Porpoising through tall cover: both hinds drive off together, a long leap
 * with the forelegs tucked, the fores land almost as a pair and the hinds land
 * under them as they lift, to drive again. The cycle starts at take-off. Each
 * pair sweeps no further than a gallop stance however long the leap, so a
 * longer stride is all flight. */
function boundSpec(stride: number): GaitSpec {
  const flight = stride - BOUND_GROUND_M;
  return {
    stride,
    touchdown: [flight / stride, (flight + 0.056) / stride, (flight + 0.42) / stride, (flight + 0.45) / stride],
    duty: [0.42 / stride, 0.42 / stride, 0.45 / stride, 0.45 / stride],
    reachFront: [0.3, 0.3, 0.26, 0.26],
    lift: [0.14, 0.14, 0.1, 0.1],
    // The hinds stream out behind off the drive and only swing under the
    // body as the fores land.
    trail: [0, 0, 0.45, 0.45],
  };
}

/** Share of a bound of this stride spent in the air, from the push-off. */
export function boundFlight(stride: number): number {
  return 1 - BOUND_GROUND_M / stride;
}

/** The stride of a ballistic leap of this height at this speed (m, m/s). */
export function boundStride(height: number, speed: number): number {
  const airborne = 2 * Math.sqrt(2 * Math.max(0, height) / 9.81);
  return Math.min(5.5, Math.max(2.1, speed * airborne + BOUND_GROUND_M));
}

function foot(): FootPose {
  return { phase: 0, contact: 'swing', load: 0, stance: 0, swing: 0, z: 0, lift: 0, solePitch: 0 };
}

export function createLocomotionPose(): LocomotionPose {
  return {
    gait: 'walk',
    cycle: 0,
    stride: WALK.stride,
    feet: [foot(), foot(), foot(), foot()],
    flight: 0,
    rise: 0,
    bodyY: 0,
    chestPitch: 0,
    pelvisPitch: 0,
    pelvisRoll: 0,
    loinPitch: 0,
    scapulaZ: [0, 0],
    scapulaPitch: [0, 0],
  };
}

export function wrapCycle(value: number): number {
  return ((value % 1) + 1) % 1;
}

export interface LocomotionSpeedThresholds {
  walkToTrot: number;
  trotToWalk: number;
  trotToCanter: number;
  canterToTrot: number;
  canterToGallop: number;
  gallopToCanter: number;
}

const DEFAULT_SPEED_THRESHOLDS: LocomotionSpeedThresholds = {
  walkToTrot: 1.75, trotToWalk: 1.45,
  trotToCanter: 3.15, canterToTrot: 2.75,
  canterToGallop: 4.85, gallopToCanter: 4.35,
};

/** Physical pace chooses the footfall law; breed-specific bands may differ. */
export function selectLocomotionGait(
  speedMps: number,
  current: LocomotionGait,
  thresholds: LocomotionSpeedThresholds = DEFAULT_SPEED_THRESHOLDS,
): LocomotionGait {
  // Hysteresis keeps noisy render-speed estimates from switching gait at a
  // threshold every other frame. Out of a bound, speed alone decides.
  if (current === 'bound') current = 'canter';
  if (current === 'gallop') {
    return speedMps >= thresholds.gallopToCanter ? 'gallop' : 'canter';
  }
  if (current === 'canter') {
    if (speedMps >= thresholds.canterToGallop) return 'gallop';
    if (speedMps >= thresholds.canterToTrot) return 'canter';
    return speedMps < thresholds.trotToWalk ? 'walk' : 'trot';
  }
  if (current === 'walk') {
    return speedMps >= thresholds.walkToTrot ? 'trot' : 'walk';
  }
  if (speedMps >= thresholds.canterToGallop) return 'gallop';
  if (speedMps >= thresholds.trotToCanter) return 'canter';
  return speedMps < thresholds.trotToWalk ? 'walk' : 'trot';
}

export function strideLength(gait: LocomotionGait, strideScale = 1): number {
  if (gait === 'walk') return WALK.stride * strideScale;
  if (gait === 'trot') return TROT.stride * strideScale;
  if (gait === 'canter') return CANTER_LEFT.stride * strideScale;
  if (gait === 'bound') return BOUND_STRIDE * strideScale;
  return GALLOP_LEFT.stride * strideScale;
}

export function advanceLocomotionCycle(
  cycle: number,
  distance: number,
  gait: LocomotionGait,
  strideScale = 1,
): number {
  if (distance <= 0) return wrapCycle(cycle);
  return wrapCycle(cycle + distance / strideLength(gait, strideScale));
}

/** A queued gait/lead change commits only as a stride wraps at touchdown. */
export function crossedStrideBoundary(previousCycle: number, nextCycle: number, distance: number): boolean {
  return distance > 0 && nextCycle < previousCycle;
}

/**
 * Absolute fore-pastern angle from vertical-down. A planted canine foreleg
 * carries the wrist nearly straight; during recovery the carpus folds the
 * paw back under the chest before opening again for contact. Keeping this
 * law beside the foot trajectory makes both ends of swing continuous and
 * lets the Three.js rig add articulation without changing the gait timing.
 */
export function foreCarpusPitch(gait: LocomotionGait, footPose: FootPose): number {
  const supportPitch = -0.055;
  if (footPose.contact !== 'swing') return supportPitch;
  const peakFold = gait === 'gallop' || gait === 'bound' ? 0.5 : gait === 'canter' ? 0.42 : gait === 'trot' ? 0.34 : 0.24;
  return supportPitch - peakFold * Math.pow(Math.sin(Math.PI * footPose.swing), 1.4);
}

function smooth01(t: number): number {
  return t * t * (3 - 2 * t);
}

function circularPulse(cycle: number, center: number, halfWidth: number): number {
  let d = Math.abs(wrapCycle(cycle) - center);
  d = Math.min(d, 1 - d);
  const x = Math.max(0, 1 - d / halfWidth);
  return x * x * (3 - 2 * x);
}

function writeFoot(cycle: number, i: number, spec: GaitSpec, stride: number, out: FootPose, touchdown = spec.touchdown): void {
  const phase = wrapCycle(cycle - touchdown[i]);
  const duty = spec.duty[i];
  const front = spec.reachFront[i];
  // The stance target travels backward by exactly the distance the root
  // covers during this foot's duty interval. A world lock replaces this
  // local approximation in the renderer, but keeping the law coherent
  // makes captures and fallback poses non-slipping too.
  const back = front - stride * duty;
  out.phase = phase;

  if (phase < duty) {
    const p = phase / duty;
    out.contact = p < 0.12 ? 'touchdown' : p > 0.82 ? 'toeoff' : 'stance';
    out.load = Math.pow(Math.sin(Math.PI * p), 0.7);
    out.stance = p;
    out.swing = 0;
    out.z = front + (back - front) * p;
    out.lift = 0;
    const toeRoll = smooth01(Math.max(0, Math.min(1, (p - 0.78) / 0.22)));
    out.solePitch = -0.1 * toeRoll;
    return;
  }

  const p = (phase - duty) / (1 - duty);
  const trail = spec.trail?.[i] ?? 0;
  const travel = smooth01(trail > 0 ? Math.max(0, (p - trail) / (1 - trail)) : p);
  out.contact = 'swing';
  out.load = 0;
  out.stance = 0;
  out.swing = p;
  if (stride > 1.5 && i < 2) {
    // A running paw does not travel forward until it hits an invisible
    // wall. It reaches a little past touchdown, then sweeps caudally into
    // contact. The non-zero backward velocity at p=1 softens the stance
    // lock and removes the alternating front-foot stamp.
    const maxReachP = 0.88;
    const overreach = 0.035;
    if (p < maxReachP) {
      out.z = back + (front + overreach - back) * smooth01(p / maxReachP);
    } else {
      const settle = (p - maxReachP) / (1 - maxReachP);
      const settle2 = settle * settle;
      const settle3 = settle2 * settle;
      // Cubic Hermite settle: zero velocity at maximum reach, then a
      // touchdown tangent that exactly cancels the root's forward travel.
      // The paw therefore enters its stance lock already stationary in
      // world space instead of being stopped abruptly like a stamping hoof.
      const h00 = 2 * settle3 - 3 * settle2 + 1;
      const h01 = -2 * settle3 + 3 * settle2;
      const h11 = settle3 - settle2;
      const touchdownTangent = -stride * (1 - duty) * (1 - maxReachP);
      out.z =
        h00 * (front + overreach) +
        h01 * front +
        h11 * touchdownTangent;
    }
  } else {
    out.z = back + (front - back) * travel;
  }
  // Quick clearance after toe-off, then a flatter approach to touchdown.
  const liftExponent = stride > 1.5 && i < 2 ? 2.8 : 1.35;
  out.lift = spec.lift[i] * Math.pow(Math.sin(Math.PI * p), liftExponent);
  if (p < 0.5) {
    out.solePitch = -0.1 * (1 - smooth01(p / 0.5));
  } else {
    const settle = smooth01((p - 0.5) / 0.5);
    out.solePitch = 0.02 * Math.sin(Math.PI * settle);
  }
}

export function writeLocomotionPose(
  gait: LocomotionGait,
  cycle: number,
  lead: GallopLead,
  out: LocomotionPose,
  strideScale = 1,
  touchdown?: FootTuple<number>,
): LocomotionPose {
  const c = wrapCycle(cycle);
  const spec = gait === 'walk'
    ? WALK
    : gait === 'trot'
      ? TROT
      : gait === 'canter'
        ? lead === 'left' ? CANTER_LEFT : CANTER_RIGHT
        : gait === 'bound' ? boundSpec(BOUND_STRIDE * strideScale)
          : lead === 'left' ? GALLOP_LEFT : GALLOP_RIGHT;
  out.gait = gait;
  out.cycle = c;
  // A bound's spec is already built at its stride.
  const stride = gait === 'bound' ? spec.stride : spec.stride * strideScale;
  out.stride = stride;

  let supported = false;
  for (let i = 0; i < 4; i++) {
    writeFoot(c, i, spec, stride, out.feet[i], touchdown);
    if (out.feet[i].contact !== 'swing') supported = true;
  }
  out.flight = supported ? 0 : 1;
  // The leap is a ballistic arc from push-off to the fore landing.
  const flight = gait === 'bound' ? boundFlight(stride) : 0;
  const leap = gait === 'bound' && c < flight ? c / flight : -1;
  out.rise = leap < 0 ? 0 : 4 * leap * (1 - leap);

  if (gait === 'walk') {
    // Two restrained COM rises per stride. Pelvis/scapula carry most of
    // the visible weight transfer while the ribcage remains composed.
    out.bodyY = 0.004 * Math.cos(c * TAU * 2);
    out.chestPitch = 0.008 * Math.sin(c * TAU * 2);
    out.pelvisPitch = 0.035 * Math.sin(c * TAU * 2 + 0.45);
    out.pelvisRoll = 0.045 * Math.sin(c * TAU);
    out.loinPitch = 0.012 * Math.sin(c * TAU * 2 + 0.2);
  } else if (gait === 'trot') {
    out.bodyY = 0.006 * Math.cos(c * TAU * 2);
    out.chestPitch = 0.006 * Math.sin(c * TAU * 2);
    out.pelvisPitch = 0.03 * Math.sin(c * TAU * 2 + 0.35);
    out.pelvisRoll = 0.025 * Math.sin(c * TAU);
    out.loinPitch = 0.01 * Math.sin(c * TAU * 2 + 0.2);
  } else if (gait === 'canter') {
    const gathered = circularPulse(c, 0.91, 0.2);
    const extended = circularPulse(c, 0.46, 0.21);
    out.bodyY = 0.004 + out.flight * 0.008 - (1 - out.flight) * 0.002;
    out.chestPitch = 0.016 * gathered - 0.022 * extended;
    out.pelvisPitch = -0.055 * gathered + 0.04 * extended;
    out.pelvisRoll = (lead === 'left' ? 1 : -1) * 0.016 * Math.sin(c * TAU);
    out.loinPitch = 0.12 * gathered - 0.085 * extended;
  } else if (gait === 'bound') {
    // Nose up off the drive, level over the top, nose down onto the fores,
    // then the hinds gather under for the next drive.
    const air = leap;
    const ground = air < 0 ? (c - flight) / (1 - flight) : 0;
    out.bodyY = 0;
    out.chestPitch = air >= 0 ? -0.2 * Math.cos(Math.PI * air) : 0.2 * Math.cos(Math.PI * ground);
    out.pelvisPitch = 0;
    out.pelvisRoll = 0;
    out.loinPitch = air >= 0 ? -0.12 * Math.sin(Math.PI * air) : 0.2 * Math.sin(Math.PI * ground);
  } else {
    // One caudal-lumbar gather/extend wave. The ribcage pitch is restrained;
    // most of the action belongs to the loin and pelvis.
    const gathered = circularPulse(c, 0.91, 0.18);
    const extended = circularPulse(c, 0.46, 0.19);
    out.bodyY = 0.006 + out.flight * 0.012 - (1 - out.flight) * 0.004;
    out.chestPitch = 0.025 * gathered - 0.035 * extended;
    out.pelvisPitch = -0.095 * gathered + 0.07 * extended;
    out.pelvisRoll = (lead === 'left' ? 1 : -1) * 0.018 * Math.sin(c * TAU);
    out.loinPitch = 0.22 * gathered - 0.16 * extended;
  }

  // Scapular travel follows each fore paw rather than one shared body key.
  for (let side = 0; side < 2; side++) {
    const f = out.feet[side];
    out.scapulaZ[side] = f.z * 0.16;
    out.scapulaPitch[side] = f.contact === 'swing'
      ? 0.08 - smooth01(f.swing) * 0.16
      : -0.08 + smooth01(f.stance) * 0.16;
  }
  return out;
}
