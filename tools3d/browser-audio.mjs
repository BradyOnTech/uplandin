/** Opt-in observation of a page's WebAudio destination mix. No microphone,
 * external samples, context resume, game globals or sound settings are used. */
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function prepareBrowserAudioCapture(page) {
  const directory = mkdtempSync(join(tmpdir(), 'quail-audio-'));
  const segments = new Map();
  const errors = [];
  const binding = `__quailAudio_${Date.now()}`;
  await page.exposeFunction(binding, (message) => {
    if (message.type === 'error') { errors.push(message.message); return; }
    if (message.type === 'start') {
      segments.set(message.id, { ...message, file: join(directory, `${segments.size}.webm`), bytes: 0 });
    } else {
      const segment = segments.get(message.id);
      if (!segment) throw new Error(`Audio segment missing: ${message.id}`);
      if (message.type === 'chunk') {
        const bytes = Buffer.from(message.base64, 'base64');
        appendFileSync(segment.file, bytes);
        segment.bytes += bytes.length;
      } else if (message.type === 'stop') Object.assign(segment, message);
    }
  });
  const installation = await page.evaluateOnNewDocument((binding) => {
    if (typeof AudioNode === 'undefined' || typeof MediaRecorder === 'undefined') return;
    const connect = AudioNode.prototype.connect;
    const disconnect = AudioNode.prototype.disconnect;
    const contexts = new Map();
    const links = new Map();
    const documentId = `${performance.timeOrigin}-${Date.now()}`;
    let armed = false;
    let sequence = 0;
    let pending = Promise.resolve();
    const emit = (message) => {
      pending = pending.then(() => window[binding](message));
      return pending;
    };
    const epoch = () => performance.timeOrigin + performance.now();
    const fail = (error) => { void emit({ type: 'error', message: String(error) }); };
    const start = (capture) => {
      if (!armed || capture.recorder?.state === 'recording') return;
      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error(`Unsupported recorder: ${mimeType}`);
      const recorder = new MediaRecorder(capture.destination.stream, { mimeType, audioBitsPerSecond: 128000 });
      const id = `${documentId}-${sequence++}`;
      capture.recorder = recorder;
      capture.stoppedEpochMs = undefined;
      capture.stopped = new Promise((resolve) => { capture.resolveStopped = resolve; });
      const startedEpochMs = epoch();
      void emit({ type: 'start', id, startedEpochMs, mimeType,
        sampleRate: capture.context.sampleRate, baseLatency: capture.context.baseLatency,
        outputLatency: capture.context.outputLatency, contextStartTime: capture.context.currentTime });
      recorder.addEventListener('dataavailable', (event) => {
        if (!event.data.size) return;
        // Serialize Blob reads as well as binding delivery: WebM chunks must
        // remain in encoder order, including the final stop event.
        pending = pending.then(async () => {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error); reader.readAsDataURL(event.data);
          });
          await window[binding]({ type: 'chunk', id, base64: dataUrl.split(',')[1] });
        });
      });
      recorder.addEventListener('error', (event) => fail(event.error));
      recorder.addEventListener('stop', () => {
        void emit({ type: 'stop', id, stoppedEpochMs: capture.stoppedEpochMs ?? epoch(),
          contextStopTime: capture.context.currentTime }).finally(() => capture.resolveStopped());
      });
      recorder.start(250);
    };
    const captureFor = (context) => {
      let capture = contexts.get(context);
      if (capture) return capture;
      const bus = context.createGain();
      const destination = context.createMediaStreamDestination();
      const analyser = context.createAnalyser(); analyser.fftSize = 2048;
      connect.call(bus, destination);
      connect.call(bus, analyser);
      capture = { context, bus, destination, analyser, samples: new Float32Array(analyser.fftSize), connectionCount: 0 };
      contexts.set(context, capture);
      return capture;
    };
    AudioNode.prototype.connect = function (...args) {
      const result = connect.apply(this, args);
      if (args[0] instanceof AudioDestinationNode) {
        try {
          const output = args[1] ?? 0;
          const linked = links.get(this) ?? new Map();
          if (!linked.has(output)) {
            const capture = captureFor(this.context);
            connect.call(this, capture.bus, output);
            linked.set(output, capture); links.set(this, linked); capture.connectionCount++;
            start(capture);
          }
        } catch (error) { fail(error); }
      }
      return result;
    };
    AudioNode.prototype.disconnect = function (...args) {
      const result = disconnect.apply(this, args);
      const linked = links.get(this);
      if (!linked) return result;
      // Mirror only disconnects that removed a physical destination route.
      // No-argument/output-index disconnect already removes the tee natively.
      const all = args.length === 0;
      const byOutput = typeof args[0] === 'number';
      const destination = args[0] instanceof AudioDestinationNode;
      if (all || byOutput || destination) for (const [output, capture] of linked) {
        if (byOutput && args[0] !== output || destination && args.length > 1 && args[1] !== output) continue;
        if (destination) try { disconnect.call(this, capture.bus, output); } catch (error) { fail(error); }
        linked.delete(output); capture.connectionCount--;
      }
      return result;
    };
    window.__quailAudioEvidence = {
      start() { armed = true; for (const capture of contexts.values()) start(capture); },
      async stop() {
        armed = false;
        const waits = [];
        for (const capture of contexts.values()) if (capture.recorder?.state === 'recording') {
          capture.stoppedEpochMs = epoch(); capture.recorder.stop(); waits.push(capture.stopped);
        }
        await Promise.all(waits); await pending;
      },
      sample() {
        return [...contexts.values()].map((capture) => {
          capture.analyser.getFloatTimeDomainData(capture.samples);
          let squares = 0, peak = 0;
          for (const value of capture.samples) { squares += value * value; peak = Math.max(peak, Math.abs(value)); }
          return { contextState: capture.context.state, currentTime: capture.context.currentTime,
            connectionCount: capture.connectionCount, recorderState: capture.recorder?.state,
            rms: Math.sqrt(squares / capture.samples.length), peak };
        });
      },
      async dispose() {
        await this.stop();
        AudioNode.prototype.connect = connect; AudioNode.prototype.disconnect = disconnect;
        for (const [node, linked] of links) for (const [output, capture] of linked) disconnect.call(node, capture.bus, output);
        for (const capture of contexts.values()) {
          disconnect.call(capture.bus);
          capture.destination.stream.getTracks().forEach((track) => track.stop());
        }
      },
    };
  }, binding);
  return {
    directory,
    async start() {
      await page.evaluate(() => {
        if (!window.__quailAudioEvidence) throw new Error('WebAudio recording is unavailable');
        window.__quailAudioEvidence.start();
      });
    },
    sample: () => page.evaluate(() => ({ epochMs: performance.timeOrigin + performance.now(), mix: window.__quailAudioEvidence?.sample() ?? [] })),
    async stopSegment() { await page.evaluate(() => window.__quailAudioEvidence?.stop()); },
    async stop() {
      await page.evaluate(() => window.__quailAudioEvidence?.dispose());
      await page.removeScriptToEvaluateOnNewDocument(installation.identifier);
      await page.removeExposedFunction(binding);
      if (errors.length) throw new Error(`Audio observation failed: ${errors.join('; ')}; scratch ${directory}`);
      const recordings = [...segments.values()];
      if (!recordings.length || recordings.some((segment) => !segment.bytes || !segment.stoppedEpochMs)) {
        throw new Error(`No complete WebAudio recording; scratch ${directory}`);
      }
      return recordings;
    },
    cleanup() { rmSync(directory, { recursive: true, force: true }); },
  };
}
