/**
 * Contact-first locomotion for the low-poly bird dog.
 *
 * The sampler describes feet and supported body motion, not Three.js
 * joints. The renderer may lock stance targets in world space and solve
 * the rig with IK while tests can inspect the gait without a scene.
 */

const TAU = Math.PI * 2;

export type LocomotionGait = 'walk' | 'trot' | 'canter' | 'gallop';
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

/** Physical pace chooses the footfall law; hunt state is layered elsewhere. */
export function selectLocomotionGait(speedMps: number, current: LocomotionGait): LocomotionGait {
  // Hysteresis keeps noisy render-speed estimates from switching gait at a
  // threshold every other frame.
  if (current === 'gallop') {
    return speedMps >= 4.35 ? 'gallop' : 'canter';
  }
  if (current === 'canter') {
    if (speedMps >= 4.85) return 'gallop';
    if (speedMps >= 2.75) return 'canter';
    return speedMps < 1.45 ? 'walk' : 'trot';
  }
  if (current === 'walk') {
    return speedMps >= 1.75 ? 'trot' : 'walk';
  }
  if (speedMps >= 4.85) return 'gallop';
  if (speedMps >= 3.15) return 'canter';
  return speedMps < 1.45 ? 'walk' : 'trot';
}

export function strideLength(gait: LocomotionGait, strideScale = 1): number {
  if (gait === 'walk') return WALK.stride * strideScale;
  if (gait === 'trot') return TROT.stride * strideScale;
  if (gait === 'canter') return CANTER_LEFT.stride * strideScale;
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
  const peakFold = gait === 'gallop' ? 0.5 : gait === 'canter' ? 0.42 : gait === 'trot' ? 0.34 : 0.24;
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

function writeFoot(cycle: number, i: number, spec: GaitSpec, stride: number, out: FootPose): void {
  const phase = wrapCycle(cycle - spec.touchdown[i]);
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
  const travel = smooth01(p);
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
): LocomotionPose {
  const c = wrapCycle(cycle);
  const spec = gait === 'walk'
    ? WALK
    : gait === 'trot'
      ? TROT
      : gait === 'canter'
        ? lead === 'left' ? CANTER_LEFT : CANTER_RIGHT
        : lead === 'left' ? GALLOP_LEFT : GALLOP_RIGHT;
  out.gait = gait;
  out.cycle = c;
  const stride = spec.stride * strideScale;
  out.stride = stride;

  let supported = false;
  for (let i = 0; i < 4; i++) {
    writeFoot(c, i, spec, stride, out.feet[i]);
    if (out.feet[i].contact !== 'swing') supported = true;
  }
  out.flight = supported ? 0 : 1;

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
