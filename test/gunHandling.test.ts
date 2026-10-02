import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { GunSystem } from '../src/three/subsystems/gun';
import { GUNS, getGun } from '../src/game/guns';
import { gunFeel, swingInertia } from '../src/game/gunFeel';
import { HULL_RADIUS_M, HULL_REST_S, SpentHulls } from '../src/three/spentHulls';
import { boresFor } from '../src/three/shotFx';
import { createSportingShotgun } from '../src/three/assets/shotgun';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

interface FieldOptions { dog?: { state: string; x: number; z: number }; birds?: { status: string; x: number; y: number; z: number }[] }

function field(gunId: string, options: FieldOptions = {}) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const dog = options.dog;
  const hunt = { huntState: () => ({ gunId, birds: [] }), dogCount: () => dog ? 1 : 0,
    dog: () => ({ state: dog?.state ?? 'quartering' }),
    dogWorld: (out: { x: number; z: number }) => { out.x = dog?.x ?? 0; out.z = dog?.z ?? 0; return out; } };
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(70, 16 / 9, .05, 1000), renderer: { domElement: new EventTarget() },
    events: new EventTarget(), quality: 'high', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds: { shotTargets: () => options.birds ?? [] }, terrain: { heightAt: () => 0 } }[id]),
  } as unknown as Ctx;
  ctx.camera.position.set(0, 1.6, 0); ctx.camera.updateMatrixWorld();
  const gun = new GunSystem(); gun.init(ctx);
  const step = (dt: number) => { ctx.time += dt; gun.update(ctx, dt); };
  const action = (detail: string) => ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail }));
  const key = (code: string) => window.dispatchEvent(Object.assign(new Event('keydown'), { code, key: code === 'KeyF' ? 'f' : code === 'KeyR' ? 'r' : ' ' }));
  const inner = gun as unknown as { readyK: number; safetyOff: number; mountT: number; shells: number; hulls: SpentHulls;
    sporting: { root: THREE.Group }; rig: THREE.Group; barrels: string[]; recVZ: number; recVP: number };
  return { ctx, gun, step, action, key, inner };
}

describe('gun weight and balance', () => {
  it('keeps the 870 as the reference and orders the guns by swing weight', () => {
    const feel = Object.fromEntries(GUNS.map(gun => [gun.id, gunFeel(gun)]));
    expect(feel['remington-870']).toMatchObject({ mountS: .18, kick: 1, swayRate: 7, swayMax: .028, settle: 1 });
    // Heavier swings mount a touch slower and lag further when carried.
    const bySwing = [...GUNS].sort((a, b) => swingInertia(a.handling) - swingInertia(b.handling)).map(gun => gun.id);
    expect(bySwing).toEqual(['side-by-side', 'over-under', 'remington-870', 'semi-auto']);
    for (const [lighter, heavier] of [['side-by-side', 'over-under'], ['over-under', 'remington-870'], ['remington-870', 'semi-auto']]) {
      expect(feel[lighter].mountS).toBeLessThan(feel[heavier].mountS);
      expect(feel[lighter].swayRate).toBeGreaterThan(feel[heavier].swayRate);
    }
    // Every mount stays inside the 150-250 ms cheek-weld law.
    for (const gun of GUNS) expect(gunFeel(gun).mountS).toBeGreaterThan(.15), expect(gunFeel(gun).mountS).toBeLessThan(.21);
    // The light double kicks hardest, the heavy Auto-5 least, then shuffles.
    expect(feel['side-by-side'].kick).toBeGreaterThan(feel['over-under'].kick);
    expect(feel['semi-auto'].kick).toBeLessThan(1);
    expect(feel['semi-auto'].shuffle?.z).toBeLessThan(0);
    expect(feel['over-under'].flip[0]).toBeLessThan(feel['over-under'].flip[1]);
  });

  it('mounts the light double fastest without ever lagging the bead off the shot', () => {
    const timings: Record<string, number> = {};
    for (const gunId of ['side-by-side', 'semi-auto']) {
      const { ctx, gun, step, action } = field(gunId);
      action('mount');
      let t = 0;
      while (gun.mountProgress() < .99 && t < 1) { step(1 / 240); t += 1 / 240; }
      timings[gunId] = t;
      gun.dispose(ctx);
    }
    expect(timings['side-by-side']).toBeLessThan(timings['semi-auto']);
  });
});

