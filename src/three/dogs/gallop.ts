/**
 * Distance-driven transverse gallop for the low-poly bird dog.
 *
 * One cycle moves through gather -> rear contact/drive -> extended flight ->
 * fore contact/drive -> gathered flight. `writeGallopPose` writes into a
 * caller-owned object so the render loop performs no allocations.
 */

const TAU = Math.PI * 2;

export interface GallopPose {
  /** FL, FR, HL, HR upper-joint angles; positive reaches toward the nose. */
  upper: [number, number, number, number];
  /** FL, FR, HL, HR lower-joint folds; positive tucks the paw. */
  lower: [number, number, number, number];
  cycle: number;
  bob: number;
  pitch: number;
  roll: number;
  stretch: number;
  /** Shoulder and hip recoil along the dog's nose-to-tail axis (meters). */
  shoulderZ: number;
  hipZ: number;
  /** Small independent girdle lifts keep weight transfer out of the torso. */
  shoulderY: number;
  hipY: number;
  neck: number;
  head: number;
  ear: number;
  tail: number;
  /** 0 = supported stride, 1 = airborne; drives the terrain planting blend. */
  flight: number;
}

export function createGallopPose(): GallopPose {
  return {
    upper: [0, 0, 0, 0],
    lower: [0, 0, 0, 0],
    cycle: 0,
    bob: 0,
    pitch: 0,
    roll: 0,
    stretch: 1,
    shoulderZ: 0,
    hipZ: 0,
    shoulderY: 0,
    hipY: 0,
    neck: 0,
    head: 0,
    ear: 0,
    tail: 0.42,
    flight: 0,
  };
}

// Eight equally spaced keys. Smooth interpolation preserves clear contacts
// without the robotic reversals of a triangle wave.
const FORE_UPPER = [-0.48, -0.36, 0.2, 0.95, 0.55, -0.28, -0.7, -0.52] as const;
const FORE_LOWER = [1.15, 0.98, 0.68, 0.28, 0.22, 0.3, 0.82, 1.35] as const;
const HIND_UPPER = [0.58, 0.4, -0.48, -0.82, -0.4, 0.2, 0.64, 0.72] as const;
const HIND_LOWER = [1.25, 1.0, 0.22, 0.34, 0.82, 1.1, 1.32, 1.42] as const;
// The back travels mostly forward. Weight transfer lives in the independently
// sliding girdles below; only 3.2 cm of residual torso rise remains.
const BODY_BOB = [0.004, -0.006, -0.004, 0.01, 0.002, -0.006, -0.003, 0.009] as const;
const BODY_PITCH = [0.01, -0.015, -0.04, -0.02, 0.035, 0.045, 0.018, 0.005] as const;
const BODY_STRETCH = [0.985, 0.99, 1.015, 1.025, 1.012, 0.99, 0.975, 0.97] as const;
const SHOULDER_Z = [-0.018, -0.012, 0.008, 0.025, 0.018, 0, -0.02, -0.025] as const;
const HIP_Z = [0.03, 0.018, -0.015, -0.032, -0.02, 0.005, 0.025, 0.035] as const;
const SHOULDER_Y = [0.006, 0.002, 0.006, 0.012, -0.015, -0.01, 0.002, 0.009] as const;
const HIP_Y = [-0.006, -0.018, -0.008, 0.01, 0.012, 0.006, -0.01, 0.004] as const;
const NECK = [0.13, 0.1, 0.05, 0, 0.03, 0.1, 0.18, 0.2] as const;
const EAR = [0.08, -0.03, -0.12, 0.12, -0.05, -0.1, 0.06, 0.16] as const;

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

function sample(track: readonly number[], cycle: number): number {
  const x = wrap01(cycle) * track.length;
  const i = Math.floor(x);
  const t = x - i;
  // Cubic smoothstep gives each footfall a brief readable hold.
  const k = t * t * (3 - 2 * t);
  return track[i] + (track[(i + 1) % track.length] - track[i]) * k;
}

function circularPulse(cycle: number, center: number, halfWidth: number): number {
  let d = Math.abs(wrap01(cycle) - center);
  d = Math.min(d, 1 - d);
  const x = Math.max(0, 1 - d / halfWidth);
  return x * x * (3 - 2 * x);
}

export function writeGallopPose(phaseRadians: number, out: GallopPose): GallopPose {
  const cycle = wrap01(phaseRadians / TAU);
  out.cycle = cycle;

  // A transverse gallop is deliberately asymmetric. The leading fore and
  // trailing hind arrive a fraction apart instead of moving as paired skis.
  out.upper[0] = sample(FORE_UPPER, cycle + 0.018);
  out.upper[1] = sample(FORE_UPPER, cycle - 0.018);
  out.upper[2] = sample(HIND_UPPER, cycle - 0.022);
  out.upper[3] = sample(HIND_UPPER, cycle + 0.022);
  out.lower[0] = sample(FORE_LOWER, cycle + 0.018);
  out.lower[1] = sample(FORE_LOWER, cycle - 0.018);
  out.lower[2] = sample(HIND_LOWER, cycle - 0.022);
  out.lower[3] = sample(HIND_LOWER, cycle + 0.022);

  out.bob = sample(BODY_BOB, cycle);
  out.pitch = sample(BODY_PITCH, cycle);
  out.roll = Math.sin(cycle * TAU) * 0.024;
  out.stretch = sample(BODY_STRETCH, cycle);
  out.shoulderZ = sample(SHOULDER_Z, cycle);
  out.hipZ = sample(HIP_Z, cycle);
  out.shoulderY = sample(SHOULDER_Y, cycle);
  out.hipY = sample(HIP_Y, cycle);
  out.neck = sample(NECK, cycle);
  // Counter-rotate the head so the eyes stay on the line of travel while
  // the neck and body absorb the stride.
  out.head = -out.neck * 0.62 - out.pitch * 0.35;
  out.ear = sample(EAR, cycle);
  out.tail = 0.42 - out.pitch * 0.8;

  // Canine double suspension: one long, extended flight after rear drive
  // and a shorter gathered flight after the forequarters push away.
  out.flight = Math.max(
    circularPulse(cycle, 0.39, 0.09),
    circularPulse(cycle, 0.86, 0.075),
  );
  return out;
}

/** Root correction from the terrain contact solver during a run. */
export function gallopGroundOffset(sink: number, flight: number): number {
  if (flight >= 1 || sink === 0) return 0;
  const wanted = -sink * (1 - flight);
  // Contacts flex through the limbs; the torso may settle only 1.8 cm in
  // either direction. This keeps total root travel under 3.6 cm even when
  // a stylized paw chain disagrees sharply with the terrain.
  return Math.max(-0.018, Math.min(0.018, wanted));
}
