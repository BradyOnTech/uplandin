import { afterEach, describe, expect, it, vi } from 'vitest';
import { BIRD_CALLS, birdCallNotes, flockCalls, FLOCKS, synthesizeBirdCall, type BirdCallId, type FlockId } from '../src/three/sound/birdCalls';
import { airCutoff, BIRD_RATE, pathAt, placeCall, renderCall } from '../src/three/sound/birdVoice';
import { callsOnFlush, CoveyCalls, CoveyGathering, GROUND_BIRDS, groundBirdWait, groundCalls, groundSpace, nextGroundBird,
  QUARRY_VOICES, type HeardBird } from '../src/three/sound/fieldBirds';
import { peak, rms } from '../src/three/sound/dsp';
import { mulberry32 } from '../src/game/math';
import { OFFERED_AREA_IDS, getArea } from '../src/game/areas';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const CALLS = Object.keys(BIRD_CALLS) as BirdCallId[];
/** A whistle's pitch over a stretch of the call, from its zero crossings. */
function pitchAt(samples: Float32Array, from: number, to: number): number {
  const first = Math.round(from * BIRD_RATE), last = Math.round(to * BIRD_RATE);
  let crossings = 0;
  for (let i = first + 1; i < last; i++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) crossings++;
  return crossings / 2 / ((last - first) / BIRD_RATE);
}

describe('bird voices', () => {
  it('render every call clean and at a steady level, the same for a seed and a little different for the next', () => {
    for (const id of CALLS) {
      const call = synthesizeBirdCall(id, 1), next = synthesizeBirdCall(id, 2);
      expect(call.every(Number.isFinite), id).toBe(true);
      expect(call[call.length - 1], id).toBe(0);
      expect(peak(call), id).toBeGreaterThan(.6);
      expect(peak(call), id).toBeLessThanOrEqual(1.2);
      expect(call.length / BIRD_RATE, id).toBeLessThan(4);
      expect(synthesizeBirdCall(id, 1), id).toEqual(call);
      expect(next, id).not.toEqual(call);
    }
  });

  it('follow the pitch paths the real calls take', () => {
    // A canyon wren's cascade falls more than an octave from its first note to its last whistle.
    const notes = birdCallNotes('canyon-wren', 3), wren = renderCall(notes, 3);
    const whistles = notes.filter(note => !note.flutter), [first, last] = [whistles[0], whistles.at(-1)!];
    const middle = (note: typeof first) => pitchAt(wren, note.at + note.length * .3, note.at + note.length * .7);
    expect(middle(first)).toBeGreaterThan(1.7 * middle(last));
    // A bobwhite calling the covey together: "hoy" rises, "poo" falls, each where it was drawn.
    const [hoy, poo] = birdCallNotes('bobwhite-assembly', 1), call = renderCall([hoy, poo], 1);
    const at = (note: typeof hoy, x: number) => pitchAt(call, note.at + note.length * (x - .1), note.at + note.length * (x + .1));
    expect(at(hoy, .8)).toBeGreaterThan(1.25 * at(hoy, .2));
    expect(at(poo, .8)).toBeLessThan(at(poo, .2) / 1.2);
    for (const [note, x] of [[hoy, .5], [poo, .5]] as const) {
      expect(at(note, x) / pathAt(note.pitch, x, true)).toBeCloseTo(1, 1);
    }
  });

  it('put a call in its country: the rimrock answers it, the open prairie hardly does', () => {
    const dry = renderCall(birdCallNotes('chukar-rally', 1), 1);
    const canyon = placeCall(dry, 'canyon', 1), open = placeCall(dry, 'open', 1);
    const tail = (placed: Float32Array) => rms(placed, dry.length + Math.round(BIRD_RATE * .05), placed.length);
    expect(tail(canyon)).toBeGreaterThan(5 * tail(open));
    expect(Array.from(canyon.subarray(0, 200))).toEqual(Array.from(dry.subarray(0, 200)));
    // The air dulls a far bird, down to a floor.
    expect(airCutoff(600)).toBeLessThan(airCutoff(100) / 3);
    expect(airCutoff(20_000)).toBe(2200);
  });

  it('make a flock of birds each calling on its own, the same for a seed', () => {
    for (const id of Object.keys(FLOCKS) as FlockId[]) {
      const flock = FLOCKS[id], calls = flockCalls(id, 7, 4);
      expect(flockCalls(id, 7, 4)).toEqual(calls);
      expect(calls.length).toBeGreaterThanOrEqual(flock.birds[0]);
      expect(calls.length).toBeLessThanOrEqual(flock.birds[1]);
      expect(calls.map(call => call.at)).toEqual(calls.map(call => call.at).sort((a, b) => a - b));
      for (const call of calls) {
        expect(call.at).toBeLessThanOrEqual(flock.seconds);
        expect(call.variant).toBeLessThan(4);
        expect(call.level).toBeGreaterThan(.4);
        expect([flock.unit, 'also' in flock ? flock.also.unit : flock.unit]).toContain(call.unit);
      }
    }
    // Some cranes in a flock are colts.
    const cranes = Array.from({ length: 20 }, (_, seed) => flockCalls('cranes', seed, 4)).flat();
    const colts = cranes.filter(call => call.unit === 'crane-colt').length / cranes.length;
    expect(colts).toBeGreaterThan(.1); expect(colts).toBeLessThan(.3);
  });
});

