/** Makes the field's long sounds off the main thread (fieldSynth.ts). */
import { runFieldSynth, type FieldSynthJob } from './fieldSynthJobs';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; job: FieldSynthJob }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};
scope.onmessage = event => {
  const samples = runFieldSynth(event.data.job);
  scope.postMessage({ id: event.data.id, samples }, [samples.buffer]);
};
