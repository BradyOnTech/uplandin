import * as THREE from 'three';

/**
 * Delivery to hand. The dog squares up in front of the hunter with the bird
 * held high; he bends, takes it from the dog's mouth with his free hand,
 * brings it up to look it over, and slips it into the game bag. The gun
 * stays in his right hand, muzzle up and away from the dog. Real time; a
 * bird getting up, a mount or a reload cuts it short at once.
 */
export const HANDOFF = {
  /** The hand leaves the forend and reaches the dog's mouth. */
  reachS: .55,
  /** Longest wait at the mouth for the dog to give the bird. */
  waitMaxS: 1.6,
  /** The bird comes up into view. */
  liftS: .5,
  /** Looking it over. */
  admireS: 1.35,
  /** Down into the game bag. */
  stowS: .45,
  /** The hand back on the forend. */
  returnS: .35,
  /** How far the hunter bends to take the bird (m off his eye height). */
  stoopM: .24,
  /** Only a dog this close (m, eye to mouth) is delivering to this hunter. */
  reachM: 2.3,
} as const;

export type HandoffPhase = 'reach' | 'wait' | 'lift' | 'admire' | 'stow' | 'return' | 'done';

/** Which beat of the hand-off this is, and how far through it (0..1). */
export function handoffBeat(t: number, releasedAt: number | null): { phase: HandoffPhase; k: number } {
  if (t < HANDOFF.reachS) return { phase: 'reach', k: Math.max(0, t) / HANDOFF.reachS };
  if (releasedAt === null) return { phase: 'wait', k: 1 };
  let r = t - Math.max(releasedAt, HANDOFF.reachS);
  if (r < 0) return { phase: 'wait', k: 1 };
  const beats = [['lift', HANDOFF.liftS], ['admire', HANDOFF.admireS], ['stow', HANDOFF.stowS], ['return', HANDOFF.returnS]] as const;
  for (const [phase, span] of beats) {
    if (r < span) return { phase, k: r / span };
    r -= span;
  }
  return { phase: 'done', k: 1 };
}

/** How fully the gun is carried in the right hand alone (0 both hands). */
export function oneHanded(beat: { phase: HandoffPhase; k: number }): number {
  const ease = (x: number) => THREE.MathUtils.smoothstep(x, 0, 1);
  if (beat.phase === 'reach') return ease(beat.k / .55);
  if (beat.phase === 'return') return 1 - ease(beat.k);
  return beat.phase === 'done' ? 0 : 1;
}

// Camera-space poses for the free hand (its grip point and orientation).
/** Looking the bird over: low in front, a little left, tipped toward the eye. */
export const ADMIRE_HAND = { position: new THREE.Vector3(-.06, -.12, -.47), rotation: new THREE.Euler(.45, -.25, .05, 'YXZ') };
/** The game bag: low behind the left hip, out of view. */
export const STOW_HAND = { position: new THREE.Vector3(-.32, -.62, -.02), rotation: new THREE.Euler(-.4, .5, .3, 'YXZ') };
/** The gun in the right hand alone, in the hunter's body frame (not the head's):
 * held at the wrist, muzzle up and out to the right, clear of the dog. */
export const ONE_HAND_GUN = { position: new THREE.Vector3(.28, -.36, -.30), rotation: new THREE.Euler(.62, -.66, -.55, 'YXZ') };
