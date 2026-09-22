import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPerformanceCapture, type PerformanceCaptureOptions } from '../src/three/performanceCapture';

afterEach(() => vi.unstubAllGlobals());

describe('portable opt-in performance reports', () => {
  it('preserves the initial route, resets the engine window and exports without browser-only APIs', () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('performance', {});
    const route = { area: 'chukar-ridge', camera: { x: 10 } };
    const resetTelemetry = vi.fn();
    const engine = { resetTelemetry, telemetry: () => ({ quality: 'lite', measurement: { framesRecorded: 50 } }) } as unknown as PerformanceCaptureOptions['engine'];
    const capture = createPerformanceCapture({ engine, context: () => route, buildId: 'test-commit+telemetry' });
    expect(capture.snapshot().startedAt).toBeNull();
    capture.start('  west climb  ');
    route.camera.x = 20;
    const report = JSON.parse(capture.download());
    expect(resetTelemetry).toHaveBeenCalledExactlyOnceWith('west climb');
    expect(report.startContext.camera.x).toBe(10);
    expect(report.context.camera.x).toBe(20);
    expect(report.navigation).toBeNull();
    expect(report.build.id).toBe('test-commit+telemetry');
    expect(report.telemetry.measurement.framesRecorded).toBe(50);
  });
});
