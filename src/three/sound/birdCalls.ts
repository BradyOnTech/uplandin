import { noiseSource } from './dsp';
import { placeCall, renderCall, type BirdSpace, type Note, type Path } from './birdVoice';

/**
 * The calls of the birds of the four grounds, each drawn from how its
 * spectrogram reads: pitch paths, timing and timbre, varied a little by seed.
 * Quarry calls belong to the hunt (a covey flushing, a lost single calling
 * the birds together); the rest are the land's own birds, heard far off.
 */

type Rand = () => number;
const rand = (seed: number): Rand => { const next = noiseSource(seed ^ 0x68e31da4); return () => next() * .5 + .5; };
const between = (r: Rand, low: number, high: number) => low + (high - low) * r();
const count = (r: Rand, low: number, high: number) => low + Math.floor(r() * (high - low + 1));
const PURE = [1, .06, .015] as const;
const SHAPED: Path = [[0, 0], [.12, 1], [.75, .85], [1, 0]];

/** Western meadowlark: two or three clear slurred whistles, then a tumbling gurgle. */
function meadowlark(r: Rand): Note[] {
  const notes: Note[] = [], key = between(r, .92, 1.08);
  let t = 0;
  for (let i = count(r, 2, 3); i > 0; i--) {
    const length = between(r, .12, .22), high = between(r, 2900, 3500) * key, low = between(r, 2200, 2700) * key;
    notes.push({ at: t, length, gain: .55, harmonics: PURE, level: [[0, 0], [.15, 1], [.8, .9], [1, 0]],
      pitch: r() < .4 ? [[0, low], [1, high]] : [[0, high], [.25, high * 1.03], [1, low]] });
    t += length + between(r, .03, .07);
  }
  for (let i = 0, run = count(r, 4, 7); i < run; i++) {
    const length = between(r, .035, .07), center = (3600 - i * 220 + between(r, -350, 350)) * key, sweep = between(r, -900, 700);
    notes.push({ at: t, length, gain: .45, harmonics: PURE, level: [[0, 0], [.2, 1], [.7, .8], [1, 0]],
      pitch: [[0, center], [.5, center + sweep * .7], [1, center + sweep]] });
    t += length + between(r, .012, .03);
  }
  notes.push({ at: t + .02, length: between(r, .09, .14), gain: .5, harmonics: PURE, pitch: [[0, 2300 * key], [1, 1750 * key]] });
  return notes;
}

/** Canyon wren: a cascade of sweet whistles falling and slowing, then a rasp or two. */
function canyonWren(r: Rand): Note[] {
  const notes: Note[] = [], total = count(r, 9, 13), top = between(r, 3900, 4400), bottom = between(r, 1700, 2000);
  let t = 0;
  for (let i = 0; i < total; i++) {
    const x = i / (total - 1), f = top * Math.pow(bottom / top, Math.pow(x, .85));
    notes.push({ at: t, length: .055 + x * .04, gain: .35 + .3 * Math.sin(Math.PI * Math.min(1, x * 1.6)), harmonics: PURE,
      pitch: [[0, f * 1.07], [1, f * .9]], level: [[0, 0], [.15, 1], [.6, .8], [1, 0]] });
    t += .075 + x * x * .1;
  }
  for (let i = count(r, 1, 2); i > 0; i--) {
    notes.push({ at: t + .05, length: .14, gain: .4, harmonics: [1, .35, .12], pitch: [[0, bottom * .85], [1, bottom * 1.1]],
      flutter: { rate: 70, depth: .7 }, breath: .15 });
    t += .22;
  }
  return notes;
}

/** Common raven: two to four deep, rough croaks. */
function raven(r: Rand): Note[] {
  const notes: Note[] = [], base = between(r, 300, 420);
  let t = 0;
  for (let i = count(r, 2, 4); i > 0; i--) {
    const length = between(r, .22, .36);
    notes.push({ at: t, length, gain: .6, pitch: [[0, base * .9], [.3, base * 1.1], [1, base * .85]],
      formants: [[950, 350, 1], [1500, 400, .7], [2500, 600, .35]], rough: .55, breath: .25,
      flutter: { rate: between(r, 24, 34), depth: .35 }, level: [[0, 0], [.1, 1], [.6, .8], [1, 0]] });
    t += length + between(r, .25, .45);
  }
  return notes;
}