describe('ready carry for the walk-in', () => {
  it('comes up while a dog points nearby or birds are in the air, and mounts quicker from there', () => {
    const near = field('remington-870', { dog: { state: 'pointing', x: 6, z: -18 } });
    for (let i = 0; i < 60; i++) near.step(1 / 60);
    expect(near.inner.readyK).toBeGreaterThan(.95);
    near.action('mount');
    let t = 0;
    while (near.gun.mountProgress() < .99) { near.step(1 / 240); t += 1 / 240; }
    expect(t).toBeLessThan(.15);
    near.gun.dispose(near.ctx);

    const far = field('remington-870', { dog: { state: 'pointing', x: 10, z: -80 } });
    for (let i = 0; i < 60; i++) far.step(1 / 60);
    expect(far.inner.readyK).toBeLessThan(.01);
    far.gun.dispose(far.ctx);

    const flush = field('over-under', { birds: [{ status: 'flying', x: 4, y: 3, z: -20 }] });
    for (let i = 0; i < 60; i++) flush.step(1 / 60);
    expect(flush.inner.readyK).toBeGreaterThan(.95);
    flush.gun.dispose(flush.ctx);
  });

  it('pushes the safety off as the gun comes up and on again once it is down', () => {
    const { ctx, gun, step, action, inner } = field('over-under');
    step(.1); expect(inner.safetyOff).toBe(0);
    action('mount'); for (let i = 0; i < 30; i++) step(1 / 60);
    expect(inner.safetyOff).toBe(1);
    action('lower'); for (let i = 0; i < 60; i++) step(1 / 60);
    expect(inner.safetyOff).toBe(0);
    const safety = inner.sporting.root.getObjectByName('Safety catch')!;
    expect(safety).toBeDefined();
    gun.dispose(ctx);
  });
});

describe('reloading cut short by a flush', () => {
  it('pushes home the shell in hand, closes and comes up with what is loaded', () => {
    const { ctx, gun, step, key, inner } = field('remington-870');
    inner.shells = 0;
    key('KeyR'); expect(gun.isReloading()).toBe(true);
    // Partway into the second shell's beat the hunter sees a bird and mounts.
    for (let t = 0; t < .55 + .38 * 1.3; t += 1 / 60) step(1 / 60);
    expect(gun.shellsRemaining()).toBe(1);
    key('KeyF');
    expect(gun.isReloading()).toBe(true);
    for (let i = 0; i < 60 && gun.isReloading(); i++) step(1 / 60);
    expect(gun.isReloading()).toBe(false);
    expect(gun.shellsRemaining()).toBe(2);
    for (let i = 0; i < 30; i++) step(1 / 60);
    expect(gun.mountProgress()).toBeGreaterThan(.99);
    gun.dispose(ctx);
  });

  it('counts each shell as it seats, so the full reload still ends full', () => {
    const { ctx, gun, step, key, inner } = field('semi-auto');
    inner.shells = 0; key('KeyR');
    const seen: number[] = [];
    while (gun.isReloading()) { step(1 / 60); if (seen.at(-1) !== gun.shellsRemaining()) seen.push(gun.shellsRemaining()); }
    expect(seen).toEqual([0, 1, 2, 3]);
    gun.dispose(ctx);
  });

  it('closes a double at once if a barrel is still loaded', () => {
    const { ctx, gun, step, key, action, inner } = field('over-under');
    action('mount'); step(.3); key(' ');
    expect(gun.shellsRemaining()).toBe(1);
    expect(inner.barrels).toEqual(['fired', 'loaded']);
    action('lower'); step(.3);
    key('KeyR'); step(.1);
    action('mount');
    let t = 0;
    while (gun.isReloading()) { step(1 / 60); t += 1 / 60; }
    expect(t).toBeLessThan(.6);
    expect(gun.shellsRemaining()).toBe(1);
    // The live barrel fires next; its partner was emptied by the ejector.
    expect(inner.barrels).toEqual(['empty', 'loaded']);
    gun.dispose(ctx);
  });
});

describe('the doubles fire in their real order', () => {
  it('fires the 686 under barrel and the side-by-side right barrel first, open choke first', () => {
    expect(boresFor('over-under')[0].y).toBeLessThan(boresFor('over-under')[1].y);
    expect(boresFor('side-by-side')[0].x).toBeGreaterThan(0);
    for (const gunId of ['over-under', 'side-by-side']) {
      const { ctx, gun, step, action, key, inner } = field(gunId);
      action('mount'); step(.3);
      key(' '); expect(inner.barrels).toEqual(['fired', 'loaded']);
      step(.1); key(' '); expect(inner.barrels).toEqual(['fired', 'fired']);
      expect(getGun(gunId).chokes[0].name).toBe('Improved cylinder');
      gun.dispose(ctx);
    }
  });
});

