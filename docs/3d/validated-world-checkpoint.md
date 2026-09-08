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

**Woodland shot obstruction**

Inspection confirmed the gun selected airborne birds solely from the shot pattern, ignoring intervening timber. Grouse habitat now checks candidate targets against actual instanced trunk geometry, including trunk height and lean. The gun rejects an obscured candidate while still allowing another visible candidate inside its pattern. Distance-culled trees remain solid for shots. This check runs when firing, not during every frame.

New checks cover a shot through a real trunk, a shot above it, a target before it, hidden rendering cells, and disposal. Gun integration checks confirm that both blocked and open shots consume a shell, while only the open shot resolves a downed bird. Compilation and the production build pass. The earlier assisted browser delivery predates this obstruction rule and does not prove a successful shot with it enabled. Terrain, rocks, buildings, and other maps' scenery are still outside this new trunk check and need further review.

**Terrain shot obstruction**

Shots now check the shared terrain heightfield before checking woodland trunks. Candidate paths are sampled at half-metre horizontal intervals, with a four-centimetre grazing tolerance. This applies across properties independently of rendering quality or terrain LOD. A ridge between two otherwise exposed endpoints blocks the shot; a clear rising shot above it does not. Sampling is an approximation, not exact triangle intersection, and runs only when firing at an in-pattern target.

Checks cover intervening crests, rising and downhill shots, vertical paths, grazing tolerance, and gun integration. A terrain-blocked shot consumes ammunition without resolving a hit. Compilation and the production build pass. This pass did not repeat the browser encounter; the earlier successful assisted shot predates terrain and trunk obstruction. Rock and building obstruction, ordinary aiming, and the feel of flight opportunities remain outstanding.

**Assisted encounter with obstruction enabled**

Repeated the West Track approach on `c0e9378` with terrain and trunk checks active. The dog held scent at 28 yards, resumed with the handler, and pointed at 23 yards. The assisted shooter waited until the bird had been airborne for more than 450 milliseconds. The first shot missed; the second downed the bird. The dog recovered it, returned carrying it, delivered it, and resumed hunting. The HUD ended at `Bag 1 / Down 0 / Shells 1`, then normal R-key input restored `Shells 3` while keeping the bag at one.

Aim direction was supplied from airborne telemetry through the development camera helper; movement, mounting, firing, and reloading used normal inputs. No flush, bird-down, or delivery helper was used. The first miss cannot be attributed specifically to obstruction because aim timing also changed. This demonstrates that a complete assisted encounter remains possible with obstruction enabled, not that ordinary aiming or target acquisition is ready. The airborne bird remains difficult to pick out in a still image against the repeated trunks, which deserves a dedicated readability review.

Evidence: `output/playwright/grouse-obstruction-aim-0.png`, `output/playwright/grouse-obstruction-aim-1.png`, and `output/playwright/grouse-obstruction-delivery.png`. The browser reported no errors and one 2.1-millisecond simulation warning; telemetry's maximum simulation tick was 2.5 milliseconds and maximum frame interval was 50.2 milliseconds. No code changed in this verification pass, so the previous 548-test and build results remain the latest checks. Mobile performance is still unverified.

**Alder Bottoms first corridor pass**

The Woodcock South Gate opened onto sparse parkland. Its bespoke alder and log materials also enabled vertex colors without geometry color attributes, producing black silhouettes. Corrected those materials, shortened the alders, replaced single oval crowns with three lobes, narrowed trunks, and positioned crowns to cover their tips. Route-side placement now uses much tighter staggered bands, preserving tree density in both quality modes. Added sedge shoulders between the existing pond rims and widened their blades; their geometry now supplies a neutral light-to-tip gradient beneath the instance tint.

Walked the South Gate in Standard and West Track in Lightweight. Evidence: `output/playwright/woodcock-entry-review.png`, `output/playwright/woodcock-alder-corridor.png`, and `output/playwright/woodcock-west-lite-corridor.png`. The corridor is more enclosed, but still needs softer understory shapes, better shade readability, and a more convincing wet ground surface. The West Track initial heading also needs checking against its authored route. Bespoke alder collisions and shot obstruction remain missing.

