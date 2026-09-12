# Pheasant world and presentation batch

The approved batch covers world art, South Slough and Old Homestead locations, pheasant flush presentation, and first-person gun/hands. Implementation and internal review are complete. This is a scoped improvement checkpoint; the broader complete-game benchmark in `production-goal.md` remains unaccepted.

**World art**

Broad, closed polygonal canopy masses replace the small irregular octahedron clusters. Mature shelterbelt crowns spread laterally with visible branch structure; per-belt planting seeds prevent a new location from reshuffling unrelated tree groups. A shared palette coordinates pale dry straw, cooler standing/wet ground, weathered bark and autumn foliage. Daylight and evening light preserve those differences. The maintained farmyard has its own softly edged packed-earth paint and no standing vegetation.

Trees remain instanced using the existing material batches. Windbreak foliage increases from 384 to 432 triangles per tree; cottonwood crown geometry increases from 160 to 240 triangles per instance. Vegetation density and height remain identical between quality tiers. No new texture download or lighting pass was introduced.

**South Slough and Old Homestead**

South Slough retains connected dense shoreline cover with a north neck leading into the farm windbreak. An eastern headland circuit gives the hunter an open approach to its farther edge. The farm has a three-sided shelterbelt, a cut interior, a maintained yard, and routes along its inside and outside edges. The main route no longer passes through the barn collision area. Existing West Pothole geometry is preserved.

The barn has grounded foundations, gables, roof panels and a cupola, accompanied by one independently grounded grain bin. The farm grouping remains one draw. Its visible walls, roof and bin now obstruct shots, while movement uses the corresponding footprint obstacles. Shared helpers supply the real habitat, cut ground, survey, plant exclusions and landmarks.

An independent audit found zero plant roots or tree trunks inside the yard, identical property tree positions from both entries, at least 4.26 metres between route centers and actual tree collision boundaries, and at least 13.59 metres of clearance from pond/farm obstacles. Controlled runner checks cross the Slough/farm seam in both directions without forcing a flush.

**Flush presentation**

Stem-release sound remains at the departure point while wing wash and rooster calls move with the bird. Wing pulses follow the same accelerating power-stroke phase used by the rendered animation. The sound lasts 1.55 seconds and recedes with the bird. Deterministic cosmetic variation includes silent roosters; hens never cackle. Local vegetation crown height supplies the released stems' launch height. Existing flight/encounter variation and cover-disturbance behavior are preserved.

Two short mono buffers and two spatial panners replace 21 scheduled tone/noise sources. Voices stop when a bird is hit and release their nodes afterward. No subjective listening acceptance is claimed: generated audio was checked for routing, timing, sample integrity and recording, and is still synthesized sound.

**First-person gun and hands**

Steel and walnut use restrained highlights and broad planes. The mounted action sits lower with a reshaped grip, while the bead remains on the camera's shot ray. Reloads use a shell-holding hand, insertion, and a return to the forend. Pump/bolt movement follows the shot event. Exact damped recoil integration fixes a forward kick on slow frames and agrees across 10–120 FPS and uneven steps. Ammunition, cooldowns, travelling shots and input rules are preserved.

The pump remains 16 draws idle and 18 while loading; geometry is 3,212 triangles idle and 3,028 during insertion. Staged desktop and landscape-phone views preserve bead alignment. These establish presentation and functional consistency, not unassisted aiming feel or actual phone performance.

**Verification and evidence**

Implementation checkpoints are `604cbe6` (locations), `9d832e2` (world art), `bbc99f8` (flush presentation), and `44e0ab8` (gun/hands). These are local commits on the existing `3d` branch; no push was performed.

The combined suite passed 691 tests in 94 files. Type checking, production build and diff checks passed. The existing large-bundle warning remains. The full-property cleanup test initially exceeded its default five-second limit under suite concurrency; it now shares the existing standing-cover test's 15-second functional-test allowance. Route/cover distance sampling also avoids repeated square roots and remote segment projections during world construction. This is not a measured mobile-loading claim.

Retained world views are `output/playwright/batch-world-{west,south,homestead}-final.png`, together with `homestead-front.png`, `homestead-inner-field.png`, `slough-live-shore.png`, `slough-headland.png`, and `south-locations-survey.png`. World captures collected no page errors. The early Homestead camera in the wet margin was replaced with a dry-yard position; its before/first-art image is not a matched final comparison.

`output/playwright/pheasant-flush-integrated-{high,lite}.webm` records controlled 12-metre launches with field vegetation, debris and audio. Both tiers share the same flight position at 2.4 seconds; debris pools are bounded at 112/56 and expire. `shotgun-motion-after.mp4`, `shotgun-{carry,mount,reload}-final.png` and corresponding `-phone.png` files document staged weapon motion and layout. These are internal component/integration reviews, not a complete ordinary hunt.

The app's goal tracker retained an earlier unfinished broader goal and rejected creation of a replacement. The approved batch was therefore executed and recorded here without marking that broader goal complete.
