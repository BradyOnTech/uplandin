# Mobile performance capture

The game now has an opt-in route recorder for comparing real phone sessions and desktop baselines. It records frame timing, CPU phase timing, renderer work, resource counts and build/device context without adding a permanent field HUD. This checkpoint improves measurement; it does not claim a phone speed increase.

**Capture on a phone**

1. Add `&diagnostics=1` to a hunt URL that already has query parameters, or `?diagnostics=1` to `index3d.html`. Select the property, entry, quality and challenge to compare.
2. Enter the field and let loading and the first view settle. Walk to the start of the route. Pause, open **Performance capture**, and give the route a recognizable name, such as `Cattail west pothole dense cover`.
3. Choose **Start capture and play**, then play the same route for each comparison. Include mounting, tracking, a flush and recovery when measuring a full hunting route. Keep orientation, quality and sight setting consistent.
4. Pause and choose **Save report**, or save from Performance capture in the completed hunt results. The JSON contains the active hunt choices and camera/route context. A fresh capture clears prior samples without restarting or changing the hunt.

For sustained phone acceptance, record the phone model and OS separately, keep the same browser/installed mode, and play for 10–15 minutes. Save reports early and late in that session to reveal heating-related degradation. Browser emulation cannot close this check. Do not compare a cold start with a warmed-up route or mix portrait and landscape in one comparison.

**What the numbers mean**

- `telemetry.frameMs` and `measurement.cpuMs` describe the latest 3,600 retained, visible, unpaused gameplay frames. Their percentiles and maximum use the same window. At 60 FPS that covers approximately one minute; at 30 FPS, two minutes.
- `measurement.framesRecorded`, `sampledMs`, `averageFps`, `captureMaxMs` and `longFrames` cover the entire capture. They remain available after the recent window wraps. `elapsedWallMs` includes time paused; `sampledMs` does not. Long-frame thresholds are strictly greater than 33⅓, 50 and 100 ms.
- `cpuMs.fixed`, `update` and `renderSubmission` measure CPU wall time. Render submission includes the world and view-model overlay. These are not GPU execution measurements and do not add up to the RAF interval when the browser is waiting for its next frame.
- `renderWork` reports draw calls and submitted triangles across the measured frames. `resources` reports geometry/texture object counts, their starting and ending values, peak counts, and net changes. These are not GPU-memory bytes. A newly visible object can allocate a renderer resource without being a leak.
- Loading uses `loading.systemsReadySinceNavigationMs`, plus navigation timing where the browser provides it. It is separate from route timing and is not a first-visible-frame or cold-network guarantee.
- The report includes browser/device hints, viewport, actual backing resolution, active hunt context and entry-module paths. Production module hashes identify an artifact; `VITE_BUILD_ID` or the helper's explicit `buildId` can add a commit/patch label. Development module paths alone do not identify an immutable build.

Reset, pause and visibility changes discard the next partial interval so a background/resume gap is not reported as a gameplay stall. A long frame during uninterrupted visible play remains in the data. The recorder performs no per-frame sorting or object allocation; summaries are computed when a report is requested.

**Developer API**

Only `?diagnostics=1` exposes `window.__performance3d` and the menu controls. The bridge offers `start(label)`, `snapshot()` and `download()`. `download()` saves JSON in a browser and returns the JSON string. It does not send telemetry to a server.

`Engine.resetTelemetry(label)` starts a fresh window. Existing `Engine.telemetry()` fields remain available; `measurement` and `loading` add the richer report. `createPerformanceCapture({ engine, context, buildId? })` is the standalone adapter. `context` should return serializable active-hunt metadata. The starting context is copied so later movement does not rewrite the start of a route.

**September 22 baseline**

A frozen source snapshot of `201a8098f3d1cbcc4edb5a465f6e42b2739197c9`, with only the telemetry instrumentation and a debug engine hook added, was served at isolated port 4627. Start/end source hashes matched. Other agents' evolving gameplay and map code were not part of these measurements, and the user's port 4593 build was untouched.

The host was Chrome headless on an Apple M1 Pro using ANGLE Metal, with a touch viewport of 932 × 430 CSS pixels at requested DPR 2. Lite rendered at 1413 × 652, DPR approximately 1.516. These are development-server desktop measurements, not physical-phone, production-loading or thermal evidence.

Each property had three page-load replays of the same seed 48320, morning light, generated GSP and Balanced challenge. After a recorded camera placement and three-second warm-up, each run used twelve seconds of actual forward movement, approximately 26.4 metres. Cattail started in the dense dry finger beside West Pothole; Chukar started at world `(0, 40)`, facing the southern climb at yaw −24°. No flush was forced. Separate six-second CPU profiles were taken after the unprofiled timing windows.

| Property, Lite | Frame p95 across three runs | Update CPU p95 | Render submission CPU p95 | Mean draw calls | Mean submitted triangles | End resources, every replay |
| --- | --- | --- | --- | --- | --- | --- |
| Cattail Coverts | 16.7 ms | 0.9–1.5 ms | 2.4 ms | 130–131 | 726k–727k | 130 geometries, 5 textures |
| Chukar Ridge | 16.7–16.8 ms | 0.7–0.8 ms | 1.6–2.1 ms | 179 | 521k | 139 geometries, 5 textures |

No page errors occurred. Resource endpoints did not increase across the three replays. Each walking window did first expose additional resources: one geometry in Cattail and six in Chukar, consistently across replays. This is a bounded replay result, not proof against all resource leaks.

The largest sampled active CPU work was Three.js world-matrix propagation and multiplication. Cattail's next prominent application cost was cover updating; Chukar's was environment updating. Both runs were largely idle between frames and sustained approximately 60 FPS on this desktop. This does not reproduce the reported phone slowdown. There is no demonstrated engine-level bottleneck here that justifies reducing habitat density, changing simulation timing or adding adaptive resolution. No such optimization was retained.

Raw reports, screenshots, CPU profiles, source hashes and the reproduction script are under `output/blitz-performance/`; `summary.json` is the compact table source. The screenshots confirm the dense cover and hunter-height climb used for the measurements. The Chukar route was not a full flush/recovery benchmark; that remains part of the integrated follow-up.

**Next measurement**

Use the recorder on the user's physical phone in the accepted Cattail habitat and the integrated Chukar route. If visible frame time rises while update and render-submission CPU times stay low, investigate GPU cost and device behavior before cutting CPU code. If CPU time dominates, reserve the measured subsystem and compare one concrete change against a frozen baseline. World-matrix work is a lead to profile, not permission to freeze animated objects globally. Keep the same habitat, species presentation and simulation for the comparison.

Focused validation: `test/frameTelemetry.test.ts`, `test/performanceCapture.test.ts` and `test/engineLifecycle.test.ts` passed, eight tests total. They cover reset/warm-up separation, ring wrap, whole-capture counters, pause/background exclusions, resource growth, stable starting context, browser-API fallbacks and engine lifecycle behavior. Physical-device acceptance remains open.
