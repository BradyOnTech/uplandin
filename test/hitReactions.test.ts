import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/game/math';
import {
  chooseHitReaction, createHitReaction, featherCount, foldDrag, foldStep, MIN_REACTION_HEIGHT_M, stepHitReaction,
  type FallBody, type HitReactionKind, type HitShot,
} from '../src/three/hitReactions';
import { TOO_CLOSE_M } from '../src/three/shotFx';
import type { BirdFamily } from '../src/three/subsystems/birds';

const flight = { heightM: 6, speedMps: 14 };
const shares = (family: BirdFamily, shot: HitShot | undefined, fl = flight, n = 6000) => {
  const rng = mulberry32(17), counts: Record<HitReactionKind, number> = { fold: 0, tower: 0, sail: 0, spiral: 0 };
  for (let i = 0; i < n; i++) counts[chooseHitReaction(family, shot, fl, rng)]++;
  return { fold: counts.fold / n, tower: counts.tower / n, sail: counts.sail / n, spiral: counts.spiral / n };
};
const body = (): FallBody => ({ x: 0, y: 6, z: 0, vxW: 12, vyW: 2, vzW: 3 });
/** Run a reaction from the hit until the bird reaches the ground (y = 0). */
const land = (kind: HitReactionKind, family: BirdFamily = 'pheasant', start = body()) => {
  const reaction = createHitReaction(kind, 0, Math.atan2(start.vxW, start.vzW), start.vyW, mulberry32(3));
  const dt = 1 / 30;
  let t = 0, top = start.y, collapsedAt = -1;
  while (start.y > 0 && t < 20) {
    stepHitReaction(start, reaction, t, dt, family);
    t += dt; top = Math.max(top, start.y);
    if (collapsedAt < 0 && reaction.collapsed) collapsedAt = t;
  }
  return { body: start, reaction, seconds: t, top, collapsedAt, carry: Math.hypot(start.x, start.z) };
};

describe('hit reactions', () => {
  it('folds a bird with no shot, too low to react, or shot up at close range', () => {
    expect(shares('pheasant', undefined).fold).toBe(1);
    expect(shares('pheasant', { offset: .7, wounded: true, rangeM: 30 }, { heightM: MIN_REACTION_HEIGHT_M - .1, speedMps: 14 }).fold).toBe(1);
    expect(shares('pheasant', { offset: .7, wounded: false, rangeM: TOO_CLOSE_M - 1 }).fold).toBe(1);
  });

  it('wing-tips most fringe wounds, and never sails a slow bird', () => {
    const fringe = shares('pheasant', { offset: .9, wounded: true, rangeM: 30 });
    expect(fringe.spiral).toBeGreaterThan(.64); expect(fringe.spiral).toBeLessThan(.76);
    expect(fringe.sail).toBeCloseTo(1 - fringe.spiral, 6);
    const far = shares('grouse', { offset: .5, wounded: true, rangeM: 46 });
    expect(far.spiral).toBeGreaterThan(.4); expect(far.spiral).toBeLessThan(.5);
    expect(shares('pheasant', { offset: .9, wounded: true, rangeM: 30 }, { heightM: 6, speedMps: 3 }).spiral).toBe(1);
  });

  it('towers roosters on body hits, never quail, and folds most centred hits', () => {
    const centred = shares('pheasant', { offset: .1, wounded: false, rangeM: 25 });
    expect(centred.fold).toBeGreaterThan(.8);
    const bodyHit = shares('pheasant', { offset: .7, wounded: false, rangeM: 25 });
    expect(bodyHit.tower).toBeGreaterThan(.2); expect(bodyHit.sail).toBeGreaterThan(.18);
    expect(bodyHit.fold).toBeLessThan(.65); expect(bodyHit.spiral).toBe(0);
    const quail = shares('quail', { offset: .7, wounded: false, rangeM: 25 });
    expect(quail.tower).toBe(0); expect(quail.sail).toBeLessThan(.1);
    // A long shot more often carries a dead bird on.
    expect(shares('chukar', { offset: .7, wounded: false, rangeM: 35 }).sail).toBeGreaterThan(shares('chukar', { offset: .7, wounded: false, rangeM: 25 }).sail);
  });

  it('draws the same reaction from the same stream', () => {
    const shot = { offset: .6, wounded: false, rangeM: 28 };
    const a = mulberry32(99), b = mulberry32(99);
    for (let i = 0; i < 50; i++) expect(chooseHitReaction('pheasant', shot, flight, a)).toBe(chooseHitReaction('pheasant', shot, flight, b));
  });

  it('drops a folded pheasant along the same momentum arc as before', () => {
    const fold = body(), manual = body(), dt = 1 / 30, drag = .65, decay = Math.exp(-drag * dt);
    foldStep(fold, dt, foldDrag('pheasant'));
    manual.x += manual.vxW * (1 - decay) / drag; manual.z += manual.vzW * (1 - decay) / drag;
    manual.y += manual.vyW * dt - .5 * 9.81 * dt * dt;
    expect(fold.x).toBe(manual.x); expect(fold.z).toBe(manual.z); expect(fold.y).toBe(manual.y);
    expect(foldDrag('quail')).toBeGreaterThan(foldDrag('pheasant'));
  });

  it('towers up, tops out with no climb left, then folds and falls nearly straight down', () => {
    const tower = land('tower');
    expect(tower.collapsedAt).toBeGreaterThan(1); expect(tower.collapsedAt).toBeLessThan(1.7);
    expect(tower.top - 6).toBeGreaterThan(3);
    // Standing on its tail, the bird loses its forward speed during the climb.
    expect(tower.carry).toBeLessThan(land('fold').carry);
    expect(tower.carry).toBeLessThan(9);
  });

  it('sails on well beyond where a folded bird lands', () => {
    const sail = land('sail'), fold = land('fold');
    expect(sail.carry).toBeGreaterThan(fold.carry + 8);
    expect(sail.seconds).toBeGreaterThan(fold.seconds);
  });

  it('corkscrews a wing-tipped bird down at a steady rate, close to its line', () => {
    const start = body(), reaction = createHitReaction('spiral', 0, 0, 2, mulberry32(5));
    expect(Math.abs(reaction.spin)).toBeGreaterThanOrEqual(5);
    for (let t = 0; t < 1; t += 1 / 30) stepHitReaction(start, reaction, t, 1 / 30, 'pheasant');
    expect(start.vyW).toBeLessThan(-4.5); expect(start.vyW).toBeGreaterThan(-5.6);
    expect(reaction.collapsed).toBe(false);
    expect(land('spiral').carry).toBeLessThan(10);
  });

  it('knocks the most feathers loose from a centred fold', () => {
    expect(featherCount('fold', 0)).toBe(14);
    expect(featherCount('fold', 1)).toBe(8);
    for (const kind of ['tower', 'sail', 'spiral'] as const) expect(featherCount(kind, .5)).toBeLessThan(featherCount('fold', .5));
  });
});
