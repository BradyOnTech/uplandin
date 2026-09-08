# Quail Fields production slice

The first production slice is one complete, cohesive 3D hunt in Quail Fields: arrival, searching, scent recognition, point, walk-in, bobwhite flush, shot or miss, fall, retrieval, delivery, summary, and replay. The dog is the central character, and Quail Fields remains the calibration property. The broader world now carries authored species doctrines across the property roster; every map must feel like its own hunt through habitat, routes, dog work, bird behavior, and flight. This document governs the approved 3D work; `docs/PRODUCTION.md` remains the historical 2D roadmap.

**Scope and art direction**

One liver-and-white German Shorthaired Pointer, bobwhite quail, one primary daylight treatment for the calibration slice, one shotgun, and the whole Quail Fields property from both existing drops. Preserve other content and the shared simulation. Additional authored properties may receive broad world passes, but they must preserve the species-specific doctrine instead of becoming palette-only reskins.

Use Firewatch's deliberate color, atmosphere, and silhouettes with Pinetrail's connected terrain and plant groupings. Build an illustrated Southern Plains landscape: ochre grasses, olive brush, pale earth, weathered wood, warm light, and cool distance. Economical geometry may use smooth animal surfaces and restrained painted textures. Avoid tiny uniform stubble, randomly scattered hero objects, and camera-dependent art fixes.

The user's September 4 visual feedback rejected the first replacement dog's cartoonish appearance. The target is an athletic adult GSP with realistic anatomy and economical surfaces. Preserve the supplied dog's breed identity and coat. Match the skull/muzzle relationship, shoulder and chest structure, muscular thighs, compact paws, and purposeful movement; do not exaggerate the forehead, eyes, mouth expression, or gait bounce. Review static source/model comparisons before accepting further animation polish.

The user subsequently confirmed a pause on dog visuals and asked to focus on the world, map and terrain. Preserve the current dog checkpoint during these environment milestones; resume dog art only when the user returns to that decision. This changes the current work order, not the full production slice's eventual acceptance requirements.

On September 5 the user explicitly sidelined dog anatomy/animation, controls, sound integration and game flow for a later phase. The active phase is world, terrain, vegetation, materials, lighting and props, with browser performance and mobile cost kept in view. Establish the visual quality first at South Gate arrival and its nearby hunting cover, using the normal gameplay camera and movement, before expanding further art changes across the property. Narrow presentation adapters such as moving the visible truck and its indicator together remain part of the environment work; hunting behavior remains unchanged.

**Milestones and evidence**

| Milestone | Required result | Evidence | State |
| --- | --- | --- | --- |
| Baseline | Normal gameplay and diagnostic previews distinguished; failed GSP point capture explained | Reproduction, regression, ordinary-camera captures | Diagnosed; parity and blank-capture guards verified |
| Dog source pipeline | Clean connected skinned mesh, deliberate weights, canine rig, authored clips, distance variants, preserved original | Editable Blender source, export script, asset manifest, multi-angle and motion review | Revised adult GSP frozen for comparison; canonical Rigify controls and nondestructive three-LOD export verified. Runtime clips remain scripted and visual quality is below target; see the build-or-buy assessment |
| First playable section | New dog, terrain, cover and daylight work together along a short actual hunting route | Continuous normal gameplay, no staged state substitutions | Functional opening and complete hunts recorded from both drops; art acceptance remains open |
| Whole property | Terrain covers the property; trail/drainage/cover/landmark geography remains stable from both drops | Route traversal, map comparison, shared-world tests | Shared survey relief and windmill bypass align with 3D; named 1.40 km ordinary-input loop passes. Later build 4533 joins entrance fencing and track branches, grounds near/far roads, and passes both entrance walks. Environment checkpoint 4536 adds fuller near cover, terrain-fitted grass detail levels, faceted crowns and an unobstructed roadside pickup; close asset repetition and terrain detail seams remain provisional |
| Environment art phase | South Gate arrival and nearby cover establish a reusable low-poly field treatment | Matched High/Lite views, ordinary approach walks, geometry/resource audits | Reviewable 4536 build passes 396 tests; art acceptance and physical mobile validation remain open. See the [environment checkpoint](quail-environment-review/README.md) |
| Complete hunt | Bird/shotgun/audio/UI/loading/summary/replay match the slice | Complete hit and miss hunts and retrieval/delivery | Presentation checkpoint 4528 passes complete hunts from both drops; folded bobwhite corrected. Recorded audio passes pause/mute/replay checks, while perceptual sound quality remains unreviewed |
| Browser hardening | Pause/resume, input, failures, repeat hunts, saves, offline loading | Browser runs and targeted regression checks | Named snapshots pass pause/context, graphics fallback, loading lifetime and isolated Career/Quick persistence. The stronger offline network-boundary test also passes cold menu fallback, cached 3D relaunch and online 2D preservation |
| Performance/mobile | Defined desktop resolution/device and lighter tier; usable touch controls | Frame-time measurements, sustained named-device checks | Presentation checkpoint 4528 completed a High hunt at 1920×1080 in default headed Chrome 148 on M1 Pro without recording; rolling timing window has headroom but a 150 ms maximum outlier. Active-rise touch emulation passes on its earlier snapshot; sustained thermal and physical mobile evidence remain unavailable |

