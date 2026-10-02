import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { FieldAudioSystem } from '../src/three/subsystems/fieldAudio';
import { playBirdCall, playBirdFlock, playDogCollar, playDogMovement, playHullDrop, prepareBirdSounds, startFieldAmbience } from '../src/audio';
import { GROUND_BIRDS } from '../src/three/sound/fieldBirds';
import { getArea } from '../src/game/areas';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';
import { LandscapeModel } from '../src/game/landscape';
import { parseDropPointId, resolveThreeHuntArea } from '../src/game/gameplayMode';
vi.mock('../src/audio', () => ({ playDogCollar: vi.fn(), playDogMovement: vi.fn(), playWhistle: vi.fn(), startFieldAmbience: vi.fn(() => null),
  setFieldTension: vi.fn(), playHeartbeat: vi.fn(), playHullDrop: vi.fn(), playBirdCall: vi.fn(), playBirdFlock: vi.fn(), prepareBirdSounds: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
it('locates nearby moving paws, with no stationary, distant, paused, or teleport cues', () => {
  vi.stubGlobal('location', { search: '' });
  const dog = { x: 3, z: 0, gait: 'trot' };
  const hunt = { huntState: () => ({ birds: [] }), dogPointRevision: () => 0, trackingGearTier: () => 0, dogCount: () => 1, dog: () => dog,
    dogWorld: (out: {x:number;z:number}) => Object.assign(out, {x:dog.x,z:dog.z}),
    coverPatches: () => [{cx:0,cz:0,hx:30,hz:30}] };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 0, paused: false, get: (id: string) => id === 'terrain' ? { heightAt: () => 0 } : hunt } as unknown as Ctx;
  const audio = new FieldAudioSystem(); audio.init(ctx); audio.update(ctx);
  dog.x += 1; audio.update(ctx);
  expect(playDogMovement).toHaveBeenLastCalledWith(true, expect.any(Number), 1);
  const volume = vi.mocked(playDogMovement).mock.calls[0][1];
  for (let n = 0; n < 20; n++) audio.update(ctx);
  expect(playDogMovement).toHaveBeenCalledTimes(1);
  dog.gait = 'still'; dog.x += 1; audio.update(ctx);
  expect(playDogMovement).toHaveBeenCalledTimes(1);
  dog.gait = 'trot'; ctx.paused = true; dog.x += 1; audio.update(ctx);
  expect(playDogMovement).toHaveBeenCalledTimes(1);
  ctx.paused = false; dog.x = 25; audio.update(ctx); dog.x++; audio.update(ctx);
  expect(playDogMovement).toHaveBeenCalledTimes(1);
  dog.x = -7; audio.update(ctx); dog.x--; audio.update(ctx);
  expect(playDogMovement).toHaveBeenLastCalledWith(true, expect.any(Number), -1);
  expect(vi.mocked(playDogMovement).mock.calls[1][1]).toBeLessThan(volume);
  audio.dispose();
});

it('plays a landing hull where it fell: a clink on the rimrock, a tick in the grass, softer farther off', () => {
  vi.stubGlobal('location', { search: '' });
  const hunt = { huntState: () => ({ birds: [] }), dogPointRevision: () => 0, trackingGearTier: () => 0, dogCount: () => 0 };
  const land = (areaId: string, x: number, z: number, speed = 4.5, paused = false) => {
    const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 0, paused, get: (id: string) => id === 'terrain' ? { heightAt: () => 0 } : hunt } as unknown as Ctx;
    ctx.camera.position.set(0, 1.6, 0); ctx.camera.updateMatrixWorld();
    const audio = new FieldAudioSystem(areaId); audio.init(ctx);
    ctx.events.dispatchEvent(new CustomEvent('hull-landed', { detail: { x, y: 0, z, speed } }));
    audio.dispose();
  };
  // The camera looks down -Z: +X is the hunter's right.
  land('chukar-ridge', 1.2, -.4);
  expect(playHullDrop).toHaveBeenLastCalledWith('rock', expect.any(Number), expect.any(Number));
  const [, near, right] = vi.mocked(playHullDrop).mock.calls[0];
  expect(right).toBeGreaterThan(.5);
  land('quail-fields', -1.2, .6);
  expect(playHullDrop).toHaveBeenLastCalledWith('soft', expect.any(Number), expect.any(Number));
  expect(vi.mocked(playHullDrop).mock.calls[1][2]).toBeLessThan(-.5);
  land('chukar-ridge', 6, -4);
  expect(vi.mocked(playHullDrop).mock.calls[2][1]).toBeLessThan(near * .6);
  land('chukar-ridge', 1.2, -.4, 1.2);
  expect(vi.mocked(playHullDrop).mock.calls[3][1]).toBeLessThan(near * .4);
  land('chukar-ridge', 1.2, -.4, 4.5, true); land('chukar-ridge', 40, 0);
  expect(playHullDrop).toHaveBeenCalledTimes(4);
});

it('keeps one regional bed across pause, mute-style unlock retries and hidden/resumed frames, then releases it on replay', () => {
  vi.stubGlobal('location', { search: '' });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = new EventTarget(); vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
  const bed = { setPaused: vi.fn(), stop: vi.fn() };
  vi.mocked(startFieldAmbience).mockReturnValueOnce(null).mockReturnValue(bed);
  const hunt = { huntState: () => ({ birds: [] }), dogPointRevision: () => 0, trackingGearTier: () => 0, dogCount: () => 0 };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 0, paused: false, get: (id: string) => id === 'terrain' ? { heightAt: () => 0 } : hunt } as unknown as Ctx;
  const audio = new FieldAudioSystem('chukar-ridge'); audio.init(ctx);
  audio.update(ctx, 0); expect(startFieldAmbience).not.toHaveBeenCalled();
  audio.update(ctx, .016); audio.update(ctx, .016);
  for (let i = 0; i < 10; i++) audio.update(ctx, .016);
  expect(startFieldAmbience).toHaveBeenCalledTimes(2);
  expect(startFieldAmbience).toHaveBeenLastCalledWith('chukar-ridge');
  ctx.paused = true; ctx.events.dispatchEvent(new CustomEvent('pause', { detail: true }));
  expect(bed.setPaused).toHaveBeenLastCalledWith(true);
  audio.update(ctx, .016); expect(startFieldAmbience).toHaveBeenCalledTimes(2);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  ctx.paused = false; ctx.events.dispatchEvent(new CustomEvent('pause', { detail: false }));
  expect(bed.setPaused).toHaveBeenLastCalledWith(true);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  expect(bed.setPaused).toHaveBeenLastCalledWith(false);
  audio.update(ctx, .016); expect(startFieldAmbience).toHaveBeenCalledTimes(2);
  win.dispatchEvent(new Event('pagehide')); expect(bed.stop).toHaveBeenCalledOnce();
  audio.update(ctx, .016); expect(startFieldAmbience).toHaveBeenCalledTimes(3);
  audio.dispose(); audio.dispose(); audio.update(ctx, .016);
  expect(bed.stop).toHaveBeenCalledTimes(2);
  const pauseCount = bed.setPaused.mock.calls.length;
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  expect(bed.setPaused).toHaveBeenCalledTimes(pauseCount);
  expect(startFieldAmbience).toHaveBeenCalledTimes(3);
});

