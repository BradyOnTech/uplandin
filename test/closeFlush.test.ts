import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import {
  CLOSE_FLUSH_THRESHOLD, closeFlushIntensity, coveyRoll, heldSingles, HELD_SINGLE_FLUSH_RADIUS, SECOND_BIRD,
  tightCovey, tightCoveyRadius, tightCoveyShare,
} from '../src/game/closeFlush';
import { Dog } from '../src/game/dog';
import { HuntSimulation } from '../src/game/huntSimulation';
import { mulberry32 } from '../src/game/math';
import { createHunt } from '../src/game/state';
import { synthesizePheasantLaunch } from '../src/three/pheasantFlushAudio';
import { synthesizeBirdLaunch } from '../src/three/speciesFlushAudio';
import { QuailFlushDebris } from '../src/three/quailFlushDebris';
import { flinchEnvelope } from '../src/three/subsystems/player';
import { shotCall } from '../src/three/shotFx';

const bird = (id: number, coveyId: number, speciesId: string, x: number, y: number, extra: Partial<Bird> = {}): Bird => ({
  id, coveyId, speciesId, pos: { x, y }, state: 'hidden', runs: false, runEnergy: 2500, restingMs: 0, nerveMs: 60000, ...extra,
});
function simulation(areaId: string, birds: Bird[], hunter: { x: number; y: number }, pointed?: number) {
  const area = getArea(areaId), hunt = createHunt(area, mulberry32(11), { wind: 'calm', condition: 'mild' });
  hunt.birds = birds; hunt.hunterPos = { ...hunter };
  const dog = new Dog({ x: hunter.x - 30, y: hunter.y - 30 }, { breed: getBreed('english-setter'), level: 8 }, mulberry32(12), area.world);
  if (pointed !== undefined) { dog.state = 'pointing'; dog.gait = 'still'; dog.pointedBirdId = pointed; dog.pos = { x: birds[0].pos.x - 12, y: birds[0].pos.y }; }
  else { dog.state = 'heel'; }
  return { hunt, dog, sim: new HuntSimulation({ hunt, dogs: [dog], area, rng: mulberry32(13), continuousEncounter: true }) };
}
const rms = (samples: Float32Array, from: number, to: number) =>
  Math.sqrt(samples.slice(from, to).reduce((sum, value) => sum + value * value, 0) / Math.max(1, to - from));

