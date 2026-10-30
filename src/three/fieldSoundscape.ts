import type { TimeOfDay } from './palette';
import type { Condition } from '../game/conditions';
import type { Month } from '../game/season';
import type { WindStrength } from '../game/wind';
import { Biquad, noiseSource, normalize, OnePole } from './sound/dsp';

/** Presentation only. These beds describe the land, never nearby quarry; the
 * land's birds are sound/fieldBirds.ts. */
export type FieldRegion = 'chukar-ridge' | 'quail-fields' | 'sharptail-prairie' | 'pheasant-coverts';
export interface FieldSoundLayer {
  readonly seconds: number;
  readonly frequency: number;
  readonly q: number;
  readonly gain: number;
  readonly swell: number;
  readonly seed: number;
}
export interface FieldSoundscape {
  readonly layers: readonly FieldSoundLayer[];
  /** How loud the evening's crickets are here, 0..1. */
  readonly insects: number;
}

const soundscapes: Record<FieldRegion, FieldSoundscape> = {
  'chukar-ridge': { layers: [
    { seconds: 11, frequency: 330, q: .48, gain: .019, swell: .62, seed: 391 },
    { seconds: 7, frequency: 2100, q: .55, gain: .0038, swell: .85, seed: 907 },
  ], insects: .45 },
  'quail-fields': { layers: [
    { seconds: 13, frequency: 480, q: .42, gain: .010, swell: .30, seed: 661 },
    { seconds: 9, frequency: 1250, q: .68, gain: .0048, swell: .62, seed: 2027 },
  ], insects: 1 },
  'sharptail-prairie': { layers: [
    { seconds: 17, frequency: 230, q: .42, gain: .018, swell: .48, seed: 817 },
    { seconds: 11, frequency: 970, q: .48, gain: .007, swell: .72, seed: 3011 },
  ], insects: .9 },
  // Wind low through the shelterbelt, and the cattails' dry rustle over it.
  'pheasant-coverts': { layers: [
    { seconds: 13, frequency: 290, q: .45, gain: .017, swell: .5, seed: 1409 },
    { seconds: 9, frequency: 2300, q: .6, gain: .0052, swell: .82, seed: 4421 },
  ], insects: .8 },
};

export function fieldSoundscape(areaId?: string): FieldSoundscape | undefined {
  return areaId && areaId in soundscapes ? soundscapes[areaId as FieldRegion] : undefined;
}

/** The wind by the hour: still at first light, up through the middle of the day, laying down at dusk. */
export const HOUR_WIND: Readonly<Record<TimeOfDay, number>> = { dawn: .65, morning: 1, noon: 1.2, evening: .95, lastlight: .7 };
/** Crickets sing in the cool of the evening; the mornings are too cold. */
export const HOUR_INSECTS: Readonly<Record<TimeOfDay, number>> = { dawn: 0, morning: 0, noon: 0, evening: .55, lastlight: 1 };

/**
 * An evening's crickets, looped: a few near ones chirping in their own
 * rhythm and pitch, and a far chorus under them. Every cricket's chirp
 * period divides the loop, so it repeats without a seam.
 */
export function fieldInsectSamples(rate: number, seed: number, seconds = 12): Float32Array {
  const out = new Float32Array(Math.round(rate * seconds));
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  for (let cricket = 0; cricket < 7; cricket++) {
    const pitch = 4200 + random() * 1000, level = .15 + random() * .85 * (cricket < 3 ? 1 : .4);
    const chirps = Math.max(1, Math.round(seconds / (.45 + random() * .3))), period = seconds / chirps;
    const pulses = 3 + Math.floor(random() * 2), offset = random() * period;
    for (let chirp = 0; chirp < chirps; chirp++) for (let pulse = 0; pulse < pulses; pulse++) {
      const start = Math.round(((offset + chirp * period + pulse * .03) % seconds) * rate), length = Math.round(.016 * rate);
      for (let n = 0; n < length; n++) {
        const envelope = Math.sin(Math.PI * n / length) ** 2;
        out[(start + n) % out.length] += Math.sin(2 * Math.PI * pitch * n / rate) * envelope * level;
      }
    }
  }
  // The far chorus: many crickets blurred into a soft, trilling shimmer, never a steady tone.
  const trill = Math.round(seconds * 31) / seconds, swells = Math.round(seconds * .7) / seconds;
  for (let i = 0, phase = 0; i < out.length; i++) {
    phase += 2 * Math.PI * 4600 / rate;
    const t = i / rate, pulse = Math.max(0, Math.sin(2 * Math.PI * trill * t)) ** 4;
    const swell = .55 + .45 * Math.sin(2 * Math.PI * swells * t);
    out[i] += Math.sin(phase) * pulse * swell * (.7 + .3 * random()) * .08;
  }
  let peak = 0;
  for (const value of out) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return out;
}

