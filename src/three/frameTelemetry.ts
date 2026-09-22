/** Bounded, allocation-free recording. Sorting happens only when a report is requested. */
const FIELDS = ['frameMs', 'fixedMs', 'updateMs', 'renderCpuMs', 'calls', 'triangles'] as const;
type Field = typeof FIELDS[number];
export interface ResourceCounts { geometries: number; textures: number }
export interface RenderCounts { calls: number; triangles: number }

export function sampleSummary(values: number[]) {
  values.sort((a, b) => a - b);
  const count = values.length;
  const pick = (p: number) => values[Math.max(0, Math.ceil(count * p) - 1)] ?? 0;
  const sum = values.reduce((total, value) => total + value, 0);
  return { samples: count, mean: count ? sum / count : 0, p50: pick(.5), p95: pick(.95), p99: pick(.99), max: values[count - 1] ?? 0 };
}

export class FrameTelemetry {
  private fields: Record<Field, Float64Array>;
  private cursor = 0;
  private count = 0;
  private total = 0;
  private sampledMs = 0;
  private captureMaxMs = 0;
  private over33Ms = 0;
  private over50Ms = 0;
  private over100Ms = 0;
  private excluded = 0;
  private skipInterval = true;
  private label = 'startup';
  private startedAtMs = 0;
  private initial: ResourceCounts = { geometries: 0, textures: 0 };
  private current: ResourceCounts = { geometries: 0, textures: 0 };
  private peak: ResourceCounts = { geometries: 0, textures: 0 };

  constructor(readonly capacity = 3600) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Telemetry capacity must be a positive integer');
    this.fields = Object.fromEntries(FIELDS.map(key => [key, new Float64Array(capacity)])) as Record<Field, Float64Array>;
  }

  reset(label: string, nowMs: number, resources: ResourceCounts): void {
    this.cursor = this.count = this.total = this.sampledMs = this.captureMaxMs = 0;
    this.over33Ms = this.over50Ms = this.over100Ms = this.excluded = 0;
    this.label = label;
    this.startedAtMs = nowMs;
    this.initial = { ...resources };
    this.current = { ...resources };
    this.peak = { ...resources };
    this.skipInterval = true;
  }

  /** A pause, hidden tab or reset makes the next RAF interval incomplete. */
  breakContinuity(): void { this.skipInterval = true; }

  record(frameMs: number, fixedMs: number, updateMs: number, renderCpuMs: number, render: RenderCounts, resources: ResourceCounts, visible = true): void {
    if (!visible || !Number.isFinite(frameMs) || frameMs <= 0) {
      this.excluded++;
      this.skipInterval = true;
      return;
    }
    if (this.skipInterval) {
      this.skipInterval = false;
      this.excluded++;
      return;
    }
    const i = this.cursor;
    this.fields.frameMs[i] = frameMs;
    this.fields.fixedMs[i] = fixedMs;
    this.fields.updateMs[i] = updateMs;
    this.fields.renderCpuMs[i] = renderCpuMs;
    this.fields.calls[i] = render.calls;
    this.fields.triangles[i] = render.triangles;
    this.cursor = (i + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.total++;
    this.sampledMs += frameMs;
    this.captureMaxMs = Math.max(this.captureMaxMs, frameMs);
    if (frameMs > 1000 / 30) this.over33Ms++;
    if (frameMs > 50) this.over50Ms++;
    if (frameMs > 100) this.over100Ms++;
    this.current.geometries = resources.geometries;
    this.current.textures = resources.textures;
    this.peak.geometries = Math.max(this.peak.geometries, resources.geometries);
    this.peak.textures = Math.max(this.peak.textures, resources.textures);
  }

  snapshot(nowMs: number) {
    const summaries = Object.fromEntries(FIELDS.map(key => [key, sampleSummary(Array.from(this.fields[key].subarray(0, this.count)))])) as Record<Field, ReturnType<typeof sampleSummary>>;
    return {
      label: this.label, startedAtMs: this.startedAtMs, elapsedWallMs: Math.max(0, nowMs - this.startedAtMs),
      framesRecorded: this.total, excludedIntervals: this.excluded,
      sampledMs: this.sampledMs, averageFps: this.sampledMs ? this.total * 1000 / this.sampledMs : 0,
      retainedFrames: this.count, capacity: this.capacity,
      retainedDurationMs: summaries.frameMs.mean * this.count,
      // All percentiles/maxima below use the same bounded recent frame window.
      frameMs: summaries.frameMs,
      cpuMs: { fixed: summaries.fixedMs, update: summaries.updateMs, renderSubmission: summaries.renderCpuMs },
      renderWork: { calls: summaries.calls, triangles: summaries.triangles },
      // These counters cover the entire capture, even after the recent window wraps.
      captureMaxMs: this.captureMaxMs,
      longFrames: { over33_33Ms: this.over33Ms, over50Ms: this.over50Ms, over100Ms: this.over100Ms },
      resources: {
        units: 'renderer object counts, not GPU memory bytes',
        initial: { ...this.initial }, current: { ...this.current }, peak: { ...this.peak },
        netChange: { geometries: this.current.geometries - this.initial.geometries, textures: this.current.textures - this.initial.textures },
      },
    };
  }
}
