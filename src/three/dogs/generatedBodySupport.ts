import * as THREE from 'three';
import type { createGeneratedGsp } from './generatedGsp';

/** Small, contact-aware torso responses; travel and gait remain simulation-owned. */
export class GeneratedBodySupport {
  private pitch = 0;
  private roll = 0;
  private speed = 0;
  private pivot = new THREE.Vector3(0, .51, 0);
  private offset = new THREE.Vector3();

  update(asset: ReturnType<typeof createGeneratedGsp>, ground: (x: number, z: number) => number,
    x: number, z: number, yaw: number, speed: number, turnRate: number, dt: number,
    moving: boolean, reset: boolean) {
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
    // Keep the response restrained: supported slope first, then a small
    // forward load under acceleration and inward bank through a real turn.
    const load = moving ? THREE.MathUtils.clamp(acceleration * .004, -.025, .025) : 0;
    const bank = moving ? THREE.MathUtils.clamp(-turnRate * this.speed * .014, -.09, .09) : 0;
    const pitchTarget = THREE.MathUtils.clamp(-Math.atan(forwardSlope), -.30, .30) + load;
    const rollTarget = THREE.MathUtils.clamp(Math.atan(sideSlope), -.18, .18) + bank;
    const blend = reset ? 1 : 1 - Math.exp(-seconds * 9);
    this.pitch = THREE.MathUtils.lerp(this.pitch, pitchTarget, blend);
    this.roll = THREE.MathUtils.lerp(this.roll, rollTarget, blend);
    const { body } = asset.joints;
    body.rotation.set(this.pitch, 0, this.roll);
    // Rotate around the ribcage, rather than swinging the whole dog around
    // a pivot at ground level. The foot solver then preserves actual support.
    this.offset.copy(this.pivot).applyQuaternion(body.quaternion).negate().add(this.pivot);
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
    neck.rotation.z -= this.roll * stability * .65;
    head.rotation.z -= this.roll * stability * .35;
  }
}