it("gives each ground its own birds for the hour, never the quarry, and suppresses zero-delta dog footfalls", () => {
  vi.stubGlobal('location', { search: '' });
  const dog = { x: 3, z: 0, gait: 'trot' };
  const hunt = { huntState: () => ({ birds: [] }), dogPointRevision: () => 0, trackingGearTier: () => 0, dogCount: () => 1, dog: () => dog,
    dogWorld: (out: {x:number;z:number}) => Object.assign(out, {x:dog.x,z:dog.z}), coverPatches: () => [] };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 120, timeOfDay: 'dawn', paused: false,
    get: (id: string) => id === 'terrain' ? { heightAt: () => 0 } : hunt } as unknown as Ctx;
  for (const area of ['chukar-ridge', 'sharptail-prairie']) {
    const audio = new FieldAudioSystem(area); audio.init(ctx); audio.update(ctx, .016);
    dog.x += 1; audio.update(ctx, 0); audio.dispose();
  }
  expect(playDogMovement).not.toHaveBeenCalled();
  const heard = (hour: Ctx['timeOfDay'], area: string) => {
    vi.mocked(playBirdCall).mockClear(); vi.mocked(playBirdFlock).mockClear();
    ctx.time = 0; ctx.timeOfDay = hour;
    const audio = new FieldAudioSystem(area); audio.init(ctx);
    for (let t = 0; t < 900; t++) { ctx.time = t; audio.update(ctx, .016); }
    audio.dispose();
    return [...vi.mocked(playBirdCall).mock.calls, ...vi.mocked(playBirdFlock).mock.calls];
  };
  for (const area of ['pheasant-coverts', 'sharptail-prairie', 'quail-fields', 'chukar-ridge']) {
    const ground = GROUND_BIRDS[area], own = ground.birds.map(bird => 'flock' in bird ? bird.flock : bird.call);
    const dawn = heard('dawn', area);
    expect(prepareBirdSounds).toHaveBeenLastCalledWith(area, getArea(area).speciesMix.map(share => share.speciesId));
    expect(dawn.length, area).toBeGreaterThan(25);
    for (const [call, placement] of dawn) {
      expect(own).toContain(call);
      expect(placement.space).toBe(ground.space);
      expect(placement.distance).toBeGreaterThanOrEqual(20);
    }
    // First light is busy; midday is not.
    expect(heard('noon', area).length, area).toBeLessThan(dawn.length * .6);
  }
});

