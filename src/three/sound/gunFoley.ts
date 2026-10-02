import type { ShotgunActionCue, ShotgunMechanism } from '../shotgunActionTiming';
import { Biquad, fadeTail, modes, noiseSource, type Mode } from './dsp';

/**
 * The guns' mechanical sounds, played with the visible action
 * (shotgunActionTiming.ts): a pump's forend riding back to its stop and
 * slamming home, the Auto-5's barrel and bolt cycling on the shot, a
 * double's top lever, its ejectors and the solid close, and shells pushed
 * into a tube or slid into a chamber. Steel rings in a few short modes,
 * plastic and walnut are dull knocks, and slides are filtered friction.
 */
export const FOLEY_RATE = 44100;

interface Slide { at: number; length: number; frequency: number; q: number; gain: number }
interface Strike { at: number; modes: readonly Mode[]; gain?: number }
interface Cue { length: number; slides: readonly Slide[]; strikes: readonly Strike[] }

// Gun steel is heavy and damped by the hands: it clacks, it doesn't ring.
const steel = (base: number, decay: number, gain: number): Mode[] => [
  { frequency: base, decay: decay * .42, gain }, { frequency: base * 1.89, decay: decay * .3, gain: gain * .62 },
  { frequency: base * 2.98, decay: decay * .22, gain: gain * .36 }, { frequency: base * .47, decay: decay * .36, gain: gain * .4 },
];
const knock = (base: number, decay: number, gain: number): Mode[] => [
  { frequency: base, decay: decay * .45, gain }, { frequency: base * 2.3, decay: decay * .25, gain: gain * .35 },
];
const tick = (base: number, gain: number): Mode[] => [
  { frequency: base, decay: .009, gain }, { frequency: base * 1.62, decay: .006, gain: gain * .6 },
];

const CUES: Readonly<Record<ShotgunMechanism, Partial<Record<ShotgunActionCue, Cue>>>> = {
  pump: {
    // Forend back: the action bars slide, then the bolt hits its stop.
    rack: { length: .16, slides: [{ at: 0, length: .07, frequency: 2300, q: .9, gain: .05 }],
      strikes: [{ at: .07, modes: steel(1150, .026, .11) }, { at: .072, modes: knock(420, .02, .05) }] },
    eject: { length: .1, slides: [{ at: 0, length: .02, frequency: 5200, q: 1.2, gain: .02 }],
      strikes: [{ at: .004, modes: tick(2900, .045) }, { at: .018, modes: tick(4700, .02) }] },
    // Forend home: the bolt rides into battery and locks.
    lock: { length: .16, slides: [{ at: 0, length: .055, frequency: 2000, q: .9, gain: .045 }],
      strikes: [{ at: .055, modes: steel(740, .032, .14) }, { at: .057, modes: knock(190, .03, .08) }] },
    shell: { length: .14, slides: [{ at: 0, length: .045, frequency: 3200, q: 1, gain: .028 }],
      strikes: [{ at: .045, modes: tick(2100, .04) }, { at: .05, modes: [{ frequency: 950, decay: .05, gain: .012 }] }] },
  },
  'semi-auto': {
    // Long recoil: barrel and bolt ride back together and the hull flicks out.
    eject: { length: .14, slides: [{ at: 0, length: .012, frequency: 3000, q: .8, gain: .02 }],
      strikes: [{ at: .002, modes: steel(1380, .036, .15) }, { at: .004, modes: knock(560, .028, .07) }, { at: .028, modes: tick(3100, .03) }] },
    // The bolt slams home on the next shell: heavier than any other cue.
    lock: { length: .16, slides: [],
      strikes: [{ at: .002, modes: steel(1250, .042, .17) }, { at: .004, modes: knock(520, .032, .09) }] },
    shell: { length: .14, slides: [{ at: 0, length: .045, frequency: 3000, q: 1, gain: .028 }],
      strikes: [{ at: .045, modes: tick(2000, .04) }, { at: .05, modes: [{ frequency: 880, decay: .05, gain: .012 }] }] },
  },
  'over-under': {
    // The top lever swings, and the barrels drop open on the hinge.
    latch: { length: .16, slides: [],
      strikes: [{ at: .002, modes: tick(2600, .06) }, { at: .032, modes: knock(420, .04, .09) }, { at: .034, modes: steel(860, .022, .04) }] },
    // The ejectors snap the hulls out of the chambers: two hard spring pops.
    eject: { length: .14, slides: [{ at: .006, length: .05, frequency: 4200, q: .8, gain: .02 }],
      strikes: [{ at: .002, modes: tick(3300, .11) }, { at: .005, modes: tick(5100, .05) }] },
    shell: { length: .12, slides: [{ at: 0, length: .04, frequency: 2600, q: 1, gain: .022 }],
      strikes: [{ at: .04, modes: knock(1700, .012, .05) }, { at: .041, modes: knock(900, .015, .035) }] },
    // A well-made double closing: one solid, short clack.
    lock: { length: .16, slides: [],
      strikes: [{ at: .002, modes: steel(1050, .026, .13) }, { at: .003, modes: knock(520, .034, .15) }, { at: .004, modes: tick(3500, .03) }] },
  },
  'side-by-side': {
    latch: { length: .16, slides: [],
      strikes: [{ at: .002, modes: tick(2800, .055) }, { at: .03, modes: knock(460, .036, .08) }, { at: .032, modes: steel(940, .02, .035) }] },
    eject: { length: .14, slides: [{ at: .006, length: .05, frequency: 4400, q: .8, gain: .02 }],
      strikes: [{ at: .002, modes: tick(3500, .105) }, { at: .005, modes: tick(5400, .045) }] },
    shell: { length: .12, slides: [{ at: 0, length: .04, frequency: 2700, q: 1, gain: .022 }],
      strikes: [{ at: .04, modes: knock(1800, .011, .05) }, { at: .041, modes: knock(960, .014, .035) }] },
    // A lighter gun closes a little brighter.
    lock: { length: .16, slides: [],
      strikes: [{ at: .002, modes: steel(1150, .024, .12) }, { at: .003, modes: knock(560, .03, .14) }, { at: .004, modes: tick(3700, .03) }] },
  },
};