describe('spent hulls', () => {
  it('throws a hull from the pump on the rack and one from the Auto-5 on the shot', () => {
    for (const gunId of ['remington-870', 'semi-auto']) {
      const { ctx, gun, step, action, key, inner } = field(gunId);
      action('mount'); step(.3);
      key(' ');
      expect(inner.hulls.count).toBe(0);
      for (let i = 0; i < 30; i++) step(1 / 60);
      expect(inner.hulls.count).toBe(1);
      // Out of the right-hand port: the hull heads to the hunter's right.
      const hull = inner.hulls.hull(0)!;
      expect(hull.x).toBeGreaterThan(.15);
      gun.dispose(ctx);
    }
  });

  it("kicks a double's fired hulls clear as it opens, never a live round", () => {
    const { ctx, gun, step, action, key, inner } = field('side-by-side');
    action('mount'); step(.3); key(' ');
    action('lower'); step(.3);
    key('KeyR');
    for (let i = 0; i < 30; i++) step(1 / 60);
    expect(inner.hulls.count).toBe(1);
    gun.dispose(ctx);
  });

  it('bounces, lies on its side on the ground, then is tidied away', () => {
    const hulls = new SpentHulls(4);
    hulls.emit({ position: new THREE.Vector3(0, 1.4, 0), velocity: new THREE.Vector3(2.4, 1.2, .2),
      orientation: new THREE.Quaternion(), spin: new THREE.Vector3(0, 18, 3) });
    const ground = (x: number) => x * .05;
    for (let i = 0; i < 240; i++) hulls.step(1 / 60, ground);
    const hull = hulls.hull(0)!;
    expect(hull.resting).toBe(true);
    expect(Math.abs(hull.axisY)).toBeLessThan(1e-6);
    expect(hull.y).toBeCloseTo(ground(hull.x) + HULL_RADIUS_M * .75, 4);
    expect(hull.x).toBeGreaterThan(1); expect(hull.x).toBeLessThan(4);
    for (let t = 0; t < HULL_REST_S + 1; t += .5) hulls.step(.5, ground);
    expect(hulls.count).toBe(0); expect(hulls.mesh.visible).toBe(false);
    // Past capacity the oldest hull is reused.
    for (let i = 0; i < 6; i++) hulls.emit({ position: new THREE.Vector3(i, 1, 0), velocity: new THREE.Vector3(),
      orientation: new THREE.Quaternion(), spin: new THREE.Vector3() });
    expect(hulls.count).toBe(4);
    hulls.dispose();
  });
});

describe('viewmodel details', () => {
  it('gives the 870 no charging handle and the Auto-5 one, within the draw budget', () => {
    const pump = createSportingShotgun('pump', { hands: false }), semi = createSportingShotgun('semi-auto', { hands: false });
    const bolt = (model: typeof pump) => model.root.getObjectByName('Bolt and handle')!;
    const size = (model: typeof pump) => new THREE.Box3().setFromObject(bolt(model)).getSize(new THREE.Vector3());
    expect(size(pump).x).toBeLessThan(.003);
    expect(size(semi).x).toBeGreaterThan(.01);
    expect(bolt(pump).children).toHaveLength(1); expect(bolt(semi).children).toHaveLength(1);
    pump.dispose(); semi.dispose();
  });

  it('slides each safety between safe and fire', () => {
    for (const action of ['pump', 'semi-auto', 'over-under', 'side-by-side'] as const) {
      const model = createSportingShotgun(action, { hands: false });
      const safety = model.root.getObjectByName('Safety catch')!;
      const safe = safety.position.clone();
      model.setSafety(1);
      const fire = safety.position.clone();
      expect(safe.distanceTo(fire)).toBeGreaterThan(.004);
      // A tang safety slides forward to fire; a cross-bolt pushes to the left.
      if (action === 'over-under' || action === 'side-by-side') expect(fire.z).toBeLessThan(safe.z);
      else expect(fire.x).toBeLessThan(safe.x);
      model.dispose();
    }
  });
});

