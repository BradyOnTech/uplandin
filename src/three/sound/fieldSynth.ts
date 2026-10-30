import { runFieldSynth, type FieldSynthJob } from './fieldSynthJobs';

/**
 * The field's beds and far sounds take 3 to 30 ms each to make on a desktop
 * and several times that on a phone, so they are made in a worker and never
 * take a frame from the hunt. Where a worker cannot run, each is made in an
 * idle moment of its own instead.
 */
interface Pending { resolve(samples: Float32Array): void; job: FieldSynthJob }
let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function whenIdle(entry: Pending): void {
  const run = () => entry.resolve(runFieldSynth(entry.job));
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run);
  else setTimeout(run, 40);
}

function synthWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./fieldSynthWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; samples: Float32Array }>) => {
      const entry = pending.get(event.data.id);
      pending.delete(event.data.id);
      entry?.resolve(event.data.samples);
    };
    // A worker that cannot load hands its jobs back to idle moments.
    worker.onerror = () => {
      worker?.terminate(); worker = null;
      for (const [id, entry] of pending) { pending.delete(id); whenIdle(entry); }
    };
  } catch { worker = null; }
  return worker;
}

/** Make one of the field's sounds without blocking a frame. */
export function fieldSynth(job: FieldSynthJob): Promise<Float32Array> {
  return new Promise(resolve => {
    const entry = { resolve, job };
    const made = typeof Worker === 'function' ? synthWorker() : null;
    if (!made) { whenIdle(entry); return; }
    const id = nextId++;
    pending.set(id, entry);
    made.postMessage({ id, job });
  });
}
