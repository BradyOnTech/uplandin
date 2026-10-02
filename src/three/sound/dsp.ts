import { mulberry32 } from '../../game/math';

/**
 * Small, allocation-light DSP for sounds synthesized once into sample
 * buffers (the pattern pheasantFlushAudio.ts set): deterministic noise,
 * one-pole and biquad filters, resonators and envelopes. Pure JS, so every
 * sound can be rendered and measured outside a browser.
 */
export type Rng = () => number;

export function noiseSource(seed: number): Rng {
  const rng = mulberry32(seed >>> 0);
  return () => rng() * 2 - 1;
}

/** One-pole lowpass state: y += a (x - y), a from a cutoff in Hz. */
export class OnePole {
  private y = 0;
  private a: number;
  constructor(cutoffHz: number, private readonly rate: number) { this.a = OnePole.coefficient(cutoffHz, rate); }
  static coefficient(cutoffHz: number, rate: number): number { return 1 - Math.exp(-2 * Math.PI * Math.max(1, cutoffHz) / rate); }
  set cutoff(hz: number) { this.a = OnePole.coefficient(hz, this.rate); }
  low(x: number): number { this.y += this.a * (x - this.y); return this.y; }
  high(x: number): number { return x - this.low(x); }
}

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'lowshelf' | 'highshelf';

/** RBJ cookbook biquad (direct form I), retunable per sample. */
export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private readonly kind: BiquadKind, frequency: number, q: number, private readonly rate: number, gainDb = 0) {
    this.tune(frequency, q, gainDb);
  }
  tune(frequency: number, q: number, gainDb = 0): void {
    const w = 2 * Math.PI * Math.min(this.rate * .49, Math.max(10, frequency)) / this.rate;
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * Math.max(.05, q)), A = Math.pow(10, gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (this.kind) {
      case 'lowpass': b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
      case 'highpass': b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
      case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cos + s); b1 = 2 * A * ((A - 1) - (A + 1) * cos); b2 = A * ((A + 1) - (A - 1) * cos - s);
        a0 = (A + 1) + (A - 1) * cos + s; a1 = -2 * ((A - 1) + (A + 1) * cos); a2 = (A + 1) + (A - 1) * cos - s; break;
      }
      default: {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cos + s); b1 = -2 * A * ((A - 1) + (A + 1) * cos); b2 = A * ((A + 1) + (A - 1) * cos - s);
        a0 = (A + 1) - (A - 1) * cos + s; a1 = 2 * ((A - 1) - (A + 1) * cos); a2 = (A + 1) - (A - 1) * cos - s;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** A struck mode: a decaying sinusoid, the building block of metal and wood. */
export interface Mode { frequency: number; decay: number; gain: number }

/** Sum of decaying modes from t = 0, with a click-free 0.5 ms onset. */
export function modes(out: Float32Array, rate: number, start: number, list: readonly Mode[], scale = 1): void {
  const first = Math.max(0, Math.floor(start * rate));
  for (const mode of list) {
    const w = 2 * Math.PI * mode.frequency / rate, decay = Math.exp(-1 / (mode.decay * rate));
    let amplitude = mode.gain * scale;
    for (let i = first, n = 0; i < out.length && amplitude > 1e-5; i++, n++) {
      out[i] += Math.sin(w * n) * amplitude * Math.min(1, n / (rate * .0005));
      amplitude *= decay;
    }
  }
}

/** Mix a buffer into another at an offset, scaled. */
export function mixInto(out: Float32Array, source: Float32Array, offsetSamples: number, gain = 1): void {
  const start = Math.max(0, Math.round(offsetSamples));
  for (let i = 0; i + start < out.length && i < source.length; i++) out[i + start] += source[i] * gain;
}

/** Gentle saturation: loud peaks round off instead of clipping. */
export function soften(x: number, drive = 1): number {
  return Math.tanh(x * drive) / Math.tanh(drive);
}

/** Peak-normalize to a target, returning the buffer. */
export function normalize(samples: Float32Array, peak = .9): Float32Array {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  if (max > 0) for (let i = 0; i < samples.length; i++) samples[i] *= peak / max;
  return samples;
}

/** Fade the last `seconds` to silence so a buffer never ends on a click. */
export function fadeTail(samples: Float32Array, rate: number, seconds: number): Float32Array {
  const n = Math.min(samples.length, Math.round(seconds * rate));
  for (let i = 0; i < n; i++) samples[samples.length - 1 - i] *= i / n;
  return samples;
}

export function peak(samples: Float32Array): number {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  return max;
}

export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}
