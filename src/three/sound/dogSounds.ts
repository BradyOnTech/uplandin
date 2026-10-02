import { Biquad, fadeTail, modes, noiseSource, normalize, type Mode } from './dsp';
import type { DogGait, DogScentStage, DogState } from '../../game/dog';

/**
 * The dog close by, and the handler's whistle: a brass bell with its own
 * voice on each dog, breath that quickens with work and stops dead on point,
 * a nose working scent, and the whistle signals a field dog learns.
 */
export const DOG_SOUND_RATE = 44100;

/** Each dog's bell is its own, so a brace can be told apart by ear. */
export const BELL_PITCHES = [2300, 2760, 2050] as const;
export function bellPitch(slot: number): number {
  return BELL_PITCHES[Math.abs(Math.trunc(slot)) % BELL_PITCHES.length];
}

// A small brass bell's partials: inharmonic, the high ones dying first, and
// a near-pair at the fundamental that beats into a slow warble.
const BELL_MODES: readonly (readonly [number, number, number])[] = [
  [1, .24, 1], [1.0012, .24, .5], [1.71, .17, .55], [2.43, .13, .42], [3.07, .1, .3], [4.11, .07, .2], [5.21, .05, .12],
];

/** One ring of a bell on a moving dog: the clapper strikes, and often rattles back. */
export function synthesizeBell(pitch: number, seed: number): Float32Array {
  const rate = DOG_SOUND_RATE, out = new Float32Array(Math.ceil(1 * rate)), vary = noiseSource(seed ^ 0x2c1b3c6d);
  const strike = (at: number, force: number) => {
    const ring: Mode[] = BELL_MODES.map(([ratio, decay, gain]) => ({
      frequency: Math.min(rate * .45, pitch * ratio * (1 + vary() * .004)), decay: decay * (1 + vary() * .1), gain: gain * force * .25,
    }));
    modes(out, rate, at, ring);
    const noise = noiseSource(seed * 7 + Math.round(at * 1e4)), edge = new Biquad('highpass', 3000, .7, rate), first = Math.round(at * rate);
    for (let n = 0; n < rate * .002; n++) out[first + n] += edge.run(noise()) * force * .15 * Math.exp(-n / (rate * .0005));
  };
  strike(0, 1);
  if (vary() > -.8) strike(.035 + Math.abs(vary()) * .03, .3 + Math.abs(vary()) * .3);
  return normalize(fadeTail(out, rate, .05), .9);
}

/** The commands a field dog knows by whistle. */
export type WhistleCall = 'whoa' | 'release' | 'cast' | 'dead' | 'recall';
interface Blast { at: number; length: number; pea?: boolean }
const PIP = .11;
export const WHISTLES: Readonly<Record<WhistleCall, readonly Blast[]>> = {
  // One long blast: stop.
  whoa: [{ at: 0, length: .55 }],
  // One short pip: carry on.
  release: [{ at: 0, length: PIP }],
  // Two pips: turn, and go that way.
  cast: [{ at: 0, length: PIP }, { at: .19, length: PIP }],
  // Three pips: dead bird, hunt close.
  dead: [{ at: 0, length: PIP }, { at: .19, length: PIP }, { at: .38, length: PIP }],
  // The pea trill, then two pips: come in.
  recall: [{ at: 0, length: .85, pea: true }, { at: 1, length: PIP }, { at: 1.19, length: PIP }],
};
const WHISTLE_HZ = 3150;

/** The handler's whistle: a breathy pure tone, the pea warbling in the trill. */
export function synthesizeWhistle(call: WhistleCall, seed: number): Float32Array {
  const rate = DOG_SOUND_RATE, blasts = WHISTLES[call];
  const out = new Float32Array(Math.ceil((Math.max(...blasts.map(blast => blast.at + blast.length)) + .05) * rate));
  const vary = noiseSource(seed ^ 0x6a09e667);
  blasts.forEach((blast, index) => {
    const first = Math.round(blast.at * rate), count = Math.round(blast.length * rate), noise = noiseSource(seed * 31 + index);
    const breath = new Biquad('bandpass', WHISTLE_HZ, 4, rate), chiff = new Biquad('highpass', 1800, .7, rate);
    const pitch = WHISTLE_HZ * (1 + vary() * .01);
    let phase = 0;
    for (let n = 0; n < count && first + n < out.length; n++) {
      const t = n / rate, x = n / count;
      // Breath pressure: up in a few hundredths, a sag at the end.
      const pressure = Math.min(1, t / .018) * Math.min(1, (blast.length - t) / .025);
      const pea = blast.pea ? 1 - .85 * (.5 + .5 * Math.sin(2 * Math.PI * 27 * t)) : 1;
      const f = pitch * (1 + .03 * Math.min(1, t / .03) - .03 + (blast.pea ? .03 * Math.sin(2 * Math.PI * 27 * t + 1) : 0) - .02 * Math.max(0, x - .85) / .15);
      phase += 2 * Math.PI * f / rate;
      const tone = Math.sin(phase) + .1 * Math.sin(2 * phase);
      const air = breath.run(noise()) * 1.4 + chiff.run(noise()) * .3 * Math.exp(-t / .012);
      out[first + n] += (tone * pea + air) * pressure;
    }
  });
  return normalize(fadeTail(out, rate, .01), .9);
}

