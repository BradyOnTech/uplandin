import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine } from '../src/three/engine';

vi.mock('three', async (original) => {
  const three = await original<typeof import('three')>();
  return { ...three, WebGLRenderer: class {
    shadowMap = { enabled: false, type: 0 };
    domElement: HTMLCanvasElement;
    dispose = vi.fn();
    info = { autoReset: true, render: { calls: 0 }, reset: () => { this.info.render.calls = 0; } };
    render = vi.fn(() => { if (this.info.autoReset) this.info.reset(); this.info.render.calls++; });
    constructor(options: { canvas: HTMLCanvasElement }) { this.domElement = options.canvas; }
    setPixelRatio() {}
    setSize() {}
  } };
});

beforeEach(() => {
  vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1 }));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('engine loading lifetime', () => {
  it('redraws a paused field after phone rotation while keeping the hunt paused', async () => {
    const engine = new Engine({} as HTMLCanvasElement, 'lite');
    engine.register({ id:'field',init() {} }); await engine.start(); engine.pause(true);
    const renderer = engine.ctx.renderer;
    vi.mocked(renderer.render).mockClear();
    Object.assign(window, {innerWidth:390,innerHeight:844});
    window.dispatchEvent(new Event('resize'));
    expect(engine.ctx.camera.aspect).toBeCloseTo(390/844);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(engine.ctx.paused).toBe(true);
    window.dispatchEvent(new Event('resize'));
    expect(renderer.render).toHaveBeenCalledOnce();
    engine.dispose();
  });
  it('renders overlays after the world and counts both passes on each frame', () => {
    const engine = new Engine({} as HTMLCanvasElement, 'high');
    const calls: number[] = [];
    engine.register({ id: 'overlay', init() {}, renderOverlay(ctx) {
      calls.push(ctx.renderer.info.render.calls);
      ctx.renderer.render(ctx.scene, ctx.camera);
    } });
    engine.renderOnce();
    expect(calls).toEqual([1]);
    expect(engine.ctx.renderer.info.render.calls).toBe(2);
    expect(engine.ctx.renderer.info.autoReset).toBe(true);
    engine.renderOnce();
    expect(calls).toEqual([1, 1]);
    expect(engine.ctx.renderer.info.render.calls).toBe(2);
    engine.dispose();
  });

  it('releases late assets without restarting after leaving during loading', async () => {
    const engine = new Engine({} as HTMLCanvasElement, 'high');
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const first = { id: 'first', init: vi.fn(), dispose: vi.fn() };
    const late = { id: 'late', init: vi.fn(() => gate), dispose: vi.fn() };
    const untouched = { id: 'untouched', init: vi.fn(), dispose: vi.fn() };
    engine.register(first); engine.register(late); engine.register(untouched);
    const started = engine.start();
    await Promise.resolve();
    expect(late.init).toHaveBeenCalledOnce();
    engine.dispose();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(late.dispose).not.toHaveBeenCalled();
    finish();
    expect(await started).toBe(false);
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(untouched.init).not.toHaveBeenCalled();
    expect(untouched.dispose).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(engine.ctx.renderer.dispose).toHaveBeenCalledOnce();
    expect(await engine.start()).toBe(false);
    engine.dispose();
    expect(late.dispose).toHaveBeenCalledOnce();
  });

  it('cleans earlier systems and partial failed assets before surfacing a load error', async () => {
    const engine = new Engine({} as HTMLCanvasElement, 'high');
    const first = { id: 'first', init: vi.fn(), dispose: vi.fn() };
    const failing = { id: 'asset', init: vi.fn(async () => { throw new Error('asset unavailable'); }), dispose: vi.fn() };
    engine.register(first); engine.register(failing);
    await expect(engine.start()).rejects.toThrow('asset unavailable');
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(failing.dispose).toHaveBeenCalledOnce();
    expect(engine.ctx.renderer.dispose).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