/** Local deterministic noise, with slow periodic gusts baked once. Native
 * bandpass filtering smooths the waveform; loop endpoints share an envelope.
 * Does not consume hunt randomness or schedule per-frame WebAudio nodes. */
export function fieldWindSamples(rate: number, layer: FieldSoundLayer): Float32Array {
  const samples = new Float32Array(Math.ceil(rate * layer.seconds));
  let seed = layer.seed >>> 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const phase = i / samples.length * Math.PI * 2;
    const gust = .55 + .29 * Math.sin(phase) + .16 * Math.sin(phase * 3 + 1.7);
    samples[i] = (seed / 0x100000000 * 2 - 1) * (1 - layer.swell + layer.swell * gust);
  }
  return samples;
}

/** Sounds made once for a loop: generate a little past the end and fold the
 * overrun into the start (equal power), so the loop repeats without a seam. */
function looped(length: number, fade: number, sample: (i: number) => number): Float32Array {
  const raw = new Float32Array(length + fade);
  for (let i = 0; i < raw.length; i++) raw[i] = sample(i);
  const out = raw.slice(0, length);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = raw[i] * Math.sqrt(t) + raw[length + i] * Math.sqrt(1 - t);
  }
  return out;
}
/** A slow swell that comes round exactly once per loop, always above zero. */
function swellOf(seconds: number, phase: number) {
  return (t: number) => .5 + .3 * Math.sin(2 * Math.PI * t / seconds + phase) + .2 * Math.sin(6 * Math.PI * t / seconds + phase * 2.3);
}
/** A struck tick: a damped sinusoid with a click-free onset, added in place
 * and wrapped round the loop. */
function tick(out: Float32Array, rate: number, at: number, frequency: number, decay: number, level: number): void {
  const start = Math.round(at * rate), w = 2 * Math.PI * frequency / rate, fall = Math.exp(-1 / (decay * rate));
  let amplitude = level;
  for (let n = 0; amplitude > 1e-4 && n < out.length; n++) {
    out[(start + n) % out.length] += Math.sin(w * n) * amplitude * Math.min(1, n / (rate * .0003));
    amplitude *= fall;
  }
}

/**
 * What the wind says in each ground's cover, over the land's broad wind
 * bed: cattail leaves knocking dry on Cattail, the long hiss of bluestem
 * and wheatgrass on the plains, a soft whisper through Chukar's sage.
 */
export type CoverVoice = 'rattle' | 'hiss' | 'whisper';
export interface CoverSound { readonly voice: CoverVoice; readonly gain: number; readonly seed: number }
const COVER_SOUNDS: Record<FieldRegion, CoverSound> = {
  'pheasant-coverts': { voice: 'rattle', gain: .03, seed: 5003 },
  'sharptail-prairie': { voice: 'hiss', gain: .018, seed: 6007 },
  'quail-fields': { voice: 'hiss', gain: .015, seed: 6113 },
  'chukar-ridge': { voice: 'whisper', gain: .016, seed: 7001 },
};
export const COVER_SECONDS = 8;
/** The cover only speaks when the wind is up: next to nothing in a calm. */
export const COVER_WIND: Readonly<Record<WindStrength, number>> = { calm: .12, breezy: .55, strong: 1 };
/** Wet stems go quiet: soaked cattails don't rattle, snow-laden grass barely hisses. */
export const COVER_WEATHER: Readonly<Record<Condition, number>> = { mild: 1, frost: 1, hot: 1, rain: .3, snow: .6 };

export function coverSound(areaId?: string): CoverSound | undefined {
  return areaId && areaId in COVER_SOUNDS ? COVER_SOUNDS[areaId as FieldRegion] : undefined;
}

