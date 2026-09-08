# Uplandin 3D engine contract

Uplandin uses one hunting simulation with two presentations. `src/game` owns dog decisions, bird outcomes, hunting rules, careers and progression. Phaser presents the original 2D game; Three.js presents the field in first person. The active art milestone is the Quail Fields slice described in [PRODUCTION-SLICE.md](docs/3d/PRODUCTION-SLICE.md). Other maps and dog appearances remain available through their existing presentation.

**Art direction and scope**

Quail Fields targets an illustrated Southern Plains landscape: warm oat grass, cooler sage sward, pale two-track ruts, weathered farm landmarks, deliberate plant groupings and layered distance. Firewatch supplies the color/composition reference; Pinetrail supplies the connected-world reference. Low-poly geometry may have smooth animal surfaces and restrained painted textures. Flat shading on every object is not a quality requirement.

One liver-and-white GSP is the central character. One complete hunt must read convincingly from arrival through scent, point, flush, shot or miss, retrieve, delivery and replay. Passing unit tests or producing one attractive still does not establish production quality.

The dog should retain realistic adult GSP anatomy. The user's review rejected the first replacement's rounded, cartoonish proportions. Simplification belongs in the surface detail and rendering budget; facial expression, limb structure and movement must stay grounded in the source animal.

**Simulation and coordinates**

`gameplayMode.ts` resolves saved Career/Quick Hunt configuration for both presentations. Standalone Quail Fields defaults to the GSP; explicit breed choices and saved career/quick dogs retain their identity. `Hunt3DSystem` routes hunter intent to the shared `HuntSimulation`, maps rendered falls back into authoritative bird locations, and applies career settlement through the shared result path.

Property coordinates are stable across both truck drops. `LandscapeModel` maps those coordinates into hunt-local world metres and exposes one elevation model to the map and both renderers. One property unit corresponds to one yard (0.9144 m). 3D movement presentation scales translate the original screen-space pace; they must remain the same in live and diagnostic modes. Bird rise presentation holds the field dog while the airborne wave resolves, preserving the original scene-cut behavior.

`areas.ts` and `quailLandscape.ts` define the shared Quail property, tracks, drainage, cover and tree stands. Bird habitat remains the shared cover-patch data. Render detail must not create a second set of hunting rules or move the geography when the player changes graphics tier.

**Engine and lifecycle**

`Engine` registers subsystems in dependency order, reports loading progress, runs a 30 Hz fixed simulation and interpolates render positions between ticks. Its pause flag stops both clocks, updates and rendering. Explicit `renderOnce()` is available for initialization, context recovery and labeled diagnostics. Subsystems release their input listeners and GPU resources during disposal.

`main3d.ts` keeps the loading interface outside the asynchronous `boot3d.ts` module so a graphics-constructor failure can display recovery controls. A disposed engine cannot restart when a pending asset load finishes. Initialized systems are released immediately; the pending system is released after its load settles. Explicit rendering does not advance animation or reload time.

`FieldInterface` owns loading/retry, entry, pause, background interruption, graphics-context recovery, touch buttons, preferences and the end-of-hunt transition. Input comes through `PlayerSystem` and `GunSystem`; the UI does not assign bird outcomes. Normal keyboard/mouse and touch express the same movement, aim, fire, reload and recall intent.

The production build fingerprints its shell, dependencies and all GSP runtime assets into `precache.json`. The service worker announces offline availability only after those assets are installed. Launch parameters select the hunt while reusing the same cached shell. Existing 2D art retains background refresh behavior in a separate persistent cache; activation migrates artwork from older shell caches before deleting them. Offline capability still requires browser verification; a manifest is not evidence by itself.

**World presentation**

| System | Responsibility |
| --- | --- |
| `SkySystem` | Sun, sky, hemisphere lighting, fog and time-of-day response, including the Quail morning treatment |
| `TerrainSystem` / `QuailTerrain` | Complete property heightfield, near/far chunks, continued distant ground and terrain queries |
| `QuailEnvironmentSystem` | Deterministic cover, sward, shrubs, tree stands, tracks, fences, wind and distance detail |
| `LandmarksSystem` / `QuailLandmarks` | Shared truck, gate and farm landmarks with collision circles |
| `PlayerSystem` | First-person movement, touch look/movement, property boundaries and solid-object collision |
| `RiggedDogSystem` | The Blender GSP presentation, animation selection, terrain contact and mouth attachment |
| `DogSystem` | Existing appearances outside the new Quail GSP candidate |
| `BirdsSystem` | Species appearance, rise, fall, grounded and carried rendering over shared bird outcomes |
| `GunSystem` | Viewmodel, mount, recoil, reload and shot intent through the established hit-resolution path |
| `HuntHudSystem` | Current hunt state, shell count, wind/truck directions and shared summary/settlement |
| `FieldAudioSystem` | Quiet ambience and the procedural field audio lifecycle |

World placement uses deterministic local random streams. Quality tiers must not change the identity or location of a tree, shrub, track or cover edge. Use instancing and bounded distance detail, avoid unnecessary frame allocations, and verify the visible transitions independently of draw-call counts.

**GSP animation ownership**

The original `GSP-liver-white.glb` is preserved. The editable Blender asset, repeatable exporter, contract validator and diagnostic previews are described in [gsp-asset.md](docs/3d/gsp-asset.md).

The GLB is in metres with +Z forward and +Y up. Its clips have no world translation or yaw authority. `RiggedDogSystem` places the root at the interpolated shared dog position and maps the shared heading onto its forward axis. LODs share a checked joint/primitive ordering, allowing geometry swaps on one live skeleton.

The animation mixer establishes the authored pose. The previous authored pose is explicitly restored before every sample because Three.js may skip writes for unchanged channels; otherwise post-mixer corrections can accumulate during stationary poses. Terrain correction then adjusts only the leg chains within bounded reach. A raised pointing paw is excluded from support locking. Head direction is a small bounded adjustment. `BirdsSystem` follows `MouthSocket` for the carried bird.

Locomotion playback follows measured ground speed. When a scent/carry clip's nominal pace is too slow for authoritative travel, a suitable walk/trot/lope supplies the leg motion and the hunting clip supplies an additive upper-body posture. Start and stop anticipation also affects the upper body, leaving travelling legs under the gait. Animation never slows the simulation to hide contact problems.

**Evidence and performance**

Normal evidence uses the ordinary FOV 70, standard browser frame scheduling, declared graphics quality and real controls. `tools3d/playthrough.mjs` records the complete input-driven hunt and read-only state. Its automatic aiming reads bird positions; this is functional evidence, not a human usability study. `tools3d/capture.mjs` defaults to ordinary arrival/walk/point captures. Historical compositions, controlled-clock captures and asset viewers are explicitly staged diagnostics.

Read-only telemetry reports actual backing resolution, frame-time percentiles, renderer counts, dog clip/contact state and carried-bird positions. Foot drift requires consecutive samples from the same plant identity. A recording's encoded frame rate is not the game's measured frame rate. Uncapped browser runs are diagnostics, not normal-browser performance evidence.

The high tier caps the backing-buffer budget at 1920 × 1080 pixels and targets 60 fps on a documented desktop browser/device. The lite tier caps it at 1280 × 720, lowers detail and targets 30 fps on named physical mobile devices. Touch emulation cannot prove sustained phone performance or thermal behavior. Missing physical-device results must remain explicit.

Run the relevant simulation/adapter tests and the production build after behavioral changes. Verify ordinary gameplay, asset deformation, varied views, both drops, lifecycle/save behavior and measured performance separately. [validation-baseline.md](docs/3d/validation-baseline.md) records what the available evidence actually proves.
