import * as THREE from 'three';
import type { GeneratedRetrievePose } from './generatedFieldMotion';
import { GENERATED_MOUTH_GRIP } from './generatedGsp';

/** Presentation fits around the resting bird, without enlarging its model.
 * The larger gamebirds need a deeper grip than a compact bobwhite. */
const CHUKAR_GRASP = { angle: .60, y: -.065 };
const PHEASANT_GRASP = { angle: .73, y: -.083 };
const GROUSE_GRASP = { angle: .70, y: -.083 };
const PARTRIDGE_GRASP = { angle: .50, y: -.056 };
const QUAIL_GRASP = { angle: .40, y: -.045 };
function grasp(speciesId: string | undefined): { angle: number; y: number } {
  if (!speciesId || speciesId === 'chukar') return CHUKAR_GRASP;
  if (speciesId === 'ringneck') return PHEASANT_GRASP;
  if (speciesId === 'sharptail' || speciesId === 'ruffed-grouse' || speciesId === 'blue-grouse' || speciesId === 'prairie-chicken') return GROUSE_GRASP;
  if (speciesId === 'hun') return PARTRIDGE_GRASP;
  return QUAIL_GRASP;
}

/** The shared retrieve clock controls the bite; it never changes pickup,
 * bird ownership, movement or the head-relative carry socket. */
export class GeneratedMouthMotion {
  angle = 0;
  readonly grip = new THREE.Vector3(...GENERATED_MOUTH_GRIP);

  update(jaw: THREE.Bone, retrieve: GeneratedRetrievePose | undefined, dt: number, reset = false): void {
    const fit = grasp(retrieve?.speciesId);
    // Species is known when the bird is acquired and remains fixed through
    // the offer. Opening the lower jaw never moves this head-relative point.
    this.grip.y = fit.y;
    let target = 0;
    if (retrieve?.stage === 'pickup') {
      // Open while reaching, then settle around the bird before the shared
      // 700 ms pickup finishes. A longer scent search holds this quiet grip.
      const open = THREE.MathUtils.smoothstep(retrieve.holdMs, 60, 260);
      const close = THREE.MathUtils.smoothstep(retrieve.holdMs, 430, 650);
      target = open * THREE.MathUtils.lerp(Math.min(.84, fit.angle + .16), fit.angle, close);
    } else if (retrieve?.stage === 'carry') {
      target = fit.angle;
    } else if (retrieve?.stage === 'deliver') {
      // The spatial hunt offers for 900 ms. Soften the grip near the end;
      // removal of the carried bird remains entirely simulation-owned.
      target = fit.angle + .10 * THREE.MathUtils.smoothstep(retrieve.holdMs, 550, 850);
    }
    this.angle = reset ? target : THREE.MathUtils.lerp(this.angle, target, 1 - Math.exp(-Math.max(0, dt) * 18));
    jaw.rotation.x = this.angle;
  }

  reset(): void { this.angle = 0; this.grip.set(...GENERATED_MOUTH_GRIP); }
}