/** A loop of the cover's own voice in the wind, peak-normalized. */
export function fieldCoverSamples(rate: number, voice: CoverVoice, seed: number, seconds = COVER_SECONDS): Float32Array {
  const length = Math.round(rate * seconds), fade = Math.round(rate * .25), noise = noiseSource(seed), random = noiseSource(seed ^ 0x2545f491);
  const unit = () => (random() + 1) / 2, swell = swellOf(seconds, seed % 7), flutter = Math.round(seconds * 1.3) / seconds;
  let out: Float32Array;
  if (voice === 'hiss') {
    // Grass blades brushing: a bright hiss that flutters as the gusts comb through.
    const high = new Biquad('highpass', 2600, .7, rate), low = new Biquad('lowpass', 7600, .7, rate);
    out = looped(length, fade, i => {
      const t = i / rate, comb = .62 + .38 * Math.sin(2 * Math.PI * flutter * t) ** 2;
      return low.run(high.run(noise())) * swell(t) ** 1.6 * comb;
    });
  } else if (voice === 'whisper') {
    // Sage and cheatgrass: soft and breathy, low in the voice, slow to swell.
    const high = new Biquad('highpass', 260, .6, rate), low = new Biquad('lowpass', 1150, .6, rate), air = new OnePole(3800, rate);
    out = looped(length, fade, i => (low.run(high.run(noise())) + air.high(noise()) * .05) * swell(i / rate) ** 2);
  } else {
    // Cattails: a dry rustle under clusters of stiff leaves knocking together,
    // more of them as each gust leans the stand over.
    const high = new Biquad('highpass', 1800, .7, rate), low = new Biquad('lowpass', 5200, .7, rate);
    out = looped(length, fade, i => low.run(high.run(noise())) * .4 * swell(i / rate) ** 2);
    for (let t = unit() * .1; t < seconds;) {
      const gust = swell(t) ** 2, clicks = 2 + Math.floor(unit() * 5);
      for (let k = 0, at = t; k < clicks; k++, at += .008 + unit() * .032) {
        tick(out, rate, at % seconds, 1500 + unit() * 2200, .0012 + unit() * .0018, (.25 + unit() * .75) * gust);
      }
      t += (.04 + unit() * .24) / Math.max(.2, gust);
    }
  }
  return normalize(out, .9);
}

/**
 * The weather's own beds: rain pattering on grass, sleet ticking on dry
 * stems, and gusts that come up under any wild day. Beds sit over the wind
 * but below the dog's bell at working range (test/fieldSoundscape.test.ts).
 */
export type WeatherBedKind = 'rain' | 'sleet' | 'gust';
export interface WeatherBed { readonly kind: WeatherBedKind; readonly gain: number; readonly seconds: number; readonly seed: number }
export const WEATHER_BEDS: Readonly<Record<Condition, readonly WeatherBed[]>> = {
  mild: [], frost: [], hot: [],
  rain: [{ kind: 'rain', gain: .018, seconds: 6, seed: 9001 }],
  snow: [{ kind: 'sleet', gain: .03, seconds: 6, seed: 9203 }],
};
/** Gusts come up with a strong wind, and under any rain or snow. */
export const GUST_BED: WeatherBed = { kind: 'gust', gain: .018, seconds: 12, seed: 9103 };
export const GUST_WIND: Readonly<Record<WindStrength, number>> = { calm: 0, breezy: .25, strong: 1 };
const WEATHER_GUSTS: Readonly<Record<Condition, number>> = { mild: 0, frost: 0, hot: .15, rain: .55, snow: .75 };
export function gustShare(condition: Condition, wind: WindStrength): number {
  return Math.max(GUST_WIND[wind], WEATHER_GUSTS[condition]);
}

