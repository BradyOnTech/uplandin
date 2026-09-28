import * as THREE from 'three';

export interface PivotFoot {
  target: THREE.Vector3; from: THREE.Vector3; goal: THREE.Vector3;
  locked: boolean; initialized: boolean; step: number; plantId: number;
}

/** A planted diagonal supports each turn step. Landing positions are chosen
 * once, rather than chasing the body's rotating stance throughout the swing. */
export class GeneratedPivotSteps {
  private pair = -1;
  private direction = 0;
  private recoverySteps = 0;
  private ideal = Array.from({ length: 4 }, () => new THREE.Vector3());
  private elapsed = 0;
  private duration = .11;
  private outward = Array.from({ length: 4 }, () => new THREE.Vector3());
  private active = false;
  reset() { this.active = false; this.pair = -1; this.elapsed = 0; this.recoverySteps = 0; }

  update(feet: readonly PivotFoot[], nominal: readonly THREE.Vector3[],
    x: number, z: number, yaw: number, rate: number, dt: number,
    eligible: boolean, ground: (x: number, z: number) => number,
    plant: () => number): boolean {
    const turning = eligible && Math.abs(rate) > 1 && Math.abs(rate) < 6.5;
    if (!eligible || Math.abs(rate) >= 6.5) { this.reset(); return false; }
    if (!this.active) {
      if (!turning || feet.some(f => !f.locked || f.step > 0)) return false;
      this.active = true;
      this.direction = Math.sign(rate);
    }
    nominal.forEach((p, i) => {
      const side = i % 2 ? 1 : -1;
      this.ideal[i].copy(p);
      this.ideal[i].x += Math.cos(yaw) * side * (turning ? .03 : 0);
      this.ideal[i].z -= Math.sin(yaw) * side * (turning ? .03 : 0);
    });
    // A sudden reversal cannot keep anticipating the old heading. Replant
    // the airborne pair from its current position, then take a short catch
    // step before returning to the ordinary turn cadence.
    const reversal = turning && Math.sign(rate) !== this.direction;
    if (reversal) { this.direction = Math.sign(rate); this.recoverySteps = 2; }
    if (this.pair < 0 || reversal) {
      const errors = [0, 1].map(p => Math.max(...[p, 3 - p].map(i =>
        Math.hypot(feet[i].target.x - this.ideal[i].x, feet[i].target.z - this.ideal[i].z))));
      if (this.pair < 0) {
        if (Math.max(...errors) < (turning ? .07 : .025)) {
          if (!turning) { this.reset(); return false; }
          return true;
        }
        this.pair = errors[0] > errors[1] ? 0 : 1;
      }
      // Bound angular travel per step and account for actual frame duration
      // when predicting touchdown. A stopped turn also finishes settling
      // here; the ordinary rest correction has no paw-clearance planning.
      this.duration = turning ? Math.max(dt, Math.floor(Math.min(this.recoverySteps > 0 ? .08 : .10, .50 / Math.abs(rate)) / dt + 1e-6) * dt) : .16;
      this.elapsed = 0;
      for (const i of [this.pair, 3 - this.pair]) {
        const foot = feet[i];
        foot.from.copy(foot.target);
        // Slightly broaden the stance during a tight pivot. The next
        // supporting limb should not land beneath the opposite hock.
        const side = i % 2 ? 1 : -1;
        const lead = turning ? rate * this.duration * (this.recoverySteps > 0 ? .5 : .75) : 0;
        const dx = this.ideal[i].x - x;
        const dz = this.ideal[i].z - z;
        foot.goal.set(x + dx * Math.cos(lead) + dz * Math.sin(lead), 0,
          z - dx * Math.sin(lead) + dz * Math.cos(lead));
        const other = feet[i ^ 1].target;
        const rightX = Math.cos(yaw + lead), rightZ = -Math.sin(yaw + lead);
        const lateral = ((foot.goal.x - other.x) * rightX + (foot.goal.z - other.z) * rightZ) * side;
        // The existing planted paw can be ahead of its new body-relative
        // stance after a reversal. Keep this landing on its own side of it.
        const separation = Math.max(0, .095 - lateral);
        foot.goal.x += rightX * side * separation;
        foot.goal.z += rightZ * side * separation;
        foot.goal.y = ground(foot.goal.x, foot.goal.z) + .023;
        this.outward[i].set((foot.from.x + foot.goal.x) / 2 - x, 0,
          (foot.from.z + foot.goal.z) / 2 - z).normalize();
        foot.step = .000001;
        foot.plantId = plant();
      }
    }
    this.elapsed += Math.max(0, dt);
    const progress = Math.min(1, (this.elapsed + 1e-9) / this.duration);
    const t = progress * progress * (3 - 2 * progress);
    for (const i of [this.pair, 3 - this.pair]) {
      const foot = feet[i], arc = Math.sin(Math.PI * progress);
      foot.target.lerpVectors(foot.from, foot.goal, t);
      foot.target.addScaledVector(this.outward[i], arc * .055);
      foot.target.y = Math.max(foot.target.y, ground(foot.target.x, foot.target.z) + .023) + arc * .075;
      foot.step = progress < 1 ? progress : 0;
    }
    if (progress >= 1) { this.pair = -1; this.recoverySteps = Math.max(0, this.recoverySteps - 1); }
    return true;
  }
}
