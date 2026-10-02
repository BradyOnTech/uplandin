import { synthesizePheasantLaunch, PHEASANT_AUDIO_RATE, type PheasantLaunchVoice } from './three/pheasantFlushAudio';
import { synthesizeBirdLaunch, BIRD_FLUSH_AUDIO_RATE, type BirdLaunchVoice } from './three/speciesFlushAudio';
import { fieldInsectSamples, fieldSoundscape, fieldWindSamples, HOUR_INSECTS, HOUR_WIND } from './three/fieldSoundscape';
import type { TimeOfDay } from './three/palette';
import type { WindStrength } from './game/wind';
import { gunMechanism, type ShotgunActionCue, type ShotgunMechanism } from './three/shotgunActionTiming';
import { REPORT_RATE, synthesizeReport } from './three/sound/gunReport';
import { FOLEY_RATE, foleyCueNames, hullSurface, synthesizeActionCue, synthesizeHullDrop, type HullSurface } from './three/sound/gunFoley';
import type { DogCollarCue } from './three/dogCollarAudio';
import { airCutoff, BIRD_RATE, type BirdSpace } from './three/sound/birdVoice';
import { flockCalls, FLOCKS, synthesizeBirdCall, type BirdCallId, type FlockId } from './three/sound/birdCalls';
import { callsOnFlush, groundCalls, groundSpace, QUARRY_VOICES } from './three/sound/fieldBirds';
import { bellPitch, BREATH_RATE, DOG_SOUND_RATE, synthesizeBell, synthesizePant, synthesizeSniffs, synthesizeWhistle, WHISTLES,
  type BreathCue, type WhistleCall } from './three/sound/dogSounds';
import { STEP_RATE, STEP_SURFACES, synthesizeStep, type StepSurface } from './three/sound/stepSounds';
/**
 * Procedural sound effects — no audio assets, everything is synthesized,
 * with WebAudio nodes or once into sample buffers (three/sound/). Mobile browsers require a user gesture before audio can
 * play, so call unlockAudio() from a pointer handler.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Everything but the shooter's own gun: it dips under the report, as the ear does. */
let world: GainNode | null = null;
let audioEnabled = true;
const dogCollarVoices = new Set<DogCollarSound>();

export function setAudioEnabled(enabled: boolean): void {
  audioEnabled = enabled;
  if (!enabled) for (const voice of dogCollarVoices) voice.stop();
  if (master && ctx) master.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.08);
}
function output(c: AudioContext): GainNode {
  if (!master || !world) {
    master = c.createGain(); master.gain.value = audioEnabled ? 1 : 0;
    // A transparent limiter: the shot's peak and a busy moment never clip.
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 3; limiter.ratio.value = 18;
    limiter.attack.value = .0015; limiter.release.value = .16;
    master.connect(limiter).connect(c.destination);
    world = c.createGain(); world.connect(master);
  }
  return world;
}

/** The report goes past the world bus, and the world dips under it for a
 * moment: wings, bell and wind come back over a second, so the shot reads
 * as the loudest thing in the field without pinning everything else. */
export const SHOT_DUCK = { depth: .5, attack: .006, hold: .14, recovery: .42 } as const;
function shotBus(c: AudioContext): AudioNode {
  const bus = output(c), now = c.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.setTargetAtTime(SHOT_DUCK.depth, now, SHOT_DUCK.attack);
  bus.gain.setTargetAtTime(1, now + SHOT_DUCK.hold, SHOT_DUCK.recovery);
  return gunBus(c);
}
/** The shooter's own gun, the report and the action in the hands: never ducked. */
function gunBus(c: AudioContext): AudioNode {
  output(c);
  return master!;
}

/** Play pre-synthesized samples (mono, or left and right) once. */
function playSamples(c: AudioContext, channels: readonly Float32Array[], rate: number, gain: number,
  destination?: AudioNode, ended?: () => void, delay = 0): AudioBufferSourceNode {
  const buffer = c.createBuffer(channels.length, channels[0].length, rate);
  channels.forEach((data, index) => buffer.getChannelData(index).set(data));
  const source = c.createBufferSource(), level = c.createGain();
  source.buffer = buffer; level.gain.value = gain;
  source.connect(level).connect(destination ?? output(c));
  source.onended = () => { source.disconnect(); level.disconnect(); ended?.(); };
  source.start(delay > 0 ? c.currentTime + delay : undefined);
  return source;
}