it('hears the quarry only from real birds: a scattered covey gathering, an unfound covey at first light', () => {
  vi.stubGlobal('location', { search: '' });
  const birds = [
    { id: 1, coveyId: 7, speciesId: 'bobwhite', state: 'hidden', single: true, pos: { x: 100, y: -20 } },
    { id: 2, coveyId: 7, speciesId: 'bobwhite', state: 'hidden', single: true, pos: { x: 130, y: -40 } },
    { id: 3, coveyId: 9, speciesId: 'bobwhite', state: 'hidden', pos: { x: -220, y: -10 } },
    { id: 4, coveyId: 9, speciesId: 'bobwhite', state: 'hidden', pos: { x: -230, y: -12 } },
    { id: 5, coveyId: 12, speciesId: 'bobwhite', state: 'retrieved', single: true, pos: { x: 10, y: 0 } },
  ];
  const hunt = { huntState: () => ({ birds }), dogPointRevision: () => 0, trackingGearTier: () => 0, dogCount: () => 0,
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x: x * .5, z: y * .5 }) };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 0, timeOfDay: 'dawn', paused: false,
    get: (id: string) => id === 'terrain' ? { heightAt: () => 0 } : hunt } as unknown as Ctx;
  const field = new FieldAudioSystem('quail-fields'); field.init(ctx);
  const when: number[] = [];
  vi.mocked(playBirdCall).mockImplementation(() => { when.push(ctx.time); return undefined; });
  for (let t = 0; t < 400; t++) { ctx.time = t; field.update(ctx, .016); }
  const calls = vi.mocked(playBirdCall).mock.calls;
  const gathering = calls.filter(([call]) => call === 'bobwhite-assembly'), covey = calls.filter(([call]) => call === 'bobwhite-covey');
  // Singles call from where they went down, off to the right; the unfound covey from the left.
  expect(gathering.length).toBeGreaterThan(3);
  for (const [, placement] of gathering) {
    expect(placement.direction.x).toBeGreaterThan(40);
    expect(placement.distance).toBeGreaterThan(40); expect(placement.distance).toBeLessThan(80);
  }
  // Not at once: a little while after the flush, and not past a few minutes.
  const times = gathering.map(call => when[calls.indexOf(call)]);
  expect(Math.min(...times)).toBeGreaterThanOrEqual(30); expect(Math.max(...times)).toBeLessThanOrEqual(240);
  expect(covey.length).toBeGreaterThan(0);
  for (const [, placement] of covey) expect(placement.direction.x).toBeLessThan(-100);
  // Gathering is done a few minutes on; at noon a covey keeps quiet.
  vi.mocked(playBirdCall).mockClear();
  ctx.timeOfDay = 'noon';
  for (let t = 400; t < 900; t++) { ctx.time = t; field.update(ctx, .016); }
  expect(vi.mocked(playBirdCall).mock.calls.filter(([call]) => call.startsWith('bobwhite'))).toEqual([]);
  // Paused, nothing calls, and what was calling stops.
  const stop = vi.fn();
  vi.mocked(playBirdCall).mockReturnValue({ active: true, stop });
  for (let t = 900; t < 1000; t++) { ctx.time = t; field.update(ctx, .016); }
  ctx.paused = true; ctx.events.dispatchEvent(new CustomEvent('pause', { detail: true }));
  expect(stop).toHaveBeenCalled();
  const before = vi.mocked(playBirdCall).mock.calls.length;
  for (let t = 1000; t < 1200; t++) { ctx.time = t; field.update(ctx, .016); }
  expect(vi.mocked(playBirdCall).mock.calls).toHaveLength(before);
  field.dispose();
});

