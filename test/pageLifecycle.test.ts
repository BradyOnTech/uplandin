import { expect, it, vi } from 'vitest';
import { bindFieldPageLifecycle } from '../src/three/pageLifecycle';
it('retains a cached hunt across repeated Back visits and disposes only on final departure', () => {
  const target = new EventTarget(), pause = vi.fn(), dispose = vi.fn();
  bindFieldPageLifecycle(target, pause, dispose);
  const send = (name: string, persisted: boolean) => target.dispatchEvent(Object.assign(new Event(name), {persisted}));
  send('pageshow', false); expect(pause).not.toHaveBeenCalled();
  for (let visit = 0; visit < 2; visit++) { send('pagehide', true); send('pageshow', true); }
  expect(pause).toHaveBeenCalledTimes(4); expect(dispose).not.toHaveBeenCalled();
  send('pagehide', false); send('pagehide', false); send('pageshow', true);
  expect(dispose).toHaveBeenCalledTimes(1); expect(pause).toHaveBeenCalledTimes(4);
});