The final lightweight walk reported 66 draws and 242,422 triangles, with no browser warnings or errors. The denser Standard pass reported 91 draws and 507,380 triangles before the final trunk-width adjustment. These are desktop samples, not mobile acceptance. Compilation and build pass. No new tests or full-suite rerun accompanied this visual-only pass; the last full suite remains 548 passing tests.

**Alder arrival alignment and noon fill**

Both Woodcock drop headings now derive from the first segment of their authored approach instead of the old generic junction. West Track changed from approximately 72 to 84 degrees; a repeated 12-second forward walk follows the route instead of heading into its planted shoulder. The route-heading contract now covers both Woodcock entries as well as Chukar, with 22 focused checks passing.

Raised the Woodcock noon sky/ground fill and reduced direct sun intensity to keep the overcast corridor readable. Reviewed the same West Track walk in Lightweight mode, captured in `output/playwright/woodcock-overcast-west.png`. The path and nearby dog are clearer. The long planting bands still read too regularly, and wet soil/pool transitions need further work; this is not finished wetland composition. Compilation and build pass. The final browser console had no errors and one 5.3-millisecond simulation-budget warning. Other times of day and mobile hardware were not reviewed in this pass.

**Alder groups and wet soil**

Broke the evenly spaced alder bands into asymmetric groups with wider openings and varied crown sizes. Added a generated wet-soil and leaf-litter texture, saved with its exact prompt under `assets/source/terrain/`. The 1024-square runtime WebP is 102,334 bytes. It supplies restrained luminance detail over the habitat colors, with a second rotated sample and distance fade. The final ground palette shifts toward muddy olive-brown. Missing and late-loading texture handling now covers both Pheasant and Woodcock; four focused checks pass. Compilation and production build pass, retaining the existing large-chunk warnings.

Walked West Track for 12 seconds in Lightweight mode. The initial texture was too strong; halved its contribution and repeated the walk. Final evidence is `output/playwright/woodcock-wet-soil-restrained.png`. The earlier same-geometry sample reported 97 draws, 194,246 triangles and a 10.2-millisecond 95th-percentile frame interval on desktop. Mobile hardware remains unmeasured. Texture edges were requested to tile, but exact pixel seamlessness is not established. Ground detail is improved; the long straight path, repeated crowns, sparse understory and missing alder obstruction still prevent this from being a convincing finished wetland.

**Alder structure and sedge silhouette**

Replaced each single alder trunk with three diverging stems baked into one shared geometry. Five uneven vertical foliage lobes now reach down the stems instead of forming a flat umbrella. Lowered and widened sedge blades and increased route-side clumps. This remains an inexpensive instanced treatment with no additional draw calls, though geometry cost increased.

Repeated the 12-second West Track approach in Lightweight mode. Evidence: `output/playwright/woodcock-stools-sedge-lite.png`. The alder silhouette now reads as a branching thicket; cover remains too regularly tied to the straight route, and the wetland still needs more convincing ground-level mass and pool transitions. Final desktop sample: 97 draws, 252,722 triangles, 9.8-millisecond 95th-percentile frame interval, and a 141.8-millisecond maximum interval. That outlier is not diagnosed, and this is not a mobile readiness claim. Compilation and production build pass with existing chunk warnings. This geometry-only pass did not rerun simulation tests. Alder collisions and shot obstruction remain outstanding.

**Joined Woodcock shorelines**

A direct pool inspection exposed different random outlines and segment counts for water and mud banks. Both now share the same 24-point boundary and elevation, with independent outer-bank randomness. Pond dimensions and chain positions are now identical across display quality. Sedge placement respects each pond's rotation. A focused test verifies exact edge joins for two rotated, differently sized pools; compilation and build pass with existing chunk warnings.

Evidence: `output/playwright/woodcock-pool-before.png` and `output/playwright/woodcock-pool-joined-clear.png`. These use development-camera positioning, not a completed walking encounter. The first revised camera position was obscured by foliage; moved aside to inspect the shoreline. The gaps are corrected, but the pools still look like flat surfaces laid over terrain. Basin shaping, matching ground paint, and excluding dry vegetation from water remain necessary before this becomes a convincing wet margin. No full-suite or mobile run in this pass.