/** The cues a mechanism has its own sound for. */
export function foleyCueNames(mechanism: ShotgunMechanism): ShotgunActionCue[] {
  return Object.keys(CUES[mechanism]) as ShotgunActionCue[];
}

/** The cues a mechanism makes; a cue it lacks plays the pump's. */
export function foleyCue(mechanism: ShotgunMechanism, cue: ShotgunActionCue): Cue {
  return CUES[mechanism][cue] ?? CUES.pump[cue] ?? CUES['over-under'][cue]!;
}

/** One variant of a cue: the same parts, a touch different each time. */
export function synthesizeActionCue(mechanism: ShotgunMechanism, cue: ShotgunActionCue, seed: number): Float32Array {
  const rate = FOLEY_RATE, plan = foleyCue(mechanism, cue), out = new Float32Array(Math.ceil(plan.length * rate));
  const vary = noiseSource(seed ^ 0x3c6ef372), wobble = (amount: number) => 1 + vary() * amount;
  for (const slide of plan.slides) {
    const noise = noiseSource(seed * 31 + Math.round(slide.frequency)), band = new Biquad('bandpass', slide.frequency * wobble(.06), slide.q, rate);
    const first = Math.round(slide.at * rate), count = Math.round(slide.length * rate * wobble(.08));
    for (let n = 0; n < count && first + n < out.length; n++) {
      const x = n / count;
      // Friction rises as the part picks up speed, and stops at once.
      out[first + n] += band.run(noise()) * slide.gain * Math.sin(Math.PI * Math.min(1, x * 1.2) * .5) * (x < .95 ? 1 : (1 - x) / .05) * 3;
    }
  }
  for (const strike of plan.strikes) {
    const at = strike.at * wobble(.03), level = (strike.gain ?? 1) * wobble(.08);
    modes(out, rate, at, strike.modes.map(mode => ({ ...mode, frequency: mode.frequency * wobble(.025) })), level);
    // The contact itself: a broadband click of a millisecond or two.
    const noise = noiseSource(seed * 17 + Math.round(at * 1e5)), edge = new Biquad('highpass', 1800, .7, rate);
    const loudest = strike.modes.reduce((sum, mode) => sum + mode.gain, 0) * level;
    for (let n = 0, first = Math.round(at * rate); n < rate * .003 && first + n < out.length; n++) {
      out[first + n] += edge.run(noise()) * loudest * .9 * Math.exp(-n / (rate * .0007));
    }
  }
  return fadeTail(out, rate, .02);
}

/** What the ground under the hunter is, for a hull landing on it. */
export type HullSurface = 'rock' | 'soft';
export function hullSurface(areaId?: string): HullSurface {
  return areaId === 'chukar-ridge' ? 'rock' : 'soft';
}

/**
 * A fired hull touching down: a 6 g plastic tube with a brass head. On the
 * rimrock's stone and scree the brass clinks and the tube knocks; in grass,
 * stubble or dirt it is a dull tick you barely hear. It lands askew, so the
 * head and the tube strike a moment apart, in either order.
 */
export function synthesizeHullDrop(surface: HullSurface, seed: number): Float32Array {
  const rate = FOLEY_RATE, rock = surface === 'rock', out = new Float32Array(Math.ceil(.09 * rate));
  const vary = noiseSource(seed ^ 0x2545f491), wobble = (amount: number) => 1 + vary() * amount;
  const brass: Mode[] = rock
    ? [{ frequency: 4150 * wobble(.06), decay: .012, gain: .05 }, { frequency: 6420 * wobble(.06), decay: .008, gain: .035 },
      { frequency: 9100 * wobble(.05), decay: .006, gain: .02 }]
    : [{ frequency: 3300 * wobble(.06), decay: .003, gain: .012 }];
  const tube: Mode[] = rock
    ? [{ frequency: 1500 * wobble(.08), decay: .006, gain: .03 }, { frequency: 2750 * wobble(.08), decay: .004, gain: .018 }]
    : [{ frequency: 1100 * wobble(.08), decay: .004, gain: .02 }, { frequency: 620 * wobble(.08), decay: .005, gain: .015 }];
  const headFirst = vary() > 0, gap = .0015 + Math.abs(vary()) * .003;
  modes(out, rate, headFirst ? .001 : .001 + gap, brass);
  modes(out, rate, headFirst ? .001 + gap : .001, tube);
  // Grit skittering on stone, or stems giving under it.
  const noise = noiseSource(seed * 13 + (rock ? 7 : 3));
  const grit = rock ? new Biquad('highpass', 2500, .7, rate) : new Biquad('bandpass', 900, .8, rate);
  const length = rate * (rock ? .012 : .02), fall = rate * (rock ? .003 : .006);
  for (let n = 0; n < length; n++) out[n + Math.round(rate * .001)] += grit.run(noise()) * (rock ? .025 : .03) * Math.exp(-n / fall);
  return fadeTail(out, rate, .01);
}
