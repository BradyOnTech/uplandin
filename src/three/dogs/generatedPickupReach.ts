import * as THREE from 'three';

/** The spatial dog settles a short step behind its fall. Let the neck reach
 * that visible bird instead of acquiring it behind the muzzle. A supported
 * chest lean handles most of the reach; this supplies its small residual.
 * Planted paws and the simulation position remain authoritative. */
export class GeneratedPickupReach {
  private offset = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private mouth = new THREE.Vector3();
  private target = new THREE.Vector3();

  update(neck: THREE.Bone, head: THREE.Bone, grip: THREE.Vector3,
    target: Readonly<{ x: number; y: number; z: number }> | undefined,
    holdMs: number, dt: number, reset = false): void {
    if (reset) this.offset.set(0, 0, 0);
    this.desired.set(0, 0, 0);
    if (target) {
      neck.updateWorldMatrix(true, true);
      this.mouth.copy(grip); head.localToWorld(this.mouth);
      this.target.set(target.x, target.y, target.z);
      // Approach over the breast, then settle the bite. This small arc keeps
      // the rotating nose/jaw clear of rising ground before the grip closes.
      this.target.y += .025 * THREE.MathUtils.smoothstep(holdMs, 120, 250)
        * (1 - THREE.MathUtils.smoothstep(holdMs, 350, 650));
      // Both points are converted through the actual supported torso, so
      // the reach still meets the fall on a slope or a turned approach.
      neck.parent!.worldToLocal(this.mouth);
      neck.parent!.worldToLocal(this.target);
      this.desired.subVectors(this.target, this.mouth).clampLength(0, .34)
        .multiplyScalar(THREE.MathUtils.smoothstep(holdMs, 100, 360));
    }
    // Lift out more slowly than contact settles in, so ownership changing
    // does not simultaneously retract the reach and jerk the head upright.
    this.offset.lerp(this.desired, 1 - Math.exp(-Math.max(0, dt) * (target ? 24 : 8)));
    neck.position.add(this.offset);
  }

  reset(): void { this.offset.set(0, 0, 0); }
}