const chukarVoice = (key: number) => (at: number, length: number, from: number, peak: number, to: number, gain: number): Note => ({
  at, length, gain, pitch: [[0, from * key], [.35, peak * key], [1, to * key]],
  formants: [[1300, 500, 1], [2500, 700, .55], [3800, 900, .25]], rough: .25, breath: .2, level: [[0, 0], [.08, 1], [.5, .75], [1, 0]],
});

/** Chukar rally: chucks quickening into "chukar, chukar", the rimrock handing it back. */
function chukarRally(r: Rand): Note[] {
  const notes: Note[] = [], voice = chukarVoice(between(r, .93, 1.07));
  let t = 0, gap = .3;
  for (let i = 0, chucks = count(r, 4, 8); i < chucks; i++) {
    notes.push(voice(t, .07, 620, 760, 600, .5 + i * .04));
    t += gap; gap = Math.max(.15, gap * .86);
  }
  for (let i = count(r, 3, 5); i > 0; i--) {
    notes.push(voice(t, .075, 640, 780, 620, .75), voice(t + .1, .14, 700, 900, 610, .85));
    t += .38;
  }
  return notes;
}

/** Chukar going up: sharp "pitoo" squeals from several birds. */
function chukarFlush(r: Rand): Note[] {
  const notes: Note[] = [];
  let t = .02;
  for (let i = count(r, 3, 5); i > 0; i--) {
    const key = between(r, .9, 1.12);
    notes.push({ at: t, length: .05, gain: .5, harmonics: [1, .3, .1], pitch: [[0, 2300 * key], [1, 2700 * key]], rough: .15 },
      { at: t + .07, length: .16, gain: .6, harmonics: [1, .35, .12], pitch: [[0, 2500 * key], [.3, 2350 * key], [1, 1500 * key]], rough: .2, breath: .1 });
    t += between(r, .12, .26);
  }
  return notes;
}

/** One sandhill crane's rolling, rattling bugle. */
function craneBugle(r: Rand): Note[] {
  const key = between(r, .85, 1.15);
  return [{ at: 0, length: between(r, .45, .9), gain: 1, pitch: [[0, 620 * key], [.25, 840 * key], [1, 720 * key]],
    formants: [[900, 400, 1], [1700, 500, .7], [2600, 700, .35]], flutter: { rate: between(r, 24, 32), depth: .75 }, rough: .2,
    level: [[0, 0], [.1, 1], [.75, .85], [1, 0]] }];
}

/** A young crane among them: a high, thin peep. */
function craneColt(r: Rand): Note[] {
  const key = between(r, .9, 1.1);
  return [{ at: 0, length: .25, gain: 1, harmonics: [1, .3], pitch: [[0, 2400 * key], [1, 2900 * key]], breath: .1 }];
}

/** One Canada goose: the short "ah" breaking up into the "HONK". */
function gooseHonk(r: Rand): Note[] {
  const key = between(r, .82, 1.2);
  const nasal = { formants: [[1000, 320, 1], [1900, 420, .65], [3000, 700, .3]] as const, rough: .35, breath: .2 };
  return [{ at: 0, length: .06, gain: .5, pitch: [[0, 260 * key], [1, 300 * key]], ...nasal },
    { at: .055, length: between(r, .13, .2), gain: 1, pitch: [[0, 470 * key], [.4, 520 * key], [1, 430 * key]], ...nasal,
      level: [[0, 0], [.06, 1], [.7, .8], [1, 0]] }];
}

/** A mallard hen on the slough: the falling "QUACK quack quack quack". */
function mallard(r: Rand): Note[] {
  const notes: Note[] = [], key = between(r, .9, 1.1);
  let t = 0;
  for (let i = 0, quacks = count(r, 3, 6); i < quacks; i++) {
    const length = i === 0 ? .2 : .14 - i * .008;
    notes.push({ at: t, length, gain: .8 - i * .1, pitch: [[0, 380 * key], [.3, 420 * key], [1, 340 * key]],
      formants: [[850, 300, 1], [1550, 400, .6], [2600, 700, .3]], rough: .45, breath: .25, flutter: { rate: 55, depth: .3 } });
    t += length + .09 - i * .006;
  }
  return notes;
}