it('sounds separate long-cast dogs from their actual positions and turns the sound with the camera', () => {
  vi.stubGlobal('location', { search: '' });
  const dogs = [{ x: -30, z: -10, gait: 'still', state: 'pointing' }, { x: 50, z: -20, gait: 'still', state: 'pointing' }];
  const hunt = { huntState: () => ({ birds: [] }), dogPointRevision: () => 0, trackingGearTier: () => 1, dogCount: () => 2, dog: (slot: number) => dogs[slot],
    dogWorld: (out: object, slot: number) => Object.assign(out, dogs[slot]), coverPatches: () => [] };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 0, paused: false,
    get: (id: string) => id === 'terrain' ? { heightAt: () => 4 } : hunt } as unknown as Ctx;
  ctx.camera.position.y = 5;
  const sounds: { active: boolean; updateSpatial: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; initial: THREE.Vector3; updates: THREE.Vector3[] }[] = [];
  vi.mocked(playDogCollar).mockImplementation((_kind, _gain, direction) => {
    const updates: THREE.Vector3[] = [];
    const sound = { active: true, updateSpatial: vi.fn((_gain, offset) => updates.push(new THREE.Vector3().copy(offset))), stop: vi.fn(), initial: new THREE.Vector3().copy(direction), updates };
    sounds.push(sound); return sound;
  });
  const field = new FieldAudioSystem('chukar-ridge'); field.init(ctx); field.update(ctx);
  expect(playDogCollar).toHaveBeenCalledTimes(2);
  expect(sounds[0].initial.x).toBe(-30); expect(sounds[1].initial.x).toBe(50);
  expect(sounds[0].initial.y).toBeCloseTo(-.35);
  expect(vi.mocked(playDogCollar).mock.calls.every(call => call[0] === 'beeper')).toBe(true);
  ctx.camera.rotation.y = Math.PI; field.update(ctx);
  expect(sounds[0].updates[0].x).toBeCloseTo(30);
  expect(playDogCollar).toHaveBeenCalledTimes(2);
  ctx.paused = true; ctx.events.dispatchEvent(new CustomEvent('pause', { detail: true }));
  expect(sounds.every(sound => sound.stop.mock.calls.length === 1)).toBe(true);
  field.update(ctx, 50); expect(playDogCollar).toHaveBeenCalledTimes(2);
  ctx.paused = false; ctx.events.dispatchEvent(new CustomEvent('pause', { detail: false }));
  for (let i = 0; i < 60; i++) field.update(ctx);
  expect(playDogCollar).toHaveBeenCalledTimes(2);
  field.dispose();
});

it('keeps the bell across repeated 30Hz positions, goes silent on a basic-collar point and never catches up after hiding', () => {
  vi.stubGlobal('location', { search: '' });
  const doc = Object.assign(new EventTarget(), { hidden: false }); vi.stubGlobal('document', doc);
  const dog = { x: 30, z: 0, gait: 'run', state: 'quartering' };
  const hunt = { huntState: () => ({ birds: [] }), dogPointRevision: () => 0, trackingGearTier: () => 0, dogCount: () => 1, dog: () => dog,
    dogWorld: (out: object) => Object.assign(out, dog), coverPatches: () => [] };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 0, paused: false,
    get: (id: string) => id === 'terrain' ? { heightAt: () => 0 } : hunt } as unknown as Ctx;
  const stop = vi.fn();
  vi.mocked(playDogCollar).mockReturnValue({ active: true, updateSpatial: vi.fn(), stop });
  const field = new FieldAudioSystem(); field.init(ctx);
  for (let i = 0; i < 50; i++) { if (i % 2 === 0) dog.x += .1; field.update(ctx); }
  expect(playDogCollar).toHaveBeenCalledTimes(1);
  expect(vi.mocked(playDogCollar).mock.calls[0][0]).toBe('bell');
  dog.state = 'pointing'; dog.gait = 'still'; field.update(ctx);
  expect(stop).toHaveBeenCalledOnce();
  for (let i = 0; i < 120; i++) field.update(ctx);
  expect(playDogCollar).toHaveBeenCalledTimes(1);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); field.update(ctx, 120);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); field.update(ctx);
  expect(playDogCollar).toHaveBeenCalledTimes(1);
  field.dispose();
});

