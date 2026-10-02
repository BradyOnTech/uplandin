import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { GunSystem } from '../src/three/subsystems/gun';
import * as inputMode from '../src/three/inputMode';
import type { HuntChallenge } from '../src/game/huntChallenge';
import type { ShotAssistancePreference, ShotTriggerSource } from '../src/three/shotAssistance';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn() }));

describe('3D shotgun action', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['normal', 'lower', 'pause', 'input-reset', 'reload'])('handles the combined touch mount and trigger: %s', scenario => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', {search:''});
    vi.stubGlobal('document', {getElementById:()=>null,querySelector:()=>null});
    const hunt={huntState:()=>({gunId:'over-under',birds:[]}),dog:()=>({state:'quartering'}),dogCount:()=>1};
    const ctx={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),renderer:{domElement:new EventTarget()},
      events:new EventTarget(),quality:'lite',timeOfDay:'morning',time:1,paused:false,
      get:(id:string)=>({hunt3d:hunt,birds:{shotTargets:()=>[]},terrain:{heightAt:()=>0}}[id])} as unknown as Ctx;
    const gun=new GunSystem();gun.init(ctx);
    const action=(detail:string)=>ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'),{detail}));
    const step=(dt:number)=>{ctx.time+=dt;gun.update(ctx,dt);};
    action('touch-mount');step(.2);
    expect(gun.touchShotStatus(ctx)).toBe('Release to shoot');expect(gun.shellsRemaining()).toBe(2);
    action('touch-fire');expect(gun.shellsRemaining()).toBe(1);
    // Duplicate release cannot fire again, even after the action has cycled.
    step(.6);action('touch-fire');expect(gun.shellsRemaining()).toBe(1);
    expect(gun.mountProgress()).toBe(1);expect(gun.touchShotStatus(ctx)).toBe('Ready for next shot');
    action('touch-mount');step(3); // Holding the next swing never times out.
    expect(gun.mountProgress()).toBe(1);
    if(scenario==='pause'||scenario==='input-reset')ctx.events.dispatchEvent(new Event(scenario));
    else if(scenario!=='normal')action(scenario);
    action('touch-fire');
    expect(gun.shellsRemaining()).toBe(scenario==='normal'?0:1);
    step(3);expect(gun.mountProgress()).toBe(0);
    expect(gun.isReloading()).toBe(false);
    gun.dispose(ctx);
  });

  it('honors an early release during mounting but a lower action cancels the queued shot',()=>{
    vi.stubGlobal('window', new EventTarget());vi.stubGlobal('location',{search:''});
    vi.stubGlobal('document',{getElementById:()=>null,querySelector:()=>null});
    const ctx={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),renderer:{domElement:new EventTarget()},
      events:new EventTarget(),quality:'lite',timeOfDay:'morning',time:1,paused:false,
      get:(id:string)=>({hunt3d:{huntState:()=>({gunId:'semi-auto',birds:[]})},birds:{shotTargets:()=>[]},terrain:{heightAt:()=>0}}[id])} as unknown as Ctx;
    const gun=new GunSystem();gun.init(ctx);
    const action=(detail:string)=>ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'),{detail}));
    action('touch-mount');action('touch-fire');expect(gun.shellsRemaining()).toBe(3);
    ctx.time+=.15;gun.update(ctx,.15);expect(gun.shellsRemaining()).toBe(2);
    action('lower');ctx.time+=.2;gun.update(ctx,.2);
    action('touch-mount');action('touch-fire');action('lower');
    ctx.time+=.15;gun.update(ctx,.15);expect(gun.shellsRemaining()).toBe(2);
    gun.dispose(ctx);
  });

  it('enlarges the touch sight picture while raised and restores the wide view on lowering',()=>{
    vi.stubGlobal('window',new EventTarget());vi.stubGlobal('location',{search:''});
    vi.stubGlobal('localStorage',{getItem:()=>null});
    vi.stubGlobal('document',{body:{classList:{contains:(name:string)=>name==='touch-controls-active',toggle:()=>{}}},getElementById:()=>null,querySelector:()=>null});
    const camera=new THREE.PerspectiveCamera(70,2,.1,1000);
    const ctx={scene:new THREE.Scene(),camera,renderer:{domElement:new EventTarget()},events:new EventTarget(),
      quality:'lite',timeOfDay:'morning',time:1,paused:false,
      get:(id:string)=>({hunt3d:{huntState:()=>({gunId:'semi-auto',birds:[]})},birds:{shotTargets:()=>[]},terrain:{heightAt:()=>0}}[id])} as unknown as Ctx;
    const gun=new GunSystem();gun.init(ctx);
    const wide=new THREE.Vector3(.5,0,-20).project(camera).x;
    ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'),{detail:'touch-mount'}));
    gun.update(ctx,.2);expect(camera.fov).toBeCloseTo(2*Math.atan(.5)*180/Math.PI);
    expect(new THREE.Vector3(.5,0,-20).project(camera).x/wide).toBeGreaterThan(1.39);
    ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'),{detail:'lower'}));
    gun.update(ctx,.2);expect(camera.fov).toBe(70);
    gun.dispose(ctx);
  });

  it.each(['semi-auto', 'remington-870', 'over-under', 'side-by-side'])('defaults %s to desktop Closer while preserving Wide, its bead and action lifecycle', gunId => {
    let savedSight: string | null = null, touch = false;
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'uplandin.3d.sight' ? savedSight : null });
    vi.stubGlobal('document', { body: { classList: { contains: () => touch, toggle: () => {} } },
      getElementById: () => null, querySelector: () => null });
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 1000);
    const ctx = { scene: new THREE.Scene(), camera, renderer: { domElement: new EventTarget() },
      events: new EventTarget(), quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
      get: (id: string) => ({ hunt3d: { huntState: () => ({ gunId, birds: [] }) },
        birds: { shotTargets: () => [] }, terrain: { heightAt: () => 0 } }[id]),
    } as unknown as Ctx;
    const gun = new GunSystem(); gun.init(ctx);
    const key = (key: string, code: string) => window.dispatchEvent(Object.assign(new Event('keydown'), { key, code }));
    const step = (dt = .2) => { ctx.time += dt; gun.update(ctx, dt); };
    const action = (detail: string) => ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail }));
    const bead = () => {
      const view = gun as unknown as { root: THREE.Group; rig: THREE.Group; sporting: { bead: THREE.Vector3 } };
      view.root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      return view.sporting.bead.clone().applyMatrix4(view.rig.matrixWorld).project(camera);
    };
    try {
      expect(camera.fov).toBe(70); // Ordinary field view stays wide.
      key('f', 'KeyF'); step(1);
      expect(camera.fov).toBe(58);
      const shellCount = gun.shellsRemaining();
      savedSight = 'wide'; ctx.events.dispatchEvent(new Event('touch-sight-change')); step(1);
      expect(camera.fov).toBe(70);
      savedSight = 'closer'; ctx.events.dispatchEvent(new Event('touch-sight-change')); step(1);
      expect(camera.fov).toBe(58);
      expect(Math.abs(bead().x)).toBeLessThan(.002);
      expect(Math.abs(bead().y)).toBeLessThan(.002);
      expect(gun.shellsRemaining()).toBe(shellCount);
      key('f', 'KeyF'); step(); expect(camera.fov).toBe(70);
      key('f', 'KeyF'); step(); expect(camera.fov).toBe(58);
      ctx.paused = true; ctx.events.dispatchEvent(new Event('pause')); step();
      expect(camera.fov).toBe(70);
      key(' ', 'Space'); expect(gun.shellsRemaining()).toBe(shellCount);
      ctx.paused = false; step(); expect(camera.fov).toBe(70);
      key('f', 'KeyF'); step(); key(' ', 'Space');
      expect(gun.shellsRemaining()).toBe(shellCount - 1);
      key('r', 'KeyR'); step(); expect(camera.fov).toBe(70);
      expect(gun.isReloading()).toBe(true);
      step(2); expect(gun.shellsRemaining()).toBe(shellCount);
      // A saved choice applies across devices; an absent choice falls back
      // to touch Closer again without writing a preference implicitly.
      touch = true; savedSight = null; ctx.events.dispatchEvent(new Event('input-reset'));
      action('touch-mount'); step(); expect(camera.fov).toBe(58);
      savedSight = 'wide'; ctx.events.dispatchEvent(new Event('touch-sight-change'));
      step(); expect(camera.fov).toBe(70);
      action('lower'); step(); expect(camera.fov).toBe(70);
      expect(gun.shellsRemaining()).toBe(shellCount);
    } finally { gun.dispose(ctx); }
  });

  it('keeps recoil strength and recovery identical through fast, slow and uneven frames', () => {
    const advance = (steps: number[]) => {
      const gun = new GunSystem(); gun.kick(1);
      for (const dt of steps) (gun as unknown as { advance(dt: number): void }).advance(dt);
      return { ...gun.recoilOffset() };
    };
    for (const duration of [.1, .3, .6]) {
      const reference = advance(Array.from({ length: Math.round(duration * 120) }, () => 1 / 120));
      for (const fps of [10, 30, 60]) {
        const slow = advance(Array.from({ length: Math.round(duration * fps) }, () => 1 / fps));
        expect(slow.z).toBeCloseTo(reference.z, 10);
        expect(slow.pitch).toBeCloseTo(reference.pitch, 10);
      }
      const uneven = advance([.013, .027, .06, ...(duration > .1 ? [duration - .1] : [])]);
      expect(uneven.z).toBeCloseTo(reference.z, 10);
      expect(uneven.pitch).toBeCloseTo(reference.pitch, 10);
    }
    expect(advance([.1]).z).toBeGreaterThan(0);
    expect(advance([.1]).pitch).toBeGreaterThan(0);
    expect(Math.abs(advance([.6]).z)).toBeLessThan(.002);
  });

  it.each(['pheasant-coverts', 'quail-fields', 'chukar-ridge'])('shows the equipped sporting action on %s with its bead on the shot ray', areaId => {
    for (const gunId of ['semi-auto', 'remington-870', 'over-under', 'side-by-side']) {
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
      expect(view.model).toBe(({ 'semi-auto': 'Sporting semiautomatic', 'remington-870': 'Sporting pump',
        'over-under': 'Sporting over/under', 'side-by-side': 'Sporting side-by-side' })[gunId]);
      expect(gun.shellsRemaining()).toBe(gunId === 'over-under' || gunId === 'side-by-side' ? 2 : 3);
      expect(Math.abs(view.beadNdc.x)).toBeLessThan(.002);
      expect(Math.abs(view.beadNdc.y)).toBeLessThan(.002);
      gun.dispose(ctx);
    }
  });

  it.each(['tree', 'pheasant-tree', 'landmark', 'terrain', 'open'])('consumes a shell and resolves only a clear shot (%s)', obstruction => {
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
        landmarks: { blocksShot: () => obstruction === 'landmark' },
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
    if (!blocked) {
      // The bird learns how squarely the pattern took it, to choose how it falls.
      const shot = birds.downBird.mock.calls[0][2] as { offset: number; wounded: boolean; rangeM: number };
      expect(shot.offset).toBeGreaterThanOrEqual(0); expect(shot.offset).toBeLessThan(.78);
      expect(shot.wounded).toBe(false); expect(shot.rangeM).toBeCloseTo(12, 0);
    }
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

  it.each(['fire', 'lower', 'pause', 'reload', 'no-rise', 'changed-rise', 'ended-rise', 'expired', 'cooldown'])(
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
      if (scenario === 'ended-rise') active=false;
      if (scenario === 'expired') step(.26);
      else for(let i=0;i<12;i++)step(1/60);
      expect(gun.shellsRemaining()).toBe(['fire','no-rise','changed-rise','ended-rise'].includes(scenario)?2:3);
      for(let i=0;i<60;i++)step(1/60);
      expect(gun.shellsRemaining()).toBe(['fire','no-rise','changed-rise','ended-rise'].includes(scenario)?2:3);
      // A new deliberate trigger after cooldown still works normally.
      key('Space');expect(gun.shellsRemaining()).toBe(['fire','no-rise','changed-rise','ended-rise'].includes(scenario)?1:2);
      gun.dispose(ctx);
    });

  it.each(['remington-870', 'semi-auto', 'over-under', 'side-by-side'])(
    'fires the equipped %s without an airborne bird through keyboard, mouse and touch intent', gunId => {
      for (const input of ['keyboard', 'mouse', 'touch']) {
        vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
        const reticle = { hidden: true };
        vi.stubGlobal('document', { getElementById: (id: string) => id === 'reticle' ? reticle : null, querySelector: () => null });
        const birds = { riseSequence: () => 0, isRiseActive: () => false, shotTargets: () => [] };
        const hunt = { huntState: () => ({ gunId, birds: [] }), dog: () => ({ state: 'quartering' }), dogCount: () => 1 };
        const canvas = new EventTarget();
        const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: canvas },
          events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 1, paused: false,
          get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]),
        } as unknown as Ctx;
        const gun = new GunSystem(); gun.init(ctx);
        const key = (code: string) => window.dispatchEvent(Object.assign(new Event('keydown'), { code, key: code === 'KeyF' ? 'f' : ' ' }));
        const mouse = (button: number) => { const event = Object.assign(new Event('mousedown'), { button }); Object.defineProperty(event, 'target', { value: canvas }); window.dispatchEvent(event); };
        const touch = (detail: string) => ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail }));
        if (input === 'keyboard') key('KeyF'); else if (input === 'mouse') mouse(2); else touch('mount');
        ctx.time += .2; gun.update(ctx, .2);
        const capacity = gun.shellCapacity();
        const trigger = () => input === 'keyboard' ? key('Space') : input === 'mouse' ? mouse(0) : touch('fire');
        trigger();
        expect(gun.shellsRemaining()).toBe(capacity - 1);
        expect(reticle.hidden).toBe(false);
        gun.update(ctx, .03); expect(gun.recoilOffset().z).toBeGreaterThan(0);
        ctx.paused = true; trigger(); expect(gun.shellsRemaining()).toBe(capacity - 1);
        gun.dispose(ctx);
      }
    });

  it.each(['remington-870', 'semi-auto'])('a new flush cannot bypass the %s action cooldown', gunId => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
    let sequence = 0;
    const birds = { riseSequence: () => sequence, isRiseActive: () => true, shotTargets: () => [] };
    const hunt = { huntState: () => ({ gunId, birds: [] }) };
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
      events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 1, paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]),
    } as unknown as Ctx;
    const gun = new GunSystem(); gun.init(ctx);
    const key = (code: string) => window.dispatchEvent(Object.assign(new Event('keydown'), { code, key: code === 'KeyF' ? 'f' : ' ' }));
    key('KeyF'); ctx.time += .2; gun.update(ctx, .2); key('Space');
    expect(gun.shellsRemaining()).toBe(2);
    sequence++; ctx.time += .02; gun.update(ctx, .02); key('Space');
    expect(gun.shellsRemaining()).toBe(2);
    ctx.time += .5; gun.update(ctx, .5); key('Space'); expect(gun.shellsRemaining()).toBe(1);
    gun.dispose(ctx);
  });

  it('changes guns only while paused without restarting the hunt or refilling stowed shells', () => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
    const state = { gunId: 'remington-870', birds: [{ id: 42 }], hunterPos: { x: 12, y: 28 }, downed: 2, fieldSessionEnded: false };
    const hunt = { huntState: () => state };
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
      events: new EventTarget(), quality: 'high', timeOfDay: 'noon', time: 1, paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds: { shotTargets: () => [] }, terrain: { heightAt: () => 0 } }[id]),
    } as unknown as Ctx;
    const gun = new GunSystem(); gun.init(ctx);
    const key = (code: string) => window.dispatchEvent(Object.assign(new Event('keydown'), { code, key: code === 'KeyF' ? 'f' : code === 'KeyR' ? 'r' : ' ' }));
    key('KeyF'); ctx.time += .2; gun.update(ctx, .2); key('Space');
    expect(gun.shellsRemaining()).toBe(2);
    expect(gun.equipGun(ctx, 'over-under')).toBe(false);
    key('KeyR'); expect(gun.isReloading()).toBe(true);
    ctx.paused = true; ctx.events.dispatchEvent(new Event('pause'));
    expect(gun.equipGun(ctx, 'unknown')).toBe(false);
    const birdReference = state.birds, hunterReference = state.hunterPos;
    for (const id of ['over-under', 'side-by-side', 'semi-auto']) {
      expect(gun.equipGun(ctx, id)).toBe(true);
      expect(gun.equippedGunId()).toBe(id); expect(state.gunId).toBe(id);
      expect(gun.shellsRemaining()).toBe(id === 'semi-auto' ? 3 : 2);
      expect(gun.isReloading()).toBe(false); expect(gun.mountProgress()).toBe(0);
    }
    expect(gun.equipGun(ctx, 'remington-870')).toBe(true);
    expect(gun.shellsRemaining()).toBe(2);
    expect(gun.equipGun(ctx, 'remington-870')).toBe(true);
    expect(gun.shellsRemaining()).toBe(2);
    expect(state.birds).toBe(birdReference); expect(state.hunterPos).toBe(hunterReference); expect(state.downed).toBe(2);
    state.fieldSessionEnded = true; expect(gun.equipGun(ctx, 'over-under')).toBe(false);
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

