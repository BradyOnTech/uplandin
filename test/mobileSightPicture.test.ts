import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { mobileShotFov, shotSightPicture } from '../src/three/inputMode';
import { PlayerSystem } from '../src/three/subsystems/player';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ unlockAudio:vi.fn(), playFootstep:vi.fn(), playCoverBrush:vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const projectedSpan = (width: number, height: number, fov: number, distance: number) => {
  const camera = new PerspectiveCamera(fov, width / height, .1, 1000);
  // A one-metre flight silhouette, without changing its physical dimensions.
  return Math.abs(new Vector3(.5, 0, -distance).project(camera).x
    - new Vector3(-.5, 0, -distance).project(camera).x) * width / 2;
};

describe('Closer sight picture', () => {
  it.each([null, 'invalid', 'closer', 'wide'])('preserves saved sight %s with a readable default on either input', saved => {
    vi.stubGlobal('localStorage', { getItem: () => saved });
    expect(shotSightPicture(false)).toBe(saved === 'wide' ? 'wide' : 'closer');
    expect(shotSightPicture(true)).toBe(saved === 'wide' ? 'wide' : 'closer');
  });

  it('defaults to Closer on either input when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage unavailable'); } });
    expect(shotSightPicture(false)).toBe('closer');
    expect(shotSightPicture(true)).toBe('closer');
  });
  it.each([[844,390], [915,412]])('gives a short %s by %s landscape screen a readable but bounded field', (width,height) => {
    const aspect = width / height, fov = mobileShotFov(1, true, aspect);
    const horizontal = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * aspect) * 180 / Math.PI;
    expect(horizontal).toBeCloseTo(90);
    for (const distance of [12,30,50]) {
      const enlargement = projectedSpan(width,height,fov,distance) / projectedSpan(width,height,58,distance);
      expect(enlargement).toBeGreaterThan(1.19);
      expect(enlargement).toBeLessThan(1.25);
    }
  });

  it('retains the portrait and tablet view, limits ultrawide magnification, and respects Wide', () => {
    for (const aspect of [390/844, 3/4, 4/3, 16/9]) expect(mobileShotFov(1,true,aspect)).toBe(58);
    expect(mobileShotFov(1,true,3)).toBe(46);
    for (const aspect of [390/844, 844/390, 3]) {
      expect(mobileShotFov(1,false,aspect)).toBe(70);
      expect(mobileShotFov(0,true,aspect)).toBe(70);
    }
  });

  it('keeps actual touch swing travel consistent after the optical change', () => {
    const responses: number[] = [];
    for (const fov of [70, 58, mobileShotFov(1,true,844/390)]) {
      vi.stubGlobal('window', new EventTarget());
      vi.stubGlobal('document', Object.assign(new EventTarget(), { getElementById:()=>null }));
      vi.stubGlobal('location', { search:'' });
      vi.stubGlobal('localStorage', { getItem:()=>null });
      const camera = new PerspectiveCamera(fov,844/390,.1,1000);
      const ctx = { camera, renderer:{domElement:new EventTarget()}, events:new EventTarget(), paused:false,
        get:()=>({heightAt:()=>0}) } as unknown as Ctx;
      const player = new PlayerSystem(); player.init(ctx);
      try {
        camera.updateMatrixWorld(true);
        const target = new Vector3(0,0,-30).applyMatrix4(camera.matrixWorld);
        ctx.events.dispatchEvent(Object.assign(new Event('hunt-touch-look'),{detail:{dx:10,dy:0}}));
        camera.updateMatrixWorld(true);
        responses.push(Math.abs(target.project(camera).x));
      } finally { player.dispose(); }
    }
    expect(responses[0]).toBeGreaterThan(.02);
    expect(responses[1]).toBeCloseTo(responses[0],3);
    expect(responses[2]).toBeCloseTo(responses[0],3);
  });
});