describe('the birds of each ground', () => {
  const quarryCalls = new Set(Object.values(QUARRY_VOICES).flatMap(voice => [voice.flush?.call, voice.gather, voice.covey?.call]));

  it('has its own birds, heard in its own country, and none of them is the quarry', () => {
    expect(groundSpace('chukar-ridge')).toBe('canyon');
    expect(groundSpace('pheasant-coverts')).toBe('marsh');
    expect(groundSpace('nowhere')).toBe('open');
    for (const area of OFFERED_AREA_IDS) {
      const ground = GROUND_BIRDS[area];
      expect(ground.birds.length, area).toBeGreaterThanOrEqual(3);
      for (const bird of ground.birds) {
        if ('call' in bird) expect(quarryCalls.has(bird.call), bird.call).toBe(false);
        expect(bird.distance[0]).toBeGreaterThanOrEqual(20);
      }
    }
    expect(nextGroundBird('nowhere', 'dawn', Math.random)).toBeNull();
    expect(groundBirdWait('nowhere', 'dawn', Math.random)).toBe(Infinity);
  });

  it('calls most at first light, each bird at its own hours', () => {
    const random = mulberry32(5);
    const mean = (hour: 'dawn' | 'noon') => Array.from({ length: 400 }, () => groundBirdWait('quail-fields', hour, random)).reduce((a, b) => a + b) / 400;
    expect(mean('noon')).toBeGreaterThan(2 * mean('dawn'));
    const crows = (hour: 'dawn' | 'noon') => Array.from({ length: 2000 }, () => nextGroundBird('pheasant-coverts', hour, random))
      .filter(pick => pick && 'call' in pick.bird && pick.bird.call === 'rooster-crow').length;
    expect(crows('dawn')).toBeGreaterThan(5 * crows('noon'));
    const pick = nextGroundBird('chukar-ridge', 'morning', random)!;
    expect(pick.distance).toBeGreaterThanOrEqual(pick.bird.distance[0]);
    expect(pick.distance).toBeLessThanOrEqual(pick.bird.distance[1]);
  });

  it('lists every call a ground makes, to make them ahead of time', () => {
    for (const area of OFFERED_AREA_IDS) {
      const species = getArea(area).speciesMix.map(share => share.speciesId), { calls, flocks } = groundCalls(area, species);
      for (const bird of GROUND_BIRDS[area].birds) 'flock' in bird ? expect(flocks).toContain(bird.flock) : expect(calls).toContain(bird.call);
      for (const id of species) {
        const voice = QUARRY_VOICES[id];
        for (const call of [voice?.flush?.call, voice?.gather, voice?.covey?.call]) if (call) expect(calls).toContain(call);
      }
    }
    expect(groundCalls('chukar-ridge', ['chukar']).calls).toEqual(expect.arrayContaining(['chukar-flush', 'chukar-rally', 'canyon-wren']));
  });

  it('gives some of the quarry a voice going up, the same bird every time', () => {
    for (const [species, chance] of [['hun', .85], ['chukar', .7], ['sharptail', .75], ['prairie-chicken', .5]] as const) {
      const calling = Array.from({ length: 2000 }, (_, seed) => callsOnFlush(species, seed)).filter(Boolean).length / 2000;
      expect(Math.abs(calling - chance), species).toBeLessThan(.05);
      expect(callsOnFlush(species, 1234)).toBe(callsOnFlush(species, 1234));
    }
    expect(callsOnFlush('bobwhite', 1)).toBe(false);
    expect(callsOnFlush('ringneck', 1)).toBe(false);
  });
});

