/**
 * Procedural sound effects — no audio assets, everything is synthesized
 * with WebAudio. Mobile browsers require a user gesture before audio can
 * play, so call unlockAudio() from a pointer handler.
 */

let ctx: AudioContext | null = null;

function ac(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Call from any user gesture to satisfy mobile autoplay policies. */
export function unlockAudio(): void {
  const c = ac();
  if (c.state === 'suspended') void c.resume();
}

/** Returns the context only if it's actually allowed to play right now. */
function ready(): AudioContext | null {
  const c = ac();
  return c.state === 'running' ? c : null;
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

interface ToneOpts {
  type?: OscillatorType;
  volume?: number;
  slideTo?: number;
}

function tone(freq: number, startIn: number, duration: number, opts: ToneOpts = {}): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + startIn;
  const osc = c.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(opts.volume ?? 0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function noise(startIn: number, duration: number, fromFreq: number, toFreq: number, volume: number): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + startIn;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, duration + 0.05);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(fromFreq, t);
  filter.frequency.exponentialRampToValueAtTime(toFreq, t + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t);
  src.stop(t + duration + 0.05);
}

/** Shotgun blast. */
export function playShot(): void {
  noise(0, 0.28, 3200, 240, 0.9);
  tone(110, 0, 0.2, { type: 'triangle', volume: 0.5, slideTo: 45 });
}

/** Covey flush: a flutter of wings. */
export function playFlush(): void {
  for (let i = 0; i < 6; i++) {
    noise(i * 0.045, 0.04, 1400, 700, 0.25);
  }
  tone(520, 0, 0.25, { volume: 0.12, slideTo: 900 });
}

/** Dog on point: two soft beeps. */
export function playPoint(): void {
  tone(880, 0, 0.09, { volume: 0.18 });
  tone(1174, 0.12, 0.14, { volume: 0.18 });
}

/** Downed bird hits the ground. */
export function playThud(): void {
  tone(160, 0, 0.18, { type: 'triangle', volume: 0.5, slideTo: 55 });
  noise(0, 0.08, 500, 150, 0.3);
}

/** Retrieve pickup blip. */
export function playBlip(): void {
  tone(660, 0, 0.07, { type: 'square', volume: 0.08 });
  tone(990, 0.08, 0.09, { type: 'square', volume: 0.08 });
}

/** Rooster pheasant cackling on the rise: raspy descending squawks. */
export function playCackle(): void {
  for (let i = 0; i < 4; i++) {
    tone(340 - i * 28, i * 0.09, 0.07, { type: 'square', volume: 0.14, slideTo: 190 - i * 15 });
  }
}

/** Woodcock wing twitter: rapid high chirps as it towers. */
export function playTwitter(): void {
  for (let i = 0; i < 6; i++) {
    tone(1900 + (i % 2) * 500, i * 0.055, 0.04, { volume: 0.09, slideTo: 2600 });
  }
}

/** Ruffed grouse thunder: the flush flutter, but bigger and closer. */
export function playThunder(): void {
  for (let i = 0; i < 9; i++) {
    noise(i * 0.038, 0.05, 1000, 450, 0.4);
  }
  tone(140, 0, 0.3, { type: 'triangle', volume: 0.25, slideTo: 60 });
}

/**
 * Dog bell: one small brass tink. Ring it on a timer while the dog moves;
 * volume carries the distance cue, and silence means the dog is standing.
 */
export function playBell(volume: number): void {
  if (volume <= 0.005) return;
  tone(2350, 0, 0.09, { volume: volume * 0.7 });
  tone(3520, 0, 0.05, { volume: volume * 0.35 });
}

/** Handler's whistle: two sliding notes. */
export function playWhistle(): void {
  tone(700, 0, 0.16, { volume: 0.22, slideTo: 1250 });
  tone(1250, 0.18, 0.22, { volume: 0.22, slideTo: 850 });
}