/** A red-winged blackbird's "check" from the cattails. */
function blackbirdCheck(r: Rand): Note[] {
  const key = between(r, .85, 1.15);
  return [{ at: 0, length: .03, gain: 1, harmonics: [1, .5, .3, .15], pitch: [[0, 3400 * key], [1, 2300 * key]], breath: .5, rough: .2 }];
}

/** Now and then one sings: "conk-la-ree", the last note a buzzing trill. */
function blackbirdSong(r: Rand): Note[] {
  const key = between(r, .94, 1.06);
  return [{ at: 0, length: .08, gain: .5, harmonics: [1, .4, .2], pitch: [[0, 1600 * key], [1, 1900 * key]] },
    { at: .1, length: .06, gain: .45, harmonics: [1, .3], pitch: [[0, 2900 * key], [1, 3200 * key]] },
    { at: .18, length: .7, gain: .5, harmonics: [1, .3, .1], pitch: [[0, 3600 * key], [1, 3300 * key]], flutter: { rate: 38, depth: .85 }, breath: .15 }];
}

/** Black-capped chickadee: the clear "fee-bee", or "chick-a-dee-dee". */
function chickadee(r: Rand): Note[] {
  const key = between(r, .95, 1.05);
  if (r() < .5) return [
    { at: 0, length: .32, gain: .5, harmonics: PURE, pitch: [[0, 3950 * key], [1, 3850 * key]], level: [[0, 0], [.1, 1], [.85, .9], [1, 0]] },
    { at: .42, length: .3, gain: .45, harmonics: PURE, pitch: [[0, 3300 * key], [.15, 3420 * key], [1, 3380 * key]], level: [[0, 0], [.1, 1], [.85, .9], [1, 0]] },
  ];
  const notes: Note[] = [{ at: 0, length: .045, gain: .4, harmonics: [1, .3], pitch: [[0, 7000], [1, 4200]] },
    { at: .06, length: .03, gain: .3, harmonics: PURE, pitch: [[0, 6800], [1, 7200]] }];
  for (let i = 0, dees = count(r, 2, 5); i < dees; i++) {
    notes.push({ at: .12 + i * .13, length: .11, gain: .45, pitch: [[0, 420], [1, 400]], formants: [[3600, 900, 1], [7200, 1500, .3]], rough: .15 });
  }
  return notes;
}

/** Northern cardinal: "cheer cheer cheer", or a quicker "birdie birdie". */
function cardinal(r: Rand): Note[] {
  const notes: Note[] = [], key = between(r, .93, 1.07), birdie = r() < .35;
  for (let i = 0, total = count(r, 3, 6); i < total; i++) {
    const at = i * (birdie ? .2 : .32);
    notes.push(birdie
      ? { at, length: .13, gain: .55, harmonics: PURE, pitch: [[0, 1900 * key], [.6, 3600 * key], [1, 3100 * key]] }
      : { at, length: .24, gain: .55, harmonics: PURE, pitch: [[0, 4100 * key], [.35, 3000 * key], [1, 2000 * key]], level: [[0, 0], [.06, 1], [.7, .9], [1, 0]] });
  }
  return notes;
}

/** Mourning dove: a soft "coo-OO-oo", then three low hoots. */
function mourningDove(r: Rand): Note[] {
  const key = between(r, .94, 1.06);
  const hoot = { harmonics: [1, .12, .04], breath: .12, level: [[0, 0], [.25, 1], [.7, .8], [1, 0]] as Path };
  return [
    { at: 0, length: .4, gain: .55, pitch: [[0, 480 * key], [.45, 620 * key], [1, 520 * key]], ...hoot },
    { at: .55, length: .55, gain: .6, pitch: [[0, 500 * key], [1, 470 * key]], ...hoot },
    { at: 1.3, length: .5, gain: .5, pitch: [[0, 490 * key], [1, 465 * key]], ...hoot },
    { at: 2, length: .5, gain: .45, pitch: [[0, 485 * key], [1, 460 * key]], ...hoot },
  ];
}

