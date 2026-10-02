import { Biquad, OnePole, fadeTail, mixInto, noiseSource, normalize } from './dsp';

/**
 * A bird's voice, built note by note: each note follows a pitch path and a
 * loudness path, as a spectrogram of the real call reads. Whistles (wrens,
 * meadowlarks, quail) are nearly pure tones; harsh calls (a raven's croak, a
 * goose's honk, a chukar's chuck) are harmonic stacks shaped by resonances,
 * roughened and breathy. Synthesized once into buffers, like the guns.
 */
export const BIRD_RATE = 22050;

/** [share of the note, value] pairs, eased between. */
export type Path = readonly (readonly [number, number])[];

export interface Note {
  /** Start within the call, s. */
  at: number;
  length: number;
  /** The fundamental along the note, Hz. */
  pitch: Path;
  /** Loudness along the note, 0..1. By default a soft attack and release. */
  level?: Path;
  gain: number;
  /** Harmonic amplitudes, fundamental first. */
  harmonics?: readonly number[];
  /** Resonances of a harsh voice, [Hz, bandwidth Hz, gain]; they weight the harmonics. */
  formants?: readonly (readonly [number, number, number])[];
  /** Share of breath noise, banded about the voice. */
  breath?: number;
  /** A rattle or buzz: loudness fluttering at a rate, Hz, by a depth, 0..1. */
  flutter?: { rate: number; depth: number };
  /** Pitch wobble: rate, Hz, and depth, semitones. */
  vibrato?: { rate: number; depth: number };
  /** Ragged pitch and loudness, 0..1: a croak, a squawk. */
  rough?: number;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** A path's value at a share of the note; pitch eases in octaves. */
export function pathAt(path: Path, x: number, octaves = false): number {
  if (x <= path[0][0]) return path[0][1];
  for (let i = 1; i < path.length; i++) {
    const [x1, v1] = path[i];
    if (x <= x1) {
      const [x0, v0] = path[i - 1], t = ease((x - x0) / Math.max(1e-6, x1 - x0));
      return octaves ? v0 * Math.pow(v1 / v0, t) : v0 + (v1 - v0) * t;
    }
  }
  return path[path.length - 1][1];
}

const SOFT: Path = [[0, 0], [.12, 1], [.7, .85], [1, 0]];
const MAX_HARMONICS = 24;

/** Harmonic weights under a voice's resonances, up to the band limit. */
function formantWeights(f0: number, formants: NonNullable<Note['formants']>, limit: number, into: Float32Array): number {
  let count = 0;
  while (count < MAX_HARMONICS && (count + 1) * f0 < limit) {
    const k = count + 1;
    let weight = 0;
    for (const [frequency, width, gain] of formants) weight += gain * Math.exp(-(((k * f0 - frequency) / width) ** 2));
    into[count++] = weight / Math.sqrt(k);
  }
  return count;
}

function renderNote(out: Float32Array, rate: number, note: Note, seed: number): void {
  const first = Math.round(note.at * rate), count = Math.round(note.length * rate), limit = rate * .45;
  const rng = noiseSource(seed), noise = noiseSource(seed ^ 0x5bd1e995);
  const band = note.breath ? new Biquad('bandpass', Math.min(limit, pathAt(note.pitch, 0, true)), 2.2, rate) : null;
  const weights = new Float32Array(MAX_HARMONICS), rough = note.rough ?? 0;
  const fixed = note.harmonics ?? [1];
  if (!note.formants) fixed.forEach((value, i) => { if (i < MAX_HARMONICS) weights[i] = value; });
  // Roughness: slow random drifts in pitch and loudness.
  const drift = new OnePole(38, rate), sway = new OnePole(55, rate);
  let phase = rng() * Math.PI * 2, harmonics = Math.min(MAX_HARMONICS, fixed.length);
  for (let n = 0; n < count && first + n < out.length; n++) {
    const x = n / count, t = n / rate;
    let f = pathAt(note.pitch, x, true);
    if (note.vibrato) f *= Math.pow(2, note.vibrato.depth * Math.sin(2 * Math.PI * note.vibrato.rate * t) / 12);
    if (rough) f *= 1 + drift.low(rng()) * rough * .9;
    phase += 2 * Math.PI * f / rate;
    if (note.formants && n % 32 === 0) harmonics = formantWeights(f, note.formants, limit, weights);
    // Each harmonic from the last two: sin((k+1)p) = 2 cos(p) sin(kp) - sin((k-1)p).
    const twoCos = 2 * Math.cos(phase);
    let previous = 0, current = Math.sin(phase), voice = 0;
    for (let k = 0; k < harmonics && (k + 1) * f < limit; k++) {
      voice += weights[k] * current;
      const next = twoCos * current - previous;
      previous = current; current = next;
    }
    if (band) {
      if (n % 32 === 0) band.tune(Math.min(limit, f * (note.formants ? 1.6 : 1)), 2.2);
      voice += band.run(noise()) * note.breath! * 4;
    }
    let level = pathAt(note.level ?? SOFT, x);
    if (note.flutter) level *= 1 - note.flutter.depth * (.5 + .5 * Math.cos(2 * Math.PI * note.flutter.rate * t));
    if (rough) level *= 1 + sway.low(rng()) * rough * 1.6;
    out[first + n] += voice * level * note.gain;
  }
}

/** A call's notes into a buffer, peaking at .9. Deterministic for a seed. */
export function renderCall(notes: readonly Note[], seed: number, rate = BIRD_RATE): Float32Array {
  const end = Math.max(...notes.map(note => note.at + note.length));
  const out = new Float32Array(Math.ceil((end + .02) * rate));
  notes.forEach((note, i) => renderNote(out, rate, note, (seed * 977 + i * 7919) >>> 0));
  return normalize(fadeTail(out, rate, .01), .9);
}

/** The country a bird is heard in. */
export type BirdSpace = 'open' | 'marsh' | 'timber' | 'canyon';

const SPACES: Readonly<Record<BirdSpace, readonly (readonly [number, number, number])[]>> = {
  // Open prairie: a ground bounce, and almost nothing else.
  open: [[.02, .1, 3500]],
  // Cattails and water: a soft, short blur.
  marsh: [[.06, .12, 2600], [.15, .07, 1700]],
  // Creek timber and plum thickets: a dense, quick wash.
  timber: [[.045, .2, 3000], [.083, .14, 2400], [.13, .09, 1800]],
  // The rimrock answers, and hands it on down the canyon.
  canyon: [[.29, .34, 2600], [.71, .2, 1800], [1.22, .1, 1200]],
};

/** A call in its country: the dry call with the land's reflections behind it. */
export function placeCall(dry: Float32Array, space: BirdSpace, seed: number, rate = BIRD_RATE): Float32Array {
  const echoes = SPACES[space], vary = noiseSource(seed ^ 0x1b873593);
  const tail = Math.max(...echoes.map(([delay]) => delay)) + .3;
  const out = new Float32Array(dry.length + Math.ceil(tail * rate));
  out.set(dry);
  for (const [delay, gain, cutoff] of echoes) {
    const dark = new OnePole(cutoff, rate), copy = new Float32Array(dry.length);
    for (let i = 0; i < dry.length; i++) copy[i] = dark.low(dry[i]);
    // A rough face returns a smeared copy, not a clean one.
    mixInto(out, copy, delay * (1 + vary() * .08) * rate, gain);
    mixInto(out, copy, (delay + .013) * rate, gain * .4);
  }
  return fadeTail(out, rate, .05);
}

/** Air takes the top end off with distance: a lowpass cutoff for a call this far off, Hz. */
export function airCutoff(distanceM: number): number {
  return Math.max(2200, 17000 * Math.exp(-Math.max(0, distanceM) / 260));
}
