import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PlayerSystem } from '../src/three/subsystems/player';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ unlockAudio: vi.fn(), playFootstep: vi.fn(), playCoverBrush: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('camera direction available to a shot before the next animation frame', () => {
  it.each(['pointer-lock', 'drag-fallback'])('uses the latest %s mouse turn immediately', mode => {
    const canvas = new EventTarget();
    const documentStub = Object.assign(new EventTarget(), {
      pointerLockElement: mode === 'pointer-lock' ? canvas : null,
      getElementById: (id: string) => id === 'mouse-look-fallback' ? { hidden: true } : null,
    });
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', documentStub);
    vi.stubGlobal('location', { search: '' });
    const ctx = { paused: false, camera: new THREE.PerspectiveCamera(70), renderer: { domElement: canvas },
      events: new EventTarget(), get: () => ({ heightAt: () => 4 }) } as unknown as Ctx;
    const player = new PlayerSystem(); player.init(ctx); player.setPose(ctx, 0, 40, 0, 0);
    try {
      if (mode === 'drag-fallback') {
        document.dispatchEvent(new Event('pointerlockerror'));
        canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 2, clientX: 100, clientY: 100 }));
      }
      window.dispatchEvent(Object.assign(new Event('mousemove'), {
        movementX: 30, movementY: -12, clientX: 130, clientY: 88, buttons: 2,
      }));
      // A fire callback reads this direction synchronously; no player.update,
      // render, RAF or simulation tick may be required to finish the swing.
      const actual = ctx.camera.getWorldDirection(new THREE.Vector3());
      const expected = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(12 * .0022, -30 * .0022, 0, 'YXZ'));
      expect(actual.distanceTo(expected)).toBeLessThan(1e-10);
      expect(ctx.camera.position.toArray()).toEqual([0, 5.62, 40]);
      ctx.paused = true;
      window.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 80, movementY: 40, clientX: 210, clientY: 128, buttons: 2 }));
      expect(ctx.camera.getWorldDirection(new THREE.Vector3()).distanceTo(actual)).toBeLessThan(1e-10);
    } finally { player.dispose(); }
  });
});
