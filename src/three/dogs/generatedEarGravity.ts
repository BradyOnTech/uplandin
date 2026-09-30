import * as THREE from 'three';

/**
 * Presentation-only ear leather after the final head pose. The leather hangs
 * toward gravity, but it is a damped spring rather than a rigid follower:
 * it lags the head's own acceleration, so ears lift and swing with each
 * stride, flop through a hard stop or turn and settle when the dog stands.
 */
export class GeneratedEarGravity {
  private rotation = new THREE.Quaternion();
  private desired = new THREE.Quaternion();
  private inverseHead = new THREE.Quaternion();
  private down = new THREE.Vector3();
  private restDown = new THREE.Vector3(0, -1, 0);
  private identity = new THREE.Quaternion();
  private hang = new THREE.Vector3(0, -1, 0);
  private hangVelocity = new THREE.Vector3();
  private headPosition = new THREE.Vector3();
  private lastHead = new THREE.Vector3();
  private headVelocity = new THREE.Vector3();
  private lastHeadVelocity = new THREE.Vector3();
  private acceleration = new THREE.Vector3();
  private force = new THREE.Vector3();
  private tracking = false;

  /** Ear-leather stiffness (1/s²), damping (1/s) and inertia response. */
  static readonly STIFFNESS = 260;
  static readonly DAMPING = 17;
  static readonly INERTIA = .32;

  update(joints: Record<string, THREE.Bone>, dt: number, reset = false): void {
    const head = joints.head;
    head.updateWorldMatrix(true, false);
    head.getWorldQuaternion(this.inverseHead).invert();
    head.getWorldPosition(this.headPosition);
    const seconds = Math.min(.05, Math.max(0, dt));
    if (reset || !this.tracking || seconds === 0) {
      this.headVelocity.set(0, 0, 0); this.lastHeadVelocity.set(0, 0, 0); this.acceleration.set(0, 0, 0);
    } else {
      this.headVelocity.copy(this.headPosition).sub(this.lastHead).divideScalar(seconds);
      this.acceleration.copy(this.headVelocity).sub(this.lastHeadVelocity).divideScalar(seconds);
      // A relocation or a single noisy frame must not fling the leather.
      if (this.acceleration.length() > 40) this.acceleration.setLength(40);
      this.lastHeadVelocity.copy(this.headVelocity);
    }
    this.lastHead.copy(this.headPosition); this.tracking = true;
    // Apparent gravity in the head frame: the leather swings opposite the
    // head's acceleration, as loose ears do on a running dog.
    this.force.set(0, -9.8, 0).addScaledVector(this.acceleration, -GeneratedEarGravity.INERTIA);
    this.down.copy(this.force).applyQuaternion(this.inverseHead).normalize();
    if (reset) {
      this.hang.copy(this.down); this.hangVelocity.set(0, 0, 0);
    } else {
      // Two sub-steps keep the spring stable at a 30 Hz presentation rate.
      const step = seconds / 2;
      for (let k = 0; k < 2; k++) {
        this.hangVelocity.addScaledVector(this.down.clone().sub(this.hang), GeneratedEarGravity.STIFFNESS * step)
          .multiplyScalar(Math.exp(-GeneratedEarGravity.DAMPING * step));
        this.hang.addScaledVector(this.hangVelocity, step).normalize();
      }
    }
    this.desired.setFromUnitVectors(this.restDown, this.hang);
    // Limit the hinge to about 87 degrees: leather can hang during a deep
    // pickup without inverting through its temple attachment at extreme poses.
    const angle = this.identity.angleTo(this.desired);
    if (angle > 1.52) this.desired.slerp(this.identity, 1 - 1.52 / angle);
    this.rotation.copy(this.desired);
    joints['ear-left'].quaternion.copy(this.rotation);
    joints['ear-right'].quaternion.copy(this.rotation);
  }
}