describe('the quarry, heard from real birds', () => {
  const single = (id: number, coveyId: number, distance: number, speciesId = 'bobwhite'): HeardBird => ({ id, coveyId, speciesId, x: distance, z: 0, distance });

  it('a scattered covey gathers: after a while, one single at a time, within earshot, for a few minutes', () => {
    const gathering = new CoveyGathering(mulberry32(3)), heard: { time: number; id: number }[] = [];
    const singles = [single(1, 7, 80), single(2, 7, 120), single(3, 7, 900), single(4, 8, 60, 'ringneck')];
    for (let time = 0; time < 400; time++) {
      const call = gathering.update(time, singles);
      if (call) { heard.push({ time, id: call.id }); expect(call.call).toBe('bobwhite-assembly'); }
    }
    expect(heard.length).toBeGreaterThan(5);
    expect(heard[0].time).toBeGreaterThanOrEqual(CoveyGathering.START_S[0]);
    expect(heard.at(-1)!.time).toBeLessThanOrEqual(CoveyGathering.FOR_S);
    // Never the bird out of earshot, nor the pheasant, which doesn't gather.
    expect(new Set(heard.map(call => call.id))).toEqual(new Set([1, 2]));
    for (let i = 1; i < heard.length; i++) expect(heard[i].time - heard[i - 1].time).toBeGreaterThanOrEqual(CoveyGathering.EVERY_S[0]);
    // Found singles stop calling; a covey that is all found is forgotten.
    const quiet = new CoveyGathering(mulberry32(3));
    for (let time = 0; time < 400; time++) expect(quiet.update(time, [])).toBeNull();
  });

  it('an unfound covey calls only at its hours, and only near enough to hear', () => {
    const coveys = [single(1, 1, 200), single(2, 2, 450, 'chukar'), single(3, 3, 2000, 'chukar'), single(4, 4, 50, 'sharptail')];
    const listen = (hour: 'dawn' | 'noon') => {
      const calls = new CoveyCalls(mulberry32(9)), heard: string[] = [];
      for (let time = 0; time < 3600; time++) { const call = calls.update(time, hour, coveys); if (call) heard.push(`${call.id}:${call.call}`); }
      return heard;
    };
    const dawn = listen('dawn'), noon = listen('noon');
    expect(dawn).toContain('1:bobwhite-covey');
    expect(dawn).toContain('2:chukar-rally');
    for (const heard of [...dawn, ...noon]) expect(heard.startsWith('3:') || heard.startsWith('4:')).toBe(false);
    // Bobwhite keep quiet at midday; chukar still talk, less.
    expect(noon.some(heard => heard.startsWith('1:'))).toBe(false);
    expect(noon.filter(heard => heard.startsWith('2:')).length).toBeLessThan(dawn.filter(heard => heard.startsWith('2:')).length);
    // Rare: a minute or so apart at the very most often.
    expect(dawn.length).toBeLessThan(3600 / CoveyCalls.EVERY_S[0]);
  });
});

