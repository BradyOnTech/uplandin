/**
 * Procedural sound effects — no audio assets, everything is synthesized
 * with WebAudio. Mobile browsers require a user gesture before audio can
 * play, so call unlockAudio() from a pointer handler.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let audioEnabled = true;

export function setAudioEnabled(enabled: boolean): void {
  audioEnabled = enabled;
  if (master && ctx) master.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.08);
}
function output(c: AudioContext): GainNode {
  if (!master) { master = c.createGain(); master.gain.value = audioEnabled ? 1 : 0; master.connect(c.destination); }
  return master;
}

function ac(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Call from any user gesture to satisfy mobile autoplay policies. */
export function unlockAudio(): void {
  if (typeof AudioContext === 'undefined' || !audioEnabled) return;
  const c = ac();
  if (c.state === 'suspended') void c.resume();
}

/** Returns the context only if it's actually allowed to play right now. */
function ready(): AudioContext | null {
  if (!audioEnabled || typeof AudioContext === 'undefined') return null;
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
  destination?: AudioNode;
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
  osc.connect(gain).connect(opts.destination ?? output(c));
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function noise(startIn: number, duration: number, fromFreq: number, toFreq: number, volume: number, destination?: AudioNode, onEnded?: () => void): void {
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
  src.connect(filter).connect(gain).connect(destination ?? output(c));
  src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); onEnded?.(); };
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
export function playCackle(volume = 1, destination?: AudioNode): void {
  for (let i = 0; i < 4; i++) {
    tone(340 - i * 28, i * 0.09, 0.07, { type: 'square', volume: 0.14 * volume, slideTo: 190 - i * 15, destination });
  }
}

/** One physical pheasant launch: heavy first beats, then receding wing wash.
 * Distance affects loudness without changing bird state or random streams. */
export interface PheasantFlushSound {
  readonly active: boolean;
  updateSpatial(distanceM: number, pan: number): void;
  stop(): void;
}

export function playPheasantFlush(distanceM: number, rooster: boolean, pan = 0): PheasantFlushSound | undefined {
  const c = ready();
  if (!c) return;
  const direction = c.createStereoPanner(), distanceGain = c.createGain();
  const clampPan = (value: number) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  const proximity = (distance: number) => 1 / (1 + (Number.isFinite(distance) ? Math.max(0, distance) : 0) / 18);
  direction.pan.value = clampPan(pan);
  distanceGain.gain.value = proximity(distanceM);
  distanceGain.connect(direction).connect(output(c));
  let active = true;
  const handle: PheasantFlushSound = {
    get active() { return active; },
    updateSpatial(distance, nextPan) {
      if (!active) return;
      direction.pan.setTargetAtTime(clampPan(nextPan), c.currentTime, .025);
      distanceGain.gain.setTargetAtTime(proximity(distance), c.currentTime, .025);
    },
    stop() {
      if (!active) return;
      active = false;
      distanceGain.disconnect(); direction.disconnect();
    },
  };
  noise(0, .18, 2600, 600, .42, distanceGain);
  for (let beat = 0; beat < 8; beat++) {
    const envelope = Math.exp(-beat * .19);
    // Audio-clock completion releases both shared routing nodes, even if
    // the game stops rendering before this final wing wash finishes.
    noise(beat * .085, .065, 1700, 380, .48 * envelope, distanceGain,
      beat === 7 ? () => handle.stop() : undefined);
    tone(105, beat * .085, .055, {type:'triangle',volume:.08 * envelope,slideTo:65,destination:distanceGain});
  }
  if (rooster) playCackle(1, distanceGain);
  return handle;
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

/** Beeper collar locate tone: a sharp electronic beep while the dog stands on point. */
export function playBeeper(): void {
  tone(2750, 0, 0.1, { type: 'square', volume: 0.1 });
  tone(2750, 0.16, 0.1, { type: 'square', volume: 0.1 });
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

/**
 * Hunter footfall. `inCover` uses a duller, softer thump (grass/ragweed);
 * open ground is a drier click. Volume should already encode distance.
 */
export function playFootstep(inCover: boolean, volume = 0.12): void {
  if (volume <= 0.01) return;
  if (inCover) {
    noise(0, 0.05, 380, 120, volume * 0.55);
    tone(90, 0, 0.06, { type: 'triangle', volume: volume * 0.35, slideTo: 50 });
  } else {
    noise(0, 0.03, 900, 400, volume * 0.4);
    tone(140, 0, 0.04, { type: 'square', volume: volume * 0.12, slideTo: 80 });
  }
}

/** Soft head-up when the dog first hits scent — almost subliminal. */
export function playScentCheck(): void {
  tone(520, 0, 0.05, { volume: 0.06, slideTo: 640 });
}

/** A quiet continuous field bed, stopped by the 3D lifecycle adapter. */
export function startFieldAmbience(): { setPaused(paused: boolean): void; stop(): void } | null {
  const c = ready();
  if (!c) return null;
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c, 8);
  source.loop = true;
  const low = c.createBiquadFilter(); low.type = 'bandpass'; low.frequency.value = 650; low.Q.value = 0.45;
  const gain = c.createGain(); gain.gain.value = 0.018;
  source.connect(low).connect(gain).connect(output(c));
  source.start();
  return {
    setPaused(paused) { gain.gain.setTargetAtTime(paused ? 0 : 0.018, c.currentTime, 0.4); },
    stop() { source.stop(); source.disconnect(); low.disconnect(); gain.disconnect(); },
  };
}

/** Distant, unlocated ambience. Never announces a hidden game bird. */
export function playFieldSong(): void {
  tone(1900, 0, 0.13, { volume: 0.012, slideTo: 2600 });
  tone(2300, 0.24, 0.10, { volume: 0.009, slideTo: 1700 });
}

export function playActionClick(): void {
  noise(0, 0.045, 2300, 550, 0.10);
  tone(240, 0, 0.035, { type: 'triangle', volume: 0.04 });
}
