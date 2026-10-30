import { describe, expect, it } from 'vitest';
import { RUNNER_MAX_ENERGY, updateBirds, type Bird, type RunnerEnv } from '../src/game/birds';
import { dist } from '../src/game/math';

/**
 * A chukar roads uphill ahead of a dog, but not for minutes: pressed long
 * enough, it sits tight for the dog to pin, or flushes wild. The same clock
 * ends a dog stood over a covey it cannot reach.
 */
const chukar = (id: number, over: Partial<Bird> = {}): Bird => ({
  id, coveyId: id, speciesId: 'chukar', pos: { x: 500, y: 500 }, state: 'hidden', runs: true,
  runEnergy: RUNNER_MAX_ENERGY, restingMs: 0, nerveMs: 3000, approachRoll: (id * .618) % 1, ...over,
});

/** A dog dogging one bird at `gap` yards for up to `seconds`; when it broke or sat. */
function press(b: Bird, seconds: number, gap = 28, env: Partial<RunnerEnv> = {}): { brokeAt: number | null; satAt: number | null } {
  const dog = { x: b.pos.x, y: b.pos.y + gap };
  let brokeAt: number | null = null, satAt: number | null = null;
  for (let tick = 1; tick <= seconds * 30 && brokeAt === null; tick++) {
    const broke: number[] = [];
    updateBirds(1000 / 30, [b], dog, { worldScale: true, bounds: { x: 0, y: 0, w: 2000, h: 2000 }, slopeAngle: -Math.PI / 2,
      runnerStyle: 'chukar', workedIds: [b.id], broke, ...env });
    if (broke.includes(b.id)) brokeAt = tick / 30;
    if (b.pressHold && satAt === null) satAt = tick / 30;
    // The dog keeps on the bird's heels.
    const d = dist(dog, b.pos);
    if (d > gap) { dog.x += (b.pos.x - dog.x) * (1 - gap / d); dog.y += (b.pos.y - dog.y) * (1 - gap / d); }
  }
  return { brokeAt, satAt };
}

describe('a pressed chukar', () => {
  it('ends every road inside a minute and a half, never inside forty-five seconds: it sits tight or flushes', () => {
    let sat = 0, flushedOffRoad = 0;
    for (let id = 1; id <= 40; id++) {
      const b = chukar(id), { brokeAt, satAt } = press(b, 180);
      expect(brokeAt, `bird ${id}`).not.toBeNull();
      expect(brokeAt!, `bird ${id}`).toBeLessThan(86);
      expect(brokeAt!, `bird ${id}`).toBeGreaterThan(45);
      if (satAt !== null) {
        sat++;
        // A bird that sat stopped running: the dog can close and point it.
        expect(b.runs).toBe(false);
        expect(satAt).toBeLessThan(brokeAt!);
      } else flushedOffRoad++;
    }
    expect(sat).toBeGreaterThan(8);
    expect(flushedOffRoad).toBeGreaterThan(8);
  });

  it('gives a bird that sits a sitter’s nerve, so the point can hold', () => {
    let checked = 0;
    for (let id = 1; id <= 40; id++) {
      const b = chukar(id), before = b.nerveMs;
      if (press(b, 180).satAt === null) continue;
      expect(b.nerveMs).toBeGreaterThan(before);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('stands any time under a point: the point has its own nerve', () => {
    const b = chukar(5);
    expect(press(b, 180, 6, { pointedIds: [5] }).brokeAt).toBeNull();
    expect(b.pressedMs ?? 0).toBe(0);
    // A covey-mate of the pointed bird stands too.
    const mate = chukar(6, { coveyId: 5 }), pointed = chukar(5);
    const broke: number[] = [];
    for (let tick = 0; tick < 30 * 120; tick++) updateBirds(1000 / 30, [pointed, mate], { x: 500, y: 520 },
      { worldScale: true, workedIds: [5], pointedIds: [5], broke });
    expect(broke).toEqual([]);
  });

  it('only feels a dog working its covey\u2019s scent, and only in the open field', () => {
    // A dog quartering close by, without the birds' scent, presses nothing.
    expect(press(chukar(7), 180, 20, { workedIds: [] }).brokeAt).toBeNull();
    // Working a covey-mate's scent presses the whole covey within reach: here
    // a dog stood over sitting birds it cannot close on.
    const mate = chukar(12, { coveyId: 11, runs: false }), worked = chukar(11, { pos: { x: 530, y: 500 }, runs: false }), broke: number[] = [];
    for (let tick = 0; tick < 30 * 120; tick++) updateBirds(1000 / 30, [worked, mate], { x: 500, y: 525 },
      { worldScale: true, workedIds: [11], broke });
    expect(broke).toContain(12);
    // The 2D field keeps its old runners.
    const flat = chukar(8);
    expect(press(flat, 180, 20, { worldScale: false }).brokeAt).toBeNull();
    expect(flat.pressedMs).toBeUndefined();
  });

  it('lets the clock run back down when the dog moves off', () => {
    const b = chukar(9);
    press(b, 20, 28);
    const pressed = b.pressedMs!;
    expect(pressed).toBeGreaterThan(15_000);
    press(b, 10, 400);
    expect(b.pressedMs!).toBeLessThan(pressed);
  });

  it('leaves other species to their own temperament', () => {
    const rooster: Bird = { ...chukar(10), speciesId: 'ringneck' };
    expect(press(rooster, 180, 30, { runnerStyle: 'pheasant' }).brokeAt).toBeNull();
  });
});