describe('delivery to hand', () => {
  function delivery(gunId = 'remington-870') {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
    const bird = { id: 7, state: 'carried' };
    const dog = { state: 'retrieving', carryingBirdId: 7 as number | null, gait: 'still', hold: 1, retrieveHoldTimeMs: () => dog.hold };
    const hunt = { huntState: () => ({ gunId, birds: [bird] }), dogCount: () => 1, dog: () => dog,
      dogWorld: (out: { x: number; z: number }) => Object.assign(out, { x: 0, z: -1 }) };
    const held: { position: THREE.Vector3; blend: number }[] = [];
    const birds = { shotTargets: () => [], holdInHand: vi.fn((_id: number, position: THREE.Vector3, _q: THREE.Quaternion, blend: number) => { held.push({ position: position.clone(), blend }); return true; }),
      releaseFromHand: vi.fn() };
    const mouth = new THREE.Vector3(.02, .55, -.72);
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(70, 16 / 9, .05, 1000), renderer: { domElement: new EventTarget() },
      events: new EventTarget(), quality: 'high', timeOfDay: 'morning', time: 1, paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 },
        dog: { mouthWorld: (out: THREE.Vector3) => { out.copy(mouth); return true; } } } as Record<string, unknown>)[id],
    } as unknown as Ctx;
    ctx.camera.position.set(0, 1.62, 0); ctx.camera.rotation.order = 'YXZ'; ctx.camera.updateMatrixWorld();
    const looks: (number | null)[] = [];
    ctx.events.addEventListener('look-assist', (event) => looks.push((event as CustomEvent).detail.pitch));
    const gun = new GunSystem(); gun.init(ctx);
    const step = (dt: number) => { ctx.time += dt; gun.update(ctx, dt); };
    const inner = gun as unknown as { handoff: { t: number } | null; sporting: { root: THREE.Group }; rig: THREE.Group };
    const hand = () => {
      const left = inner.sporting.root.getObjectByName('Left glove and canvas cuff')!;
      inner.sporting.root.updateMatrixWorld(true);
      return left.localToWorld(new THREE.Vector3(0, -.03, -.245));
    };
    return { ctx, gun, step, bird, dog, birds, held, mouth, looks, inner, hand };
  }

  it('bends to the dog, takes the bird from its mouth, looks it over and bags it', () => {
    const { ctx, gun, step, bird, birds, held, mouth, looks, inner, hand } = delivery();
    step(1 / 60);
    expect(inner.handoff).not.toBeNull();
    // Bend and look down at the bird in the dog's mouth.
    expect(looks[0]).toBeLessThan(-.6);
    for (let t = 0; t < HANDOFF_REACH; t += 1 / 60) step(1 / 60);
    expect(hand().distanceTo(mouth)).toBeLessThan(.06);
    expect(birds.holdInHand).not.toHaveBeenCalled();
    // The dog gives: the bird comes up in the hand, into view.
    bird.state = 'retrieved';
    for (let i = 0; i < 50; i++) step(1 / 60);
    expect(birds.holdInHand).toHaveBeenCalled();
    expect(looks.at(-1)).toBeGreaterThan(-.2);
    ctx.camera.updateMatrixWorld();
    const ndc = held.at(-1)!.position.clone().project(ctx.camera);
    expect(Math.abs(ndc.x)).toBeLessThan(.5); expect(Math.abs(ndc.y)).toBeLessThan(.7);
    for (let i = 0; i < 4 * 60 && inner.handoff; i++) step(1 / 60);
    expect(birds.releaseFromHand).toHaveBeenCalledWith(7);
    expect(inner.handoff).toBeNull();
    expect(looks.at(-1)).toBeNull();
    gun.dispose(ctx);
  });

  it('keeps the muzzle off the dog while the hand is away', () => {
    const { ctx, gun, step, inner, mouth } = delivery('over-under');
    ctx.camera.rotation.x = -.75; ctx.camera.updateMatrixWorld();
    for (let i = 0; i < 40; i++) step(1 / 60);
    inner.rig.updateMatrixWorld(true);
    const muzzle = new THREE.Vector3(0, 0, -1).applyQuaternion(inner.rig.getWorldQuaternion(new THREE.Quaternion()));
    const breech = inner.rig.getWorldPosition(new THREE.Vector3());
    const toDog = mouth.clone().sub(breech).normalize();
    expect(muzzle.dot(toDog)).toBeLessThan(.2);
    expect(muzzle.y).toBeGreaterThan(.3);
    gun.dispose(ctx);
  });

  it('drops it all for a mount: the bird into the bag, the hand back on the gun', () => {
    const { ctx, gun, step, bird, birds, inner, looks } = delivery();
    for (let i = 0; i < 40; i++) step(1 / 60);
    bird.state = 'retrieved';
    for (let i = 0; i < 30; i++) step(1 / 60);
    ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail: 'mount' }));
    step(1 / 60);
    expect(inner.handoff).toBeNull();
    expect(birds.releaseFromHand).toHaveBeenCalledWith(7);
    expect(looks.at(-1)).toBeNull();
    for (let i = 0; i < 20; i++) step(1 / 60);
    expect(gun.mountProgress()).toBeGreaterThan(.99);
    gun.dispose(ctx);
  });

  it('lets the dog be if it moves off before giving', () => {
    const { ctx, gun, step, dog, birds, inner } = delivery();
    for (let i = 0; i < 20; i++) step(1 / 60);
    dog.carryingBirdId = null;
    step(1 / 60);
    expect(inner.handoff).toBeNull();
    expect(birds.releaseFromHand).not.toHaveBeenCalled();
    gun.dispose(ctx);
  });
});
const HANDOFF_REACH = .6;
