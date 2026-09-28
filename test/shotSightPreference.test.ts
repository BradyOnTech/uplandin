import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('Shot view when optional storage is unavailable', () => {
  it.each(['blocked-read', 'stale-read'])('applies explicit selections to the actual gun through %s and input switches', async failure => {
    // A fresh document has its own visit choice, just as these fresh modules do.
    vi.resetModules();
    const { shotSightPicture, saveShotSightPicture } = await import('../src/three/inputMode');
    const { GunSystem } = await import('../src/three/subsystems/gun');
    let touch = false;
    const writes = vi.fn(() => { throw new Error('Storage unavailable'); });
    vi.stubGlobal('localStorage', {
      getItem: () => { if (failure === 'blocked-read') throw new Error('Storage unavailable'); return 'wide'; },
      setItem: writes,
    });
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { body: { classList: { contains: () => touch, toggle: () => {} } },
      getElementById: () => null, querySelector: () => null });
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 1000);
    const ctx = { scene: new THREE.Scene(), camera, renderer: { domElement: new EventTarget() },
      events: new EventTarget(), quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
      get: (id: string) => ({ hunt3d: { huntState: () => ({ gunId: 'over-under', birds: [] }) },
        birds: { shotTargets: () => [] }, terrain: { heightAt: () => 0 } }[id]),
    } as unknown as Ctx;
    const gun = new GunSystem(); gun.init(ctx);
    const action = (detail: string) => ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail }));
    const step = () => { ctx.time += .2; gun.update(ctx, .2); };
    try {
      expect(camera.fov).toBe(70);
      action('mount'); step(); expect(camera.fov).toBe(failure === 'stale-read' ? 70 : 58);
      // The shared setter and event are the actual field-select change path.
      saveShotSightPicture('closer'); ctx.events.dispatchEvent(new Event('touch-sight-change')); step();
      expect(camera.fov).toBe(58);
      expect(shotSightPicture(false)).toBe('closer');
      expect(writes).toHaveBeenCalledWith('uplandin.3d.sight', 'closer');
      touch = true; ctx.events.dispatchEvent(new Event('input-reset'));
      action('touch-mount'); step();
      expect(camera.fov).toBe(58); expect(shotSightPicture(true)).toBe('closer');
      saveShotSightPicture('wide'); ctx.events.dispatchEvent(new Event('touch-sight-change')); step();
      expect(camera.fov).toBe(70);
      touch = false; ctx.events.dispatchEvent(new Event('input-reset')); action('mount'); step();
      expect(camera.fov).toBe(70); expect(shotSightPicture(false)).toBe('wide');
      expect(gun.shellsRemaining()).toBe(2);
    } finally { gun.dispose(ctx); }
  });
});
