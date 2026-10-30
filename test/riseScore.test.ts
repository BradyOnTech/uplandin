import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/game/math';
import {
  BELOW_CONTOUR, countsAgainstCap, GUN_PATIENCE_MS, holdsSky, inTheShot, LEAVING_RANGE_M, laneLift, lanesOffTheHill, planRise, RISE_RANGE_M, riseScoreFor, SKY_MAX, SLEEPER_MIN_MS,
  WAVE_MAX_GAP_MS, waveLanes, waveMayRise,
  type RiseGun, type SkyClock,
} from '../src/game/riseScore';

const covey = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, distance: 30 - i }));
const sky = (patch: Partial<SkyClock> = {}): SkyClock => ({ nowMs: 10_000, inPlay: 0, lastWaveMs: 4_000, clearSinceMs: 9_000, ...patch });
const gun = (patch: Partial<RiseGun> = {}): RiseGun => ({ loaded: 2, capacity: 2, reloading: false, emptiedSinceWave: false, ...patch });

describe('the rise score plan', () => {
  it('puts every flushed bird in exactly one wave of at most three, nearest the boots first', () => {
    for (let seed = 1; seed < 60; seed++) {
      for (const species of ['bobwhite', 'hun', 'chukar', 'sharptail', 'ringneck', 'prairie-chicken']) {
        const waves = planRise(covey(12), species, mulberry32(seed));
        const ids = waves.flatMap(wave => wave.ids);
        expect([...ids].sort((a, b) => a - b)).toEqual(covey(12).map(b => b.id));
        for (const wave of waves) expect(wave.ids.length).toBeLessThanOrEqual(Math.min(SKY_MAX, riseScoreFor(species).waveSize));
        // Bird 12 sits nearest the hunter: it is in the first wave unless it is the sleeper.
        expect(waves[0].ids[0]).toBe(12);
      }
    }
  });

  it('breaks a bobwhite covey three at a time and a sharptail group in singles and pairs', () => {
    const quail = planRise(covey(12), 'bobwhite', mulberry32(3)).filter(wave => !wave.sleeper);
    expect(quail.slice(0, -1).every(wave => wave.ids.length === 3)).toBe(true);
    const sizes = new Set<number>();
    for (let seed = 1; seed < 30; seed++) planRise(covey(6), 'sharptail', mulberry32(seed)).forEach(wave => sizes.add(wave.ids.length));
    expect([...sizes].sort()).toEqual([1, 2]);
    expect(planRise(covey(2), 'ringneck', mulberry32(1)).map(wave => wave.ids.length)).toEqual([1, 1]);
  });

  it('holds back a sleeper now and then, never from a small covey, and always last', () => {
    let sleepers = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const waves = planRise(covey(9), 'bobwhite', mulberry32(seed));
      const held = waves.filter(wave => wave.sleeper);
      expect(held.length).toBeLessThanOrEqual(1);
      if (held.length) { sleepers++; expect(waves.at(-1)!.sleeper).toBe(true); expect(held[0].ids).toHaveLength(1); }
      expect(planRise(covey(3), 'bobwhite', mulberry32(seed)).some(wave => wave.sleeper)).toBe(false);
    }
    expect(sleepers / 400).toBeGreaterThan(.12); expect(sleepers / 400).toBeLessThan(.25);
  });

  it('is a pure function of its stream', () => {
    expect(planRise(covey(10), 'chukar', mulberry32(44))).toEqual(planRise(covey(10), 'chukar', mulberry32(44)));
  });
});

describe('which birds hold the sky', () => {
  it('lets a wave go when its birds are down, out of the shot, or have had their few seconds', () => {
    const live = { status: 'flying', rangeM: 25, sinceLaunchMs: 900 };
    expect(holdsSky(live)).toBe(true);
    expect(holdsSky({ ...live, status: 'waiting' })).toBe(true);
    expect(holdsSky({ ...live, status: 'falling' })).toBe(false);
    expect(holdsSky({ ...live, status: 'grounded' })).toBe(false);
    expect(holdsSky({ ...live, status: 'departing' })).toBe(false);
    expect(holdsSky({ ...live, rangeM: RISE_RANGE_M + .5 })).toBe(false);
    expect(holdsSky({ ...live, sinceLaunchMs: WAVE_MAX_GAP_MS })).toBe(false);
    // A bird that has had its seconds is still a target in the shot until it is down or out of range.
    const late = { ...live, sinceLaunchMs: WAVE_MAX_GAP_MS };
    expect(inTheShot(late)).toBe(true);
    expect(inTheShot({ ...live, rangeM: RISE_RANGE_M + .5 })).toBe(false);
    expect(inTheShot({ ...live, status: 'departing' })).toBe(false);
  });

  it('counts a leaving bird against the three until it is 55 m off, so the sky never shows six', () => {
    expect(countsAgainstCap({ status: 'flying', rangeM: 25 })).toBe(true);
    expect(countsAgainstCap({ status: 'flying', rangeM: RISE_RANGE_M + 8 })).toBe(true);
    expect(countsAgainstCap({ status: 'departing', rangeM: LEAVING_RANGE_M - .5 })).toBe(true);
    expect(countsAgainstCap({ status: 'departing', rangeM: LEAVING_RANGE_M + .5 })).toBe(false);
    expect(countsAgainstCap({ status: 'falling', rangeM: 20 })).toBe(false);
  });
});

