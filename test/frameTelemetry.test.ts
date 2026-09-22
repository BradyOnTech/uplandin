import { describe, expect, it } from 'vitest';
import { FrameTelemetry } from '../src/three/frameTelemetry';

describe('bounded gameplay measurement windows', () => {
  const render = { calls: 80, triangles: 9000 };
  const resources = { geometries: 40, textures: 6 };
  const frame = (telemetry: FrameTelemetry, ms: number, counts = resources, visible = true) =>
    telemetry.record(ms, 1, 2, 3, render, counts, visible);

  it('resets away startup/warm-up and reports growth from the route start', () => {
    const telemetry = new FrameTelemetry();
    frame(telemetry, 16); frame(telemetry, 900);
    telemetry.reset('cattail-dense-route', 2000, resources);
    frame(telemetry, 200); // Partial interval crossing the reset boundary.
    frame(telemetry, 16, { geometries: 45, textures: 7 });
    frame(telemetry, 20, { geometries: 41, textures: 6 });
    const report = telemetry.snapshot(2100);
    expect(report.label).toBe('cattail-dense-route');
    expect(report.frameMs).toMatchObject({ samples: 2, mean: 18, max: 20 });
    expect(report.captureMaxMs).toBe(20);
    expect(report.sampledMs).toBe(36);
    expect(report.elapsedWallMs).toBe(100);
    expect(report.resources).toMatchObject({ initial: resources, peak: { geometries: 45, textures: 7 }, netChange: { geometries: 1, textures: 0 } });
  });

  it('keeps recent percentiles and maximum consistent when the ring wraps', () => {
    const telemetry = new FrameTelemetry(3);
    telemetry.reset('long-route', 0, resources);
    frame(telemetry, 16);
    for (const ms of [150, 60, 35, 10, 20, 30]) frame(telemetry, ms);
    const report = telemetry.snapshot(1000);
    expect(report.frameMs).toMatchObject({ samples: 3, p50: 20, p95: 30, max: 30 });
    expect(report.retainedDurationMs).toBe(60);
    expect(report.framesRecorded).toBe(6);
    expect(report.captureMaxMs).toBe(150);
    expect(report.longFrames).toEqual({ over33_33Ms: 3, over50Ms: 2, over100Ms: 1 });
    expect(report.cpuMs.renderSubmission.p50).toBe(3);
  });

  it('does not call a pause or background resume gap a gameplay stall', () => {
    const telemetry = new FrameTelemetry();
    telemetry.reset('chukar-climb', 0, resources);
    frame(telemetry, 16); frame(telemetry, 17);
    telemetry.breakContinuity();
    frame(telemetry, 20000); frame(telemetry, 18);
    frame(telemetry, 1000, resources, false);
    frame(telemetry, 4000); frame(telemetry, 19);
    frame(telemetry, NaN); frame(telemetry, 16); frame(telemetry, 20);
    const report = telemetry.snapshot(30000);
    expect(report.frameMs.samples).toBe(4);
    expect(report.frameMs.max).toBe(20);
    expect(report.excludedIntervals).toBe(6);
    expect(report.longFrames.over50Ms).toBe(0);
  });
});