/** A loop of a weather bed, peak-normalized. */
export function fieldWeatherSamples(rate: number, bed: WeatherBed): Float32Array {
  const length = Math.round(rate * bed.seconds), fade = Math.round(rate * .2), noise = noiseSource(bed.seed), random = noiseSource(bed.seed ^ 0x68e31da4);
  const unit = () => (random() + 1) / 2;
  let out: Float32Array;
  if (bed.kind === 'gust') {
    // Wind leaning on the land: low, with two long gusts a loop and a lull between.
    const high = new Biquad('highpass', 70, .6, rate), low = new Biquad('lowpass', 520, .6, rate), whistle = new Biquad('bandpass', 1400, 2.2, rate);
    out = looped(length, fade, i => {
      const t = i / rate, gust = Math.max(0, .5 + .5 * Math.sin(4 * Math.PI * t / bed.seconds - 1.2)) ** 2.2 * .85 + .15;
      const n = noise();
      return (low.run(high.run(n)) + whistle.run(n) * .18 * gust) * gust;
    });
  } else if (bed.kind === 'rain') {
    // A steady hiss of rain on grass, and the near drops pattering through it.
    const high = new Biquad('highpass', 900, .7, rate), low = new Biquad('lowpass', 6200, .7, rate);
    out = looped(length, fade, () => low.run(high.run(noise())) * .3);
    for (let t = 0; t < bed.seconds; t += -Math.log(1 - unit() * .999) / 900) {
      const big = unit() < .12;
      tick(out, rate, t, big ? 900 + unit() * 900 : 2200 + unit() * 3800, big ? .003 : .0006 + unit() * .0009, (big ? .5 : .28) * unit() ** 2);
    }
  } else {
    // Sleet: hard little ticks on dry stems, over the soft hush of falling snow.
    const low = new Biquad('lowpass', 1500, .6, rate);
    out = looped(length, fade, () => low.run(noise()) * .12);
    for (let t = 0; t < bed.seconds; t += -Math.log(1 - unit() * .999) / 150) {
      tick(out, rate, t, 3000 + unit() * 4200, .0004 + unit() * .0003, .7 * unit() ** 3);
    }
  }
  return normalize(out, .9);
}

/** Crickets by the month: loud in September's warmth, gone by December; frost and snow still them. */
export const MONTH_INSECTS: Readonly<Record<Month, number>> = { September: 1.25, October: 1, November: .2, December: 0, January: 0 };
const WEATHER_INSECTS: Readonly<Record<Condition, number>> = { mild: 1, frost: 0, hot: 1.15, rain: .25, snow: 0 };
export function insectShare(month: Month, condition: Condition): number {
  return MONTH_INSECTS[month] * WEATHER_INSECTS[condition];
}

/**
 * The working country beyond the property, heard faintly: a gravel truck
 * on the section road, cattle bawling on the next place, a far train on
 * the Dakota grounds, a grain dryer running at harvest on Cattail. Never
 * near, never loud, and gone while the hunter walks in on a point.
 */
export type FarSoundKind = 'gravel-truck' | 'cattle' | 'train';
export interface FarSound {
  readonly kind: FarSoundKind;
  readonly weight: number;
  /** How far off it is, m. */
  readonly distance: readonly [number, number];
  /** Loudness before the distance falloff (as the land's birds). */
  readonly gain: number;
  readonly hours?: Partial<Record<TimeOfDay, number>>;
  readonly months?: Partial<Record<Month, number>>;
}
export interface WorkingLandscape {
  /** Mean seconds between far sounds. */
  readonly interval: number;
  readonly sounds: readonly FarSound[];
  /** A grain dryer's drone, by month. */
  readonly dryer?: { readonly gain: number; readonly months: Partial<Record<Month, number>> };
}
const WORKDAY: Partial<Record<TimeOfDay, number>> = { dawn: .3, morning: 1, noon: 1.2, evening: .7, lastlight: .25 };
const HARVEST: Partial<Record<Month, number>> = { September: 1.2, October: 1.4, November: 1, December: .5, January: .4 };
const CHORES: Partial<Record<TimeOfDay, number>> = { dawn: 1.6, morning: 1, noon: .5, evening: 1.3, lastlight: .8 };
export const WORKING_LANDSCAPE: Readonly<Record<FieldRegion, WorkingLandscape>> = {
  'sharptail-prairie': { interval: 80, sounds: [
    { kind: 'cattle', weight: 2, distance: [350, 900], gain: .5, hours: CHORES },
    { kind: 'gravel-truck', weight: 1, distance: [700, 1500], gain: 1.1, hours: WORKDAY },
    { kind: 'train', weight: .9, distance: [2500, 4500], gain: 3.2 },
  ] },
  'pheasant-coverts': { interval: 70, sounds: [
    { kind: 'gravel-truck', weight: 1.6, distance: [600, 1400], gain: 1.1, hours: WORKDAY, months: HARVEST },
    { kind: 'train', weight: 1, distance: [2200, 4200], gain: 3.2 },
    { kind: 'cattle', weight: .7, distance: [400, 1000], gain: .5, hours: CHORES },
  ], dryer: { gain: .0045, months: { September: .4, October: 1, November: .8, December: .2 } } },
  'quail-fields': { interval: 95, sounds: [
    { kind: 'cattle', weight: 2, distance: [300, 800], gain: .5, hours: CHORES },
    { kind: 'gravel-truck', weight: 1, distance: [700, 1500], gain: 1.1, hours: WORKDAY },
  ] },
  // The canyon is the quietest ground: only range cattle, far down the draw.
  'chukar-ridge': { interval: 150, sounds: [
    { kind: 'cattle', weight: 1, distance: [500, 1200], gain: .45, hours: CHORES },
  ] },
};
/** Far sounds are dulled below 1.5 kHz, so a low rate carries them. */
export const FAR_RATE = 11025;
/** Far sounds share the land's birds' distance falloff, a step under them. */
export const FAR_SOUND_GAIN = .18;