describe('when the next wave may rise', () => {
  const bobwhite = riseScoreFor('bobwhite'), sharptail = riseScoreFor('sharptail');
  const wave = (n = 3, sleeper = false) => ({ ids: Array.from({ length: n }, (_, i) => i), sleeper, pauseMs: 500 });

  it('never puts more than three birds in the sky, even for a covey\'s first wave', () => {
    expect(waveMayRise(wave(3), bobwhite, sky({ inPlay: 1 }), true)).toBe(false);
    expect(waveMayRise(wave(2), bobwhite, sky({ inPlay: 1 }), true)).toBe(true);
    expect(waveMayRise(wave(1), sharptail, sky({ inPlay: 3, clearSinceMs: null }), false)).toBe(false);
  });

  it('lets the clock run on a wave that has had its seconds, but never crowds the sky past three', () => {
    // The last wave no longer holds the sky, but one of its birds is still in range.
    expect(waveMayRise(wave(3), bobwhite, sky({ inPlay: 0, inSky: 1, clearSinceMs: 9_500 }), false)).toBe(false);
    expect(waveMayRise(wave(2), bobwhite, sky({ inPlay: 0, inSky: 1, clearSinceMs: 9_500 }), false)).toBe(true);
    expect(waveMayRise(wave(3), bobwhite, sky({ inPlay: 0, inSky: 0, clearSinceMs: 9_500 }), false)).toBe(true);
  });

  it('lets a covey wave rise once the sky has cleared for its breath', () => {
    expect(waveMayRise(wave(), bobwhite, sky({ inPlay: 1, clearSinceMs: null }), false)).toBe(false);
    expect(waveMayRise(wave(), bobwhite, sky({ clearSinceMs: 9_700 }), false)).toBe(false);
    expect(waveMayRise(wave(), bobwhite, sky({ clearSinceMs: 9_500 }), false)).toBe(true);
  });

  it('never sends a wave into an empty gun until the hunter has had his chance to reload', () => {
    const empty = gun({ loaded: 0, emptiedSinceWave: true });
    expect(waveMayRise(wave(), bobwhite, sky({ gun: empty }), false)).toBe(false);
    expect(waveMayRise(wave(), bobwhite, sky({ gun: gun({ loaded: 1, reloading: true, emptiedSinceWave: true }) }), false)).toBe(false);
    // The covey does not wait for ever on a hunter who never reloads.
    expect(waveMayRise(wave(), bobwhite, sky({ gun: empty, clearSinceMs: 10_000 - 500 - GUN_PATIENCE_MS }), false)).toBe(true);
  });

  it('lifts the next wave as the gun comes back loaded, while earlier birds are still out', () => {
    const reloaded = gun({ emptiedSinceWave: true });
    expect(waveMayRise(wave(2), bobwhite, sky({ inPlay: 1, clearSinceMs: null, gun: reloaded }), false)).toBe(true);
    expect(waveMayRise(wave(3), bobwhite, sky({ inPlay: 1, clearSinceMs: null, gun: reloaded }), false)).toBe(false);
    expect(waveMayRise(wave(2), bobwhite, sky({ inPlay: 1, clearSinceMs: null, gun: gun() }), false)).toBe(false);
  });

  it('pops sharptails up while others are still in the air, a beat apart', () => {
    expect(waveMayRise(wave(1), sharptail, sky({ inPlay: 2, clearSinceMs: null, lastWaveMs: 9_700 }), false)).toBe(false);
    expect(waveMayRise(wave(1), sharptail, sky({ inPlay: 2, clearSinceMs: null, lastWaveMs: 9_400 }), false)).toBe(true);
  });

  it('gets the sleeper up when the gun is empty, or long after the hunter relaxed', () => {
    const sleeper = wave(1, true);
    const empty = gun({ loaded: 0, emptiedSinceWave: true });
    expect(waveMayRise(sleeper, bobwhite, sky({ inPlay: 2, clearSinceMs: null, lastWaveMs: 10_000 - SLEEPER_MIN_MS + 50, gun: empty }), false)).toBe(false);
    expect(waveMayRise(sleeper, bobwhite, sky({ inPlay: 2, clearSinceMs: null, gun: empty }), false)).toBe(true);
    expect(waveMayRise(sleeper, bobwhite, sky({ inPlay: 0, clearSinceMs: 9_800, gun: gun() }), false)).toBe(false);
    expect(waveMayRise(sleeper, bobwhite, sky({ inPlay: 0, clearSinceMs: 9_400, gun: gun() }), false)).toBe(true);
  });
});

