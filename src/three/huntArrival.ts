/** World metres; y is the foot contact plane, not the dog's body centre. */
export interface HuntArrivalPoint { x: number; y: number; z: number }

export interface HuntArrivalSite {
  readonly crateFloor: Readonly<HuntArrivalPoint>;
  readonly boxThreshold: Readonly<HuntArrivalPoint>;
  readonly tailgateEdge: Readonly<HuntArrivalPoint>;
  readonly landing: Readonly<HuntArrivalPoint>;
  /** Same heading convention as the hunt: atan2(world Z, world X). */
  readonly releaseHeading: number;
  readonly fieldHeading: number;
}

export type HuntArrivalPhase = 'anticipating' | 'opening' | 'stepping' | 'airborne' | 'landing' | 'ready';
export interface HuntArrivalFrame {
  phase: HuntArrivalPhase;
  progress: number;
  done: boolean;
  crateDoor: number;
  tailgate: number;
  dog: HuntArrivalPoint & {
    heading: number;
    /** Positive pitch raises the nose. Radians; independent of foot height. */
    pitch: number;
    /** 0..1 landing/crouch compression, applied by the chosen dog renderer. */
    bodyCompression: number;
    excitement: number;
    locomotion: 'stand' | 'walk' | 'hop';
  };
}

export const HUNT_ARRIVAL_DURATION = 3.2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const phase = (time: number, start: number, end: number) => clamp((time - start) / (end - start));

/** Pure, seekable release choreography. The caller owns pause/skip authority:
 * sampling at the duration supplies the same grounded endpoint as playback.
 * No camera, bird simulation, dog AI, or wall-clock state is changed here. */
export function sampleHuntArrival(site: HuntArrivalSite, elapsed: number, out?: HuntArrivalFrame): HuntArrivalFrame {
  const time = Number.isNaN(elapsed) ? 0 : Math.max(0, Math.min(HUNT_ARRIVAL_DURATION, elapsed));
  const frame: HuntArrivalFrame = out ?? { phase: 'anticipating', progress: 0, done: false,
    crateDoor: 0, tailgate: 0,
    dog: { x: 0, y: 0, z: 0, heading: 0, pitch: 0, bodyCompression: 0, excitement: 1, locomotion: 'stand' } };
  frame.progress = time / HUNT_ARRIVAL_DURATION;
  frame.done = time >= HUNT_ARRIVAL_DURATION;
  frame.tailgate = smooth(phase(time, .18, .78));
  frame.crateDoor = smooth(phase(time, .43, 1.0));
  const dog = frame.dog;
  dog.heading = site.releaseHeading;
  dog.pitch = 0; dog.bodyCompression = 0;
  dog.excitement = .95; dog.locomotion = 'stand';
  let from = site.crateFloor, to = site.crateFloor, progress = 0;
  if (time < .43) {
    frame.phase = 'anticipating';
    dog.bodyCompression = .035 * Math.pow(Math.sin(time / .43 * Math.PI * 2), 2);
  } else if (time < 1.02) {
    frame.phase = 'opening';
    // An eager lean, but the feet stay behind the opening until it clears.
    dog.pitch = -.045 * Math.sin(phase(time, .43, 1.02) * Math.PI);
  } else if (time < 1.52) {
    frame.phase = 'stepping'; dog.locomotion = 'walk';
    const walk = phase(time, 1.02, 1.52);
    if (walk < .55) { from = site.crateFloor; to = site.boxThreshold; progress = smooth(walk / .55); }
    else { from = site.boxThreshold; to = site.tailgateEdge; progress = smooth((walk - .55) / .45); }
    dog.bodyCompression = .16 * smooth(phase(time, 1.39, 1.52));
    dog.pitch = .10 * smooth(phase(time, 1.39, 1.52));
  } else if (time < 2.16) {
    frame.phase = 'airborne'; dog.locomotion = 'hop';
    from = site.tailgateEdge; to = site.landing; progress = phase(time, 1.52, 2.16);
    dog.pitch = blend(.10, -.24, smooth(progress));
    dog.bodyCompression = .16 * (1 - smooth(progress * 3));
  } else {
    from = site.landing; to = site.landing;
    frame.phase = frame.done ? 'ready' : 'landing';
    dog.bodyCompression = .23 * Math.sin(Math.PI * phase(time, 2.16, 2.47));
    dog.pitch = -.24 * (1 - smooth(phase(time, 2.16, 2.47)));
    const turn = Math.atan2(Math.sin(site.fieldHeading - site.releaseHeading), Math.cos(site.fieldHeading - site.releaseHeading));
    dog.heading = site.releaseHeading + turn * smooth(phase(time, 2.48, HUNT_ARRIVAL_DURATION));
    dog.excitement = blend(.95, .68, smooth(phase(time, 2.48, HUNT_ARRIVAL_DURATION)));
  }
  dog.x = blend(from.x, to.x, progress); dog.y = blend(from.y, to.y, progress); dog.z = blend(from.z, to.z, progress);
  // A small upward impulse before dropping off the tailgate; the ballistic
  // arc is continuous with both actual contact planes, including sloped lots.
  if (frame.phase === 'airborne') dog.y += .32 * 4 * progress * (1 - progress);
  return frame;
}