**Shared Woodcock basins**

Moved the pond layout into `src/game/wetPonds.ts` so the terrain and scenery share rotated pool footprints. The Woodcock landform now shapes submerged floors and gently rising banks, increases moisture around the margins, and suppresses terrain vegetation classification within water. Ground paint adds a mud transition; bespoke alders are excluded from pool interiors. Basin overlap initially failed the bank-height check, so placement now separates their full terrain influence footprints.

The full suite passes: 553 tests across 78 files. New basin checks cover surrounding bank elevation and consistency between both entries. Compilation and build pass with the existing chunk-size warnings. Reviewed the same assisted camera position in Lightweight mode: `output/playwright/woodcock-basin-lite.png`. The pool is recessed and the alder formerly standing in it is gone. The bank remains visibly coarse; terrain tessellation, water-margin sedges, broader vegetation exclusion and water traversal still need review. No complete encounter or mobile hardware run accompanied this pass.

**Terrain shoreline instead of a separate rim**

Removed the separate mud strip, which bridged over the basin and left an angular brown border. Mud now comes entirely from the terrain paint. Only tiles intersecting basin influence receive extra detail: 64 Lightweight or 96 Standard near divisions and 32 far divisions. Other tiles retain their existing budget. Moved pond sedges farther onto the banks, excluded route sedges from water, and excluded shared habitat scenery from the pool footprint.

Reviewed assisted pool views in both display modes. Evidence: `output/playwright/woodcock-terrain-shore-lite.png` and `output/playwright/woodcock-shore-cleared-high.png`. The floating rim is gone. Standard review still shows a thin vertical object near the water that needs tracing to its source; shoreline clutter is not fully resolved. Six focused checks pass, including level water, basin height and texture fallback. Compilation passes after the final habitat exclusion; the production build passed before that last exclusion. The previous full-suite result remains 553 tests. No mobile or full encounter validation in this pass.

**Reed identification and shore walk**

Traced the thin object with a temporary browser ray inspection: it was shared reed habitat instance 349 on the near bank, not a tree in the water. The one-cone reed looked like a pole. Bottoms reeds now use seven shorter, uneven stems with spreading blades in one shared geometry. No inspection hooks were added to the repository; temporary browser prototype changes were restored or cleared by reload.

Evidence: `output/playwright/woodcock-reed-clumps.png` and `output/playwright/woodcock-shore-walk.png`. Started from the assisted review position and used normal forward input for ten seconds. The player entered the pool at normal speed, confirming that water traversal still lacks a distinct response. The final Standard view reported 49 draws, 591,964 triangles, a 10-millisecond 95th-percentile frame interval and a 158.2-millisecond maximum interval; no mobile inference is justified. Compilation and build pass with existing chunk warnings. This visual-only change did not rerun simulation tests. Next gameplay work should define shallow-water movement and dog behavior rather than hide this gap with more scenery.

**Initial shallow-water movement**

Added a cached water-depth sampler using the shared pool levels and terrain bed. Woodcock hunter speed now falls smoothly to 55 percent of walking pace in deeper shallows; sprint input is suppressed above 12 centimeters of water. Moving back onto dry ground restores ordinary sprinting. Other maps keep their existing movement. A player integration check exercises both wet and dry movement, alongside the existing collision cases; 16 focused checks pass. Compilation and build pass with existing chunk warnings.

Browser verification started from an assisted position at Beaver Pond center, then held ordinary forward and sprint keys for three seconds. Travel was 3.639 meters, consistent with the 1.21-meter-per-second wading pace. Evidence: `output/playwright/woodcock-wading.png`. This proves the player pace change, not a completed hunt or a finished water experience. Dog water movement, ripples, water footsteps, and communication of depth remain outstanding. No mobile performance run or full-suite rerun in this pass.

**Wading ripple feedback**

