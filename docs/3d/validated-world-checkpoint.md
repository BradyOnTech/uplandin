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

The vegetation pass varies shelterbelt spacing, mature-tree breadth, and sapling height without adding batches. Lightweight prairie uses eight broader blades instead of ten narrow ones, with broader cattail leaves as well. Compared both entry views in `output/playwright/pheasant-grouping-lite.png` and `output/playwright/pheasant-grouping-high.png`. Near tufts read more clearly; distant reed aliasing remains. Compilation and build pass.

Desktop browser telemetry at the stationary South Gate: Lightweight reported 140 draws and 197,268 triangles at 1228×750; Standard reported 148 draws and 472,912 triangles at 1842×1125. Both recorded a recent 95th-percentile frame interval around 10.2 ms, over different sample durations. These are scene baselines on this desktop, not a controlled before/after benchmark, phone measurement, GPU-time measurement, or encounter stress test.

**Chukar cross-map review**

The South Gate approach has a clear sidehill and uphill dog behavior, but sparse sage/bunchgrass and dark repeated rock ribs leave the setting unfinished. A 22-second walk followed by observation ended the original hunt with eight birds lost: acreage stocking had supplied only one covey. Added a non-Quail 3D stocking baseline of three expected groups, using the same bird-share to covey-share conversion as spawning. The existing acreage count remains the lower bound, and challenge multipliers still apply. Tests verify another spatially separated opportunity after the opening covey on Chukar, Hun, and Sharptail properties at both gates and all challenges.

Repeated the same Chukar walk: a covey rose, escaped, and the session returned to hunting. Evidence is in `output/playwright/chukar-bench-review.png` before and `output/playwright/chukar-after-opening-escape.png` after. All 530 tests pass. The complete shot/retrieve loop remains unverified; improving the rocky-map vegetation and landform presentation remains necessary.

The first Chukar vegetation pass widens sage leaves and bunchgrass blades, increases shrub body size, varies rib widths and gaps, and adds restrained rock fill light. The first image showed only a modest improvement. Sampling the entry's ground confirmed suitable slopes; the sparse five-metre placement grid was the stronger constraint. Reduced small-plant spacing from 5.4 to 3.8 property yards and compensated rock probabilities to retain their expected density. Existing route and landmark clearances remain in use. The revised entry image is `output/playwright/chukar-bench-planting.png`; it has more visible sage and bunchgrass, but the scene still needs substantial composition work. Standard entry reported 204 draws and 322,970 triangles. Compilation and build pass; no mobile performance conclusion follows from this desktop sample.

The Chukar arrival pass aligns both gate headings with their actual first trail segments. The South Gate previously faced the generic junction rather than the authored northwest switchback. Trailhead props and release direction now follow that route. Narrowed the contour ribbon to 1.6 metres overall, feathered its edges, and reduced small-plant clearance to match. Walked 49 yards up the first leg and captured `output/playwright/chukar-first-switchback.png`: the crest reveals the sidehill and contour path. The rock ribs still resemble rows of upright blocks and require a formation-shape redesign, not another density adjustment. Focused route and opportunity checks pass (24 tests), along with compilation.

The rock-shape pass replaces eleven narrow uprights per formation with up to seven broad ledges, caps their height relative to width, and aligns each long face with the formation. Added stepped bedding rings to the shared low-poly stone geometry. Repeated the 18-second climb and captured `output/playwright/chukar-bedded-ledges.png`; the rows of posts are replaced by low shelves emerging from the slope. The view is more coherent, though it still lacks a strong hero landform and needs broader art review. Compilation passes.

**Grouse woodland structure pass**

The South Gate visual review showed an almost bare hillside. Grouse was using generic habitat with an 11 percent tree chance on a 16-yard grid, leaving widely separated silhouettes rather than close timber. It now uses an eight-yard candidate grid with 68 percent tree probability, thinner pale trunks, varied upright crowns, nearby shrubs and slash, and narrower planting clearance along the route. Both quality tiers preserve the same tree density. Ground colors now favor dry leaf litter, and noon fill is brighter so shade remains readable.