it.each([false, true])('hears a real simulation point and flush between renders (same tick: %s)', sameTick => {
  vi.stubGlobal('location', { search: '?area=quail-fields&drop=south-gate&breed=gsp&seed=1184004868' });
  const landscape = new LandscapeModel(resolveThreeHuntArea(location.search), parseDropPointId(location.search));
  const hunt = new Hunt3DSystem(landscape);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 2, 40);
  const player = { isRunning: () => false, consumeRecall: () => false,
    setHuntHeading: (_ctx: Ctx, heading: number) => { camera.rotation.y = -heading - Math.PI / 2; } };
  const ctx = { camera, events: new EventTarget(), time: 0, paused: false,
    get: (id: string) => ({ hunt3d: hunt, player, terrain: { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) },
      birds: { isRiseActive: () => false } }[id] ?? {}) } as unknown as Ctx;
  hunt.init(ctx); hunt.fixedUpdate(ctx, 1000 / 30);
  const field = new FieldAudioSystem('quail-fields'); field.init(ctx); field.update(ctx);
  const trail = hunt.areaConfig().trails[0].points; let leg = 1;
  if (sameTick) for (const bird of hunt.huntState().birds) bird.nerveMs = 1;
  // Test fixture follows the same public-trail/visible-scent contract as the
  // adapter tests. No FieldAudio render observes the intermediate point.
  for (let tick = 0; tick < 1800 && hunt.dogPointRevision() === 0; tick++) {
    const dog = hunt.dog();
    const target = dog.scentStage !== 'none' ? hunt.dogWorld({ x: 0, z: 0 })
      : hunt.simToWorld(trail[leg].x, trail[leg].y, { x: 0, z: 0 });
    const dx = target.x - camera.position.x, dz = target.z - camera.position.z, distance = Math.hypot(dx, dz);
    if (dog.scentStage === 'none' && distance < 1 && leg < trail.length - 1) leg++;
    camera.rotation.y = Math.atan2(-dx, -dz);
    camera.position.x += dx / distance * 2.2 / 30; camera.position.z += dz / distance * 2.2 / 30;
    field.update(ctx);
    hunt.fixedUpdate(ctx, 1000 / 30);
  }
  expect(hunt.dogPointRevision()).toBe(1);
  // Expire fixture nerve to exercise the genuine event path. This is a
  // render-cadence regression, not evidence of natural hunt timing.
  if (!sameTick) {
    expect(hunt.dog().state).toBe('pointing');
    hunt.huntState().birds.find(bird => bird.id === hunt.dog().pointedBirdId)!.nerveMs = 1;
    hunt.fixedUpdate(ctx, 1000 / 30);
  }
  vi.mocked(playDogCollar).mockClear();
  expect(hunt.lastFlushInfo()).not.toBeNull(); expect(hunt.dog().state).not.toBe('pointing');
  const stop = vi.fn();
  vi.mocked(playDogCollar).mockReturnValue({ active: true, updateSpatial: vi.fn(), stop });
  field.update(ctx);
  expect(playDogCollar).toHaveBeenCalledTimes(1);
  expect(vi.mocked(playDogCollar).mock.calls[0][0]).toBe('beeper');
  for (let tick = 0; tick < 5; tick++) { hunt.fixedUpdate(ctx, 1000 / 30); field.update(ctx); }
  expect(playDogCollar).toHaveBeenCalledTimes(1); expect(stop).not.toHaveBeenCalled();
  ctx.events.dispatchEvent(new CustomEvent('pause', { detail: true })); expect(stop).toHaveBeenCalledOnce();
  field.dispose();
  hunt.init(ctx); expect(hunt.dogPointRevision()).toBe(0);
});