/** Bobwhite covey call at first light: "koi-lee". */
function bobwhiteCovey(r: Rand): Note[] {
  const key = between(r, .94, 1.06);
  return [
    { at: 0, length: .14, gain: .6, harmonics: [1, .1], pitch: [[0, 1200 * key], [.6, 1750 * key], [1, 1650 * key]] },
    { at: .19, length: .22, gain: .75, harmonics: [1, .1], pitch: [[0, 1900 * key], [.55, 2700 * key], [1, 2500 * key]], level: SHAPED },
  ];
}

/** A scattered bobwhite calling the covey back together: "hoy-poo". */
function bobwhiteAssembly(r: Rand): Note[] {
  const key = between(r, .94, 1.06);
  return [
    { at: 0, length: .18, gain: .65, harmonics: [1, .1], pitch: [[0, 1350 * key], [1, 2050 * key]] },
    { at: .24, length: .2, gain: .7, harmonics: [1, .1], pitch: [[0, 2050 * key], [1, 1450 * key]] },
  ];
}

/** Gray partridge: the rusty-gate "kee-uck". */
function hunCall(r: Rand): Note[] {
  const key = between(r, .92, 1.08);
  return [
    { at: 0, length: .24, gain: .7, harmonics: [1, .55, .35, .2], pitch: [[0, 2300 * key], [.4, 3100 * key], [1, 2700 * key]], rough: .6, breath: .45 },
    { at: .27, length: .08, gain: .55, harmonics: [1, .5, .3], pitch: [[0, 3300 * key], [1, 2100 * key]], rough: .4, breath: .3 },
  ];
}

/** Huns going up: the covey squealing. */
function hunFlush(r: Rand): Note[] {
  const notes: Note[] = [];
  let t = .02;
  for (let i = count(r, 4, 7); i > 0; i--) {
    const key = between(r, .9, 1.12);
    notes.push({ at: t, length: .07, gain: .5, harmonics: [1, .5, .3], pitch: [[0, 2900 * key], [.5, 3300 * key], [1, 2500 * key]], rough: .5, breath: .4 });
    t += between(r, .06, .14);
  }
  return notes;
}

/** A sharptail going up: low, hard "tuk"s. */
function sharptailFlush(r: Rand): Note[] {
  const notes: Note[] = [], key = between(r, .9, 1.1);
  let t = .03;
  for (let i = count(r, 3, 6); i > 0; i--) {
    notes.push({ at: t, length: .05, gain: .7, pitch: [[0, 560 * key], [1, 470 * key]], formants: [[800, 350, 1], [1600, 500, .5], [2700, 700, .2]],
      rough: .4, breath: .3, level: [[0, 0], [.1, 1], [.4, .7], [1, 0]] });
    t += between(r, .1, .16);
  }
  return notes;
}

/** A prairie chicken going up: a quick, higher "cac-cac". */
function prairieChickenFlush(r: Rand): Note[] {
  const notes: Note[] = [], key = between(r, .9, 1.1);
  let t = .03;
  for (let i = count(r, 2, 5); i > 0; i--) {
    notes.push({ at: t, length: .06, gain: .6, pitch: [[0, 760 * key], [.3, 820 * key], [1, 640 * key]], formants: [[1150, 400, 1], [2300, 600, .45], [3400, 800, .2]],
      rough: .45, breath: .3 });
    t += between(r, .09, .13);
  }
  return notes;
}

/** A rooster crowing somewhere off the place: "KOK-kok", then a whirr of wings. */
function roosterCrow(r: Rand): Note[] {
  const key = between(r, .93, 1.07), harsh = { formants: [[1300, 550, 1], [2500, 800, .6], [3800, 1100, .3]] as const, rough: .45, breath: .3 };
  const notes: Note[] = [
    { at: 0, length: .26, gain: .8, pitch: [[0, 650 * key], [.3, 1050 * key], [1, 880 * key]], ...harsh },
    { at: .32, length: .2, gain: .65, pitch: [[0, 900 * key], [1, 700 * key]], ...harsh },
  ];
  for (let i = 0; i < 8; i++) notes.push({ at: .62 + i * .042, length: .03, gain: .12, pitch: [[0, 180], [1, 160]], harmonics: [1, .3], breath: 1.5 });
  return notes;
}

