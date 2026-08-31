import { describe, expect, it } from 'vitest';
import {
  advanceLocomotionCycle,
  crossedStrideBoundary,
  createLocomotionPose,
  foreCarpusPitch,
  selectLocomotionGait,
  writeLocomotionPose,
} from '../src/three/dogs/locomotion';
import { createTwoBoneSolution, solveTwoBone } from '../src/three/dogs/legIk';

describe('contact-first dog locomotion', () => {
  it('selects footfall laws from measured speed with hysteresis', () => {
    expect(selectLocomotionGait(1.2, 'walk')).toBe('walk');
    expect(selectLocomotionGait(2.2, 'walk')).toBe('trot');
    expect(selectLocomotionGait(3.4, 'gallop')).toBe('canter');
    expect(selectLocomotionGait(3.4, 'trot')).toBe('canter');
    expect(selectLocomotionGait(4.6, 'gallop')).toBe('gallop');
    expect(selectLocomotionGait(4.6, 'canter')).toBe('canter');
    expect(selectLocomotionGait(5, 'canter')).toBe('gallop');
  });

  it('uses diagonal support pairs at the trot', () => {
    const a = writeLocomotionPose('trot', 0.1, 'left', createLocomotionPose());
    expect(a.feet[0].contact).not.toBe('swing');
    expect(a.feet[3].contact).not.toBe('swing');
    expect(a.feet[1].contact).toBe('swing');
    expect(a.feet[2].contact).toBe('swing');

    const b = writeLocomotionPose('trot', 0.6, 'left', createLocomotionPose());
    expect(b.feet[1].contact).not.toBe('swing');
    expect(b.feet[2].contact).not.toBe('swing');
  });

  it('gives a field gallop four distinct contacts and two suspension windows', () => {
    const out = createLocomotionPose();
    expect(writeLocomotionPose('gallop', 0.05, 'left', out).feet[3].contact).not.toBe('swing');
    expect(writeLocomotionPose('gallop', 0.31, 'left', out).feet[2].contact).not.toBe('swing');
    expect(writeLocomotionPose('gallop', 0.55, 'left', out).feet[1].contact).not.toBe('swing');
    expect(writeLocomotionPose('gallop', 0.73, 'left', out).feet[0].contact).not.toBe('swing');
    expect(writeLocomotionPose('gallop', 0.48, 'left', out).flight).toBe(1);
    expect(writeLocomotionPose('gallop', 0.93, 'left', out).flight).toBe(1);
  });

  it('uses a three-beat canter with a diagonal middle beat', () => {
    const out = createLocomotionPose();
    const trailingHind = writeLocomotionPose('canter', 0.05, 'left', out);
    expect(trailingHind.feet[3].contact).not.toBe('swing');
    const diagonal = writeLocomotionPose('canter', 0.31, 'left', out);
    expect(diagonal.feet[1].contact).not.toBe('swing');
    expect(diagonal.feet[2].contact).not.toBe('swing');
    const leadFore = writeLocomotionPose('canter', 0.58, 'left', out);
    expect(leadFore.feet[0].contact).not.toBe('swing');
  });

  it('carries both fore paws forward together in extended suspension', () => {
    const extended = writeLocomotionPose('gallop', 0.48, 'left', createLocomotionPose());
    const [leadFore, trailingFore] = extended.feet;
    expect(extended.flight).toBe(1);
    expect(leadFore.contact).toBe('swing');
    expect(trailingFore.contact).toBe('swing');
    // Rudi's slow-motion broadside shows both forelimbs long and low here.
    // A large lift split makes the paws alternately pick at the air—the
    // user-described "tap dance"—instead of reading as one reach.
    expect(Math.max(leadFore.lift, trailingFore.lift)).toBeLessThan(0.05);
    expect(Math.abs(leadFore.lift - trailingFore.lift)).toBeLessThan(0.035);
    expect(Math.abs(leadFore.z - trailingFore.z)).toBeLessThan(0.08);
  });

  it('keeps gallop fore-paw recovery low instead of high-stepping', () => {
    const pose = createLocomotionPose();
    let maxForeLift = 0;
    let maxHindLift = 0;
    for (let sample = 0; sample < 200; sample++) {
      writeLocomotionPose('gallop', sample / 200, 'left', pose);
      maxForeLift = Math.max(maxForeLift, pose.feet[0].lift, pose.feet[1].lift);
      maxHindLift = Math.max(maxHindLift, pose.feet[2].lift, pose.feet[3].lift);
    }
    expect(maxForeLift).toBeLessThan(0.1);
    // Hinds still need extra clearance to fold the hock beneath the pelvis.
    expect(maxHindLift).toBeGreaterThan(maxForeLift);
  });

  it('keeps the paw and scapula continuous through fore toe-off', () => {
    // Right fore touches at .50 and leaves support at .50 + .21.
    const before = writeLocomotionPose('gallop', 0.71 - 1e-6, 'left', createLocomotionPose());
    const after = writeLocomotionPose('gallop', 0.71 + 1e-6, 'left', createLocomotionPose());
    expect(Math.abs(before.feet[1].solePitch - after.feet[1].solePitch)).toBeLessThan(0.01);
    expect(Math.abs(before.scapulaPitch[1] - after.scapulaPitch[1])).toBeLessThan(0.01);
  });

  it('retracts a reaching fore paw before touchdown', () => {
    // Right fore touchdown is .50. Its maximum reach should occur shortly
    // beforehand, followed by a small backward sweep that sheds world
    // velocity instead of stamping a forward-moving paw into its lock.
    const peakReach = writeLocomotionPose('gallop', 0.405, 'left', createLocomotionPose());
    const touchdown = writeLocomotionPose('gallop', 0.5 - 1e-5, 'left', createLocomotionPose());
    expect(peakReach.feet[1].contact).toBe('swing');
    expect(touchdown.feet[1].contact).toBe('swing');
    expect(peakReach.feet[1].z - touchdown.feet[1].z).toBeGreaterThan(0.02);
  });

  it('matches fore-paw world velocity to the ground at touchdown', () => {
    // The root advances one stride per cycle. Immediately before contact,
    // the paw must therefore sweep backward by one stride per cycle; any
    // residual forward world velocity becomes a visible stamp when the
    // stance lock engages.
    const epsilon = 1e-5;
    const earlier = writeLocomotionPose('gallop', 0.5 - epsilon * 2, 'left', createLocomotionPose());
    const later = writeLocomotionPose('gallop', 0.5 - epsilon, 'left', createLocomotionPose());
    const localVelocity = (later.feet[1].z - earlier.feet[1].z) / epsilon;
    const worldVelocity = later.stride + localVelocity;
    expect(Math.abs(worldVelocity)).toBeLessThan(0.03);
  });

  it('preserves quiet touchdown under a breed-scaled stride', () => {
    const strideScale = 1.08;
    const epsilon = 1e-5;
    const earlier = writeLocomotionPose(
      'gallop',
      0.5 - epsilon * 2,
      'left',
      createLocomotionPose(),
      strideScale,
    );
    const later = writeLocomotionPose(
      'gallop',
      0.5 - epsilon,
      'left',
      createLocomotionPose(),
      strideScale,
    );
    const localVelocity = (later.feet[1].z - earlier.feet[1].z) / epsilon;
    expect(Math.abs(later.stride + localVelocity)).toBeLessThan(0.03);
    expect(advanceLocomotionCycle(0, later.stride / 4, 'gallop', strideScale)).toBeCloseTo(0.25, 6);
  });

  it('folds the fore carpus during recovery and opens it at both contacts', () => {
    const stance = writeLocomotionPose('gallop', 0.55, 'left', createLocomotionPose()).feet[1];
    const early = writeLocomotionPose('gallop', 0.71 + 1e-6, 'left', createLocomotionPose()).feet[1];
    const middle = writeLocomotionPose('gallop', 0.105, 'left', createLocomotionPose()).feet[1];
    const late = writeLocomotionPose('gallop', 0.5 - 1e-6, 'left', createLocomotionPose()).feet[1];

    expect(foreCarpusPitch('gallop', stance)).toBeCloseTo(-0.055, 6);
    expect(foreCarpusPitch('gallop', middle)).toBeLessThan(-0.5);
    expect(Math.abs(foreCarpusPitch('gallop', early) + 0.055)).toBeLessThan(0.001);
    expect(Math.abs(foreCarpusPitch('gallop', late) + 0.055)).toBeLessThan(0.001);
  });

  it('uses more wrist fold at a gallop than at a trot', () => {
    const gallop = writeLocomotionPose('gallop', 0.105, 'left', createLocomotionPose()).feet[1];
    const trot = writeLocomotionPose('trot', 0.215, 'left', createLocomotionPose()).feet[1];
    expect(gallop.swing).toBeCloseTo(trot.swing, 2);
    expect(foreCarpusPitch('gallop', gallop)).toBeLessThan(foreCarpusPitch('trot', trot) - 0.1);
  });

  it('mirrors lead-dependent pelvic weight shift', () => {
    const left = writeLocomotionPose('gallop', 0.25, 'left', createLocomotionPose());
    const right = writeLocomotionPose('gallop', 0.25, 'right', createLocomotionPose());
    expect(left.pelvisRoll).toBeCloseTo(-right.pelvisRoll, 6);
    expect(Math.abs(left.pelvisRoll)).toBeGreaterThan(0.01);
  });

  it('mirrors gallop lead contacts', () => {
    const left = writeLocomotionPose('gallop', 0.73, 'left', createLocomotionPose());
    const right = writeLocomotionPose('gallop', 0.73, 'right', createLocomotionPose());
    expect(left.feet[0].contact).not.toBe('swing');
    expect(left.feet[1].contact).toBe('swing');
    expect(right.feet[1].contact).not.toBe('swing');
    expect(right.feet[0].contact).toBe('swing');
  });

  it('advances phase from distance and wraps cleanly', () => {
    const quarter = advanceLocomotionCycle(0, 0.94 / 4, 'trot');
    expect(quarter).toBeCloseTo(0.25, 6);
    expect(advanceLocomotionCycle(0.9, 0.94 * 0.2, 'trot')).toBeCloseTo(0.1, 6);
  });

  it('recognizes only a moving stride wrap as a safe gait boundary', () => {
    expect(crossedStrideBoundary(0.98, 0.02, 0.05)).toBe(true);
    expect(crossedStrideBoundary(0.2, 0.3, 0.05)).toBe(false);
    expect(crossedStrideBoundary(0.98, 0.02, 0)).toBe(false);
  });

  it('moves a supporting paw backward by exactly the root travel', () => {
    const before = writeLocomotionPose('trot', 0.05, 'left', createLocomotionPose());
    const after = writeLocomotionPose('trot', 0.25, 'left', createLocomotionPose());
    const rootTravel = 0.94 * (0.25 - 0.05);
    expect(before.feet[0].contact).not.toBe('swing');
    expect(after.feet[0].contact).not.toBe('swing');
    expect(before.feet[0].z - after.feet[0].z).toBeCloseTo(rootTravel, 6);
  });

  it('keeps sampled poses continuous across cycle wrap', () => {
    const before = writeLocomotionPose('gallop', 1 - 1e-5, 'left', createLocomotionPose());
    const after = writeLocomotionPose('gallop', 1e-5, 'left', createLocomotionPose());
    expect(Math.abs(before.loinPitch - after.loinPitch)).toBeLessThan(0.001);
    expect(Math.abs(before.feet[3].z - after.feet[3].z)).toBeLessThan(0.001);
  });
});

describe('dog leg IK', () => {
  it('reaches a sagittal target without changing segment lengths', () => {
    const target = { y: -0.34, z: 0.08 };
    const solved = solveTwoBone(target.y, target.z, 0.195, 0.2, 1, createTwoBoneSolution());
    const y = -Math.cos(solved.upper) * 0.195 - Math.cos(solved.lowerAbsolute) * 0.2;
    const z = Math.sin(solved.upper) * 0.195 + Math.sin(solved.lowerAbsolute) * 0.2;
    expect(y).toBeCloseTo(target.y, 5);
    expect(z).toBeCloseTo(target.z, 5);
    expect(solved.clamped).toBe(false);
  });

  it('clamps unreachable targets instead of producing NaN', () => {
    const solved = solveTwoBone(-2, 0, 0.2, 0.2, 1, createTwoBoneSolution());
    expect(solved.clamped).toBe(true);
    expect(Number.isFinite(solved.upper)).toBe(true);
    expect(Number.isFinite(solved.lower)).toBe(true);
  });
});
