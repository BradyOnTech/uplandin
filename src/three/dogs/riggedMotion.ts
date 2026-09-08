import type { DogGait, DogScentStage, DogState } from '../../game/dog';
import { AnimationMixer, Vector3, type AnimationAction, type AnimationClip, type Object3D } from 'three';

export interface DogMotionInput {
  state: DogState;
  gait: DogGait;
  scentStage: DogScentStage;
  carryingBirdId: number | null;
}

/** Moving legs follow actual travel, while a stationary dog can address its scent target. */
export function dogTorsoHeading(dog: DogMotionInput, speed: number, travel: number, intent: number, previous: number, dt: number, immediate = false): number {
  const stationaryIntent = dog.state === 'pointing' || dog.state === 'honoring'
    || dog.state === 'tracking' || dog.state === 'retrieving';
  const moving = dog.gait !== 'still' && speed > 0.06 && dog.state !== 'pointing' && dog.state !== 'honoring';
  const target = moving ? travel : stationaryIntent || immediate ? intent : previous;
  const delta = Math.atan2(Math.sin(target - previous), Math.cos(target - previous));
  // Travel already interpolates fixed snapshots. Stationary turns ease into
  // the scent direction; a zero render delta cannot invent a new bearing.
  return immediate ? target : dt <= 0 ? previous : moving ? previous + delta : previous + delta * (1 - Math.exp(-dt * 12));
}

/** Shared state chooses the performance; the animation never chooses a hunt outcome. */
export function chooseDogClip(dog: DogMotionInput, speed: number, turnRate: number): string {
  if (dog.state === 'pointing' || dog.state === 'honoring') return 'point';
  if (dog.state === 'tracking') {
    if (dog.scentStage === 'checking') return 'scent_check';
    if (dog.scentStage === 'locating') return 'locate';
    if (dog.scentStage === 'stalking') return 'stalk';
    if (dog.scentStage === 'locking') return 'lock';
  }
  const moving = dog.gait !== 'still' && speed > 0.035;
  if (dog.state === 'retrieving') {
    if (dog.carryingBirdId !== null) return moving ? 'carry' : 'deliver';
    if (!moving) return 'pickup';
  }
  if (!moving) return dog.state === 'heel' ? 'attentive' : 'idle';
  if (dog.state === 'heel' || dog.state === 'recalled') return speed < 1.5 ? 'heel' : 'trot';
  if (speed > 3.1) return 'lope';
  if (speed > 1.3) return 'trot';
  if (Math.abs(turnRate) > 0.45) return turnRate > 0 ? 'turn_left' : 'turn_right';
  return 'walk';
}

export function contactWeight(cycle: number, offset: number, stanceFraction: number): number {
  if (stanceFraction <= 0) return 0;
  if (stanceFraction >= 1) return 1;
  const phase = ((cycle + offset) % 1 + 1) % 1;
  if (phase >= stanceFraction) return 0;
  const ramp = Math.min(0.055, stanceFraction * 0.15);
  return Math.min(1, phase / ramp, (stanceFraction - phase) / ramp);
}

/** Avoid turning a careful road-in into a many-times-speed foot cycle. */
export function supportingGait(performance: string, speed: number, nominalSpeed: number): string {
  if ((performance === 'stalk' || performance === 'locate' || performance === 'carry') && speed > nominalSpeed * 1.8) {
    return speed > 3.4 ? 'lope' : speed > 1.3 ? 'trot' : 'walk';
  }
  return performance;
}

/** Sample an authored phase while mixer time still advances crossfades and other layers. */
export function advancePhaseDrivenAction(mixer: AnimationMixer, action: AnimationAction, phase: number, dt: number): void {
  action.setEffectiveTimeScale(0);
  action.time = Math.max(0, Math.min(1, phase)) * action.getClip().duration;
  mixer.update(dt);
}

interface FootPosition { x: number; y: number; z: number }

export const POINT_SETTLE_SECONDS = 0.22;

/** The pickup endpoint is the low grip; lift only after the hunt attaches the bird. */
export function dogClipBlendSeconds(previous: string, performance: string): number {
  return previous === 'pickup' && performance === 'carry' ? 0.30 : 0.16;
}

/** Interrupt a partial fade from its current contribution, without a pose jump. */
export function crossFadeDogAction(next: AnimationAction, previous: AnimationAction, seconds: number): void {
  previous.setEffectiveWeight(previous.getEffectiveWeight());
  next.crossFadeFrom(previous, seconds, false);
}

/** Sample the shipped skeleton, without changing the visible dog's pose. */
export function sampleClipContacts(model: Object3D, clip: AnimationClip, names: readonly string[]): Map<string, Vector3> {
  const sample = model.clone(true);
  const mixer = new AnimationMixer(sample);
  const action = mixer.clipAction(clip).play();
  action.time = clip.duration * 0.5;
  mixer.update(0);
  sample.updateMatrixWorld(true);
  const contacts = new Map<string, Vector3>();
  for (const name of names) {
    const contact = sample.getObjectByName(name);
    if (!contact) throw new Error(`Point contact missing: ${name}`);
    // The detached model has the same transform relative to the visual root.
    contacts.set(name, contact.getWorldPosition(new Vector3()));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(sample);
  return contacts;
}

/** Airborne feet finish their flight; occupied support points settle one at a time. */
export function planPointSettling<T extends string>(feet: readonly {
  id: T; planted: boolean; from: FootPosition; to: FootPosition;
}[]): { id: T; delay: number }[] {
  const moving = feet.map(foot => ({ ...foot, distance: Math.hypot(foot.from.x - foot.to.x, foot.from.z - foot.to.z) }))
    .filter(foot => foot.distance > 0.025 || !foot.planted && Math.abs(foot.from.y - foot.to.y) > 0.012)
    .sort((a, b) => Number(a.planted) - Number(b.planted) || b.distance - a.distance);
  let nextPlanted = moving.some(foot => !foot.planted) ? POINT_SETTLE_SECONDS : 0;
  return moving.map(foot => {
    const delay = foot.planted ? nextPlanted : 0;
    if (foot.planted) nextPlanted += POINT_SETTLE_SECONDS;
    return { id: foot.id, delay };
  });
}

/** A released paw really leaves the ground before acquiring a new support point. */
export function sampleCorrectiveStep<T extends FootPosition>(from: FootPosition, authored: FootPosition, phase: number, heightAt: (x: number, z: number) => number, out: T): T {
  const t = Math.max(0, Math.min(1, phase));
  const blend = t * t * (3 - 2 * t);
  out.x = from.x + (authored.x - from.x) * blend;
  out.z = from.z + (authored.z - from.z) * blend;
  const landingY = heightAt(authored.x, authored.z) + 0.002;
  out.y = Math.max(heightAt(out.x, out.z) + 0.002, from.y + (landingY - from.y) * blend) + Math.sin(Math.PI * t) * 0.075;
  return out;
}
