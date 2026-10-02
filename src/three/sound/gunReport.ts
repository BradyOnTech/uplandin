import { Biquad, OnePole, fadeTail, mixInto, modes, noiseSource, soften, type Mode } from './dsp';

/**
 * The shotgun report as the shooter hears it, synthesized once per gun,
 * ground and variant (see sound/dsp.ts). Three parts:
 *
 *  - the blast: a Friedlander pressure pulse (the sharp N-wave of the
 *    muzzle gases), a bright crack, a low boom felt in the chest and the
 *    ground's reflection a few milliseconds behind;
 *  - the gun: the knock of the stock and action in the hands (the
 *    Auto-5's long-recoil cycle plays with its visible action, gunFoley.ts);
 *  - the land answering: a dark rolling rumble off open country, echoes off
 *    a shelterbelt or the farmstead, a clear slapback off the rimrock.
 *
 * Stereo: the blast is centred; the rumble and echoes are decorrelated left
 * and right, so the land sounds wide around the shooter.
 */
export const REPORT_RATE = 44100;

interface Echo { delay: number; gain: number; cutoff: number; pan: number }
interface LandAnswer {
  /** The diffuse roll: when it swells, how long it lasts, how loud and how dark. */
  rumble: { start: number; length: number; gain: number; cutoff: number };
  echoes: readonly Echo[];
}

const OPEN: LandAnswer = { rumble: { start: .07, length: 1.8, gain: .2, cutoff: 1100 }, echoes: [] };
const ANSWERS: Readonly<Record<string, LandAnswer>> = {
  // Shelterbelt and farmstead: a firm echo, then the buildings.
  'pheasant-coverts': { rumble: { start: .06, length: 1.6, gain: .19, cutoff: 1300 },
    echoes: [{ delay: .31, gain: .17, cutoff: 1900, pan: -.35 }, { delay: .74, gain: .07, cutoff: 950, pan: .4 }] },
  // Open rolling prairie: the long, low roll of the land.
  'sharptail-prairie': { rumble: { start: .09, length: 2.4, gain: .25, cutoff: 850 }, echoes: [] },
  // Plum thickets and mesquite: soft, and one far answer off the creek timber.
  'quail-fields': { rumble: { start: .07, length: 1.9, gain: .2, cutoff: 1050 },
    echoes: [{ delay: .58, gain: .09, cutoff: 1200, pan: .25 }] },
  // Rimrock: a hard slapback, then the canyon handing it on.
  'chukar-ridge': { rumble: { start: .05, length: 1.5, gain: .13, cutoff: 1500 },
    echoes: [{ delay: .38, gain: .3, cutoff: 2400, pan: .45 }, { delay: .92, gain: .17, cutoff: 1500, pan: -.3 }, { delay: 1.55, gain: .08, cutoff: 900, pan: .2 }] },
};

export function landAnswer(areaId?: string): LandAnswer {
  return (areaId && ANSWERS[areaId]) || OPEN;
}

/** The dry blast, without the gun or the land: shared by the report and its echoes. */
function blast(seed: number, seconds: number, rate = REPORT_RATE): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * rate));
  const noise = noiseSource(seed), crackFilter = new OnePole(900, rate), boomFilter = new Biquad('lowpass', 175, .75, rate);
  // The bang itself: the midrange that carries on any speaker.
  const bangFilter = new Biquad('bandpass', 760, .55, rate), bangUpper = new Biquad('bandpass', 1900, .8, rate);
  // Positive phase ~1.6 ms: the N-wave of the muzzle gases.
  const T = .0016, B = 1.35;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate, white = noise();
    const pulse = t < T * 6 ? (1 - t / T) * Math.exp(-B * t / T) : 0;
    const crack = crackFilter.high(white) * Math.exp(-t / .0065) * .62;
    const boomEnvelope = Math.min(1, t / .0015) * Math.exp(-t / .095);
    const boom = boomFilter.run(white) * boomEnvelope * 2.1;
    const bangEnvelope = Math.min(1, t / .0008) * (Math.exp(-t / .028) * .8 + Math.exp(-t / .07) * .2);
    const bang = (bangFilter.run(white) * 1.7 + bangUpper.run(white) * .7) * bangEnvelope;
    out[i] = pulse * .95 + crack + boom + bang;
  }
  // The chest and the ground: a felt thump, and the reflection 4.5 ms behind.
  modes(out, rate, 0, [{ frequency: 62, decay: .085, gain: .32 }, { frequency: 118, decay: .05, gain: .18 }]);
  const reflection = new Float32Array(out.length), dark = new OnePole(2600, rate);
  for (let i = 0; i < out.length; i++) reflection[i] = dark.low(out[i]);
  mixInto(out, reflection, .0045 * rate, .42);
  return out;
}