/** Synthesized once and reused: a few variants of each sound, taken in turn. */
type Make = (seed: number) => readonly Float32Array[];
const sampleCache = new Map<string, { variants: (readonly Float32Array[])[]; next: number }>();
function cacheEntry(key: string) {
  let entry = sampleCache.get(key);
  if (!entry) { entry = { variants: [], next: 0 }; sampleCache.set(key, entry); }
  return entry;
}
function cached(key: string, index: number, make: Make): readonly Float32Array[] {
  return cacheEntry(key).variants[index] ??= make(index + 1);
}
function variant(key: string, count: number, make: Make): readonly Float32Array[] {
  return cached(key, cacheEntry(key).next++ % count, make);
}

/** Sounds made ahead of need, a few milliseconds at a time in idle moments. */
const warming: (() => void)[] = [];
let warmingScheduled = false;
function whenIdle(work: (deadline?: IdleDeadline) => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(work, { timeout: 1500 });
  else setTimeout(work, 40);
}
function warmSome(deadline?: IdleDeadline): void {
  warmingScheduled = false;
  const started = Date.now(), left = () => deadline ? deadline.timeRemaining() : 8 - (Date.now() - started);
  do warming.shift()?.(); while (warming.length && left() > 6);
  if (warming.length) { warmingScheduled = true; whenIdle(warmSome); }
}

const REPORT_VARIANTS = 3, FOLEY_VARIANTS = 4;
const reportKey = (gunId: string, areaId?: string) => `shot|${gunId}|${areaId ?? ''}`;
const makeReport = (gunId: string, areaId?: string): Make => seed => {
  const report = synthesizeReport(gunId, areaId, seed);
  return [report.left, report.right];
};
const foleyKey = (mechanism: ShotgunMechanism, cue: ShotgunActionCue) => `foley|${mechanism}|${cue}`;
const makeFoley = (mechanism: ShotgunMechanism, cue: ShotgunActionCue): Make => seed => [synthesizeActionCue(mechanism, cue, seed)];
const makeHull = (surface: HullSurface): Make => seed => [synthesizeHullDrop(surface, seed)];

const BIRD_VARIANTS = 3;
const birdKey = (call: BirdCallId, space: BirdSpace) => `bird|${call}|${space}`;
const makeBird = (call: BirdCallId, space: BirdSpace): Make => seed => [synthesizeBirdCall(call, seed, space)];

/** Make a ground's birds before they call: the land's own birds in its
 * country, and the quarry's voices (sound/fieldBirds.ts). */
export function prepareBirdSounds(areaId: string | undefined, speciesIds: readonly string[]): void {
  if (typeof AudioContext === 'undefined') return;
  const space = groundSpace(areaId), { calls, flocks } = groundCalls(areaId, speciesIds);
  const flushCalls = new Set(speciesIds.map(id => QUARRY_VOICES[id]?.flush?.call));
  for (const call of calls) {
    const at: BirdSpace = flushCalls.has(call) ? 'open' : space, variants = flushCalls.has(call) ? FOLEY_VARIANTS : BIRD_VARIANTS;
    for (let i = 0; i < variants; i++) warming.push(() => cached(birdKey(call, at), i, makeBird(call, at)));
  }
  for (const id of flocks) {
    const flock: (typeof FLOCKS)[FlockId] = FLOCKS[id], units: BirdCallId[] = [flock.unit, ...('also' in flock ? [flock.also.unit] : [])];
    for (const unit of units) for (let i = 0; i < FOLEY_VARIANTS; i++) warming.push(() => cached(birdKey(unit, space), i, makeBird(unit, space)));
  }
  if (!warmingScheduled) { warmingScheduled = true; whenIdle(warmSome); }
}

/** Make a gun's sounds before its first shot: its reports on this ground,
 * its action's cues and its hulls landing, one by one when the page is idle. */
