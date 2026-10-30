import * as THREE from 'three';
import type { createGeneratedGsp } from './generatedGsp';

/** Share of the physical lean, atan(v·ω/g), a dog shows round a turn. */
export const TURN_LEAN_SHARE = .6;
/** The most a dog banks into a turn (rad). */
export const TURN_LEAN_MAX = .4;
/** Height (m) above its feet of the trunk that leans into a turn. */
const LEAN_HEIGHT = .45;

/** Small, contact-aware torso responses; travel and gait remain simulation-owned. */
export class GeneratedBodySupport {
  private pitch = 0;
  private roll = 0;
  /** The lean into a turn, separate from the slope's roll (rad). */
  bank = 0;
  /** How steep the ground is along the dog (0 level, 1 at the steepest posture it takes). */
  get grade() { return Math.min(1, Math.abs(this.pitch) / .30); }
  private speed = 0;
  private pivot = new THREE.Vector3(0, .51, 0);
  private offset = new THREE.Vector3();

  update(asset: ReturnType<typeof createGeneratedGsp>, ground: (x: number, z: number) => number,
    x: number, z: number, yaw: number, speed: number, turnRate: number, dt: number,
    moving: boolean, reset: boolean, pitchOffset = 0) {
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    // Sample the footprint, not individual paw flight. A swinging leg must
    // never tip the back or make a dog bob up and down on a smooth hillside.
    const forwardSlope = (ground(x + sin * .26, z + cos * .26)
      - ground(x - sin * .30, z - cos * .30)) / .56;
    const sideSlope = (ground(x + cos * .17, z - sin * .17)
      - ground(x - cos * .17, z + sin * .17)) / .34;
    const seconds = Math.max(0, dt);
    const speedBlend = reset ? 1 : 1 - Math.exp(-seconds * 8);
    const nextSpeed = THREE.MathUtils.lerp(this.speed, moving ? speed : 0, speedBlend);
    const acceleration = reset || seconds === 0 ? 0 : (nextSpeed - this.speed) / seconds;
    this.speed = nextSpeed;
    // Supported slope first, then a small forward load under acceleration.
    const load = moving ? THREE.MathUtils.clamp(acceleration * .004, -.025, .025) : 0;
    // Round a turn a running dog leans in hard, most of the way to the lean
    // that balances the turn (a cast-end reversal is 20 degrees and more).
    const bank = moving ? THREE.MathUtils.clamp(-Math.atan(turnRate * this.speed / 9.81) * TURN_LEAN_SHARE, -TURN_LEAN_MAX, TURN_LEAN_MAX) : 0;
    const pitchTarget = THREE.MathUtils.clamp(-Math.atan(forwardSlope), -.30, .30) + load;
    const rollTarget = THREE.MathUtils.clamp(Math.atan(sideSlope), -.18, .18);
    const blend = reset ? 1 : 1 - Math.exp(-seconds * 9);
    this.pitch = THREE.MathUtils.lerp(this.pitch, pitchTarget, blend);
    this.roll = THREE.MathUtils.lerp(this.roll, rollTarget, blend);
    this.bank = reset ? bank : THREE.MathUtils.lerp(this.bank, bank, 1 - Math.exp(-seconds * 8));
    const { body } = asset.joints;
    // A pose's own pitch (a skid onto the forehand) rides on the support.
    body.rotation.set(this.pitch + pitchOffset, 0, this.roll + this.bank);
    // Rotate around the ribcage, rather than swinging the whole dog around
    // a pivot at ground level. The foot solver then preserves actual support.
    this.offset.copy(this.pivot).applyQuaternion(body.quaternion).negate().add(this.pivot);
    // The bank leans the whole dog in from its feet: the trunk swings over
    // to the inside while the paws keep to their line.
    this.offset.x -= LEAN_HEIGHT * Math.sin(this.bank);
    this.offset.y -= LEAN_HEIGHT * (1 - Math.cos(this.bank));
    body.position.add(this.offset);
    return this.offset.y;
  }

  stabilizeHead(asset: ReturnType<typeof createGeneratedGsp>, steadyHead: boolean) {
    // A bird in the mouth and a fixed point need a quieter head than the
    // turning torso. No extra scan or nod is invented during these actions.
    const { neck, head } = asset.joints;
    const stability = steadyHead ? .85 : .5;
    neck.rotation.x -= this.pitch * stability * .65;
    head.rotation.x -= this.pitch * stability * .35;
    // A leaning dog keeps its eyes nearer level than its back.
    const roll = this.roll * stability + this.bank * Math.max(stability, .6);
    neck.rotation.z -= roll * .65;
    head.rotation.z -= roll * .35;
  }
}
