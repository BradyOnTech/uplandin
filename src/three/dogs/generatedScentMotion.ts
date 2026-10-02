import * as THREE from 'three';
import type { DogScentStage, DogState } from '../../game/dog';
import type { createGeneratedGsp } from './generatedGsp';

/** Only information the shared dog already knows; no bird positions or outcome timers. */
export interface GeneratedFieldIntent {
  state: DogState;
  scentStage: DogScentStage;
  scentProgress: number;
  waitingForHandler: boolean;
  /** Signed difference between intent and torso bearing, in the model's +Z frame. */
  intentYaw: number;
  /** Working inside a cover patch, where the handler tracks the dog by its tail. */
  inCover?: boolean;
  /** A slam into point: the skid's progress (0..1, then 1 while it settles). */
  slam?: number | null;
  /** Crown height (m) of the standing cover the dog is in; 0 in the open. */
  coverHeight?: number;
}

export type GeneratedFieldPerformance = 'neutral' | 'search' | 'checking' | 'locating' | 'stalking' | 'locking' | 'point' | 'waiting';

export function fieldPerformance(intent: GeneratedFieldIntent | undefined): GeneratedFieldPerformance {
  if (!intent) return 'neutral';
  if (intent.state === 'pointing' || intent.state === 'honoring') return 'point';
  if (intent.state === 'whoa') return 'waiting';
  if (intent.state === 'seeking') return 'stalking';
  if (intent.state === 'tracking') {
    // Range holds keep their scent stage, but must never lift a pointing paw
    // or continue casting while the simulation waits for the handler.
    if (intent.waitingForHandler) return 'waiting';
    if (intent.scentStage !== 'none') return intent.scentStage;
  }
  return intent.state === 'quartering' ? 'search' : 'neutral';
}

/** Upper-body intent over distance-driven strides and world-space foot contacts. */
export class GeneratedScentMotion {
  performance: GeneratedFieldPerformance = 'neutral';
  private elapsed = 0;
  private neckPitch = 0;
  private headPitch = 0;
  private reach = 0;
  private height = 0;
  private yaw = 0;
  private tailPitch = 0;
  private tailYaw = 0;

  reset() {
    this.elapsed = this.neckPitch = this.headPitch = this.reach = this.height = this.yaw = this.tailPitch = this.tailYaw = 0;
    this.performance = 'neutral';
  }

  update(asset: ReturnType<typeof createGeneratedGsp>, intent: GeneratedFieldIntent | undefined,
    moving: boolean, pointPresence: number, dt: number, reset: boolean) {
    if (reset) this.reset();
    this.elapsed += Math.max(0, dt);
    this.performance = fieldPerformance(intent);
    const progress = THREE.MathUtils.clamp(intent?.scentProgress ?? 0, 0, 1);
    const bearing = THREE.MathUtils.clamp(intent?.intentYaw ?? 0, -.5, .5);
    let neckPitch = 0, headPitch = 0, reach = 0, height = 0, yaw = 0, tailPitch = 0, tailYaw = 0;
    switch (this.performance) {
      case 'search':
        // An open, mobile head checks across the cast. It leads the torso's
        // actual turn, without inventing a target beyond the dog's knowledge.
        neckPitch = -.10; headPitch = .035;
        yaw = bearing * .7 + (moving ? Math.sin(this.elapsed * 1.65) * .10 : 0);
        // A merry, busy tail while hunting: the first thing that changes on game.
        // Inside cover it rides high and cracks: the flag over the bluestem
        // is how the handler follows his dog.
        tailPitch = intent?.inCover ? .2 : .08;
        tailYaw = moving ? Math.sin(this.elapsed * 6.2) * .24 + (intent?.inCover ? Math.sin(this.elapsed * 8) * .08 : 0) : 0;
        break;
      case 'neutral':
        // Standing at heel or idle: soft breathing, an easy tail and a slow
        // look round, so a waiting dog never reads as a statue.
        if (!moving) {
          height = Math.sin(this.elapsed * 2.2) * .004;
          yaw = Math.sin(this.elapsed * .4) * .2;
          tailPitch = -.12 + Math.sin(this.elapsed * 1.4) * .04;
          tailYaw = Math.sin(this.elapsed * 1.1) * .1;
        }
        break;
      case 'checking':
        // First scent: lift into the air and interrupt the searching tail.
        neckPitch = -.32; headPitch = .15; height = .022; reach = .025;
        yaw = bearing; tailPitch = .3;
        break;
      case 'locating':
        neckPitch = .15; headPitch = -.14; reach = .025;
        // One narrowing check tied to the real finite locating beat, rather
        // than an endless sniff loop or an animation speed unrelated to travel.
        yaw = bearing + Math.sin(progress * Math.PI * 2) * .28 * (1 - progress);
        // Tail up and feathering fast: a dog making game, readable at range.
        tailPitch = .3;
        tailYaw = Math.sin(progress * Math.PI * 2) * .05 * (1 - progress) + Math.sin(this.elapsed * 17) * .13;
        break;
      case 'stalking':
      case 'locking':
        // Reach low and forward, then quiet the head as the source firms up.
        // The locking foreleg and final silhouette belong to the point pose.
        neckPitch = .32 + .08 * progress; headPitch = -.27;
        reach = .05; height = -.04;
        yaw = bearing * .8; tailPitch = .32;
        break;
      case 'waiting':
        // Four feet down, alert to the scent. This is neither idle nor a point.
        neckPitch = -.12; headPitch = .09; height = .012; reach = .018;
        yaw = bearing; tailPitch = -.06;
        break;
    }
    const blend = reset ? 1 : 1 - Math.exp(-Math.max(0, dt) * (this.performance === 'checking' ? 18 : 11));
    this.neckPitch = THREE.MathUtils.lerp(this.neckPitch, neckPitch, blend);
    this.headPitch = THREE.MathUtils.lerp(this.headPitch, headPitch, blend);
    this.reach = THREE.MathUtils.lerp(this.reach, reach, blend);
    this.height = THREE.MathUtils.lerp(this.height, height, blend);
    this.yaw = THREE.MathUtils.lerp(this.yaw, yaw, blend);
    this.tailPitch = THREE.MathUtils.lerp(this.tailPitch, tailPitch, blend);
    this.tailYaw = THREE.MathUtils.lerp(this.tailYaw, tailYaw, blend);
    // Converge onto the authored point during locking. Other actions target
    // zero offsets, letting residual scent work fade instead of snapping away.
    const weight = 1 - THREE.MathUtils.smoothstep(pointPresence, 0, 1);
    const { neck, head, tail } = asset.joints;
    neck.rotation.x += this.neckPitch * weight;
    head.rotation.x += this.headPitch * weight;
    neck.position.z += this.reach * weight;
    neck.position.y += this.height * weight;
    neck.rotation.y += this.yaw * .65 * weight;
    head.rotation.y += this.yaw * .35 * weight;
    tail.rotation.x += this.tailPitch * weight;
    tail.rotation.y += this.tailYaw * weight;
  }
}