describe('wave lanes', () => {
  it('puts wave-mates on distinct bearings, a lane step apart within jitter', () => {
    for (let seed = 1; seed < 200; seed++) {
      const lanes = waveLanes(3, .42, mulberry32(seed)).map(lane => lane.offset).sort((a, b) => a - b);
      expect(lanes[1] - lanes[0]).toBeGreaterThan(.42 * .64);
      expect(lanes[2] - lanes[1]).toBeGreaterThan(.42 * .64);
      expect(Math.max(...lanes.map(Math.abs))).toBeLessThan(.42 * 1.22);
      const pair = waveLanes(2, .42, mulberry32(seed)).map(lane => lane.offset);
      expect(Math.abs(pair[0] - pair[1])).toBeGreaterThan(.42 * .84);
    }
  });

  it('opens a wave breaking across the gun on screen, not one bird behind another', () => {
    // Seen from the gun, a bird's sideways share of its speed is sin(bearing off the sight line).
    for (let seed = 1; seed < 200; seed++) {
      for (const offSight of [0, .6, 1.2, -1.4]) {
        const sideways = waveLanes(3, .55, mulberry32(seed), offSight).map(lane => Math.sin(offSight + lane.offset)).sort((a, b) => a - b);
        expect(sideways[1] - sideways[0]).toBeGreaterThan(Math.sin(.55) * .3);
        expect(sideways[2] - sideways[1]).toBeGreaterThan(Math.sin(.55) * .3);
        // Every lane still flies away from the gun.
        for (const lane of waveLanes(3, .55, mulberry32(seed), offSight)) expect(Math.cos(offSight + lane.offset)).toBeGreaterThan(.2);
      }
    }
  });

  it('pours a downhill flier\'s wave off the slope: no lane above the contour, spacing kept', () => {
    for (let seed = 1; seed < 100; seed++) {
      for (const [escape, uphill] of [[.1, -Math.PI / 2], [Math.PI / 2, -Math.PI / 2], [-1.3, -1.6], [3, 2.2]]) {
        const lanes = waveLanes(3, .5, mulberry32(seed));
        const poured = lanesOffTheHill(lanes, escape, uphill);
        for (const lane of poured) {
          // The uphill share of its heading is never positive: at least BELOW_CONTOUR under the contour.
          expect(Math.cos(escape + lane.offset - uphill)).toBeLessThanOrEqual(Math.cos(Math.PI / 2 + BELOW_CONTOUR) + 1e-9);
        }
        const gaps = (set: { offset: number }[]) => set.map(l => l.offset).sort((a, b) => a - b).map((v, i, a) => i ? v - a[i - 1] : 0);
        expect(gaps(poured)).toEqual(gaps(lanes).map(g => expect.closeTo(g, 9)));
      }
    }
    // A wave already pouring straight downhill is left alone.
    const down = waveLanes(3, .5, mulberry32(3));
    expect(lanesOffTheHill(down, Math.PI / 2, -Math.PI / 2)).toEqual(down);
  });

  it('breaks a popcorn single away from the side birds already in the shot are on', () => {
    for (let seed = 1; seed < 50; seed++) {
      expect(waveLanes(1, .55, mulberry32(seed), 0, 1)[0].offset).toBeLessThan(0);
      expect(waveLanes(1, .55, mulberry32(seed), 0, -1)[0].offset).toBeGreaterThan(0);
      // Even when its covey's escape line runs toward the birds already up.
      for (const [escape, avoid] of [[-.6, -1], [.7, 1], [-1.1, -1]]) {
        const offSight = escape + waveLanes(1, .55, mulberry32(seed), escape, avoid)[0].offset;
        expect(Math.sign(offSight)).toBe(-avoid); expect(Math.abs(offSight)).toBeGreaterThan(.29);
      }
      // A pair goes up on the free side together, still a lane apart.
      for (const [escape, avoid] of [[0, 1], [.6, 1], [-.5, -1]]) {
        const pair = waveLanes(2, .55, mulberry32(seed), escape, avoid).map(lane => Math.sin(escape + lane.offset));
        for (const s of pair) expect(-avoid * s).toBeGreaterThan(.14);
        expect(Math.abs(pair[0] - pair[1])).toBeGreaterThan(Math.sin(.55) * .9);
      }
      // An escape already wider on the free side is kept.
      expect(waveLanes(1, .55, mulberry32(seed), 1.2, -1)[0].offset).toBeCloseTo(0, 9);
    }
  });

  it('lifts the middle lane above the sides, and splits a pair high and low', () => {
    const lanes = waveLanes(3, .55, mulberry32(5));
    const lifts = lanes.map(laneLift).sort((a, b) => a - b);
    expect(lifts[2]).toBeGreaterThan(lifts[0] + .3);
    const pair = waveLanes(2, .55, mulberry32(5)).map(laneLift).sort((a, b) => a - b);
    expect(pair[1] - pair[0]).toBeCloseTo(.5);
    expect(laneLift(undefined)).toBe(1);
  });
});