export function workingLandscape(areaId?: string): WorkingLandscape | undefined {
  return areaId && areaId in WORKING_LANDSCAPE ? WORKING_LANDSCAPE[areaId as FieldRegion] : undefined;
}
export interface FarSoundPick { readonly sound: FarSound; readonly distance: number; readonly bearing: number; readonly seed: number }
/** The next far sound for the hour and month, if the ground has any. */
export function nextFarSound(areaId: string | undefined, hour: TimeOfDay, month: Month, random: () => number): FarSoundPick | null {
  const land = workingLandscape(areaId);
  if (!land) return null;
  const weights = land.sounds.map(sound => sound.weight * (sound.hours?.[hour] ?? 1) * (sound.months?.[month] ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return null;
  let pick = random() * total;
  const sound = land.sounds[Math.max(0, weights.findIndex(weight => (pick -= weight) < 0))];
  return { sound, distance: sound.distance[0] + (sound.distance[1] - sound.distance[0]) * random(),
    bearing: random() * Math.PI * 2, seed: 1 + Math.floor(random() * 1e6) };
}
export function farSoundWait(areaId: string | undefined, random: () => number): number {
  const land = workingLandscape(areaId);
  return land ? land.interval * (.5 + random()) : Infinity;
}
/** How loud a grain dryer runs this month, 0 where there is none. */
export function dryerLevel(areaId: string | undefined, month: Month): number {
  const dryer = workingLandscape(areaId)?.dryer;
  return dryer ? dryer.gain * (dryer.months[month] ?? 0) : 0;
}

/** One period of a harmonic voice, read back by phase: far cheaper than
 * summing the harmonics sample by sample. */
function wavetable(harmonics: number, amplitude: (k: number) => number, size = 1024): Float32Array {
  const table = new Float32Array(size + 1);
  for (let i = 0; i <= size; i++) for (let k = 1; k <= harmonics; k++) table[i] += Math.sin(2 * Math.PI * k * i / size + k * k) * amplitude(k);
  return table;
}
function readTable(table: Float32Array, phase: number): number {
  const x = (phase - Math.floor(phase)) * (table.length - 1), i = Math.floor(x);
  return table[i] + (table[i + 1] - table[i]) * (x - i);
}

/** A far sound, already dulled by distance; peak-normalized. */
export function farSoundSamples(kind: FarSoundKind, seed: number, rate = FAR_RATE): Float32Array {
  const random = noiseSource(seed), noise = noiseSource(seed ^ 0x1b873593), unit = () => (random() + 1) / 2;
  if (kind === 'cattle') {
    // A cow bawling: a buzzy voice that rises, holds and sags, through an mm-oo-aah mouth.
    const seconds = 1.6 + unit() * 1.1, out = new Float32Array(Math.round(seconds * rate)), base = 88 + unit() * 30;
    const air = new Biquad('lowpass', 1300, .6, rate);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length, s = i / rate;
      const f0 = base * (1 + .38 * Math.min(1, t / .22) - .5 * Math.max(0, t - .6)) * (1 + .012 * Math.sin(2 * Math.PI * 5 * s));
      phase += 2 * Math.PI * f0 / rate;
      const f1 = 280 + 480 * Math.min(1, t / .35), f2 = 750 + 450 * Math.min(1, t / .45);
      let voice = 0;
      for (let k = 1; k <= 24; k++) {
        const f = k * f0, formant = 1 / (1 + ((f - f1) / 130) ** 2) + .6 / (1 + ((f - f2) / 170) ** 2);
        voice += Math.sin(k * phase) * formant / Math.sqrt(k);
      }
      out[i] = air.run(voice * Math.min(1, t / .1) * Math.min(1, (1 - t) / .3));
    }
    return normalize(out, .9);
  }
  if (kind === 'gravel-truck') {
    // A loaded truck along the section road: diesel and gravel growing, passing, going.
    const seconds = 13 + unit() * 4, out = new Float32Array(Math.round(seconds * rate)), pass = seconds * (.42 + unit() * .16);
    const engine = new Biquad('lowpass', 340, .7, rate), crunch = new Biquad('bandpass', 1900, .9, rate), air = new Biquad('lowpass', 1100, .6, rate);
    const diesel = wavetable(10, k => 1 / k);
    let phase = 0, grit = 0;
    for (let i = 0; i < out.length; i++) {
      const s = i / rate, near = Math.exp(-(((s - pass) / (seconds * .2)) ** 2));
      phase += 41 * (1 + .03 * Math.tanh((pass - s) / 1.5)) / rate;
      if (unit() < .008) grit = unit();
      grit *= .9986;
      out[i] = air.run(engine.run(readTable(diesel, phase) * .7 + noise() * .4) + crunch.run(noise()) * (.35 + grit) * .55) * (.1 + .9 * near);
    }
    return normalize(out, .9);
  }
  // A far freight at a crossing: the long-long-short-long horn over the rumble of the cars.
  const seconds = 16 + unit() * 3, out = new Float32Array(Math.round(seconds * rate));
  const rumble = new Biquad('lowpass', 140, .7, rate), air = new Biquad('lowpass', 1500, .6, rate);
  const chord = [311, 370, 466].map(f => f * (1 + (unit() - .5) * .02)), voice = wavetable(6, k => 1 / (k * 1.4)), blasts: [number, number][] = [];
  for (let at = 2.5 + unit(), k = 0; k < 4; k++) { const length = k === 2 ? .7 : 2 + unit() * .5; blasts.push([at, length]); at += length + .45; }
  for (let i = 0; i < out.length; i++) {
    const s = i / rate, cars = Math.sin(Math.PI * i / out.length) ** 1.5;
    let horn = 0;
    for (const [at, length] of blasts) {
      if (s < at || s > at + length + .3) continue;
      const envelope = Math.min(1, (s - at) / .09) * Math.min(1, Math.max(0, at + length + .3 - s) / .3);
      for (const f of chord) horn += readTable(voice, f * s) * envelope;
    }
    out[i] = air.run(horn * .16) + rumble.run(noise()) * cars * 1.4;
  }
  // The land throws the horn back a third of a second later.
  const echo = Math.round(.34 * rate);
  for (let i = out.length - 1; i >= echo; i--) out[i] += out[i - echo] * .28;
  return normalize(out, .9);
}

/** A grain dryer's drone across the section: fan hum, blade buzz and burner roar, looped. */
export function grainDryerSamples(rate: number, seed: number, seconds = 4): Float32Array {
  const noise = noiseSource(seed), on = (f: number) => Math.round(f * seconds) / seconds;
  const fan = on(59), blade = on(177), beat = on(.75), motor = wavetable(7, k => 1 / k);
  const roar = new Biquad('lowpass', 650, .6, rate), air = new Biquad('lowpass', 900, .6, rate);
  const out = looped(Math.round(rate * seconds), Math.round(rate * .2), i => {
    const s = i / rate, hum = readTable(motor, fan * s);
    const buzz = Math.sin(2 * Math.PI * blade * s) * (.6 + .4 * Math.sin(2 * Math.PI * beat * s));
    return air.run(hum * .5 + buzz * .25 + roar.run(noise()) * .9);
  });
  return normalize(out, .9);
}
