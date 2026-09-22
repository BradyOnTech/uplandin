import type { Engine } from './engine';

export interface PerformanceCaptureOptions {
  engine: Pick<Engine, 'telemetry' | 'resetTelemetry'>;
  /** Active hunt/route values, not next-hunt choices from the Pause menu. */
  context: () => Record<string, unknown>;
  /** Commit plus patch identifier for local builds; optional in deployed builds. */
  buildId?: string;
}

function browserMetadata() {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const win = typeof window === 'undefined' ? undefined : window;
  return {
    userAgent: nav?.userAgent ?? null,
    platform: nav?.platform ?? null,
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    touchPoints: nav?.maxTouchPoints ?? null,
    viewport: win ? { width: win.innerWidth, height: win.innerHeight, dpr: win.devicePixelRatio } : null,
    displayMode: win?.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser',
  };
}

function navigationTiming() {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null;
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (!entry) return null;
  return {
    type: entry.type, responseEndMs: entry.responseEnd,
    domContentLoadedMs: entry.domContentLoadedEventEnd, loadEventMs: entry.loadEventEnd,
    transferBytes: entry.transferSize, encodedDocumentBytes: entry.encodedBodySize,
  };
}

/** Opt-in diagnostics bridge. Creates no HUD, timer, observer, or background network request. */
export function createPerformanceCapture(options: PerformanceCaptureOptions) {
  let startContext: Record<string, unknown> | null = null;
  let startDevice: ReturnType<typeof browserMetadata> | null = null;
  let startedAt: string | null = null;

  function snapshot() {
    return {
      schema: 'uplandin-performance-v1',
      capturedAt: new Date().toISOString(), startedAt,
      build: {
        id: options.buildId ?? import.meta.env.VITE_BUILD_ID ?? null,
        modulePaths: typeof document === 'undefined' ? [] : Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'), script => new URL(script.src).pathname),
        mode: import.meta.env.MODE,
      },
      device: browserMetadata(), startDevice,
      navigation: navigationTiming(),
      startContext, context: options.context(),
      telemetry: options.engine.telemetry(),
      interpretation: {
        frameWindow: 'Percentiles describe the most recent retained frames. Whole-capture counters and elapsed time are separate.',
        cpu: 'Fixed/update/renderSubmission measure CPU wall time, not GPU execution time.',
        resources: 'Geometry/texture numbers count renderer objects, not GPU memory bytes. Net growth is diagnostic, not proof of a leak.',
        device: 'User agent and viewport do not establish physical phone, thermal or touch-play acceptance.',
      },
    };
  }

  return {
    start(label: string) {
      // Keep the initial route/pose immutable even if the caller reuses an object.
      startContext = JSON.parse(JSON.stringify(options.context())) as Record<string, unknown>;
      startDevice = browserMetadata();
      startedAt = new Date().toISOString();
      options.engine.resetTelemetry(label.trim() || 'manual');
    },
    snapshot,
    download() {
      const report = snapshot();
      const json = JSON.stringify(report, null, 2);
      if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return json;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `uplandin-performance-${report.capturedAt.replace(/[:.]/g, '-')}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Give mobile browsers time to hand off the download before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return json;
    },
  };
}

export type PerformanceCapture = ReturnType<typeof createPerformanceCapture>;
