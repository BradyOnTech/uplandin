import { afterEach, describe, expect, it, vi } from 'vitest';
import { Engine, type Ctx } from '../src/three/engine';
import { HuntArrivalController } from '../src/three/huntArrivalController';
import type { HuntArrivalFrame, HuntArrivalSite } from '../src/three/huntArrival';

// Exercise the real Engine pause/render-only contract without a GPU/context.
vi.mock('three', async original => {
  const three = await original<typeof import('three')>();
  return { ...three, WebGLRenderer: class {
    shadowMap = { enabled: false, type: 0 };
    info = { autoReset: true, reset() {}, render: {}, memory: {} };
    render = vi.fn(); dispose = vi.fn();
    setPixelRatio() {} setSize() {}
  } };
});

class ElementStub extends EventTarget {
  id = ''; hidden = false; textContent = ''; parent: ElementStub | null = null;
  children: ElementStub[] = [];
  attributes = new Map<string, string>();
  private classes = new Set<string>();
  classList = {
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
    contains: (name: string) => this.classes.has(name),
  };
  constructor(readonly tag: string) { super(); }
  set innerHTML(markup: string) {
    // Only the two interactive/announced descendants needed by this
    // controller; layout and real focus accessibility remain browser checks.
    for (const tag of ['p', 'button']) if (markup.includes(`<${tag}`)) this.append(new ElementStub(tag));
  }
  querySelector(tag: string) { return this.children.find(child => child.tag === tag) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(child: ElementStub) { child.parent = this; this.children.push(child); }
  focus = vi.fn();
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
}

const site: HuntArrivalSite = {
  crateFloor: { x: 8, y: 2.1, z: -3 }, boxThreshold: { x: 8.5, y: 2.1, z: -2.5 },
  tailgateEdge: { x: 9, y: 2.08, z: -2 }, landing: { x: 10, y: 1, z: -1 },
  releaseHeading: Math.PI / 4, fieldHeading: 1.1,
};
const heightAt = (x: number, z: number) => .07 * x - .04 * z;
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup());
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function fixture({ brace = false, reducedMotion = false, supported = true, hasSite = true } = {}) {
  const body = new ElementStub('body');
  const documentStub = Object.assign(new EventTarget(), { body, createElement: (tag: string) => new ElementStub(tag) });
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1 }));
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reducedMotion })));
  let now = 1000, id = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const request = vi.fn((callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
  const cancel = vi.fn((handle: number) => { pending.delete(handle); });
  vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', cancel);
  const step = (ms = 1000 / 60) => {
    now += ms; const callbacks = [...pending.values()]; pending.clear();
    callbacks.forEach(callback => callback(now));
  };
  const engine = new Engine({} as HTMLCanvasElement, 'lite');
  engine.ctx.time = 42;
  engine.ctx.camera.position.set(-7, 2, 11);
  engine.ctx.camera.rotation.set(-.12, .4, 0);
  const original = { x: -7, z: 11, yaw: .4 * 180 / Math.PI, pitch: -.12 * 180 / Math.PI };
  const tick = vi.fn(), presentation = vi.fn();
  const release = vi.fn((_ctx: Ctx, _positions: HuntArrivalFrame['dog'][]) => true);
  const hunt = { id: 'hunt3d', init() {}, fixedUpdate: tick, update: presentation,
    dogCount: () => brace ? 2 : 1, releaseFromTruck: release };
  const hinges = vi.fn();
  const landmarks = { id: 'landmarks', init() {}, arrivalSite: () => hasSite ? site : null, setTruckRelease: hinges };
  const setPose = vi.fn((ctx: Ctx, x: number, z: number, yaw: number, pitch: number) => {
    ctx.camera.position.x = x; ctx.camera.position.z = z;
    ctx.camera.rotation.y = yaw * Math.PI / 180; ctx.camera.rotation.x = pitch * Math.PI / 180;
  });
  const gunHidden = vi.fn();
  const actors = Array.from({ length: brace ? 2 : 1 }, (_, slot) => ({
    id: slot === 0 ? 'dog' : 'dog-2', init() {},
    // Two independently registered production renderer contracts; their
    // internal skin/rig implementations are deliberately outside this test.
    setArrivalPose: vi.fn((_pose: HuntArrivalFrame['dog'] | null, _elapsed?: number, _dt?: number) => {}),
  }));
  const systems = [hunt, landmarks, { id: 'terrain', init() {}, heightAt },
    { id: 'player', init() {}, setPose }, { id: 'gun', init() {}, setArrivalHidden: gunHidden },
    ...actors.map((actor, slot) => !supported && slot === actors.length - 1 ? { id: actor.id, init() {} } : actor)];
  systems.forEach(system => engine.register(system));
  const controller = new HuntArrivalController(engine);
  const panel = body.children[0], skip = panel.querySelector('button')!;
  const done = vi.fn(() => engine.pause(false));
  cleanups.push(() => { controller.dispose(); engine.dispose(); });
  return { controller, engine, step, pending, request, cancel, tick, presentation, release, hinges, setPose,
    gunHidden, actors, body, panel, skip, done, original };
}

type Fixture = ReturnType<typeof fixture>;
function expectFinalHandoff(f: Fixture, count = 1) {
  expect(f.controller.active).toBe(false);
  expect(f.release).toHaveBeenCalledOnce();
  const [ctx, positions] = f.release.mock.calls[0];
  expect(ctx).toBe(f.engine.ctx); expect(positions).toHaveLength(count);
  for (const pose of positions) {
    expect(pose.y).toBeCloseTo(heightAt(pose.x, pose.z), 10);
    expect(Math.sin(pose.heading - site.fieldHeading)).toBeCloseTo(0, 10);
    expect(Math.cos(pose.heading - site.fieldHeading)).toBeCloseTo(1, 10);
    expect(pose.pitch).toBeCloseTo(0, 10); expect(pose.locomotion).toBe('stand');
  }
  expect(positions.reduce((sum, pose) => sum + pose.x, 0) / count).toBeCloseTo(site.landing.x, 10);
  expect(positions.reduce((sum, pose) => sum + pose.z, 0) / count).toBeCloseTo(site.landing.z, 10);
  expect(f.setPose).toHaveBeenLastCalledWith(f.engine.ctx, f.original.x, f.original.z, f.original.yaw, f.original.pitch);
  expect(f.hinges).toHaveBeenLastCalledWith({ crateDoor: 1, tailgate: 1 });
  expect(f.gunHidden).toHaveBeenLastCalledWith(false);
  for (const actor of f.actors) expect(actor.setArrivalPose.mock.calls.filter(([pose]) => pose === null)).toHaveLength(1);
  expect(f.panel.hidden).toBe(true);
  expect(f.body.classList.contains('hunt-arriving')).toBe(false);
  expect(f.pending.size).toBe(0);
}

describe('hunt arrival controller lifetime', () => {
  it('runs presentation frames without advancing the hunt, then releases once on natural completion', () => {
    const f = fixture();
    expect(f.controller.start(f.done)).toBe(true);
    expect(f.engine.ctx.paused).toBe(true);
    expect(f.controller.start(vi.fn())).toBe(false);
    expect(f.panel.hidden).toBe(false);
    expect(f.gunHidden).toHaveBeenLastCalledWith(true);
    expect(f.skip.focus).toHaveBeenCalledOnce();
    for (let frame = 0; frame < 360 && f.controller.active; frame++) {
      f.step();
      expect(f.tick).not.toHaveBeenCalled();
      expect(f.engine.ctx.time).toBe(42);
    }
    expect(f.presentation.mock.calls.length).toBeGreaterThan(100);
    expect(f.presentation.mock.calls.every(([, dt]) => dt === 0)).toBe(true);
    expectFinalHandoff(f);
    expect(f.done).toHaveBeenCalledOnce(); expect(f.engine.ctx.paused).toBe(false);
    expect(f.controller.start(vi.fn())).toBe(false);
    f.controller.finish(true); f.skip.dispatchEvent(new Event('click'));
    expect(f.release).toHaveBeenCalledOnce(); expect(f.done).toHaveBeenCalledOnce();
  });

  it.each(['finish', 'skip', 'interrupt'] as const)('uses the same endpoint for %s and cannot replay on resume', reason => {
    const f = fixture(); f.controller.start(f.done);
    for (let i = 0; i < 20; i++) f.step();
    expect(f.release).not.toHaveBeenCalled();
    if (reason === 'skip') f.skip.dispatchEvent(new Event('click'));
    else f.controller.finish(reason === 'finish');
    expectFinalHandoff(f);
    expect(f.done).toHaveBeenCalledTimes(reason === 'interrupt' ? 0 : 1);
    if (reason === 'interrupt') expect(f.engine.ctx.paused).toBe(true);
    f.engine.pause(false);
    expect(f.controller.start(vi.fn())).toBe(false);
    f.step(); f.controller.finish(true);
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('releases a mixed brace to distinct grounded endpoints after both actors finish', () => {
    const f = fixture({ brace: true }); f.controller.start(f.done);
    for (let i = 0; i < 70; i++) f.step();
    expect(f.actors[0].setArrivalPose.mock.calls.at(-1)![0]?.locomotion).toBe('walk');
    expect(f.actors[1].setArrivalPose.mock.calls.at(-1)![0]?.locomotion).toBe('stand');
    expect(f.release).not.toHaveBeenCalled();
    for (let i = 0; i < 360 && f.controller.active; i++) f.step();
    expectFinalHandoff(f, 2);
    const [, positions] = f.release.mock.calls[0];
    expect(Math.hypot(positions[0].x - positions[1].x, positions[0].z - positions[1].z)).toBeGreaterThan(.4);
    // Separation is across the truck, not a change in forward landing depth.
    const forward = positions.map(p => p.x * Math.cos(site.releaseHeading) + p.z * Math.sin(site.releaseHeading));
    expect(forward[0]).toBeCloseTo(forward[1], 10);
    expect(f.done).toHaveBeenCalledOnce();
  });

  it('honors reduced motion with an immediate brace handoff and no animation frame', () => {
    const f = fixture({ brace: true, reducedMotion: true });
    expect(f.controller.start(f.done)).toBe(true);
    expectFinalHandoff(f, 2);
    expect(f.request).not.toHaveBeenCalled(); expect(f.tick).not.toHaveBeenCalled();
    expect(f.done).toHaveBeenCalledOnce(); expect(f.engine.ctx.paused).toBe(false);
    expect(f.controller.start(vi.fn())).toBe(false);
  });

  it('disposes active presentation without resuming or leaving a runnable RAF callback', () => {
    const f = fixture(); f.controller.start(f.done); f.step();
    const stale = [...f.pending.values()][0];
    f.controller.dispose(); expectFinalHandoff(f);
    expect(f.done).not.toHaveBeenCalled(); expect(f.engine.ctx.paused).toBe(true);
    expect(f.body.children).toHaveLength(0);
    const renders = f.presentation.mock.calls.length, requests = f.request.mock.calls.length;
    stale(performance.now() + 1000); f.controller.dispose();
    expect(f.presentation).toHaveBeenCalledTimes(renders); expect(f.request).toHaveBeenCalledTimes(requests);
    expect(f.release).toHaveBeenCalledOnce(); expect(f.done).not.toHaveBeenCalled();
  });

  it.each([{ hasSite: false }, { brace: true, supported: false }])('declines an unavailable presentation without pausing or releasing', options => {
    const f = fixture(options);
    expect(f.controller.start(f.done)).toBe(false);
    expect(f.engine.ctx.paused).toBe(false); expect(f.controller.active).toBe(false);
    expect(f.release).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled();
    expect(f.done).not.toHaveBeenCalled(); expect(f.panel.hidden).toBe(true);
  });
});