export function prepareGunSounds(gunId: string, areaId?: string): void {
  if (typeof AudioContext === 'undefined') return;
  const mechanism = gunMechanism(gunId), surface = hullSurface(areaId);
  for (let i = 0; i < REPORT_VARIANTS; i++) warming.push(() => cached(reportKey(gunId, areaId), i, makeReport(gunId, areaId)));
  for (const cue of foleyCueNames(mechanism)) for (let i = 0; i < FOLEY_VARIANTS; i++) warming.push(() => cached(foleyKey(mechanism, cue), i, makeFoley(mechanism, cue)));
  for (let i = 0; i < FOLEY_VARIANTS; i++) warming.push(() => cached(`hull|${surface}`, i, makeHull(surface)));
  if (!warmingScheduled) { warmingScheduled = true; whenIdle(warmSome); }
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

/** Resolves once sound can play, for pages that play on a click (sounds.html). */
export async function audioReady(): Promise<boolean> {
  if (typeof AudioContext === 'undefined' || !audioEnabled) return false;
  const c = ac();
  if (c.state === 'suspended') await c.resume().catch(() => undefined);
  return c.state === 'running';
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

/** The shotgun report, and the land answering it (sound/gunReport.ts). */
export function playShot(gunId = 'remington-870', areaId?: string): void {
  const c = ready();
  if (!c) return;
  playSamples(c, variant(reportKey(gunId, areaId), REPORT_VARIANTS, makeReport(gunId, areaId)), REPORT_RATE, .95, shotBus(c));
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
export interface SoundDirection { x: number; y: number; z: number }

export interface PheasantFlushSound {
  readonly active: boolean;
  updateSpatial(distanceM: number, direction: SoundDirection): void;
  updateCoverSpatial?(distanceM: number, direction: SoundDirection): void;
  stop(): void;
}

export function playPheasantFlush(distanceM: number, rooster: boolean,
  source: SoundDirection = { x: 0, y: 0, z: -1 }, voice: PheasantLaunchVoice = {}): PheasantFlushSound | undefined {
  const c = ready();
  if (!c) return;
  return playSpatialLaunch(c, synthesizePheasantLaunch(rooster, voice), PHEASANT_AUDIO_RATE, distanceM, source);
}

const coveyVoices = new Set<{ sound: PheasantFlushSound; distance: number }>();

/** At most four representative covey birds have individual spatial voices.
 * A closer launch can replace the most distant one. Delayed birds make sound
 * only at their visible takeoff, and the sound follows the airborne bird. */
export function playBirdFlush(species: string, distanceM: number,
  source: SoundDirection, voice: BirdLaunchVoice = {}): PheasantFlushSound | undefined {
  const c = ready();
  if (!c) return;
  for (const entry of coveyVoices) if (!entry.sound.active) coveyVoices.delete(entry);
  const distance = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  if (coveyVoices.size >= 4) {
    const farthest = [...coveyVoices].reduce((a, b) => a.distance >= b.distance ? a : b);
    if (farthest.distance <= distance) return;
    farthest.sound.stop();
  }
  const entry = { distance, sound: undefined as unknown as PheasantFlushSound };
  // Some birds call as they go up: the call rides with the wings.
  const seed = voice.seed ?? 1, flush = QUARRY_VOICES[species]?.flush;
  const call = flush && callsOnFlush(species, seed)
    ? { samples: cached(birdKey(flush.call, 'open'), seed % FOLEY_VARIANTS, makeBird(flush.call, 'open'))[0], rate: BIRD_RATE, gain: .45, delay: .04 }
    : undefined;
  const handle = playSpatialLaunch(c, synthesizeBirdLaunch(species, voice), BIRD_FLUSH_AUDIO_RATE,
    distance, source, () => coveyVoices.delete(entry), call);
  entry.sound = handle;
  const update = handle.updateSpatial;
  handle.updateSpatial = (nextDistance, nextDirection) => {
    entry.distance = Number.isFinite(nextDistance) ? Math.max(0, nextDistance) : 0;
    update(nextDistance, nextDirection);
  };
  coveyVoices.add(entry);
  return handle;
}

interface LaunchCall { samples: Float32Array; rate: number; gain: number; delay: number }
function playSpatialLaunch(c: AudioContext, samples: { cover: Float32Array; flight: Float32Array },
  rate: number, distanceM: number, source: SoundDirection, onStop?: () => void, call?: LaunchCall): PheasantFlushSound {
  const proximity = (distance: number) => 1 / (1 + (Number.isFinite(distance) ? Math.max(0, distance) : 0) / 18);
  const route = () => {
    const direction = c.createPanner(), distanceGain = c.createGain();
    direction.panningModel = 'HRTF';
    direction.rolloffFactor = 0;
    distanceGain.connect(direction).connect(output(c));
    const position = (distance: number, offset: SoundDirection, smooth: boolean) => {
      const length = Math.hypot(offset.x, offset.y, offset.z);
      const valid = Number.isFinite(length) && length > .001;
      const x = valid ? offset.x / length : 0, y = valid ? offset.y / length : 0, z = valid ? offset.z / length : -1;
      if (smooth) {
        direction.positionX.setTargetAtTime(x, c.currentTime, .025);
        direction.positionY.setTargetAtTime(y, c.currentTime, .025);
        direction.positionZ.setTargetAtTime(z, c.currentTime, .025);
        distanceGain.gain.setTargetAtTime(proximity(distance), c.currentTime, .025);
      } else {
        direction.positionX.value = x; direction.positionY.value = y; direction.positionZ.value = z;
        distanceGain.gain.value = proximity(distance);
      }
    };
    position(distanceM, source, false);
    return { direction, distanceGain, position };
  };
  const wings = route(), cover = route();
  let active = true, coverActive = true;
  const sources: AudioBufferSourceNode[] = [];
  const releaseCover = () => {
    if (!coverActive) return;
    coverActive = false;
    cover.distanceGain.disconnect(); cover.direction.disconnect();
  };
  const handle: PheasantFlushSound = {
    get active() { return active; },
    updateSpatial(distance, nextDirection) { if (active) wings.position(distance, nextDirection, true); },
    updateCoverSpatial(distance, nextDirection) { if (active && coverActive) cover.position(distance, nextDirection, true); },
    stop() {
      if (!active) return;
      active = false;
      for (const source of sources) { source.stop(); source.disconnect(); }
      releaseCover();
      wings.distanceGain.disconnect(); wings.direction.disconnect();
      onStop?.();
    },
  };
  const play = (data: Float32Array, destination: AudioNode, ended: () => void) => {
    const buffer = c.createBuffer(1, data.length, rate);
    buffer.getChannelData(0).set(data);
    const node = c.createBufferSource(); node.buffer = buffer;
    node.connect(destination); sources.push(node);
    node.onended = () => { node.disconnect(); ended(); };
    node.start();
  };
  play(samples.cover, cover.distanceGain, releaseCover);
  play(samples.flight, wings.distanceGain, () => handle.stop());
  if (call) sources.push(playSamples(c, [call.samples], call.rate, call.gain, wings.distanceGain, undefined, call.delay));
  return handle;
}

/** How a bird's loudness falls away with distance. */
export function birdFalloff(distanceM: number): number {
  return 1 / (1 + Math.max(0, Number.isFinite(distanceM) ? distanceM : 0) / 45);
}

/** Where a bird is heard from. */
export interface BirdPlacement {
  distance: number;
  /** Listener-relative direction to the bird, any length. */
  direction: SoundDirection;
  /** Where a bird crossing the sky has got to by the time it is done calling. */
  to?: SoundDirection;
  space: BirdSpace;
  /** Loudness before the distance falloff. */
  gain: number;
}
export interface BirdSound { readonly active: boolean; stop(): void }

/** A bird's route: the air dulls it with distance, then it is placed around the hunter. */
function birdRoute(c: AudioContext, placement: BirdPlacement, seconds: number) {
  const air = c.createBiquadFilter(), level = c.createGain(), direction = c.createPanner();
  air.type = 'lowpass'; air.frequency.value = airCutoff(placement.distance); air.Q.value = .5;
  level.gain.value = placement.gain * birdFalloff(placement.distance);
  direction.panningModel = 'HRTF'; direction.rolloffFactor = 0;
  const unit = (d: SoundDirection) => {
    const length = Math.hypot(d.x, d.y, d.z);
    return Number.isFinite(length) && length > 1e-6 ? { x: d.x / length, y: d.y / length, z: d.z / length } : { x: 0, y: 0, z: -1 };
  };
  const from = unit(placement.direction), now = c.currentTime;
  direction.positionX.setValueAtTime(from.x, now); direction.positionY.setValueAtTime(from.y, now); direction.positionZ.setValueAtTime(from.z, now);
  if (placement.to) {
    const to = unit(placement.to), end = now + Math.max(.1, seconds);
    direction.positionX.linearRampToValueAtTime(to.x, end); direction.positionY.linearRampToValueAtTime(to.y, end);
    direction.positionZ.linearRampToValueAtTime(to.z, end);
  }
  air.connect(level).connect(direction).connect(output(c));
  return { input: air, release: () => { air.disconnect(); level.disconnect(); direction.disconnect(); } };
}

function birdSound(c: AudioContext, placement: BirdPlacement, seconds: number,
  parts: readonly { samples: Float32Array; level: number; delay: number }[]): BirdSound {
  const route = birdRoute(c, placement, seconds), sources: AudioBufferSourceNode[] = [];
  let open = parts.length, active = true;
  const finish = () => { if (!active) return; active = false; route.release(); };
  const sound: BirdSound = {
    get active() { return active; },
    stop() { if (!active) return; for (const source of sources) { source.onended = null; source.stop(); source.disconnect(); } finish(); },
  };
  for (const part of parts) sources.push(playSamples(c, [part.samples], BIRD_RATE, part.level, route.input, () => { if (--open === 0) finish(); }, part.delay));
  return sound;
}

/** One bird calling, from where it is (fieldAudio.ts places it). */
export function playBirdCall(call: BirdCallId, placement: BirdPlacement): BirdSound | undefined {
  const c = ready();
  if (!c || !(placement.gain > 0)) return;
  const [samples] = variant(birdKey(call, placement.space), BIRD_VARIANTS, makeBird(call, placement.space));
  return birdSound(c, placement, samples.length / BIRD_RATE, [{ samples, level: 1, delay: 0 }]);
}

/** A flock: each bird calling on its own, all from the flock's place in the sky. */
export function playBirdFlock(id: FlockId, placement: BirdPlacement, seed: number): BirdSound | undefined {
  const c = ready();
  if (!c || !(placement.gain > 0)) return;
  const parts = flockCalls(id, seed, FOLEY_VARIANTS).map(call => ({
    samples: cached(birdKey(call.unit, placement.space), call.variant, makeBird(call.unit, placement.space))[0], level: call.level * .55, delay: call.at,
  }));
  return birdSound(c, placement, FLOCKS[id].seconds + 1, parts);
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
  for (const note of COLLAR_NOTES.beeper) tone(note.frequency, note.start, note.duration, { type: note.type, volume: note.volume });
}

/**
 * Dog bell: one small brass tink. Ring it on a timer while the dog moves;
 * volume carries the distance cue, and silence means the dog is standing.
 */
export function playBell(volume: number): void {
  if (volume <= 0.005) return;
  for (const note of COLLAR_NOTES.bell) tone(note.frequency, note.start, note.duration, { type: note.type, volume: volume * note.volume });
}

/** One ring of a dog's own brass bell (sound/dogSounds.ts). Stopped, it is
 * damped in a few hundredths of a second rather than cut off. */
function ringBell(c: AudioContext, level: GainNode, direction: PannerNode,
  position: (gain: number, offset: SoundDirection, smooth: boolean) => void, slot: number): DogCollarSound {
  const pitch = bellPitch(slot), damp = c.createGain();
  damp.connect(level);
  let active = true, released = false;
  // The route is let go once the ring has ended, whether it rang out or was damped.
  const release = () => {
    active = false;
    if (released) return;
    released = true;
    damp.disconnect(); level.disconnect(); direction.disconnect(); dogCollarVoices.delete(handle);
  };
  const ring = playSamples(c, variant(`bell|${pitch}`, FOLEY_VARIANTS, makeBell(pitch)), DOG_SOUND_RATE, 1, damp, release);
  const handle: DogCollarSound = {
    get active() { return active; },
    updateSpatial(gain, offset) { if (active) position(gain, offset, true); },
    stop() {
      if (!active) return;
      active = false;
      damp.gain.setTargetAtTime(0, c.currentTime, .012);
      ring.stop(c.currentTime + .06);
    },
  };
  dogCollarVoices.add(handle);
  return handle;
}

const COLLAR_NOTES: Record<DogCollarCue, readonly { frequency: number; start: number; duration: number; volume: number; type: OscillatorType }[]> = {
  bell: [
    { frequency: 2350, start: 0, duration: .09, volume: .7, type: 'sine' },
    { frequency: 3520, start: 0, duration: .05, volume: .35, type: 'sine' },
  ],
  beeper: [
    { frequency: 2750, start: 0, duration: .1, volume: .1, type: 'square' },
    { frequency: 2750, start: .16, duration: .1, volume: .1, type: 'square' },
  ],
};

export interface DogCollarSound {
  readonly active: boolean;
  updateSpatial(volume: number, direction: SoundDirection): void;
  stop(): void;
}

/** Short, cancellable versions of the existing collar sounds. The direction
 * is listener-relative and updated while the player turns, even mid-beep. */
export function playDogCollar(kind: DogCollarCue, volume: number, source: SoundDirection, slot = 0): DogCollarSound | undefined {
  const c = ready();
  if (!c || !Number.isFinite(volume) || volume <= .001) return;
  const direction = c.createPanner(), level = c.createGain();
  direction.panningModel = 'HRTF'; direction.rolloffFactor = 0;
  level.connect(direction).connect(output(c));
  const position = (gain: number, offset: SoundDirection, smooth: boolean) => {
    const length = Math.hypot(offset.x, offset.y, offset.z);
    const valid = Number.isFinite(length) && length > .001;
    const values = [valid ? offset.x / length : 0, valid ? offset.y / length : 0, valid ? offset.z / length : -1];
    for (const [i, param] of [direction.positionX, direction.positionY, direction.positionZ].entries()) {
      if (smooth) param.setTargetAtTime(values[i], c.currentTime, .02);
      else param.value = values[i];
    }
    const safeGain = Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : 0;
    if (smooth) level.gain.setTargetAtTime(safeGain, c.currentTime, .02);
    else level.gain.value = safeGain;
  };
  position(volume, source, false);
  if (kind === 'bell') return ringBell(c, level, direction, position, slot);
  let active = true, remaining = COLLAR_NOTES[kind].length;
  const notes: { source: OscillatorNode; envelope: GainNode }[] = [];
  const handle: DogCollarSound = {
    get active() { return active; },
    updateSpatial(gain, offset) { if (active) position(gain, offset, true); },
    stop() {
      if (!active) return;
      active = false;
      for (const note of notes) { note.source.stop(c.currentTime); note.source.disconnect(); note.envelope.disconnect(); }
      level.disconnect(); direction.disconnect(); dogCollarVoices.delete(handle);
    },
  };
  dogCollarVoices.add(handle);
  for (const note of COLLAR_NOTES[kind]) {
    const oscillator = c.createOscillator(), envelope = c.createGain();
    const start = c.currentTime + note.start;
    oscillator.type = note.type; oscillator.frequency.value = note.frequency;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(note.volume, start + .004);
    envelope.gain.exponentialRampToValueAtTime(.001, start + note.duration);
    envelope.gain.linearRampToValueAtTime(0, start + note.duration + .02);
    oscillator.connect(envelope).connect(level);
    notes.push({ source: oscillator, envelope });
    oscillator.onended = () => { if (--remaining === 0) handle.stop(); };
    oscillator.start(start); oscillator.stop(start + note.duration + .02);
  }
  return handle;
}

/** Handler's whistle: two sliding notes. */
/** The handler's whistle: one long blast to stop, a pip to carry on, two to
 * turn, three for a dead bird, the trill and two pips to come in. */
export function playWhistle(call: WhistleCall = 'recall'): void {
  const c = ready();
  if (!c) return;
  playSamples(c, cached(`whistle|${call}`, 0, seed => [synthesizeWhistle(call, seed)]), DOG_SOUND_RATE, .3);
}

const BREATH_VARIANTS = 6;
const makeBell = (pitch: number): Make => seed => [synthesizeBell(pitch, seed)];
const makeBreath = (cue: BreathCue): Make => seed => [cue === 'pant' ? synthesizePant(seed) : synthesizeSniffs(seed)];

/** Make the dogs' bells, breath and the whistle before they are needed. */
export function prepareDogSounds(dogCount: number): void {
  if (typeof AudioContext === 'undefined') return;
  for (let slot = 0; slot < Math.max(1, dogCount); slot++) {
    const pitch = bellPitch(slot);
    for (let i = 0; i < FOLEY_VARIANTS; i++) warming.push(() => cached(`bell|${pitch}`, i, makeBell(pitch)));
  }
  for (const cue of ['pant', 'sniff'] as const) for (let i = 0; i < BREATH_VARIANTS; i++) warming.push(() => cached(`breath|${cue}`, i, makeBreath(cue)));
  for (const call of Object.keys(WHISTLES) as WhistleCall[]) warming.push(() => cached(`whistle|${call}`, 0, seed => [synthesizeWhistle(call, seed)]));
  if (!warmingScheduled) { warmingScheduled = true; whenIdle(warmSome); }
}

/** A dog's breath close by, from where its head is (fieldAudio.ts). */
export function playDogBreath(cue: BreathCue, volume: number, source: SoundDirection): void {
  const c = ready();
  if (!c || !(volume > .002)) return;
  const direction = c.createPanner();
  direction.panningModel = 'HRTF'; direction.rolloffFactor = 0;
  const length = Math.hypot(source.x, source.y, source.z), valid = Number.isFinite(length) && length > .001;
  direction.positionX.value = valid ? source.x / length : 0; direction.positionY.value = valid ? source.y / length : 0;
  direction.positionZ.value = valid ? source.z / length : -1;
  direction.connect(output(c));
  playSamples(c, variant(`breath|${cue}`, BREATH_VARIANTS, makeBreath(cue)), BREATH_RATE, Math.min(1, volume) * .12, direction,
    () => direction.disconnect());
}

/** Each kind of ground has its own loudness under a boot. */
const STEP_LEVEL: Readonly<Record<StepSurface, number>> = { dirt: .5, grass: .45, cover: .55, rock: .62, scree: .62, wet: .5, water: .6 };
const STEP_VARIANTS = 4;
const stepKey = (surface: StepSurface, running: boolean) => `step|${surface}|${running ? 'run' : 'walk'}`;
const makeStep = (surface: StepSurface, running: boolean): Make => seed => [synthesizeStep(surface, seed, running)];

/** Make every kind of footfall before the first step. */
export function prepareStepSounds(): void {
  if (typeof AudioContext === 'undefined') return;
  for (const surface of STEP_SURFACES) for (const running of [false, true]) {
    for (let i = 0; i < STEP_VARIANTS; i++) warming.push(() => cached(stepKey(surface, running), i, makeStep(surface, running)));
  }
  if (!warmingScheduled) { warmingScheduled = true; whenIdle(warmSome); }
}

/**
 * The hunter's own footfall on the ground underfoot (sound/stepSounds.ts):
 * dirt, grass, tall cover, rock, scree, slough mud or shallow water. Volume
 * already holds distance; `true`/`false` stand for cover or open grass.
 */
export function playFootstep(surface: StepSurface | boolean = 'grass', volume = 0.1, running = false): void {
  // Walking in on a point, every step sounds loud.
  volume *= 1 + fieldTension * .8;
  const c = ready();
  if (!c || volume <= 0.01) return;
  const ground: StepSurface = typeof surface === 'boolean' ? (surface ? 'cover' : 'grass') : surface;
  playSamples(c, variant(stepKey(ground, running), STEP_VARIANTS, makeStep(ground, running)), STEP_RATE, volume * STEP_LEVEL[ground]);
}

let fieldTension = 0;
/** 0..1: how close the hunter is to walking in on a standing point. The
 * field quiets around them and their own steps carry (fieldAudio.ts). */
export function setFieldTension(tension: number): void {
  fieldTension = Number.isFinite(tension) ? Math.max(0, Math.min(1, tension)) : 0;
}

/** The hunter's own pulse after a bird erupts at their feet: one low lub-dub. */
export function playHeartbeat(intensity = 1, delay = .16): void {
  const amount = Math.max(0, Math.min(1, intensity));
  if (amount <= 0) return;
  tone(58, delay, .14, { volume: .2 * amount, slideTo: 38 });
  tone(52, delay + .19, .12, { volume: .13 * amount, slideTo: 36 });
}

/** Nearby paws and stems, located at the dog rather than a UI cue. */
export function playDogMovement(inCover: boolean, volume: number, pan: number): void {
  const c = ready();
  if (!c || volume <= .001) return;
  const routing = c.createStereoPanner();
  routing.pan.value = Math.max(-1, Math.min(1, pan));
  routing.connect(output(c));
  noise(0, .045, inCover ? 450 : 1000, 140, volume * .55, routing);
  noise(.055, .04, inCover ? 380 : 800, 120, volume * .4, routing);
  // The final sound owns routing cleanup, including when rendering stops.
  noise(.07, .11, inCover ? 1900 : 700, 420, volume * (inCover ? .7 : .15), routing,
    () => routing.disconnect());
}

/** Soft head-up when the dog first hits scent — almost subliminal. */
export function playScentCheck(): void {
  tone(520, 0, 0.05, { volume: 0.06, slideTo: 640 });
}

/** A quiet continuous field bed, stopped by the 3D lifecycle adapter. */
export interface FieldAmbience {
  setPaused(paused: boolean): void;
  setWind?(strength: WindStrength): void;
  /** 0..1: the field hushes while the hunter walks in on a point. */
  setTension?(tension: number): void;
  /** The wind and the evening's crickets follow the hour. */
  setHour?(hour: TimeOfDay): void;
  stop(): void;
}

const INSECT_GAIN = .012, INSECT_RATE = 22050;
export function startFieldAmbience(areaId?: string): FieldAmbience | null {
  const c = ready();
  if (!c) return null;
  const profile = fieldSoundscape(areaId);
  if (profile) {
    let paused = false, wind: WindStrength = 'breezy', windGain = .75, hush = 1, hour: TimeOfDay | null = null, hourWind = 1;
    const windLevel = (volume: number) => volume * windGain * hourWind * hush;
    const layers = profile.layers.map(layer => {
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
      const samples = fieldWindSamples(c.sampleRate, layer);
      source.buffer = c.createBuffer(1, samples.length, c.sampleRate);
      source.buffer.getChannelData(0).set(samples); source.loop = true;
      filter.type = 'bandpass'; filter.frequency.value = layer.frequency; filter.Q.value = layer.q;
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.setTargetAtTime(windLevel(layer.gain), c.currentTime, .7);
      source.connect(filter).connect(gain).connect(output(c)); source.start();
      return { source, filter, gain, volume: layer.gain };
    });
    // The evening's crickets, left and right, made only when the hour calls for them.
    let insects: { source: AudioBufferSourceNode; gain: GainNode; side: StereoPannerNode }[] = [];
    const insectLevel = () => paused || hour === null ? 0 : INSECT_GAIN * profile.insects * HOUR_INSECTS[hour] * hush;
    const setInsects = (seconds: number) => { for (const layer of insects) layer.gain.gain.setTargetAtTime(insectLevel(), c.currentTime, seconds); };
    let stopped = false;
    return {
      setPaused(nextPaused) {
        if (stopped) return;
        paused = nextPaused;
        for (const layer of layers) layer.gain.gain.setTargetAtTime(paused ? 0 : windLevel(layer.volume), c.currentTime, paused ? .08 : .5);
        setInsects(paused ? .08 : .5);
      },
      setWind(strength) {
        if (stopped || strength === wind) return;
        wind = strength; windGain = strength === 'calm' ? .45 : strength === 'strong' ? 1 : .75;
        if (!paused) for (const layer of layers) layer.gain.gain.setTargetAtTime(windLevel(layer.volume), c.currentTime, 1.2);
      },
      setTension(tension) {
        const next = 1 - Math.max(0, Math.min(1, tension)) * .6;
        if (stopped || Math.abs(next - hush) < .01) return;
        // Hush slowly as the hunter closes; let the field back in quickly.
        const rising = next > hush;
        hush = next;
        if (!paused) for (const layer of layers) layer.gain.gain.setTargetAtTime(windLevel(layer.volume), c.currentTime, rising ? .35 : .9);
        if (!paused) setInsects(rising ? .35 : .9);
      },
      setHour(next) {
        if (stopped || next === hour) return;
        hour = next; hourWind = HOUR_WIND[next] ?? 1;
        if (!paused) for (const layer of layers) layer.gain.gain.setTargetAtTime(windLevel(layer.volume), c.currentTime, 2);
        if (!insects.length && profile.insects > 0 && (HOUR_INSECTS[next] ?? 0) > 0) {
          insects = [-.6, .6].map((pan, i) => {
            const source = c.createBufferSource(), gain = c.createGain(), side = c.createStereoPanner();
            const samples = fieldInsectSamples(INSECT_RATE, 7919 + i * 104729);
            source.buffer = c.createBuffer(1, samples.length, INSECT_RATE);
            source.buffer.getChannelData(0).set(samples); source.loop = true;
            side.pan.value = pan; gain.gain.setValueAtTime(0, c.currentTime);
            source.connect(gain).connect(side).connect(output(c)); source.start();
            return { source, gain, side };
          });
        }
        setInsects(1.5);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        for (const layer of layers) { layer.source.stop(); layer.source.disconnect(); layer.filter.disconnect(); layer.gain.disconnect(); }
        for (const layer of insects) { layer.source.stop(); layer.source.disconnect(); layer.gain.disconnect(); layer.side.disconnect(); }
      },
    };
  }
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c, 8);
  source.loop = true;
  const low = c.createBiquadFilter(); low.type = 'bandpass'; low.frequency.value = 650; low.Q.value = 0.45;
  const gain = c.createGain(); gain.gain.value = 0.018;
  source.connect(low).connect(gain).connect(output(c));
  source.start();
  let stopped = false;
  return {
    setPaused(paused) { if (!stopped) gain.gain.setTargetAtTime(paused ? 0 : 0.018, c.currentTime, 0.4); },
    stop() { if (stopped) return; stopped = true; source.stop(); source.disconnect(); low.disconnect(); gain.disconnect(); },
  };
}

/** Close mechanical foley; each cue follows the visible action, below the
 * gun report and foreground launch. No queued reload sequence survives pause.
 * Each mechanism has its own steel, walnut and plastic (sound/gunFoley.ts). */
export function playActionClick(cue: ShotgunActionCue = 'latch', mechanism: ShotgunMechanism = 'over-under'): void {
  const c = ready();
  if (!c) return;
  playSamples(c, variant(foleyKey(mechanism, cue), FOLEY_VARIANTS, makeFoley(mechanism, cue)), FOLEY_RATE, 1, gunBus(c));
}

/** A fired hull touching down near the hunter, placed left or right (fieldAudio.ts). */
export function playHullDrop(surface: HullSurface, volume: number, pan = 0): void {
  const c = ready();
  if (!c || !(volume > .003)) return;
  const routing = c.createStereoPanner();
  routing.pan.value = Math.max(-1, Math.min(1, pan));
  routing.connect(output(c));
  playSamples(c, variant(`hull|${surface}`, FOLEY_VARIANTS, makeHull(surface)), FOLEY_RATE, Math.min(1, volume),
    routing, () => routing.disconnect());
}

/** Close wing pressure, kept quiet enough to hear the quarry flush. */
export function playHawkWingbeat(volume = .08): void {
  noise(0, .14, 700, 180, volume);
}
