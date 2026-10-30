import * as THREE from 'three';
import type { GallopLead, LocomotionGait } from './locomotion';
import type { createGeneratedGsp } from './generatedGsp';

const TAU = Math.PI * 2;
/** The ribcage pivot the trunk rocks about (body frame). */
const PIVOT = new THREE.Vector3(0, .51, 0);

/** One instant of the trunk's motion over the stride. */
export interface GaitBodyPose {
  /** Whole-trunk pitch, nose up positive (rad). */
  pitch: number;
  /** Trunk rise above its supported height (m). */
  heave: number;
  /** Loin flexion, gathered positive (rad): the pelvis tucks under the loin. */
  loin: number;
  /** Hip roll across the loin (rad), the walk's and trot's sway. */
  hipRoll: number;
}

export function createGaitBodyPose(): GaitBodyPose { return { pitch: 0, heave: 0, loin: 0, hipRoll: 0 }; }

function pulse(cycle: number, center: number, halfWidth: number): number {
  let d = Math.abs((((cycle - center) % 1) + 1) % 1);
  d = Math.min(d, 1 - d);
  const x = Math.max(0, 1 - d / halfWidth);
  return x * x * (3 - 2 * x);
}

/**
 * The trunk over one stride of each footfall law, timed to the generated
 * dog's contact schedule (locomotion.ts and generatedGsp.ts):
 * - walk: two restrained rises a stride and a swaying pelvis;
 * - trot: a firm topline that lifts in each diagonal's short suspension;
 * - canter: the rocking-horse gait, nose up on the hinds and down onto the lead fore;
 * - gallop: the forehand rides up on the hind drive into the long extended
 *   flight, the chest drops to catch on the fores, the loin stretches out and
 *   gathers under again in the short gathered flight;
 * - bound: the loin bends and opens round the leap (the leap itself is ballistic, elsewhere).
 * `vigor` scales the sagittal action (the breed's vertical motion and the
 * stride's own variation). Allocation-free.
 */
export function writeGaitBodyPose(gait: LocomotionGait, cycle: number, lead: GallopLead, vigor: number, out: GaitBodyPose): GaitBodyPose {
  const c = ((cycle % 1) + 1) % 1, side = lead === 'left' ? 1 : -1;
  if (gait === 'walk') {
    out.pitch = .010 * Math.sin(2 * TAU * c) * vigor;
    out.heave = .006 * Math.cos(2 * TAU * c) * vigor;
    out.loin = .025 * Math.sin(2 * TAU * c + .2) * vigor;
    out.hipRoll = .05 * Math.sin(TAU * c);
  } else if (gait === 'trot') {
    // Diagonals touch at 0 and .5 with a .43 duty: the two short flights centre on .465 and .965.
    out.pitch = .012 * Math.sin(2 * TAU * c) * vigor;
    out.heave = .011 * Math.cos(2 * TAU * (c - .465)) * vigor;
    out.loin = .02 * Math.sin(2 * TAU * c + .35) * vigor;
    out.hipRoll = .03 * Math.sin(TAU * c);
  } else if (gait === 'canter') {
    // Trailing hind at 0, the diagonal at .27, the lead fore at .54; one flight from about .86.
    out.pitch = .075 * Math.cos(TAU * (c - .2)) * vigor;
    out.heave = .02 * Math.cos(TAU * (c - .93)) * vigor;
    out.loin = (.11 * pulse(c, .93, .22) - .06 * pulse(c, .47, .18)) * vigor;
    out.hipRoll = side * .018 * Math.sin(TAU * c);
  } else if (gait === 'gallop') {
    // Hinds support from 0 to about .29, fores from .5 to about .79: the
    // long extended flight centres near .40, the short gathered one near .9.
    out.pitch = .065 * Math.cos(TAU * (c - .33)) * vigor;
    out.heave = .026 * (Math.cos(2 * TAU * (c - .40)) + .3 * Math.cos(TAU * (c - .40))) / 1.3 * vigor;
    // The stretch waits for the hinds to leave the ground (about .29).
    out.loin = (.19 * pulse(c, .91, .2) - .15 * pulse(c, .45, .15)) * vigor;
    out.hipRoll = side * .02 * Math.sin(TAU * c);
  } else {
    // The bound starts at the drive: the loin opens through the leap and
    // bends hard as the hinds come under to drive again.
    out.pitch = 0;
    out.heave = 0;
    out.loin = (.2 * pulse(c, .9, .22) - .14 * pulse(c, .3, .25)) * vigor;
    out.hipRoll = 0;
  }
  return out;
}

/**
 * Applies the stride's trunk motion over the generated rig, after the field
 * motion has chosen its world-space foot targets and before the legs are
 * solved to them: planted paws stay put while the trunk rocks, rises and
 * bends over them. Gait changes and starts and stops crossfade, so a
 * threshold never snaps the back.
 */
export class GeneratedGaitBody {
  readonly pose = createGaitBodyPose();
  private from = createGaitBodyPose();
  private target = createGaitBodyPose();
  private blend = 1;
  private presence = 0;
  private gait: LocomotionGait | null = null;
  private before = new THREE.Vector3();
  private after = new THREE.Vector3();

  reset(): void {
    this.presence = 0; this.blend = 1; this.gait = null;
    Object.assign(this.pose, createGaitBodyPose());
  }

  /** The motion this frame; `apply` puts it on the rig. */
  update(gait: LocomotionGait, cycle: number, lead: GallopLead, vigor: number, moving: boolean, dt: number, reset: boolean): GaitBodyPose {
    if (reset) this.reset();
    const seconds = Math.max(0, dt);
    if (this.gait !== null && gait !== this.gait) { Object.assign(this.from, this.pose); this.blend = 0; }
    this.gait = gait;
    this.presence = reset ? (moving ? 1 : 0) : THREE.MathUtils.clamp(this.presence + (moving ? 1 : -1) * seconds / .22, 0, 1);
    writeGaitBodyPose(gait, cycle, lead, vigor, this.target);
    this.blend = Math.min(1, this.blend + seconds / .24);
    const k = this.blend * this.blend * (3 - 2 * this.blend), w = this.presence * this.presence * (3 - 2 * this.presence);
    for (const key of ['pitch', 'heave', 'loin', 'hipRoll'] as const)
      this.pose[key] = THREE.MathUtils.lerp(this.from[key], this.target[key], k) * w;
    return this.pose;
  }

  /** Pitch the trunk about the ribcage, lift it, and bend the pelvis under
   * the loin. Returns the height it added to the body (m). */
  apply(asset: ReturnType<typeof createGeneratedGsp>, pelvisYaw = 0): number {
    const { body, pelvis } = asset.joints;
    this.before.copy(PIVOT).applyQuaternion(body.quaternion);
    body.rotation.x -= this.pose.pitch;
    this.after.copy(PIVOT).applyQuaternion(body.quaternion);
    this.before.sub(this.after);
    body.position.add(this.before);
    body.position.y += this.pose.heave;
    // Gathering tucks the pelvis under: the croup and hips swing down and forward.
    pelvis.rotation.set(-this.pose.loin, pelvisYaw, this.pose.hipRoll);
    return this.before.y + this.pose.heave;
  }
}
