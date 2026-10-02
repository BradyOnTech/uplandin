import { afterEach, describe, expect, it, vi } from 'vitest';
import { bellPitch, BELL_PITCHES, BREATH_RATE, DOG_SOUND_RATE, DogBreathing, synthesizeBell, synthesizePant, synthesizeSniffs,
  synthesizeWhistle, WHISTLES, type WhistleCall } from '../src/three/sound/dogSounds';
import { peak, rms } from '../src/three/sound/dsp';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';
import { LandscapeModel } from '../src/game/landscape';
import { parseDropPointId, resolveThreeHuntArea } from '../src/game/gameplayMode';
import { playWhistle } from '../src/audio';
import type { Ctx } from '../src/three/engine';
import type { DogGait, DogScentStage, DogState } from '../src/game/dog';

vi.mock('../src/audio', () => ({ playWhistle: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

/** Energy at one frequency (Goertzel), over a stretch of the sound. */
function energyAt(samples: Float32Array, rate: number, frequency: number, from = 0, to = samples.length / rate): number {
  const w = 2 * Math.PI * frequency / rate, k = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = Math.round(from * rate); i < Math.min(samples.length, Math.round(to * rate)); i++) { const s0 = samples[i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return s1 * s1 + s2 * s2 - k * s1 * s2;
}
/** Energy across a band around a frequency, ±6%. */
const bandAt = (samples: Float32Array, rate: number, frequency: number) => {
  let sum = 0;
  for (let f = frequency * .94; f <= frequency * 1.06; f += 4) sum += energyAt(samples, rate, f);
  return sum;
};
/** Stretches louder than a floor: the blasts of a whistle, the bursts of a breath. */
function bursts(samples: Float32Array, rate: number, floor: number): { at: number; length: number }[] {
  const window = Math.round(rate * .004), found: { at: number; length: number }[] = [];
  let start = -1;
  for (let i = 0; i + window <= samples.length; i += window) {
    const loud = rms(samples, i, i + window) > floor;
    if (loud && start < 0) start = i;
    if (!loud && start >= 0) { found.push({ at: start / rate, length: (i - start) / rate }); start = -1; }
  }
  if (start >= 0) found.push({ at: start / rate, length: (samples.length - start) / rate });
  return found;
}

describe("the dog's bell", () => {
  it("rings in each dog's own voice, so a brace can be told apart", () => {
    expect(new Set(BELL_PITCHES).size).toBe(BELL_PITCHES.length);
    expect(bellPitch(3)).toBe(bellPitch(0));
    const first = synthesizeBell(bellPitch(0), 1), second = synthesizeBell(bellPitch(1), 1);
    expect(bandAt(first, DOG_SOUND_RATE, bellPitch(0))).toBeGreaterThan(20 * bandAt(first, DOG_SOUND_RATE, bellPitch(1)));
    expect(bandAt(second, DOG_SOUND_RATE, bellPitch(1))).toBeGreaterThan(20 * bandAt(second, DOG_SOUND_RATE, bellPitch(0)));
  });

  it('rings on after the clapper strikes, dying away clean, a little different each time', () => {
    for (const seed of [1, 2, 3]) {
      const ring = synthesizeBell(bellPitch(0), seed);
      expect(ring.every(Number.isFinite)).toBe(true);
      expect(peak(ring)).toBeCloseTo(.9, 2);
      expect(Math.abs(ring[ring.length - 1])).toBe(0);
      const strike = rms(ring, 0, DOG_SOUND_RATE * .05), later = rms(ring, DOG_SOUND_RATE * .4, DOG_SOUND_RATE * .5);
      // Still ringing, well under the strike.
      expect(later).toBeGreaterThan(strike * .05);
      expect(later).toBeLessThan(strike * .5);
    }
    expect(synthesizeBell(bellPitch(0), 2)).not.toEqual(synthesizeBell(bellPitch(0), 1));
  });
});

describe("the handler's whistle", () => {
  it('speaks the field dog language: one long blast, one pip, two, three, and the trill', () => {
    const counts: Record<WhistleCall, number> = { whoa: 1, release: 1, cast: 2, dead: 3, recall: 3 };
    for (const call of Object.keys(WHISTLES) as WhistleCall[]) {
      const whistle = synthesizeWhistle(call, 1), heard = bursts(whistle, DOG_SOUND_RATE, .05);
      expect(heard, call).toHaveLength(counts[call]);
      expect(whistle.every(Number.isFinite) && whistle[whistle.length - 1] === 0, call).toBe(true);
      // A high, clear tone, nothing like a voice.
      expect(bandAt(whistle, DOG_SOUND_RATE, 3150)).toBeGreaterThan(30 * bandAt(whistle, DOG_SOUND_RATE, 1500));
    }
    expect(bursts(synthesizeWhistle('whoa', 1), DOG_SOUND_RATE, .05)[0].length).toBeGreaterThan(.45);
    expect(bursts(synthesizeWhistle('cast', 1), DOG_SOUND_RATE, .05).every(pip => pip.length < .15)).toBe(true);
    // The recall trill warbles with the pea, many times a second.
    const trill = synthesizeWhistle('recall', 1), dips = bursts(trill.subarray(0, Math.round(.8 * DOG_SOUND_RATE)), DOG_SOUND_RATE, .25);
    expect(dips.length).toBeGreaterThan(15);
  });

  it('goes out for every command, whether or not the dog is in its carry', () => {
    vi.stubGlobal('location', { search: '?breed=gsp' });
    const queue: ('whoa' | 'release' | 'cast')[][] = [['whoa'], [], ['cast', 'release']];
    let recall = false;
    const camera = { position: { x: 0, z: 40 }, rotation: { y: Math.PI }, getWorldDirection: (out: { set(x: number, y: number, z: number): unknown }) => out.set(0, 0, -1) };
    const player = { isRunning: () => false, consumeRecall: () => { const now = recall; recall = false; return now; },
      consumeCommands: () => queue.shift() ?? [], setHuntHeading: () => undefined };
    const ctx = { camera, get: (id: string) => id === 'player' ? player : id === 'terrain' ? { heightAt: () => 0 } : { isRiseActive: () => false } } as unknown as Ctx;
    const hunt = new Hunt3DSystem(new LandscapeModel(resolveThreeHuntArea(location.search), parseDropPointId(location.search)));
    hunt.init(ctx);
    hunt.step(ctx, 4);
    recall = true; hunt.step(ctx, 1);
    expect(vi.mocked(playWhistle).mock.calls).toEqual([['whoa'], ['cast'], ['release'], ['recall']]);
  });
});

describe("the dog's breath", () => {
  const dog = (state: DogState, gait: DogGait, scentStage: DogScentStage = 'none') => ({ state, gait, scentStage });
  const listen = (breath: DogBreathing, seconds: number, who: ReturnType<typeof dog>, distance: number) => {
    const heard: { at: number; cue: string; level: number }[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) { const breath1 = breath.advance(1 / 60, who, distance); if (breath1) heard.push({ at: t, ...breath1 }); }
    return heard;
  };

  it('is too quiet to hear from a fresh dog, and quickens as the dog works', () => {
    const breath = new DogBreathing();
    expect(listen(breath, 3, dog('heel', 'still'), 3)).toEqual([]);
    listen(breath, 4, dog('quartering', 'run'), 40);
    const blown = listen(breath, 3, dog('quartering', 'trot'), 4);
    expect(blown.length).toBeGreaterThan(5);
    expect(blown.every(heard => heard.cue === 'pant')).toBe(true);
    listen(breath, 10, dog('quartering', 'run'), 40);
    expect(listen(breath, 3, dog('quartering', 'trot'), 4).length).toBeGreaterThan(blown.length);
    // Farther off, quieter; past earshot, nothing.
    const far = new DogBreathing(); far.exertion = 1;
    expect(listen(far, 3, dog('heel', 'still'), 20)).toEqual([]);
    const close = new DogBreathing(), off = new DogBreathing(); close.exertion = off.exertion = 1;
    expect(listen(close, 1, dog('heel', 'still'), 2)[0].level).toBeGreaterThan(2 * listen(off, 1, dog('heel', 'still'), 9)[0].level);
  });

  it('holds its breath on point and backing, and breathes again once it moves', () => {
    const breath = new DogBreathing();
    breath.exertion = 1;
    expect(listen(breath, 6, dog('pointing', 'still', 'locking'), 3)).toEqual([]);
    expect(listen(breath, 6, dog('honoring', 'still'), 3)).toEqual([]);
    const after = listen(breath, 2, dog('breaking', 'run'), 3);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0].at).toBeGreaterThanOrEqual(.6);
  });

  it('works scent with its nose, and pants muffled around a bird it carries', () => {
    const breath = new DogBreathing();
    const sniffing = listen(breath, 4, dog('tracking', 'track', 'locating'), 5);
    expect(sniffing.length).toBeGreaterThan(2);
    expect(sniffing.every(heard => heard.cue === 'sniff')).toBe(true);
    const carrying = new DogBreathing(), free = new DogBreathing(); carrying.exertion = free.exertion = 1;
    expect(listen(carrying, 1, dog('retrieving', 'trot', 'locating'), 3)[0]).toMatchObject({ cue: 'pant' });
    expect(listen(carrying, 1, dog('retrieving', 'trot'), 3)[0].level).toBeLessThan(listen(free, 1, dog('heel', 'trot'), 3)[0].level * .6);
  });

  it('sounds like breath: a pant out and in, sniffs short and quick', () => {
    const pant = synthesizePant(1), out = bursts(pant, BREATH_RATE, .02);
    expect(out).toHaveLength(2);
    expect(rms(pant, 0, Math.round(out[0].length * BREATH_RATE))).toBeGreaterThan(rms(pant, Math.round(out[1].at * BREATH_RATE), pant.length));
    const sniffs = bursts(synthesizeSniffs(1), BREATH_RATE, .02);
    expect(sniffs.length).toBeGreaterThanOrEqual(3); expect(sniffs.length).toBeLessThanOrEqual(6);
    for (const sniff of sniffs) expect(sniff.length).toBeLessThan(.06);
  });
});
