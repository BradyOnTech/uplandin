import * as THREE from 'three';

/** Presentation-only settling of ear leather after the final head pose. */
export class GeneratedEarGravity {
  private rotation = new THREE.Quaternion();
  private desired = new THREE.Quaternion();
  private inverseHead = new THREE.Quaternion();
  private down = new THREE.Vector3();
  private restDown = new THREE.Vector3(0, -1, 0);
  private identity = new THREE.Quaternion();

  update(joints: Record<string, THREE.Bone>, dt: number, reset = false): void {
    joints.head.updateWorldMatrix(true, false);
    joints.head.getWorldQuaternion(this.inverseHead).invert();
    this.down.set(0, -1, 0).applyQuaternion(this.inverseHead).normalize();
    this.desired.setFromUnitVectors(this.restDown, this.down);
    // Limit the hinge to about 87 degrees: leather can hang during a deep
    // pickup without inverting through its temple attachment at extreme poses.
    const angle = this.identity.angleTo(this.desired);
    if (angle > 1.52) this.desired.slerp(this.identity, 1 - 1.52 / angle);
    if (reset) this.rotation.copy(this.desired);
    else this.rotation.slerp(this.desired, 1 - Math.exp(-Math.max(0, dt) * 14));
    joints['ear-left'].quaternion.copy(this.rotation);
    joints['ear-right'].quaternion.copy(this.rotation);
  }
}
