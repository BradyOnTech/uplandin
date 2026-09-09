import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { GunSystem } from '../src/three/subsystems/gun';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn() }));

describe('3D shotgun action', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['pheasant-coverts', 'quail-fields', 'chukar-ridge'])('shows the equipped sporting action on %s with its bead on the shot ray', areaId => {
    for (const gunId of ['semi-auto', 'remington-870']) {
      vi.stubGlobal('window', new EventTarget());
      vi.stubGlobal('location', { search: '?capture' });
      vi.stubGlobal('document', { getElementById: () => null });
      const hunt = { huntState: () => ({ areaId, gunId, birds: [] }),
        dog: () => ({ state: 'quartering', pointedBirdId: null }), dogCount: () => 1 };
      const camera = new THREE.PerspectiveCamera(70, 1.6, .1, 1000);
      camera.position.set(14, 8, -20); camera.rotation.set(.2, -.4, 0, 'YXZ'); camera.updateMatrixWorld();
      const ctx = { scene: new THREE.Scene(), camera, renderer: { domElement: new EventTarget() },
        events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 0, paused: false,
        get: (id: string) => ({ hunt3d: hunt, birds: { riseSequence: () => 0 }, terrain: { heightAt: () => 0 } }[id]),
      } as unknown as Ctx;
      const gun = new GunSystem(); gun.init(ctx);
      const audit = (window as unknown as { __gunAudit: { setState(mode: string): void; viewmodel(): { model: string; beadNdc: { x: number; y: number } } } }).__gunAudit;
      audit.setState('mount'); gun.update(ctx, 0);
      const view = audit.viewmodel();
      expect(view.model).toBe(gunId === 'semi-auto' ? 'Sporting semiautomatic' : 'Sporting pump');
      expect(gun.shellsRemaining()).toBe(3);
      expect(Math.abs(view.beadNdc.x)).toBeLessThan(.002);
      expect(Math.abs(view.beadNdc.y)).toBeLessThan(.002);
      gun.dispose(ctx);
    }
  });

  it.each(['tree', 'pheasant-tree', 'terrain', 'open'])('consumes a shell and resolves only a clear shot (%s)', obstruction => {
    const blocked = obstruction !== 'open';
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null });
    const target = { simId: 5, x: 0, y: 0, z: -12, status: 'flying' };
    const hunt = { dog: () => ({ state: 'quartering', pointedBirdId: null }), dogCount: () => 1, huntState: () => ({ gunId: 'over-under', birds: [] }), resolveBird: vi.fn(() => true) };
    const habitat = { blocksShot: vi.fn(() => obstruction === 'tree') };
    const birds = { riseSequence: () => 1, isRiseActive: () => true, downBird: vi.fn(), shotTargets: () => [target] };
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
      events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 10, paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds, 'property-habitat': habitat,
        flora: { blocksShot: () => obstruction === 'pheasant-tree' },
        terrain: { heightAt: (_x: number, z: number) => obstruction === 'terrain' ? Math.max(0, 2 - Math.abs(z + 6)) : 0 } }[id]),
    } as unknown as Ctx;
    vi.stubGlobal('document', { getElementById: () => null, pointerLockElement: ctx.renderer.domElement });
    const gun = new GunSystem(); gun.init(ctx);
    (gun as unknown as { mountT: number }).mountT = 1;
    const click = Object.assign(new Event('mousedown'), { button: 0 });
    window.dispatchEvent(click);
    expect(gun.shellsRemaining()).toBe(1);
    expect(hunt.resolveBird).not.toHaveBeenCalled();
    ctx.time += .05; gun.fixedUpdate(ctx, 50); gun.update(ctx, .05);
    expect(habitat.blocksShot).toHaveBeenCalledTimes(obstruction === 'terrain' ? 0 : 1);
    expect(hunt.resolveBird).toHaveBeenCalledTimes(blocked ? 0 : 1);
    expect(birds.downBird).toHaveBeenCalledTimes(blocked ? 0 : 1);
    gun.dispose(ctx);
  });

  it('keeps crossing outcomes consistent with 30 Hz birds across render rates and trigger phases', () => {
    for (const fps of [30, 60, 120]) for (const phase of [0, .008, .025]) for (const lead of [0, 1.8]) {
      vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
      const target = { simId: 5, x: 0, y: 0, z: -30, status: 'flying' };
      const hunt = { dog: () => ({ state: 'quartering' }), dogCount: () => 1,
        huntState: () => ({ gunId: 'over-under', birds: [] }), resolveBird: vi.fn(() => true) };
      const birds = { riseSequence: () => 1, isRiseActive: () => true, shotTargets: () => [target],
        downBird: () => { target.status = 'falling'; } };
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
        events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 10, paused: false,
        get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => -10 } }[id]),
      } as unknown as Ctx;
      vi.stubGlobal('document', { getElementById: () => null, pointerLockElement: ctx.renderer.domElement });
      const gun = new GunSystem(); gun.init(ctx);
      (gun as unknown as { mountT: number }).mountT = 1;
      ctx.camera.lookAt(lead, 0, -30); ctx.camera.updateMatrixWorld();
      // Fire at different offsets since the last fixed bird tick.
      let accumulator = phase;
      window.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
      ctx.paused = true; gun.fixedUpdate(ctx, 1000);
      expect(hunt.resolveBird).not.toHaveBeenCalled(); ctx.paused = false;
      for (let frame = 0; frame < fps / 3; frame++) {
        ctx.time += 1/fps; accumulator += 1/fps;
        while (accumulator >= 1/30) {
          target.x += 18/30;
          gun.fixedUpdate(ctx, 1000/30);
          accumulator -= 1/30;
        }
        gun.update(ctx, 1/fps);
      }
      expect(hunt.resolveBird.mock.calls.length, `fps=${fps}, phase=${phase}, lead=${lead}`).toBe(lead ? 1 : 0);
      gun.dispose(ctx);
    }
  });

  it.each(['fire', 'lower', 'pause', 'reload', 'no-rise', 'changed-rise', 'expired', 'cooldown'])(
    'handles rapid F + Space during mount safely: %s', scenario => {
      vi.stubGlobal('window', new EventTarget());vi.stubGlobal('location', { search: '' });
      vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
      let active = scenario !== 'no-rise', sequence = 1;
      const birds = { riseSequence: () => sequence, isRiseActive: () => active, shotTargets: () => [] };
      const hunt = { huntState: () => ({ gunId: 'semi-auto', birds: [] }), dog: () => ({ state: 'quartering' }), dogCount: () => 1 };
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
        events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 1, paused: false,
        get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]),
      } as unknown as Ctx;
      const gun = new GunSystem();gun.init(ctx);
      const key = (code: string) => window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }),
        { code, key: code === 'Space' ? ' ' : code === 'KeyR' ? 'r' : 'f', repeat: false }));
      const step = (dt: number) => { ctx.time += dt;gun.update(ctx,dt); };
      // A lowered trigger must never mount or queue a later shot.
      key('Space');step(.05);expect(gun.shellsRemaining()).toBe(3);expect(gun.mountProgress()).toBe(0);
      if (scenario === 'cooldown') (gun as unknown as { lastShotMs: number }).lastShotMs=ctx.time*1000;
      key('KeyF');key('Space');expect(gun.shellsRemaining()).toBe(3);
      if (scenario === 'lower') { key('KeyF');key('KeyF'); }
      if (scenario === 'pause') { ctx.paused=true;ctx.events.dispatchEvent(new Event('pause'));ctx.paused=false;key('KeyF'); }
      if (scenario === 'reload') key('KeyR'); // Even a full-gun reload request cancels a queued trigger.
      if (scenario === 'changed-rise') sequence++;
      if (scenario === 'no-rise') active=true;
      if (scenario === 'expired') step(.26);
      else for(let i=0;i<12;i++)step(1/60);
      expect(gun.shellsRemaining()).toBe(scenario==='fire'?2:3);
      for(let i=0;i<60;i++)step(1/60);
      expect(gun.shellsRemaining()).toBe(scenario==='fire'?2:3);
      // A new deliberate trigger after cooldown still works normally.
      key('Space');expect(gun.shellsRemaining()).toBe(scenario==='fire'?1:2);
      gun.dispose(ctx);
    });

  it('supports latched keyboard aim and a single shot per Space press without mouse buttons', () => {
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
    const birds = { riseSequence: () => 0, isRiseActive: () => true, shotTargets: () => [] };
    const hunt = { huntState: () => ({ gunId: 'semi-auto', birds: [] }), dog: () => ({ state: 'quartering' }), dogCount: () => 1 };
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
      events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 0, paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]),
    } as unknown as Ctx;
    const gun = new GunSystem(); gun.init(ctx);
    const key = (code: string, repeat = false) => window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code, key: code === 'Space' ? ' ' : code === 'KeyR' ? 'r' : 'f', repeat }));
    key('KeyF'); key('KeyF', true);
    for (let i = 0; i < 40; i++) gun.update(ctx, 1 / 60);
    expect(gun.mountProgress()).toBeGreaterThan(.99);
    window.dispatchEvent(Object.assign(new Event('mouseup'), { button: 2 }));
    gun.update(ctx, .1);
    expect(gun.mountProgress()).toBeGreaterThan(.99);
    const drag = Object.assign(new Event('mousedown'), { button: 0 });
    Object.defineProperty(drag, 'target', { value: ctx.renderer.domElement });
    window.dispatchEvent(drag);
    expect(gun.shellsRemaining()).toBe(3);
    key('Space'); key('Space', true);
    expect(gun.shellsRemaining()).toBe(2);
    key('KeyR');
    expect(gun.isReloading()).toBe(true);
    for (let i = 0; i < 180; i++) gun.update(ctx, 1 / 60);
    key('KeyF');
    for (let i = 0; i < 40; i++) gun.update(ctx, 1 / 60);
    expect(gun.mountProgress()).toBeGreaterThan(.99);
    expect(gun.shellsRemaining()).toBe(3);
    ctx.paused = true; ctx.events.dispatchEvent(new Event('pause'));
    key('Space'); expect(gun.shellsRemaining()).toBe(3);
    ctx.paused = false;
    for (let i = 0; i < 40; i++) gun.update(ctx, 1 / 60);
    expect(gun.mountProgress()).toBe(0);
    gun.dispose(ctx);
  });

  it('reloads an empty gun when the player presses R', () => {
    const browserWindow = new EventTarget();
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null });

    const hunt = {
      huntState: () => ({ gunId: 'over-under', birds: [] }),
      dog: () => ({ state: 'quartering', pointedBirdId: null }),
      dogCount: () => 1,
      simToWorld: (_x: number, _y: number, out: { x: number; z: number }) => out,
    };
    const birds = {
      isRiseActive: () => true,
      riseSequence: () => 1,
    };
    const terrain = { heightAt: () => 0 };
    const camera = new THREE.PerspectiveCamera();
    const ctx = {
      scene: new THREE.Scene(),
      camera,
      renderer: { domElement: new EventTarget() },
      rng: () => 0.5,
      events: new EventTarget(),
      quality: 'high',
      timeOfDay: 'dawn',
      time: 0,
      fixedAlpha: 1,
      paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds, terrain }[id]),
    } as unknown as Ctx;
    const gun = new GunSystem();
    gun.init(ctx);

    // Reproduce a spent gun without coupling this regression to hit testing.
    (gun as unknown as { shells: number }).shells = 0;
    const reload = new Event('keydown');
    Object.defineProperty(reload, 'key', { value: 'r' });
    browserWindow.dispatchEvent(reload);
    expect(gun.isReloading()).toBe(true);
    expect(gun.shellsRemaining()).toBe(0);
    for (let i = 0; i < 120; i++) {
      ctx.time += 1 / 60;
      gun.update(ctx, 1 / 60);
    }

    expect(gun.isReloading()).toBe(false);
    expect(gun.shellsRemaining()).toBe(2);
  });
});