describe('mobile shot request provenance and resolution', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function field(challenge: HuntChallenge = 'relaxed', preference: ShotAssistancePreference = 'difficulty', obstruction = '') {
    const settings = { challenge, preference };
    vi.stubGlobal('window', new EventTarget());
    // The next-hunt URL deliberately disagrees with the running hunt.
    vi.stubGlobal('location', { search: '?challenge=wild&controls=touch' });
    vi.stubGlobal('document', {
      body: { classList: { contains: () => true, toggle: () => {} } },
      getElementById: () => null, querySelector: () => null,
    });
    vi.spyOn(inputMode, 'shotAssistancePreference').mockImplementation(() => settings.preference);
    // Just outside the over/under's first, improved-cylinder barrel at 30 m:
    // generous assistance reaches it, light does not.
    const target = { simId: 9, x: 1.66, y: 2, z: -30, status: 'flying' };
    const hunt = {
      huntState: () => ({ gunId: 'over-under', birds: [] }),
      getActiveChallenge: () => settings.challenge,
      resolveBird: vi.fn(() => obstruction !== 'authority'),
    };
    const birds = { shotTargets: () => [target], downBird: vi.fn() };
    const camera = new THREE.PerspectiveCamera(70, 2, .1, 1000);
    camera.position.y = 2; camera.updateMatrixWorld();
    const blockers: Record<string, unknown> = {
      hunt3d: hunt, birds,
      terrain: { heightAt: () => obstruction === 'terrain' ? 100 : 0 },
      'property-habitat': { blocksShot: () => obstruction === 'habitat' },
      'woodcock-wet-bottoms': { blocksShot: () => obstruction === 'wet' },
      landmarks: { blocksShot: () => obstruction === 'landmark' },
      flora: { blocksShot: () => obstruction === 'flora' },
    };
    const ctx = {
      scene: new THREE.Scene(), camera, renderer: { domElement: new EventTarget() }, events: new EventTarget(),
      quality: 'lite', timeOfDay: 'morning', time: 1, paused: false, get: (id: string) => blockers[id],
    } as unknown as Ctx;
    const gun = new GunSystem(); gun.init(ctx);
    const action = (action: string, source?: ShotTriggerSource) => ctx.events.dispatchEvent(
      Object.assign(new Event('hunt-action'), { detail: source ? { action, source } : action }));
    const step = (dt: number) => { ctx.time += dt; gun.update(ctx, dt); };
    const key = (code: string) => window.dispatchEvent(Object.assign(new Event('keydown'),
      { code, key: code === 'KeyF' ? 'f' : ' ', repeat: false }));
    return { settings, target, hunt, birds, ctx, gun, action, step, key };
  }

  it.each([
    ['relaxed', 'difficulty', 1], ['balanced', 'difficulty', 0], ['wild', 'difficulty', 0],
    ['relaxed', 'off', 0], ['wild', 'generous', 1], ['relaxed', 'light', 0],
  ] as const)('resolves a real near miss using active %s / %s settings', (challenge, preference, hits) => {
    const f = field(challenge, preference);
    f.action('touch-mount'); f.step(.2);
    expect(f.gun.shellsRemaining()).toBe(2);
    f.action('touch-fire', 'touch');
    expect(f.gun.shellsRemaining()).toBe(1);
    expect(f.hunt.resolveBird).not.toHaveBeenCalled();
    f.gun.fixedUpdate(f.ctx, 200);
    expect(f.hunt.resolveBird).toHaveBeenCalledTimes(hits);
    expect(f.birds.downBird).toHaveBeenCalledTimes(hits);
    f.gun.dispose(f.ctx);
  });

  it.each(['keyboard', 'mouse', 'other', 'unattributed'] as const)(
    'does not assist %s firing when the touch interface is visible', source => {
      const f = field('relaxed', 'generous');
      f.action('touch-mount'); f.step(.2);
      if (source === 'keyboard') f.key('Space');
      else f.action('touch-fire', source === 'unattributed' ? undefined : source);
      f.gun.fixedUpdate(f.ctx, 200);
      expect(f.gun.shellsRemaining()).toBe(1);
      expect(f.hunt.resolveBird).not.toHaveBeenCalled();
      f.gun.dispose(f.ctx);
    });

  it.each([true, false])('keeps the queued trigger profile when settings change before mount completes (assisted=%s)', assisted => {
    const f = field(assisted ? 'relaxed' : 'wild');
    f.action('touch-mount'); f.action('touch-fire', 'touch');
    f.settings.challenge = assisted ? 'wild' : 'relaxed';
    f.settings.preference = assisted ? 'off' : 'generous';
    f.step(.15); f.gun.fixedUpdate(f.ctx, 200);
    expect(f.gun.shellsRemaining()).toBe(1);
    expect(f.hunt.resolveBird).toHaveBeenCalledTimes(assisted ? 1 : 0);
    f.gun.dispose(f.ctx);
  });

  it('keeps the original queued keyboard trigger unassisted even if a touch release follows', () => {
    const f = field('relaxed', 'generous');
    f.action('touch-mount'); f.key('Space'); f.action('touch-fire', 'touch');
    f.step(.15); f.gun.fixedUpdate(f.ctx, 200);
    expect(f.gun.shellsRemaining()).toBe(1);
    expect(f.hunt.resolveBird).not.toHaveBeenCalled();
    f.step(.6); f.gun.fixedUpdate(f.ctx, 200);
    expect(f.gun.shellsRemaining()).toBe(1);
    f.gun.dispose(f.ctx);
  });

  it.each(['lower', 'pause', 'input-reset', 'blur', 'reload', 'expired'])(
    'cancels assisted pending fire on %s without spending a shell or downing a bird', cancellation => {
      const f = field();
      f.action('touch-mount'); f.action('touch-fire', 'touch');
      if (cancellation === 'pause' || cancellation === 'input-reset') f.ctx.events.dispatchEvent(new Event(cancellation));
      else if (cancellation === 'blur') window.dispatchEvent(new Event('blur'));
      else if (cancellation !== 'expired') f.action(cancellation);
      f.step(cancellation === 'expired' ? .26 : .15); f.gun.fixedUpdate(f.ctx, 200);
      f.step(1); f.gun.fixedUpdate(f.ctx, 200);
      expect(f.gun.shellsRemaining()).toBe(2);
      expect(f.hunt.resolveBird).not.toHaveBeenCalled();
      f.gun.dispose(f.ctx);
    });

  it.each(['terrain', 'habitat', 'wet', 'landmark', 'flora', 'authority'])(
    'retains %s authority for assisted near hits', obstruction => {
      const f = field('relaxed', 'generous', obstruction);
      f.action('touch-mount'); f.step(.2); f.action('touch-fire', 'touch');
      f.gun.fixedUpdate(f.ctx, 200);
      expect(f.gun.shellsRemaining()).toBe(1);
      expect(f.hunt.resolveBird).toHaveBeenCalledTimes(obstruction === 'authority' ? 1 : 0);
      expect(f.birds.downBird).not.toHaveBeenCalled();
      f.gun.dispose(f.ctx);
    });
});