The user later resumed the environment phase and widened it to the authored property roster. The current work order is world, terrain, vegetation, materials, lighting, props, and species-specific hunting geography. Dog anatomy and animation, controls, sound integration, game flow, and browser/test validation remain deliberately deferred until the environment direction is approved.

**Authoring contracts**

These milestone states summarize separate named snapshots, not a blanket pass for later changes. Evidence is linked in [the environment art checkpoint](quail-environment-review/README.md), [the access and track checkpoint](quail-access-review/README.md), [the world, map and ground checkpoint](world-ground-review/README.md), [the species hunting doctrine](hunting-doctrine.md), [the presentation checkpoint](presentation-validation/README.md), [validation baseline](validation-baseline.md), [offline preservation](offline-preservation.md), [Rigify export workflow](gsp-rigify-workflow.md), and [dog asset decision](dog-build-or-buy.md). The current dog is a working prototype; its export and footfall checks do not establish production-quality anatomy or performance.

`src/game` remains authoritative for hunt decisions, scoring, bird state, and career progression. Landscape property coordinates are shared by the map and both renderers. Rendering detail must not change cover or hunting rules. A GLB clip must never drive authoritative world translation.

Preserve `GSP-liver-white.glb`. The source audit found 1,500,000 triangles, 807,802 vertices, three 4096px textures, no skin and no clips. Rebuild a clean deformation-friendly game mesh from the source reference when dog work resumes. Decimation plus automatic weights alone is not an accepted finish. Preserve editable `.blend` source and repeatable export alongside runtime assets. Document clips, nominal speeds, bones, contacts and asset sizes.

**Quality gates**

- [ ] Normal gameplay uses the same camera, dog setup and motion as evidence captures.
- [x] Both truck drops describe the same property and can complete a hunt.
- [ ] GSP is convincing from front, rear and side in motion, on slopes, at starts/stops, and throughout search-to-point and retrieve transitions.
- [ ] No prominent foot drift, joint collapse, missing terrain, floating props, abrupt vegetation changes or prototype material mismatch along the route.
- [x] Shot and miss use real input and real hit resolution. Synthetic hit hooks are labeled diagnostic and cannot prove shooting.
- [x] Bird reaches the dog mouth and delivery credit occurs through shared simulation.
- [ ] Loading, pause, context interruption, replay, save behavior and cached assets work in a production build.
- [ ] Desktop target: 60 fps at a documented 1920×1080 backing resolution on a named browser/device; report frame-time percentiles and outliers.
- [ ] Lite target: 30 fps on named mobile devices, with touch movement/look/aim/fire/reload/recall and sustained runtime. Emulation is not real-device proof; report unavailable checks explicitly.
- [x] Tests and build pass, while visual and runtime evidence are reviewed independently.

**Current baseline**

The review on 2026-09-04 found 305 passing tests and a successful build. The GSP `gameplay-point` capture did not reach its expected state in 30,000 ticks and reported two support paws about 0.10m above terrain. The capture harness used 960×540, sometimes changed field of view from 70 to 40 degrees, ignored a `--quality` option, and used capture-specific spawn/movement behavior. These observations establish incomplete validation, not proof of a broken entire hunt. The current environment pass is intentionally being iterated without new browser or test validation until its visual direction is approved.

**Sources**

- [Pinetrail official Steam presentation](https://store.steampowered.com/app/4920240/Pinetrail/)
- [Firewatch official presentation](https://www.firewatchgame.com/)
- `docs/DESIGN.md`, `docs/3d/shared-hunt-simulation-plan.md`, `docs/3d/canine-locomotion-research.md`
