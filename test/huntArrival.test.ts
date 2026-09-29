import { describe, expect, it } from 'vitest';
import { HUNT_ARRIVAL_DURATION, sampleHuntArrival, type HuntArrivalSite } from '../src/three/huntArrival';

const site: HuntArrivalSite = {
  crateFloor: { x: 3, y: 1.3, z: 2 }, boxThreshold: { x: 3, y: 1.3, z: 2.9 },
  tailgateEdge: { x: 3, y: 1.285, z: 3.38 }, landing: { x: 3, y: .36, z: 4.7 },
  releaseHeading: Math.PI / 2, fieldHeading: Math.PI * 1.95,
};

describe('seekable dog release timeline', () => {
  it('holds the dog inside until both exits are open', () => {
    const initial = sampleHuntArrival(site, 0);
    expect(initial.phase).toBe('anticipating'); expect(initial.crateDoor).toBe(0); expect(initial.tailgate).toBe(0);
    for (let time = 0; time <= 1.02; time += .017) {
      const frame = sampleHuntArrival(site, time);
      expect({ x: frame.dog.x, y: frame.dog.y, z: frame.dog.z }).toEqual(site.crateFloor);
    }
    const release = sampleHuntArrival(site, 1.02);
    expect(release.crateDoor).toBe(1); expect(release.tailgate).toBe(1);
    expect(sampleHuntArrival(site, 1.1).dog.z).toBeGreaterThan(site.crateFloor.z);
  });

  it('crosses the actual sill before hopping off the platform onto the sampled ground', () => {
    const threshold = sampleHuntArrival(site, 1.02 + .5 * .55);
    expect(threshold.dog.x).toBeCloseTo(site.boxThreshold.x, 10);
    expect(threshold.dog.z).toBeCloseTo(site.boxThreshold.z, 10);
    expect(threshold.dog.y).toBeCloseTo(site.boxThreshold.y, 10);
    const takeoff = sampleHuntArrival(site, 1.52), midair = sampleHuntArrival(site, 1.84), landing = sampleHuntArrival(site, 2.16);
    expect(takeoff.dog.z).toBe(site.tailgateEdge.z); expect(takeoff.dog.y).toBe(site.tailgateEdge.y);
    expect(midair.phase).toBe('airborne'); expect(midair.dog.locomotion).toBe('hop');
    expect(midair.dog.y).toBeGreaterThan((site.tailgateEdge.y + site.landing.y) / 2 + .25);
    expect(landing.dog.y).toBe(site.landing.y); expect(landing.dog.z).toBe(site.landing.z);
    expect(sampleHuntArrival(site, 2.31).dog.bodyCompression).toBeGreaterThan(.20);
  });

  it('has continuous pose, hinge, and compression values at every phase boundary', () => {
    for (const time of [.18, .43, .78, 1, 1.02, 1.295, 1.39, 1.52, 2.16, 2.47, 2.48, 3.2]) {
      const before = sampleHuntArrival(site, time - 1e-6), after = sampleHuntArrival(site, time + 1e-6);
      for (const field of ['x', 'y', 'z', 'heading', 'pitch', 'bodyCompression', 'excitement'] as const) {
        expect(Math.abs(after.dog[field] - before.dog[field]), `${time}: ${field}`).toBeLessThan(.0001);
      }
      expect(Math.abs(before.crateDoor - after.crateDoor)).toBeLessThan(.0001);
      expect(Math.abs(before.tailgate - after.tailgate)).toBeLessThan(.0001);
    }
  });

  it('gives skip and natural playback the same grounded, field-facing endpoint', () => {
    const before = JSON.stringify(site);
    const final = sampleHuntArrival(site, HUNT_ARRIVAL_DURATION);
    expect(final).toEqual(sampleHuntArrival(site, Infinity)); expect(final.done).toBe(true); expect(final.phase).toBe('ready');
    expect({ x: final.dog.x, y: final.dog.y, z: final.dog.z }).toEqual(site.landing);
    expect(Math.sin(final.dog.heading - site.fieldHeading)).toBeCloseTo(0, 10);
    expect(Math.cos(final.dog.heading - site.fieldHeading)).toBeCloseTo(1, 10);
    expect(final.dog.bodyCompression).toBeCloseTo(0, 10); expect(final.dog.pitch).toBeCloseTo(0, 10);
    expect(final.crateDoor).toBe(1); expect(final.tailgate).toBe(1);
    expect(JSON.stringify(site)).toBe(before);
    expect(sampleHuntArrival(site, NaN)).toEqual(sampleHuntArrival(site, -1));
  });

  it('reuses output without carrying pose state backward through a seek', () => {
    const output = sampleHuntArrival(site, 1.84), dog = output.dog;
    expect(sampleHuntArrival(site, 3.2, output)).toBe(output); expect(output.dog).toBe(dog);
    expect(sampleHuntArrival(site, 0, output)).toEqual(sampleHuntArrival(site, 0));
    for (let time = 0; time <= HUNT_ARRIVAL_DURATION; time += .01) {
      const frame = sampleHuntArrival(site, time, output);
      for (const value of Object.values(frame.dog).filter(value => typeof value === 'number')) expect(Number.isFinite(value)).toBe(true);
      expect(frame.crateDoor).toBeGreaterThanOrEqual(0); expect(frame.crateDoor).toBeLessThanOrEqual(1);
      expect(frame.tailgate).toBeGreaterThanOrEqual(0); expect(frame.tailgate).toBeLessThanOrEqual(1);
    }
  });
});
