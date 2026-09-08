# World validation checkpoint

The first browser review after re-enabling tests shows a functioning prototype with substantial visual work still required. The Pheasant entry has better horizon structure and grounded paths, but it is not yet a production-quality reference scene.

**Completed in this pass**

- Corrected Pheasant and Chukar trail coordinates that incorrectly contained drop-point objects.
- Corrected the undefined dog casting doctrine reference and two compilation issues in habitat systems.
- Unified Pheasant harvest rows, terrain paint, pond footprints, water elevation, and rooted wet-margin placement.
- Added batched shelterbelt trees and fuller grass blades. Shelterbelts retain the same layout in both quality tiers and add four rendering batches without shadow casters.
- Subdivided shared route surfaces along their length and sampled both shoulders against the terrain. Softened their edges and corrected the direction of Sharptail wheel-rut width.
- Updated obsolete test fixtures after the move from Quail-only flight behavior to spatial encounters across properties. Added actual geometry, route connectivity, pond consistency, and harvest-boundary checks.

**Observed in the browser**

Reviewed Cattail Coverts from the South Gate at midday in Standard and Lightweight display modes on the desktop browser. The path no longer breaks into large floating triangles. Shelterbelts give the distant field boundaries recognizable structure. Lightweight retains those landmarks but loses considerable grass fullness.

The foreground remains too bare and uniformly brown. The distant trees still need more natural grouping and silhouette variation. The dog remains visibly provisional.

The following route pass replaced both pond-crossing entry lines with shoulder approaches, retaining connections through the homestead, fence, and central junction. Sampling every segment verifies a minimum normalized pond radius of 1.2, leaving space outside the main water footprint. Reviewed both entry views and the survey in the browser. The survey now displays Pheasant pond footprints and reed margins at map scale instead of point markers.

The habitat pass removed open-water overlap from shared cover rectangles and added dry grass shoulder strips. Pond radii now have one definition used by the landform, presentation and habitat. The nearest-point geometry check proves whole cover rectangles clear the water envelope; seeded spawning and both gate setups at all challenge levels also remain outside that envelope. Reviewed West Pothole in the field and survey. This proves initial holds, not running-bird or dog pathfinding behavior. All 522 tests and the production build pass at this checkpoint.

The runner pass adds a species-owned ringneck edge turn. When its direct escape leaves cover, a rooster tries oblique and lateral steps that increase its distance from the dog, holding only if none remains covered. Bobwhites keep their previous hold behavior. Movement now checks intermediate points at intervals no greater than one property yard, preventing a long tick from jumping a visible open gap merely because its endpoint falls in another patch. Focused tests cover the species distinction and a gap crossing. This has not yet been assessed in a complete rendered encounter.

**Walk-through findings**

A keyboard-driven South Gate walk reached tracking-runner and on-point states. At roughly 97 yards from the truck, the camera walked down into the pond basin beneath its water plane, obscuring the sky with the dark underside. Added a conservative pond boundary to the existing landmark obstacle provider, which is consumed by hunter and dog movement. Repeated the same sustained keyboard sequence: the hunter remained on the bank and the dog reached a point. The water perimeter is covered by the three-circle boundary in the focused geometry check. Swimming and water retrieves remain unimplemented; this boundary supports dry-land locomotion only.

Before/after images are in `output/playwright/pheasant-shore-approach.png` and `output/playwright/pheasant-shore-collision-after.png`. The close bank view exposes an overly angular water edge and sparse, thin reeds. Prioritize their presentation next. No shot, retrieve, or complete hunt was verified in this walk.

The shoreline art pass replaces independent water-edge spikes with a 96-segment outline driven by broad curves and a narrow alpha margin. Cattail stalks now carry two broad leaves each, preserving their existing instance batches. Seasonal frost/snow patches exclude the pond footprint and sample the terrain at their perimeter vertices. Repeated the same keyboard approach and captured `output/playwright/pheasant-shore-clean-water.png`: the sharp spikes and white patches over water are gone, and near reeds have a fuller silhouette. Compilation and the production build pass. One earlier review logged a 2.60 ms simulation tick against its 2 ms target; no rendering errors were reported. Mobile cost remains unmeasured.

The ground pass reuses the existing 63 KB painted prairie texture as luminance detail over Pheasant's habitat colors. Property-anchored sampling keeps it consistent between gates; two scales and a 24–90 metre fade reduce repetition. It uses mipmaps and tiered anisotropy. Reviewed Standard and Lightweight entry views in `output/playwright/pheasant-painted-ground.png` and `output/playwright/pheasant-painted-ground-lite.png`; visible soil and straw now break up the formerly flat surface. Lightweight vegetation still loses considerable silhouette quality at distance. Optional-texture failure and late-load disposal checks pass, as does the production build.

**Next work, in order**

1. Walk the revised Pheasant approaches from both gates and inspect running-bird and dog behavior around water; entry screenshots and initial-placement checks are not a completed walk-through.
2. Establish one convincing entry-to-cover sequence with better ground litter, grouped vegetation, recognizable wet margins, and varied shelterbelt spacing. Judge it at walking height in both display modes.
3. Walk a complete Pheasant encounter and compare it with Quail and Chukar. Check that route choice, running birds, dog relocation, and escape directions support different decisions.
4. Measure frame cost and loading behavior on representative mobile hardware before making mobile-readiness claims.
5. Continue the deferred dog presentation, controls, audio, and hunt-flow work after the world and encounter reference is convincing.

**Validation limits**

The production build passes. Automated checks cover simulation and geometry contracts; they do not establish visual quality. Desktop inspection of Lightweight mode is not a mobile performance measurement. No complete on-foot encounter or device performance run was performed in this pass.