The existing water material now draws up to eight expanding, fading ripple rings from hunter movement. Positions are reused in shader uniforms, with no new textures or draw calls. Stationary time does not emit ripples, dry movement does not emit them, and large camera jumps reset travel accumulation. The effect uses the same depth sampler as player movement.

Reviewed Lightweight mode with an assisted downward view and normal forward input. Evidence: `output/playwright/woodcock-wading-ripples.png` and `output/playwright/woodcock-ripples-settled.png`. Rings appeared during movement and disappeared after stopping. Compilation and production build pass with existing chunk warnings. No simulation tests rerun for this presentation change. This close view also exposes unfinished dog water height and the weapon intersecting the water when looking down; neither is fixed by ripple feedback. Mobile shader cost remains unmeasured.

**Generated GSP initial flotation**

The generated dog's motion controller now releases terrain contacts in deeper water and positions its body relative to the surface. It restores ground contacts on returning to shore. Entry and exit depths differ slightly to prevent rapid switching. The current paddle is a time-driven reuse of the walking cycle, not an authored swimming gait; swimming speed and AI remain unchanged. This is an initial presentation fix, not finished dog water behavior.

Sixteen generated-motion checks pass, including flotation and recovery to shore; compilation and build pass with existing chunk warnings. Browser review explicitly used `breed=gsp&dog=generated`. Earlier water screenshots without a breed parameter used the default setter and do not validate generated-dog changes. Evidence: `output/playwright/woodcock-generated-gsp-afloat.png`; the audit reported swimming active and all feet unlocked. The first attempted screenshot exercised the setter and was rejected as proof. Transparent water still exposes the leg cycle and shadow, and rigged/legacy dogs retain their old behavior. No mobile or full hunt validation in this pass.

**Dedicated generated paddle pose**

Replaced the swimming branch's walking-cycle reuse with submerged elliptical paw targets and a steady torso. The legs remain folded through recovery and never request planted contacts. A full-cycle check verifies finite paw positions, underwater paw travel and zero unreachable leg targets; all 17 generated-motion checks pass. Compilation and build pass with existing chunk warnings.

Reviewed the generated GSP from the assisted Beaver Pond position. Evidence: `output/playwright/woodcock-gsp-paddle.png`; the live audit reported swimming active and zero clamped targets. This is still an initial authored paddle, not a biomechanically validated swimming animation. Body immersion, transitions, travel speed, wake effects and legacy dog support remain unfinished. No complete swimming retrieve or mobile run was performed.

**Dog water travel ceiling**

The 3D hunt now samples each dog's water depth and supplies a travel-speed ceiling to the shared simulation. The ceiling eases down to 1.4 meters per second in deeper water and is absent on dry ground. It applies to movement, including recall and retrieval, without slowing sensing or decision timers. The generated paddle remains presentation-only; legacy dog visuals are still unfinished in water.

A recall check verifies capped travel and restoration on dry ground. The full run exposed the generated-startup fixture's missing area/drop accessors introduced by water sampling; supplied those while retaining its startup, zero-time and disposal assertions. All 557 tests across 78 files now pass, as do compilation and build with existing chunk warnings.

Browser sampling began at the assisted Beaver Pond position. The dog initially stayed at heel, so those samples were not movement proof. After normal hunter movement released it, six half-second samples showed approximately 1.4 meters per second while tracking with swimming active. A full swimming retrieve and shore transition still need review; no mobile performance claim is made.

**Close handler discipline in Alder Bottoms**

The continuing live session exposed a dog stalking over 100 meters away while the hunter remained in water. Extended the existing close-woodland scent hold to the bottoms doctrine: retain scent and wait for the hunter instead of running a long approach alone. The existing hold/resume test now covers both Grouse and Woodcock, while Pheasant and Chukar retain uninterrupted scent work. Sixty-two focused dog and locator checks pass; compilation and build pass with existing chunk warnings.

Repeated the assisted Beaver Pond start, then used normal walking input. The dog held scent at 26 yards with the close-up HUD label. After changing only the viewing direction through the development helper and walking forward for fifteen seconds, the hunter reached shore; the dog resumed, returned to grounded presentation and pointed. Evidence: `output/playwright/woodcock-close-handler-shore.png`. The point occurred under low alder foliage, which obstructed the view at close range. This is evidence of hold/resume and swim-to-shore behavior, not a completed flush, shot or retrieve. Mobile performance remains unverified.