/** Red-tailed hawk: the long, hoarse, falling scream. */
function redtail(r: Rand): Note[] {
  const key = between(r, .94, 1.06);
  return [{ at: 0, length: between(r, 1.6, 2.2), gain: .7, harmonics: [1, .6, .4, .25, .12],
    pitch: [[0, 2200 * key], [.12, 2850 * key], [.5, 2400 * key], [1, 1750 * key]], rough: .5, breath: .55, level: [[0, 0], [.08, 1], [.6, .75], [1, 0]] }];
}

/** Horned larks: high, tinkling notes from the bare ground. */
function hornedLark(r: Rand): Note[] {
  const notes: Note[] = [];
  let t = 0;
  for (let i = count(r, 3, 6); i > 0; i--) {
    const f = between(r, 4300, 6200);
    notes.push({ at: t, length: between(r, .04, .09), gain: .4, harmonics: PURE, pitch: [[0, f], [1, f * between(r, .85, 1.15)]] });
    t += between(r, .06, .14);
  }
  return notes;
}

export const BIRD_CALLS = {
  meadowlark, 'canyon-wren': canyonWren, raven, 'chukar-rally': chukarRally, 'chukar-flush': chukarFlush, mallard,
  'blackbird-check': blackbirdCheck, 'blackbird-song': blackbirdSong, chickadee, cardinal, 'mourning-dove': mourningDove,
  'bobwhite-covey': bobwhiteCovey, 'bobwhite-assembly': bobwhiteAssembly, 'hun-call': hunCall, 'hun-flush': hunFlush,
  'sharptail-flush': sharptailFlush, 'prairie-chicken-flush': prairieChickenFlush, 'rooster-crow': roosterCrow, redtail,
  'horned-lark': hornedLark, 'goose-honk': gooseHonk, 'crane-bugle': craneBugle, 'crane-colt': craneColt,
} as const satisfies Record<string, (r: Rand) => Note[]>;
export type BirdCallId = keyof typeof BIRD_CALLS;

/** The call's notes for a seed: the same bird, a little different each time. */
export function birdCallNotes(id: BirdCallId, seed: number): Note[] {
  return BIRD_CALLS[id](rand(seed));
}

/** A call as heard in its country, at unit level (the playback sets distance). */
export function synthesizeBirdCall(id: BirdCallId, seed: number, space: BirdSpace = 'open'): Float32Array {
  return placeCall(renderCall(birdCallNotes(id, seed), seed), space, seed);
}

/**
 * Flocks are many birds, each calling on its own: a skein of geese going
 * over, cranes bugling high up, blackbirds chattering in the cattails. Each
 * bird plays one unit call, at its own moment and loudness.
 */
export interface Flock {
  readonly unit: BirdCallId;
  /** Another call some of the birds give instead, and how many of them. */
  readonly also?: { readonly unit: BirdCallId; readonly share: number };
  readonly birds: readonly [number, number];
  /** How long the flock is heard calling, s. */
  readonly seconds: number;
}
export const FLOCKS = {
  // A skein keeps up a near-continuous chatter as it goes over.
  geese: { unit: 'goose-honk', birds: [22, 36], seconds: 8 },
  cranes: { unit: 'crane-bugle', also: { unit: 'crane-colt', share: .2 }, birds: [12, 20], seconds: 7 },
  blackbirds: { unit: 'blackbird-check', also: { unit: 'blackbird-song', share: .08 }, birds: [10, 22], seconds: 4.5 },
} as const satisfies Record<string, Flock>;
export type FlockId = keyof typeof FLOCKS;

export interface FlockCall { unit: BirdCallId; at: number; variant: number; level: number }
/** When each bird of a flock calls, which of a few variants, and how loud. */
export function flockCalls(id: FlockId, seed: number, variants: number): FlockCall[] {
  const flock: Flock = FLOCKS[id], r = rand(seed ^ 0x2f6b7a1d), calls: FlockCall[] = [];
  for (let i = count(r, flock.birds[0], flock.birds[1]); i > 0; i--) {
    const unit = flock.also && r() < flock.also.share ? flock.also.unit : flock.unit;
    calls.push({ unit, at: between(r, 0, flock.seconds), variant: Math.floor(r() * variants), level: between(r, .45, 1) });
  }
  return calls.sort((a, b) => a.at - b.at);
}