describe('the close flush', () => {
  it('is full under the boots, fading out by the edge of easy gun range', () => {
    expect(closeFlushIntensity('ringneck', 3)).toBe(1);
    expect(closeFlushIntensity('ringneck', 6)).toBeGreaterThan(CLOSE_FLUSH_THRESHOLD);
    expect(closeFlushIntensity('ringneck', 9)).toBe(0);
    expect(closeFlushIntensity('chukar', 4)).toBe(1);
    expect(closeFlushIntensity('chukar', 12)).toBe(0);
    expect(closeFlushIntensity('bobwhite', Number.NaN)).toBe(0);
  });

  it('lets some coveys sit tight: quail and chukar now and then, sharptail occasionally', () => {
    const share = (species: string) => Array.from({ length: 2000 }, (_, i) => i / 2000).filter(roll => tightCovey(species, roll)).length / 2000;
    expect(share('chukar')).toBeCloseTo(tightCoveyShare('chukar'), 2);
    expect(share('sharptail')).toBeLessThan(share('chukar'));
    expect(share('ringneck')).toBe(0);
    for (const roll of [0, .05, .29]) {
      const radius = tightCoveyRadius('chukar', roll);
      expect(radius).toBeGreaterThanOrEqual(2.5); expect(radius).toBeLessThanOrEqual(5.5);
    }
    // A covey's roll comes from its first bird and never changes with the walk-in.
    const covey = [bird(5, 2, 'chukar', 0, 0, { approachRoll: .4 }), bird(3, 2, 'chukar', 1, 0, { approachRoll: .9 })];
    expect(coveyRoll(covey, 2)).toBe(coveyRoll([...covey].reverse(), 2));
    expect(coveyRoll(covey, 2)).not.toBe(.9);
  });

  it('walks right in on a tight covey before it goes', () => {
    // approachRoll 0 gives a covey roll of .173: inside chukar's tight share.
    const covey = Array.from({ length: 6 }, (_, i) => bird(900 + i, 40, 'chukar', 300 + (i % 3), 300 + Math.floor(i / 3), { approachRoll: i ? .5 : 0 }));
    expect(tightCovey('chukar', coveyRoll(covey, 40))).toBe(true);
    const f = simulation('chukar-ridge', covey, { x: 280, y: 300 }, 900);
    let flushedAt = Infinity;
    for (let step = 0; step < 80 && flushedAt === Infinity; step++) {
      const hunter = { x: 280 + step * .25, y: 300 };
      const events = f.sim.update(1000 / 30, { hunterPos: hunter });
      if (events.some(event => event.type === 'covey-flushed')) flushedAt = 300 - hunter.x;
    }
    expect(flushedAt).toBeLessThanOrEqual(5.6);
    expect(flushedAt).toBeGreaterThan(2);
  });

  it('leaves a covey bird or two sitting after the rise, to go up alone when walked up on', () => {
    // Find a trigger whose seeded roll holds birds back (the roll is fixed per bird).
    const roll = (id: number) => (Math.imul(id + 1, 2246822519) >>> 0) / 0xffffffff;
    const trigger = Array.from({ length: 400 }, (_, i) => 2000 + i).find(id => heldSingles('chukar', 8, roll(id), false) > 0)!;
    const covey = Array.from({ length: 8 }, (_, i) => bird(trigger + i, 41, 'chukar', 400 + i * 2, 300, { approachRoll: .6 }));
    const f = simulation('chukar-ridge', covey, { x: 380, y: 300 });
    const rise = f.sim.flushBird(trigger, 'proximity', null)!;
    const held = covey.filter(candidate => candidate.state === 'hidden');
    expect(held.length).toBeGreaterThanOrEqual(1);
    expect(held.every(candidate => candidate.heldSingle && !rise.birdIds.includes(candidate.id))).toBe(true);
    // The farthest birds held, and they go up one at a time as the hunter closes.
    const single = held[0];
    f.hunt.hunterPos = { x: single.pos.x - HELD_SINGLE_FLUSH_RADIUS - 4, y: 300 };
    let second: number[] | undefined;
    for (let step = 0; step < 60 && !second; step++) {
      const events = f.sim.update(1000 / 30, { hunterPos: { x: single.pos.x - HELD_SINGLE_FLUSH_RADIUS - 4 + step * .3, y: 300 } });
      second = events.flatMap(event => event.type === 'covey-flushed' ? [event.birdIds] : [])[0];
    }
    expect(second).toHaveLength(1);
  });

  it('may put a second pheasant up a beat after the first', () => {
    const roll = (id: number) => (Math.imul(id + 7, 3266489917) >>> 0) / 0xffffffff;
    const first = Array.from({ length: 400 }, (_, i) => 3000 + i).find(id => roll(id) < SECOND_BIRD.chance)!;
    const pair = [bird(first, 50, 'ringneck', 300, 300, { sex: 'rooster', runs: false }), bird(first + 1000, 51, 'ringneck', 308, 300, { sex: 'hen', runs: false })];
    const f = simulation('pheasant-coverts', pair, { x: 260, y: 300 });
    f.sim.flushBird(first, 'proximity', null);
    expect(pair[1].state).toBe('hidden');
    let startle: number | undefined, elapsed = 0;
    for (let step = 0; step < 120 && startle === undefined; step++) {
      const events = f.sim.update(1000 / 30, { hunterPos: { x: 260, y: 300 } });
      elapsed += 1000 / 30;
      for (const event of events) if (event.type === 'covey-flushed' && event.cause === 'startle') startle = event.birdId;
    }
    expect(startle).toBe(first + 1000);
    expect(elapsed).toBeGreaterThanOrEqual(SECOND_BIRD.minMs);
    expect(elapsed).toBeLessThanOrEqual(SECOND_BIRD.maxMs + 50);
  });

  it('opens with a clap and a thump, and a rooster underfoot always cackles', () => {
    const quiet = synthesizePheasantLaunch(true, { seed: 7 }), loud = synthesizePheasantLaunch(true, { seed: 7, burst: 1 });
    expect(rms(loud.cover, 0, 1500)).toBeGreaterThan(rms(quiet.cover, 0, 1500) * 1.8);
    for (let seed = 1; seed < 40; seed++) expect(synthesizePheasantLaunch(true, { seed, burst: 1 }).calls).toBeGreaterThanOrEqual(2);
    expect(synthesizePheasantLaunch(false, { seed: 3, burst: 1 }).calls).toBe(0);
    const covey = synthesizeBirdLaunch('chukar', { seed: 7 }), close = synthesizeBirdLaunch('chukar', { seed: 7, burst: 1 });
    expect(rms(close.cover, 0, 1500)).toBeGreaterThan(rms(covey.cover, 0, 1500) * 1.5);
    for (const sample of [...loud.cover, ...close.cover, ...loud.flight, ...close.flight]) expect(Math.abs(sample)).toBeLessThan(1);
  });

  it('throws three times the cover, a loose feather and a white puff on snow', () => {
    const ordinary = new QuailFlushDebris('high', () => 0, 'tall-cover'), close = new QuailFlushDebris('high', () => 0, 'tall-cover');
    ordinary.launch(0, 0, 1, 0, 3); close.launch(0, 0, 1, 0, 3, { intensity: 1, feathers: 2, featherColor: 0x9a5328 });
    ordinary.render(); close.render();
    expect(close.audit().visible).toBe(ordinary.audit().visible * 3 + 2);
    const snow = new QuailFlushDebris('high', () => 0);
    snow.launch(0, 0, 1, 0, 3, { snow: true }); snow.render();
    const color = snow.mesh.geometry.attributes.color;
    expect(color.getX(0)).toBeGreaterThan(.8); expect(color.getZ(0)).toBeGreaterThan(.8);
    for (const effect of [ordinary, close, snow]) effect.dispose();
  });

  it('flinches for a moment, never long enough to steal the shot', () => {
    expect(flinchEnvelope(0)).toBe(0);
    expect(flinchEnvelope(.04)).toBeCloseTo(1);
    expect(flinchEnvelope(.25)).toBeLessThan(.15);
    expect(flinchEnvelope(.5)).toBe(0);
  });

  it('calls a rooster shot at his feet "too close"', () => {
    expect(shotCall(true, false, null, 6).text).toContain('TOO CLOSE');
    expect(shotCall(true, false, null, 22).text).toBe('BIRD DOWN');
    expect(shotCall(true, true, null, 6).tone).toBe('wound');
  });
});