**Continuous approach to a Woodcock flush**

Continued normal walking from the shore encounter, with occasional assisted viewing-direction changes. The earlier pointed bird had already flushed during unattended live time, so it was not treated as shot evidence. Followed the next scent approach continuously until a natural single-bird rise was captured at approximately nine yards, then paused. Evidence: `output/playwright/woodcock-follow-rise.png`. The bird was off the current viewing direction; no shot or retrieve was completed. A subsequent paused camera change did not produce a refreshed render and is not visual proof.

The HUD displayed “AMERICAN FLUSH” because it kept only the first word of a species name. It now retains full species names, while preserving hen/rooster identification for pheasants. Compilation passes; no new tests or build rerun for this text-only correction. Ordinary target acquisition and complete encounter validation remain outstanding.

**Physical alder trunks**

Bespoke alder root clusters now supply collision circles to hunter movement and dog navigation. Shots test the rendered stem geometry, including gaps and height, rather than the broad crown. The new geometry test checks an actual stem, a target before it, a shot above it, persistence when hidden and disposal. All 559 tests across 79 files pass; compilation and build pass with existing chunk warnings.

Browser review began at an assisted position two meters beside a real alder. Normal forward input stopped 0.74 meters from the root center, matching the root radius plus hunter clearance. Evidence: `output/playwright/woodcock-trunk-collision.png`. This close view also shows how opaque crown lobes engulf the camera; collisions alone do not solve foliage readability. A complete hunt with the new obstacles and a mobile performance review remain outstanding.

**Broken alder foliage and camera clearance**

Replaced five closed crown solids with separated folded leaf sprays. The first pass was too sparse and horizontal; increased overlap and varied pitch to retain a fuller side silhouette. Leaves within 0.45 to 1.15 meters of the camera now fade through a small screen-door pattern. Stem collision and shot obstruction remain solid. This adds geometry but no textures or draw calls.

Reviewed the same close-trunk position and entry view in Lightweight mode. Evidence: `output/playwright/woodcock-leaf-clearance.png` and `output/playwright/woodcock-leaf-sprays-final-entry.png`. The camera is no longer sealed behind one solid crown face, though the close fade pattern is visible and still needs polish. The entry sample reported 69 draws and 352,774 triangles, with a 9.8-millisecond 95th-percentile frame interval and 140.7-millisecond maximum interval on desktop. Mobile cost is unmeasured. Compilation and build pass with existing chunk warnings. No simulation tests rerun for this foliage-only change.

**Alder render groups**

Grouped alder instances into 80-meter cells sharing the same geometry and materials. Distant cells now stop rendering beyond a conservative 260-meter Lightweight or 340-meter Standard radius plus cell extent. All rooted collision circles and shot geometry remain available even when a cell is hidden. The obstruction test now drives actual cell hiding and verifies that shots remain blocked. Compilation and build pass with existing chunk warnings.

Compared the same assisted entry viewpoint: rendered triangles dropped from 352,774 to 194,998, while draw calls rose from 69 to 84. Evidence: `output/playwright/woodcock-alder-cells.png`. Nearby cover retains its composition. Dog pose and elapsed simulation differ between samples, so these are approximate scene comparisons, not controlled performance benchmarks. The short desktop sample does not establish mobile readiness. Distant group transitions, a longer walking comparison and device performance remain to review.

**Pheasant arrival direction**

Returned to the Pheasant approaches after the Alder work. The old South Gate heading aimed straight at the slough despite a dry-shoulder route turning northwest. Both Pheasant headings now derive from their first authored route segment. The route-direction contract now includes both Pheasant entries; all 23 focused checks pass. Compilation and build pass with existing chunk warnings.