describe('playing birds', () => {
  function fakeAudio() {
    const nodes: any[] = [];
    const param = (value = 0) => ({ value, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const node = (kind: string, extra: object = {}) => {
      const n: any = { kind, gain: param(1), frequency: param(), Q: param(), positionX: param(), positionY: param(), positionZ: param(),
        onended: null, connect: vi.fn((to: any) => to), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), ...extra };
      nodes.push(n); return n;
    };
    vi.stubGlobal('AudioContext', class {
      state = 'running'; currentTime = 2; destination = {};
      createGain() { return node('gain'); }
      createBiquadFilter() { return node('filter'); }
      createPanner() { return node('pan'); }
      createStereoPanner() { return node('stereo'); }
      createDynamicsCompressor() { return node('limiter', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
      createBufferSource() { return node('source'); }
      createBuffer(channels: number, length: number, rate: number) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (i: number) => data[i] };
      }
    });
    return nodes;
  }

  it('places a call: dulled by the air, quieter with distance, crossing the sky, and stopped whole', async () => {
    const nodes = fakeAudio(), audio = await import('../src/audio');
    const near = audio.playBirdCall('raven', { distance: 60, direction: { x: 3, y: 4, z: 0 }, space: 'canyon', gain: .7 })!;
    const filter = nodes.find(n => n.kind === 'filter'), pan = nodes.find(n => n.kind === 'pan');
    expect(filter.type).toBe('lowpass'); expect(filter.frequency.value).toBeCloseTo(airCutoff(60));
    expect(pan.panningModel).toBe('HRTF'); expect(pan.rolloffFactor).toBe(0);
    expect(pan.positionX.setValueAtTime).toHaveBeenCalledWith(.6, 2); expect(pan.positionY.setValueAtTime).toHaveBeenCalledWith(.8, 2);
    expect(pan.positionX.linearRampToValueAtTime).not.toHaveBeenCalled();
    const level = filter.connect.mock.results[0].value;
    expect(level.gain.value).toBeCloseTo(.7 * audio.birdFalloff(60));
    expect(audio.birdFalloff(300)).toBeLessThan(audio.birdFalloff(60) / 3);
    const source = nodes.find(n => n.kind === 'source');
    expect(source.buffer.sampleRate).toBe(BIRD_RATE);
    near.stop(); near.stop();
    expect(source.stop).toHaveBeenCalledOnce(); expect(pan.disconnect).toHaveBeenCalledOnce(); expect(near.active).toBe(false);
    // Overhead: the call moves across the sky over its length.
    audio.playBirdCall('redtail', { distance: 300, direction: { x: 0, y: 1, z: -1 }, to: { x: 1, y: 1, z: 0 }, space: 'open', gain: .6 });
    const overhead = nodes.filter(n => n.kind === 'pan').at(-1);
    expect(overhead.positionX.linearRampToValueAtTime).toHaveBeenCalledWith(expect.closeTo(Math.SQRT1_2), expect.any(Number));
    expect(overhead.positionX.linearRampToValueAtTime.mock.calls[0][1]).toBeGreaterThan(3);
    expect(audio.playBirdCall('raven', { distance: 60, direction: { x: 1, y: 0, z: 0 }, space: 'canyon', gain: 0 })).toBeUndefined();
  });

  it("plays a flock's birds at their own moments, through one route that it lets go once they are done", async () => {
    const nodes = fakeAudio(), audio = await import('../src/audio');
    const flock = audio.playBirdFlock('geese', { distance: 200, direction: { x: 0, y: 1, z: -1 }, to: { x: -1, y: 1, z: 0 }, space: 'marsh', gain: 1 }, 11)!;
    const calls = flockCalls('geese', 11, 4), sources = nodes.filter(n => n.kind === 'source');
    expect(sources).toHaveLength(calls.length);
    expect(sources.map(source => source.start.mock.calls[0][0] ?? 2)).toEqual(calls.map(call => call.at > 0 ? 2 + call.at : 2));
    expect(nodes.filter(n => n.kind === 'pan')).toHaveLength(1);
    const pan = nodes.find(n => n.kind === 'pan');
    for (const source of sources.slice(0, -1)) source.onended();
    expect(pan.disconnect).not.toHaveBeenCalled(); expect(flock.active).toBe(true);
    sources.at(-1).onended();
    expect(pan.disconnect).toHaveBeenCalledOnce(); expect(flock.active).toBe(false);
  });

  it("lets a calling bird's call ride with its wings, and only a bird that calls", async () => {
    const nodes = fakeAudio(), audio = await import('../src/audio');
    const caller = Array.from({ length: 50 }, (_, seed) => seed).find(seed => callsOnFlush('hun', seed))!;
    const quiet = Array.from({ length: 50 }, (_, seed) => seed).find(seed => !callsOnFlush('hun', seed))!;
    audio.playBirdFlush('hun', 12, { x: 1, y: 0, z: -1 }, { seed: caller });
    const sources = nodes.filter(n => n.kind === 'source');
    expect(sources).toHaveLength(3);
    const call = sources.find(source => source.buffer.sampleRate === BIRD_RATE && source.start.mock.calls[0][0] > 2);
    expect(call).toBeDefined();
    // Into the same moving route as the wings.
    const wings = sources.find(source => source !== call && source.buffer.duration > 1);
    expect(call.connect.mock.results[0].value.connect.mock.calls[0][0]).toBe(wings.connect.mock.calls[0][0]);
    const before = nodes.filter(n => n.kind === 'source').length;
    audio.playBirdFlush('hun', 12, { x: 1, y: 0, z: -1 }, { seed: quiet });
    expect(nodes.filter(n => n.kind === 'source').length - before).toBe(2);
  });
});
