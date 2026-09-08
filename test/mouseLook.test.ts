import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindMouseLook } from '../src/three/mouseLook';

describe('browser mouse-look fallback', () => {
  afterEach(() => vi.unstubAllGlobals());
  function fixture() {
    const browserWindow = new EventTarget();
    const browserDocument = Object.assign(new EventTarget(), { pointerLockElement: null as unknown });
    const canvas = Object.assign(new EventTarget(), { requestPointerLock: vi.fn(() => Promise.reject(new Error('Unavailable'))) }) as unknown as HTMLCanvasElement;
    vi.stubGlobal('window', browserWindow); vi.stubGlobal('document', browserDocument);
    const turn = vi.fn(), fallbackChanged = vi.fn(), abort = new AbortController();
    let paused = false;
    const look = bindMouseLook(canvas, { signal: abort.signal, turn, fallbackChanged, paused: () => paused });
    const emit = (target: EventTarget, type: string, values = {}) => target.dispatchEvent(Object.assign(new Event(type), values));
    return { browserWindow, browserDocument, canvas, turn, fallbackChanged, abort, look, emit, pause: () => { paused = true; } };
  }
  it('reports rejected capture and turns only while a canvas drag is held', async () => {
    const f = fixture();
    f.emit(f.canvas, 'click'); await Promise.resolve();
    expect(f.fallbackChanged).toHaveBeenCalledWith(true);
    f.emit(f.browserWindow, 'mousemove', { clientX: 120, clientY: 80, buttons: 1 });
    expect(f.turn).not.toHaveBeenCalled();
    f.emit(f.canvas, 'mousedown', { button: 0, clientX: 100, clientY: 50 });
    f.emit(f.browserWindow, 'mousemove', { clientX: 120, clientY: 80, buttons: 1 });
    expect(f.turn).toHaveBeenLastCalledWith(20, 30);
    f.emit(f.browserWindow, 'mouseup');
    f.emit(f.browserWindow, 'mousemove', { clientX: 180, clientY: 80, buttons: 0 });
    expect(f.turn).toHaveBeenCalledTimes(1);
    f.abort.abort();
  });
  it('keeps relative mouse input when capture succeeds and removes listeners on disposal', () => {
    const f = fixture();
    f.browserDocument.pointerLockElement = f.canvas;
    f.emit(f.browserDocument, 'pointerlockchange');
    f.emit(f.browserWindow, 'mousemove', { movementX: 7, movementY: -4 });
    expect(f.turn).toHaveBeenCalledWith(7, -4);
    expect(f.fallbackChanged).toHaveBeenCalledWith(false);
    f.abort.abort();
    f.emit(f.browserWindow, 'mousemove', { movementX: 10, movementY: 10 });
    expect(f.turn).toHaveBeenCalledTimes(1);
  });
  it('does not turn while paused or carry a drag across pause', () => {
    const f = fixture();
    f.emit(f.browserDocument, 'pointerlockerror');
    f.emit(f.canvas, 'mousedown', { button: 2, clientX: 100, clientY: 50 });
    f.look.release();
    f.emit(f.browserWindow, 'mousemove', { clientX: 120, clientY: 80, buttons: 2 });
    expect(f.turn).not.toHaveBeenCalled();
    f.browserDocument.pointerLockElement = f.canvas; f.pause();
    f.emit(f.browserWindow, 'mousemove', { movementX: 7, movementY: -4 });
    expect(f.turn).not.toHaveBeenCalled(); f.abort.abort();
  });
  it('keeps aiming after a left-button shot while the right button remains held', () => {
    const f = fixture();
    f.emit(f.browserDocument, 'pointerlockerror');
    f.emit(f.canvas, 'mousedown', { button: 2, clientX: 100, clientY: 50 });
    f.emit(f.canvas, 'mousedown', { button: 0, clientX: 100, clientY: 50 });
    f.emit(f.browserWindow, 'mouseup', { button: 0, buttons: 2 });
    f.emit(f.browserWindow, 'mousemove', { clientX: 130, clientY: 60, buttons: 2 });
    expect(f.turn).toHaveBeenCalledWith(30, 10);
    f.abort.abort();
  });
});