Walked forward for twelve seconds from South Gate in Standard and West Track in Lightweight. Evidence: `output/playwright/pheasant-aligned-south.png` and `output/playwright/pheasant-aligned-west.png`. The slough/pothole sits beside the approach instead of directly ahead; South Gate also reveals the homestead along the edge. West Track showed the dog tracking a runner at 19 yards. These are entry walks, not full encounters. Bright ground patches in both views were traced to seasonal frost/snow overlay geometry; their solid pale shapes still look artificial and need refinement. No mobile hardware run in this pass.

**Seasonal ground blending**

Seasonal patches now use a feathered radial edge with irregular mottling instead of solid pale polygons. Frost has lower opacity than snow, letting the soil show through. The existing geometry and pond clearance remain; the material adds no textures or draw calls and no longer writes transparent patches into the depth buffer.

Repeated twelve-second entry walks from West Track in Lightweight and South Gate in Standard. Evidence: `output/playwright/pheasant-feathered-frost-west.png` and `output/playwright/pheasant-feathered-frost-south.png`. The conspicuous white plates are gone in these views. Frost is now subtle; the overall scene still needs stronger vegetation grouping, ground variation and shelterbelt composition. Compilation and production build pass with existing chunk warnings, and the reviewed browser page reported no warnings or errors. No simulation tests were rerun for this material-only change. Snow-specific visibility and mobile shader cost remain unreviewed.

**Pheasant ground layers and windbreak density**

Added short, wider grass in selected spaces between standing bunches, using the existing prairie geometry and batches. Shelterbelts have more trees, broader mature crowns and irregular sapling placement, producing overlapping groups. This is a modest composition improvement; the open ground still looks sparse and the cottonwood crowns remain too round.

A bent-blade experiment produced artificial triangular tips and excessive geometry, so it was removed. Final evidence: `output/playwright/pheasant-low-growth-south.png` (Standard) and `output/playwright/pheasant-low-growth-west.png` (Lightweight), both after twelve seconds of forward walking. Earlier `pheasant-layered-*` images are rejected iterations. The final West sample recorded 119 draws and 245,264 triangles versus 119 draws and 201,948 triangles before this pass. That added geometry needs mobile measurement; the short desktop sample is not a device benchmark. All 23 property habitat contract checks, compilation and production build pass. Existing chunk warnings remain; the reviewed page had no browser warnings or errors. No complete hunting encounter was established by these entry walks.

**West Track runner follow-through**

Continued the West Track walk beyond the entry view using forward input. A first pass ended with one escape after about 54 seconds; a replay paused at the natural flush showed that the bird was a hen, roughly 45 meters ahead. One second after takeoff it was visible above the grass, left of center. No camera relocation, forced flush or shot was used. Evidence: `output/playwright/pheasant-west-natural-flush.png` and `output/playwright/pheasant-west-hen-rise.png`. Letting this hen go was appropriate; this does not prove a successful rooster interception or retrieval.

The flush label now explicitly says `HEN FLUSH · HOLD FIRE` when every bird in the rise is a hen. Rooster labels remain unchanged. The existing hen penalty is unchanged. Added focused hen/rooster label checks through the public flush path; all 23 Hunt3D checks and compilation pass. Screenshots predate the wording change and establish encounter behavior, not the revised wording. The main remaining encounter task is to intercept a running rooster rather than simply follow behind it, and judge whether the cover and guidance make that choice understandable.

**Next work, in order**

1. Walk the revised Pheasant approaches from both gates and inspect running-bird and dog behavior around water; entry screenshots and initial-placement checks are not a completed walk-through.
2. Establish one convincing entry-to-cover sequence with better ground litter, grouped vegetation, recognizable wet margins, and varied shelterbelt spacing. Judge it at walking height in both display modes.
3. Walk a complete Pheasant encounter and compare it with Quail and Chukar. Check that route choice, running birds, dog relocation, and escape directions support different decisions.
4. Measure frame cost and loading behavior on representative mobile hardware before making mobile-readiness claims.
5. Continue the deferred dog presentation, controls, audio, and hunt-flow work after the world and encounter reference is convincing.

**Validation limits**

The production build passes. Automated checks cover simulation and geometry contracts; they do not establish visual quality. Desktop inspection of Lightweight mode is not a mobile performance measurement. No complete on-foot encounter or device performance run was performed in this pass.
