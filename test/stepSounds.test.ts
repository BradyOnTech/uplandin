import { describe, expect, it } from 'vitest';
import { onRoute, STEP_RATE, STEP_SURFACES, stepSurface, synthesizeStep, type StepSurface } from '../src/three/sound/stepSounds';
import { peak, rms } from '../src/three/sound/dsp';
import { LandscapeModel, type GroundSample } from '../src/game/landscape';
import { getArea } from '../src/game/areas';

/** Share of a stretch's energy above a frequency, from first differences (a rough brightness). */
function brightness(samples: Float32Array, from: number, to: number): number {
  let edge = 0, body = 0;
  for (let i = Math.round(from * STEP_RATE) + 1; i < Math.round(to * STEP_RATE); i++) { edge += (samples[i] - samples[i - 1]) ** 2; body += samples[i] ** 2; }
  return edge / Math.max(1e-12, body);
}
/** Separate hard contacts: peaks of a short-window envelope, a few milliseconds apart. */
function contacts(samples: Float32Array): number {
  const window = Math.round(STEP_RATE * .002), envelope: number[] = [];
  for (let i = 0; i + window <= samples.length; i += window) envelope.push(rms(samples, i, i + window));
  const top = Math.max(...envelope);
  let count = 0, last = -10;
  for (let i = 1; i < envelope.length - 1; i++) {
    if (envelope[i] > envelope[i - 1] && envelope[i] >= envelope[i + 1] && envelope[i] > top * .2 && i - last >= 3) { count++; last = i; }
  }
  return count;
}

describe('footsteps', () => {
  it('know the ground underfoot', () => {
    const ground = (rockiness: number, vegetation: number, moisture: number) => ({ rockiness, vegetation, moisture });
    expect(stepSurface(ground(0, .7, 0), false, 0)).toBe('grass');
    expect(stepSurface(ground(0, .2, 0), false, 0)).toBe('dirt');
    expect(stepSurface(ground(0, .7, 0), true, 0)).toBe('cover');
    expect(stepSurface(ground(0, .7, 0), false, 0, true)).toBe('dirt');
    expect(stepSurface(ground(.4, .5, 0), true, 0)).toBe('scree');
    expect(stepSurface(ground(.8, .1, 0), false, 0, true)).toBe('rock');
    expect(stepSurface(ground(.8, .1, .9), false, 0)).toBe('wet');
    expect(stepSurface(ground(0, .7, .9), true, .3)).toBe('water');
    const lane = [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
    expect(onRoute(lane, 50, 3, 4)).toBe(true);
    expect(onRoute(lane, 50, 6, 4)).toBe(false);
    expect(onRoute(lane, 103, 0, 4)).toBe(true);
    expect(onRoute([], 0, 0, 4)).toBe(false);
  });

  it('find rock and scree on the rimrock, and wet ground at the water, on the real grounds', () => {
    const mix = (id: string) => {
      const land = new LandscapeModel(getArea(id)), bounds = land.worldBounds(), counts = new Map<StepSurface, number>();
      const sample: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
      for (let x = bounds.minX; x < bounds.maxX; x += (bounds.maxX - bounds.minX) / 40) {
        for (let z = bounds.minZ; z < bounds.maxZ; z += (bounds.maxZ - bounds.minZ) / 40) {
          const surface = stepSurface(land.surfaceAtWorld(x, z, sample), false, 0);
          counts.set(surface, (counts.get(surface) ?? 0) + 1);
        }
      }
      return counts;
    };
    const chukar = mix('chukar-ridge'), coverts = mix('pheasant-coverts'), prairie = mix('sharptail-prairie');
    expect((chukar.get('rock') ?? 0) + (chukar.get('scree') ?? 0)).toBeGreaterThan(20);
    expect(coverts.get('wet') ?? 0).toBeGreaterThan(0);
    expect(prairie.get('rock') ?? 0).toBe(0);
    expect(prairie.get('grass')).toBeGreaterThan(1000);
  });

  it('are clean, a little different each time, and harder at a run', () => {
    for (const surface of STEP_SURFACES) {
      const step = synthesizeStep(surface, 1);
      expect(step.every(Number.isFinite), surface).toBe(true);
      expect(peak(step), surface).toBeCloseTo(.9, 2);
      expect(Math.abs(step[step.length - 1]), surface).toBe(0);
      expect(step.length / STEP_RATE).toBeLessThan(.5);
      expect(synthesizeStep(surface, 1)).toEqual(step);
      expect(synthesizeStep(surface, 2), surface).not.toEqual(step);
      expect(synthesizeStep(surface, 1, true), surface).not.toEqual(step);
    }
  });

  it('sound like their ground: stone knocks bright, cover hisses on, scree rattles, water splashes', () => {
    const step = (surface: StepSurface) => synthesizeStep(surface, 3);
    // The heel on stone is brighter than on dirt.
    expect(brightness(step('rock'), 0, .03)).toBeGreaterThan(1.5 * brightness(step('dirt'), 0, .03));
    // Tall cover drags on past the boot; bare dirt is done.
    const tail = (surface: StepSurface) => rms(step(surface), STEP_RATE * .16, STEP_RATE * .26) / rms(step(surface), 0, STEP_RATE * .1);
    expect(tail('cover')).toBeGreaterThan(5 * tail('dirt'));
    expect(tail('water')).toBeGreaterThan(5 * tail('dirt'));
    // Loose stones: many separate little contacts.
    expect(contacts(step('scree'))).toBeGreaterThan(2 * contacts(step('dirt')));
  });
});