The shared habitat material incorrectly enabled vertex colors on geometry without a color attribute, turning instance colors black. Removed that flag and the redundant non-indexed conversion warning. Shared placement budgets now sample across the full candidate list instead of retaining only its beginning. This cap issue was a general distribution hazard; the sparse Grouse profile was the immediate cause of its empty entry. Hero trunks use their crowns' clearance footprint so one half of a tree cannot be rejected independently.

Woodland instances are grouped into 80-metre rendering cells, with distance limits for trees and shorter limits for ground objects. They share geometry and materials, which are released once on disposal. New checks cover timber in all four property quadrants on both quality tiers, paired crown counts, culling and restoration, and resource cleanup. All 534 tests and the production build pass. The build still reports large bundles.

Reviewed the high-quality South Gate and walked the lightweight West Track for 14 seconds. The latter reported 124 draws and 246,552 triangles at 1228 by 750 pixels, with a sampled 95th-percentile frame interval of 10.2 milliseconds on this desktop. These are not mobile measurements or GPU timings. The console had no warnings or errors. Evidence: `output/playwright/grouse-entry-review.png`, `output/playwright/grouse-timber-noon.png`, and `output/playwright/grouse-west-lite-walk.png`.

The forest now constrains sightlines, but the ground is still too bare, crowns repeat visibly, and this habitat layer does not yet supply tree collision. The walk showed the dog working timber openings; it did not validate a complete grouse flush, shot, and retrieve. Those remain substantive work, alongside the other maps and deferred presentation phases.

**Solid woodland pass**

Grouse habitat now supplies trunk collision circles from the same placements and base radius used for rendering. Both quality tiers retain identical physical trees, including trees whose rendering cells are distant or hidden. The hunter and dog consume these footprints. A shared static spatial index narrows movement checks to nearby obstacles; it also supports existing rock, fence, and pond circles, including large circles spanning several cells.

Added checks for index coverage across negative coordinates and large pond boundaries, actual woodland trunk counts and quality parity, a dog detour around a real tree placement, and a hunter sprint into one. Existing fence tunneling, sliding, prop detour, and retrieval checks remain passing. The full suite passes 537 tests across 75 files, and compilation and the production build pass.

Walked 66 yards from West Track using normal forward input in Lightweight mode. The dog continued working the timber and the world remained responsive. Captured `output/playwright/grouse-solid-timber-walk.png`. The sampled simulation average was about 0.068 milliseconds, with one 2.7-millisecond budget warning; this spike remains recorded. The frame interval's 95th percentile was 10.1 milliseconds on this desktop. No browser errors occurred. This walk does not prove mobile performance, complex forest navigation, or a complete encounter. Forest-floor detail, less repetitive crowns, and a full flush/shot/retrieve review remain next woodland work.

**Woodland floor pass**

Added clustered low fronds and scattered dry leaves using two shared solid geometries, with no transparent texture cards. Placements follow the terrain normal and leave route and entry clearances. Rendering uses 48-metre cells; detail shrinks away between 30 and 42 metres on Lightweight and between 53 and 65 metres on Standard. Ground shading adds restrained fine variation in stable property coordinates. The first ground pattern looked like camouflage in the browser, so its contrast was reduced before checkpointing.

Repeated the West Track walk in both modes. Evidence is `output/playwright/grouse-floor-lite.png` and the final `output/playwright/grouse-floor-restrained.png`. The initial Standard floor view reported 211 draws and 480,164 triangles; Lightweight reported 133 draws and 268,862 triangles. These desktop samples do not establish mobile performance. Compilation and the production build pass. No new tests or full-suite rerun were needed for this art pass; the previous full run remains 537 passing tests. The final browser review had no errors and one 2.2-millisecond simulation-budget warning.

