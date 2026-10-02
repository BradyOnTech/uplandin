import { Biquad, fadeTail, noiseSource, OnePole } from './dsp';

/**
 * A steel-string acoustic guitar, plucked: the extended Karplus-Strong
 * string (a burst of noise shaped by the pick and where it strikes, round
 * a loop that loses its top end each pass), tuned with a fractional delay,
 * then a small wooden body around it. Each note is made once and cached.
 */
export const GUITAR_RATE = 22050;

export interface Pluck {
  /** 0 soft .. 1 hard; harder is louder and brighter. */
  velocity?: number;
  /** Where the string is struck, as a share of its length: near the bridge is twangy. */
  position?: number;
  /** Seconds for the note to die 60 dB at 110 Hz; higher notes die sooner. */
  sustain?: number;
  /** Seconds of the note kept. */
  length?: number;
  /** A harmonic touched at the twelfth fret: the fundamental damped, the octave chiming. */
  harmonic?: boolean;
}

export const midiHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

export function synthesizePluck(frequency: number, seed: number, pluck: Pluck = {}): Float32Array {
  const rate = GUITAR_RATE, velocity = Math.max(.05, Math.min(1, pluck.velocity ?? .7));
  const length = Math.ceil((pluck.length ?? 3) * rate), out = new Float32Array(length);
  // The loop's own delay: the averaging filter adds half a sample, the allpass the rest.
  const period = rate / frequency;
  let size = Math.floor(period - .5), fraction = period - .5 - size;
  if (fraction < .1) { size -= 1; fraction += 1; }
  const tune = (1 - fraction) / (1 + fraction);
  const line = new Float32Array(size);
  // The pluck: noise shaped by how hard, then a comb for where it was struck.
  const noise = noiseSource(seed), pick = new OnePole(900 + 7000 * velocity * velocity, rate), raw = new Float32Array(size);
  for (let i = 0; i < size; i++) raw[i] = pick.low(noise());
  const at = Math.max(1, Math.round((pluck.position ?? .2) * size));
  let mean = 0;
  for (let i = 0; i < size; i++) { line[i] = raw[i] - (i >= at ? raw[i - at] : 0); mean += line[i]; }
  for (let i = 0; i < size; i++) line[i] -= mean / size;
  // Loss per trip round the loop, for the sustain asked at this pitch.
  const t60 = (pluck.sustain ?? 6) * Math.pow(110 / frequency, .5);
  const loss = Math.pow(10, -3 / (t60 * frequency));
  let index = 0, previous = 0, allpassIn = 0, allpassOut = 0;
  for (let n = 0; n < length; n++) {
    const current = line[index];
    const averaged = loss * .5 * (current + previous);
    previous = current;
    const tuned = tune * averaged + allpassIn - tune * allpassOut;
    allpassIn = averaged; allpassOut = tuned;
    line[index] = tuned;
    out[n] = current;
    if (++index >= size) index = 0;
  }
  if (pluck.harmonic) {
    // A finger at the twelfth fret: only the even partials ring on.
    for (let n = length - 1; n >= Math.round(period); n--) out[n] = .5 * (out[n] + out[n - Math.round(period / 2)]);
  }
  // The body: the air in it, the top and the back, and a little bite.
  const air = new Biquad('bandpass', 102, 2.5, rate), top = new Biquad('bandpass', 210, 3, rate), back = new Biquad('bandpass', 420, 2.5, rate);
  const bite = new Biquad('peak', 2600, 1, rate, 3);
  const level = .3 + .7 * velocity;
  for (let n = 0; n < length; n++) {
    const string = out[n];
    // The prompt sound fades fast into the long aftersound, as a real string's does.
    const prompt = .7 + .3 * Math.exp(-n / (rate * .22));
    out[n] = bite.run(string + air.run(string) * .5 + top.run(string) * .35 + back.run(string) * .2) * level * prompt;
  }
  return fadeTail(out, rate, .08);
}
