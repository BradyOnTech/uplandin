import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { GunSystem } from '../src/three/subsystems/gun';
import type { Ctx } from '../src/three/engine';
import { playActionClick } from '../src/audio';
import { shotgunCycleCues, shotgunReloadCues, type ShotgunMechanism } from '../src/three/shotgunActionTiming';

vi.mock('../src/audio', () => ({ playActionClick: vi.fn(), playShot: vi.fn(), unlockAudio: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function field(gunId: string) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const hunt = { huntState: () => ({ gunId, birds: [] }), dogCount: () => 1 };
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
    events: new EventTarget(), quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds: { shotTargets: () => [] }, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  const gun = new GunSystem(); gun.init(ctx);
  const step = (dt: number) => { ctx.time += dt; gun.update(ctx, dt); };
  const action = (detail: string) => ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail }));
  return { ctx, gun, step, action };
}

it.each(['over-under', 'side-by-side', 'remington-870', 'semi-auto'])('%s seats only missing shells, and its actual completion frame is audible', id => {
  for (const fps of [20, 30, 60]) {
    const { ctx, gun, step, action } = field(id);
    action('touch-mount'); step(.2); action('touch-fire'); step(.6);
    expect(gun.shellsRemaining()).toBe(gun.shellCapacity() - 1);
    vi.mocked(playActionClick).mockClear(); action('reload');
    expect(playActionClick).not.toHaveBeenCalled();
    const events: { cue: string; time: number }[] = [];
    let elapsed = 0;
    vi.mocked(playActionClick).mockImplementation(cue => { events.push({ cue: cue!, time: elapsed }); });
    while (gun.isReloading()) { elapsed += 1 / fps; step(1 / fps); }
    expect(events.filter(e => e.cue === 'shell')).toHaveLength(1);
    if (id === 'over-under' || id === 'side-by-side') {
      expect(events.map(e => e.cue)).toEqual(['latch', 'eject', 'shell', 'lock']);
      expect(events.at(-1)!.time).toBeLessThanOrEqual(elapsed);
      expect(events.at(-1)!.time).toBeGreaterThan(.89);
    } else expect(events.map(e => e.cue)).toEqual(['shell']);
    expect(gun.shellsRemaining()).toBe(gun.shellCapacity());
    step(1); expect(events.filter(e => e.cue === 'shell')).toHaveLength(1);
    gun.dispose(ctx);
  }
});

it('never schedules future mechanics through pause or gun replacement', () => {
  const { ctx, gun, step, action } = field('remington-870');
  action('touch-mount'); step(.2); action('touch-fire');
  step(.1); expect(playActionClick).toHaveBeenLastCalledWith('rack');
  const before = vi.mocked(playActionClick).mock.calls.length;
  ctx.paused = true; ctx.events.dispatchEvent(new Event('pause'));
  for (let i = 0; i < 30; i++) gun.update(ctx, 0);
  expect(playActionClick).toHaveBeenCalledTimes(before);
  expect(gun.equipGun(ctx, 'over-under')).toBe(true);
  ctx.paused = false; step(.5);
  expect(playActionClick).toHaveBeenCalledTimes(before);
  gun.dispose(ctx);
});

it.each(['remington-870', 'semi-auto'])('%s can reload immediately after firing without losing or repeating its cycle', id => {
  const { ctx, gun, step, action } = field(id);
  action('touch-mount'); step(.2); action('touch-fire'); action('reload');
  vi.mocked(playActionClick).mockClear();
  for (let frame = 0; frame < 90; frame++) step(1 / 60);
  expect(vi.mocked(playActionClick).mock.calls.map(call => call[0])).toEqual(id === 'remington-870'
    ? ['rack', 'eject', 'lock', 'shell'] : ['eject', 'lock', 'shell']);
  expect(gun.isReloading()).toBe(false);
  expect(gun.shellsRemaining()).toBe(gun.shellCapacity());
  gun.dispose(ctx);
});

it('keeps distinct cycling and reload sequences through uneven animation intervals', () => {
  for (const action of ['pump', 'semi-auto', 'over-under', 'side-by-side'] as ShotgunMechanism[]) {
    const sample = (steps: number[], missing: number) => {
      let t = 0; const cycle: string[] = [], reload: string[] = [];
      for (const dt of steps) {
        shotgunCycleCues(action, t, t + dt, cue => cycle.push(cue));
        shotgunReloadCues(action, t, t + dt, .55 + missing * .38, missing, cue => reload.push(cue));
        t += dt;
      }
      return { cycle, reload };
    };
    const max = action === 'pump' || action === 'semi-auto' ? 3 : 2;
    for (let missing = 1; missing <= max; missing++) {
      const regular = sample(Array(120).fill(1 / 60), missing);
      expect(sample([.03, .12, 0, .19, .08, .28, .31, .49, .5], missing)).toEqual(regular);
      expect(regular.reload.filter(cue => cue === 'shell')).toHaveLength(missing);
      expect(regular.cycle).toEqual(action === 'pump' ? ['rack', 'eject', 'lock']
        : action === 'semi-auto' ? ['eject', 'lock'] : []);
    }
  }
});