The woodland floor now has recognizable small vegetation and litter, but the fronds remain coarse and the canopy and shrub silhouettes still repeat. This is incremental art progress, not a finished reference hunt. A complete encounter remains unverified.

**Close-timber scent pacing**

The browser dog reached 84 yards while tracking, despite the close-timber search range. Search steering respected the range, but the scent-approach branch did not. For the live woodland range configuration, the dog now pauses a scent approach beyond 1.6 times its effective working radius and resumes within 1.2 times that radius. It retains the scent beat and does not declare an early point. Finished points, retrievals, and other species' tracking remain outside this hold rule. The HUD says `DOG HOLDING SCENT · CLOSE UP` while waiting.

Focused checks cover holding position without losing the scent, resuming into a point, and uninterrupted Pheasant and Chukar tracking. All 540 tests and the production build pass. In the browser, the dog held at 28 yards, resumed when approached, and reached a point at 22 yards. No rise had occurred before that point. The live HUD and telemetry confirmed the point; the screenshot requested afterward was too late and shows the subsequent search, so `grouse-followed-point.png` must not be treated as point-image proof. The hold is captured in `output/playwright/grouse-handler-hold.png`.

The bird escaped before a shot or retrieve was completed. The next encounter review needs continuous recording or tightly timed input through the point-to-rise window. This change improves approach pacing but does not establish a complete reference hunt, and the hold behavior still needs broader judgment across dog training levels.

**Assisted Grouse encounter completed**

A continuous browser action captured the point at 23 yards, mounted the gun through normal right-mouse input, aimed with the development camera-pose helper at the first airborne bird, and fired through normal left-mouse input. One shell was consumed and one bird went down. The dog retrieved it, returned carrying it, delivered it, and resumed searching. The HUD changed from `Bag 0 / Down 1 / Shells 2` to `Bag 1 / Down 0 / Shells 2`. No direct bird-down, flush, or delivery helper was used.

This verifies a connected assisted point/shot/retrieve sequence, not ordinary aiming skill or shooting-window quality. The shot occurred at the start of flight using exact airborne coordinates. The browser had no errors, but recorded a 12.4-millisecond simulation spike and a 216-millisecond maximum frame interval during the instrumented sequence; it is not performance acceptance evidence. Actual point and delivery images are `output/playwright/grouse-point-continuous.png` and `output/playwright/grouse-assisted-delivery.png`.

The encounter images revealed a foreground shrub filling the view like a solid green boulder. Woodland shrubs now use a lower multi-lobe crown instead of the generic dodecahedron. Revisited the exact camera position for a visual comparison in `output/playwright/grouse-shrub-sightline.png`; the foreground and dog are substantially less obscured. Compilation and the production build pass. No simulation changes followed the 540-test passing run. Ordinary aiming, obstruction of shots by scenery, varied dog training levels, and mobile behavior still need review.

**Next work, in order**

1. Walk the revised Pheasant approaches from both gates and inspect running-bird and dog behavior around water; entry screenshots and initial-placement checks are not a completed walk-through.
2. Establish one convincing entry-to-cover sequence with better ground litter, grouped vegetation, recognizable wet margins, and varied shelterbelt spacing. Judge it at walking height in both display modes.
3. Walk a complete Pheasant encounter and compare it with Quail and Chukar. Check that route choice, running birds, dog relocation, and escape directions support different decisions.
4. Measure frame cost and loading behavior on representative mobile hardware before making mobile-readiness claims.
5. Continue the deferred dog presentation, controls, audio, and hunt-flow work after the world and encounter reference is convincing.

**Validation limits**

The production build passes. Automated checks cover simulation and geometry contracts; they do not establish visual quality. Desktop inspection of Lightweight mode is not a mobile performance measurement. No complete on-foot encounter or device performance run was performed in this pass.