/** The stock and action knocking in the hands. The Auto-5's long-recoil
 * cycle follows the visible action, as its cues (gunFoley.ts). */
const KNOCK: readonly Mode[] = [{ frequency: 820, decay: .018, gain: .05 }, { frequency: 1730, decay: .012, gain: .035 }, { frequency: 2950, decay: .008, gain: .02 }];

function gunKnock(out: Float32Array, seed: number, rate = REPORT_RATE): void {
  const vary = noiseSource(seed ^ 0x51ed);
  modes(out, rate, .008, KNOCK.map(mode => ({ ...mode, frequency: mode.frequency * (1 + vary() * .04) })));
}

/** The land's answer: the diffuse roll and the echoes, decorrelated left and right. */
function answer(areaId: string | undefined, seed: number, dry: Float32Array, rate = REPORT_RATE): [Float32Array, Float32Array] {
  const land = landAnswer(areaId), { rumble } = land;
  const length = Math.max(rumble.start + rumble.length, ...land.echoes.map(echo => echo.delay + .45)) + .1;
  const left = new Float32Array(Math.ceil(length * rate)), right = new Float32Array(left.length);
  for (const [side, out] of [[0, left], [1, right]] as const) {
    const noise = noiseSource(seed * 7 + side * 0x9e37), roll = new Biquad('lowpass', rumble.cutoff, .6, rate), deep = new Biquad('lowpass', 160, .7, rate);
    for (let i = 0; i < out.length; i++) {
      const t = i / rate, age = t - rumble.start;
      if (age < -.03) continue;
      // Darker as it travels: the high end dies first.
      if (i % 64 === 0) roll.tune(rumble.cutoff * (1 - .62 * Math.min(1, Math.max(0, age) / rumble.length)), .6);
      const swell = Math.min(1, Math.max(0, (age + .03) / .14)), fall = Math.exp(-Math.max(0, age) / (rumble.length / 4.2));
      const white = noise();
      // A thunder-like slow flutter in the roll.
      const flutter = .75 + .25 * Math.sin(t * 9.1 + side * 1.7) * Math.sin(t * 3.3 + 0.4 + side);
      out[i] = (roll.run(white) * 1.4 + deep.run(white) * 2.6) * swell * swell * fall * flutter * rumble.gain;
    }
    for (const echo of land.echoes) {
      const level = echo.gain * (side === 0 ? 1 - Math.max(0, echo.pan) : 1 + Math.min(0, echo.pan));
      const smear = new Biquad('lowpass', echo.cutoff, .7, rate);
      const copy = new Float32Array(dry.length);
      for (let i = 0; i < dry.length; i++) copy[i] = smear.run(dry[i]);
      // A rough face returns a smeared echo, not a clean copy.
      mixInto(out, copy, echo.delay * rate, level);
      mixInto(out, copy, (echo.delay + .011 + side * .003) * rate, level * .45);
      mixInto(out, copy, (echo.delay + .027 - side * .004) * rate, level * .22);
    }
  }
  return [left, right];
}

export interface ShotReport { left: Float32Array; right: Float32Array; rate: number }

/** Each gun knocks a little differently in the hands. */
function gunSeed(gunId: string): number {
  let hash = 0;
  for (const char of gunId) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return hash;
}

/** One variant of a gun's report on a ground. Deterministic for a seed. */
export function synthesizeReport(gunId: string, areaId: string | undefined, seed: number): ShotReport {
  const rate = REPORT_RATE, dry = blast(seed, .42, rate);
  const near = dry.slice();
  gunKnock(near, seed ^ gunSeed(gunId), rate);
  const [tailLeft, tailRight] = answer(areaId, seed, dry, rate);
  const length = Math.max(near.length, tailLeft.length);
  const left = new Float32Array(length), right = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const center = i < near.length ? near[i] : 0;
    left[i] = soften((center + tailLeft[i]) * .78, 1.5) * .92;
    right[i] = soften((center + tailRight[i]) * .78, 1.5) * .92;
  }
  fadeTail(left, rate, .08); fadeTail(right, rate, .08);
  return { left, right, rate };
}