export const BREATH_RATE = 22050;

function breathBurst(out: Float32Array, rate: number, at: number, length: number, resonances: readonly (readonly [number, number, number])[],
  noise: () => number, gain: number, voiced = 0): void {
  const filters = resonances.map(([frequency, q]) => new Biquad('bandpass', frequency, q, rate));
  const first = Math.round(at * rate), count = Math.round(length * rate);
  let phase = 0;
  for (let n = 0; n < count && first + n < out.length; n++) {
    const x = n / count, envelope = Math.sin(Math.PI * Math.min(1, x * 1.4)) ** 1.5 * (x > .7 ? (1 - x) / .3 : 1);
    phase += 2 * Math.PI * 175 / rate;
    const source = noise() + voiced * (Math.sin(phase) + .5 * Math.sin(2 * phase) + .3 * Math.sin(3 * phase));
    let sample = 0;
    filters.forEach((filter, i) => { sample += filter.run(source) * resonances[i][2]; });
    out[first + n] += sample * envelope * gain;
  }
}

/** One pant, out and in: a working dog's open-mouthed breath. */
export function synthesizePant(seed: number): Float32Array {
  const rate = BREATH_RATE, out = new Float32Array(Math.ceil(.26 * rate)), noise = noiseSource(seed ^ 0x3c6ef372), vary = noiseSource(seed);
  const out1 = .095 + vary() * .012, gap = .025;
  breathBurst(out, rate, 0, out1, [[1250 * (1 + vary() * .06), 2.5, 1], [2600, 3, .6], [480, 1.5, .4]], noise, 1, .08);
  breathBurst(out, rate, out1 + gap, .08, [[1750 * (1 + vary() * .06), 2.5, 1], [3300, 3, .5]], noise, .55);
  return normalize(fadeTail(out, rate, .01), .9);
}

/** A nose working scent: a quick run of short, sharp sniffs. */
export function synthesizeSniffs(seed: number): Float32Array {
  const rate = BREATH_RATE, vary = noiseSource(seed ^ 0x510e527f), noise = noiseSource(seed * 13 + 5);
  const sniffs = 3 + Math.floor((vary() * .5 + .5) * 4), spacing = .12 + vary() * .015;
  const out = new Float32Array(Math.ceil((sniffs * spacing + .08) * rate));
  for (let i = 0; i < sniffs; i++) {
    breathBurst(out, rate, i * spacing, .035 + vary() * .008, [[4600, 1.2, 1], [2400, 1.6, .45]], noise, i % 2 ? .8 : 1);
  }
  return normalize(fadeTail(out, rate, .01), .9);
}

export type BreathCue = 'pant' | 'sniff';

/**
 * A dog's breathing as the hunter hears it close by: panting that quickens
 * with hard running and slows as the dog rests, a nose working when it makes
 * game, and nothing at all on point, where a dog holds its breath.
 */
export class DogBreathing {
  /** 0 fresh, 1 blown. */
  exertion = 0;
  private wait = 0;
  static readonly HEARD_M = 14;

  advance(dt: number, dog: { state: DogState; gait: DogGait; scentStage?: DogScentStage }, distanceM: number): { cue: BreathCue; level: number } | null {
    if (!(dt > 0)) return null;
    const work = dog.gait === 'run' ? .1 : dog.gait === 'trot' ? .035 : dog.gait === 'track' ? .012 : -.05;
    this.exertion = Math.max(0, Math.min(1, this.exertion + work * dt));
    this.wait -= dt;
    // On point, or backing another dog's point: not a breath until it moves.
    if (dog.state === 'pointing' || dog.state === 'honoring') { this.wait = Math.max(this.wait, .7); return null; }
    if (this.wait > 0) return null;
    if (!(distanceM < DogBreathing.HEARD_M)) { this.wait = .25; return null; }
    const near = (1 - distanceM / DogBreathing.HEARD_M) ** 2;
    if (dog.scentStage && dog.scentStage !== 'none' && dog.state !== 'retrieving') {
      this.wait = 1.1;
      return { cue: 'sniff', level: near * .8 };
    }
    // A fresh dog breathes too quietly to hear.
    if (this.exertion < .12) { this.wait = .5; return null; }
    this.wait = 1 / (1.6 + this.exertion * 2.2);
    // A bird in its mouth muffles it.
    return { cue: 'pant', level: near * (.35 + .65 * this.exertion) * (dog.state === 'retrieving' ? .5 : 1) };
  }
}
