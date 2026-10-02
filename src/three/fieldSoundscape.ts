import type { TimeOfDay } from './palette';

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
