# Pheasant reference experience

Pheasant is the current priority. Complete one coherent hunting experience before returning to broad passes on other properties. Existing assisted encounters are development references, not proof of finished play.

**Completion criteria**

- [ ] Both entries introduce a readable route, distinctive cover and a useful first decision.
- [ ] Ground, standing vegetation, wet margins, shelterbelts, homestead and horizon form a consistent low-poly scene at walking height in Standard and Lightweight.
- [ ] Cover edges support visible dog searching, runner relocation and a fair approach to a point. Birds and dogs do not cross impassable water or solid props.
- [ ] Roosters and hens are distinguishable during ordinary play, with clear hold-fire feedback.
- [ ] An uninterrupted hunt using normal movement and aiming reaches a natural flush, shot, retrieve, results and a new hunt. Misses, empty ammunition and ending without a bird remain understandable.
- [ ] Dog presentation, weapon framing and encounter feedback are sufficiently readable to support this reference experience; provisional presentation defects are resolved or explicitly assessed against that standard.
- [ ] Focused regressions and production build pass, with no unresolved runtime errors in the reviewed route.
- [ ] Rendering and loading have measured desktop baselines, and phone suitability remains explicitly unclaimed until tested on hardware.

**Current work**

The initial review still shows isolated grass tufts, bare shoulders and repetitive shelterbelt crowns. Standing cover is now broader and dry ground has a patchy fallen-stem layer. Small close-range litter batches reduced the first experiment by roughly 52,000 triangles at the South reference viewpoint. The resulting scene reported 115 draws/569,762 triangles in Standard and 102 draws/271,657 triangles in Lightweight. These are static desktop scene counts, not a phone benchmark.

The large double-barrel silhouette was a model-selection defect: a configured semiautomatic outside Quail still displayed the legacy gun. Sporting models now follow the equipped action on all maps. Browser comparison shows a much clearer field of view; tests verify pump/semiautomatic selection, three-shell capacity and sight-bead alignment on Pheasant, Quail and Chukar.

Pheasant field notes now report retrieved birds, point flushes, escaped birds and elapsed field time without exposing hidden stocking. Protected hens remain an explicit consequence. The live HUD and movement hints hide on completion. The empty-hunt screen was reviewed at desktop and 390-pixel width; Hunt again generated a fresh seed while retaining property, entry, breed, coat, challenge, light and quality. Explicit seed links remain repeatable.

The shelterbelt pass replaced oval crowns with three irregular foliage masses per lobe and added forks using the existing trunk batch. The four foliage lobes retain their placement and color distribution. This adds no material batches; each crown lobe uses 60 triangles rather than 80, offsetting the added branch geometry. The Standard close approach was reviewed in `output/playwright/pheasant-windbreak-branching.png`.

| Interface detail | Applied change |
| --- | --- |
| Numbers | Tabular figures in the bag and stat values |
| Small screens | Compact duration, bounded scrolling card and 44-pixel button height |
| Text | Balanced heading and natural paragraph wrapping |

**Control and encounter evidence**

All 575 tests across 82 files and the production build pass at this checkpoint. Existing large-bundle warnings remain. The most recent reviewed browser page reported no warnings or errors. No phone hardware benchmark has been performed.

Pointer lock did not activate in the automated browser, and native Computer access reported that the Mac was locked. The old behavior silently prevented turning. Added a mouse drag fallback after capture fails, with a visible hint; ordinary pointer-lock input remains unchanged. Fallback releases on pause/blur and supports right-button tracking across a left-button shot. Tests cover rejection, normal capture, disposal, pause and combined buttons. Movement/parking fixtures were updated to provide document event listeners; their movement assertions are unchanged.

An assisted Seed 1 run with the sporting gun completed one rooster shot, retrieve and field notes. A subsequent replay used keyboard, mouse drags and visible buttons only, with no camera-position, time-step, forced-flush or down helpers. The route ran continuously through the shot, then used the ordinary pause/resume menu before the retrieve. Read-only telemetry recorded the approach: point at approximately 44 meters from the dog, flush at approximately 35 meters from the bird. One shot consumed one shell, one bird was retrieved, and field notes reported one point flush and no escaped birds. Evidence: `output/playwright/pheasant-input-only-field-notes.png`. This is a rehearsed input-path verification, not a first-time player's usability evaluation or fully uninterrupted hunt.

The empty-hunt and retrieved-bird summaries were reviewed separately. Narrow layout evidence is `output/playwright/pheasant-field-notes-narrow-final.png`. Native captured-mouse feel, the West approach, later encounters, water/prop interaction and presentation of a close retrieve remain outstanding. The field is still not declared complete.

**Dense habitat correction**

User review correctly identified that the widened tufts still made Pheasant look like sparse upland grass. Standing habitat now uses nine closely spaced, jittered clumps per planting cell, with a separate height multiplier of 1.45–1.80 and broader blades. Wet margins use clustered reeds, including the damp shore above water level. Harvested fields and access clearances stay open. Standard and Lightweight preserve identical tall-grass root positions and height multipliers; Lightweight reduces blades per clump, and both tiers swap simpler geometry into distant parcels without removing their instances.

Assisted static views at South Gate's first cover edge and inside the stand confirm substantially greater screening at hunting height. These were camera-positioned art reviews, not new playthrough evidence. The edge view reported 117 draws/1,056,064 triangles in Standard and 95 draws/497,902 triangles in Lightweight before the final shore-width adjustment. This increases rendering cost and is not mobile validation. Evidence: `output/playwright/pheasant-dense-cover-high.png`, `pheasant-dense-cover-lite.png`, and `pheasant-dense-cover-inside.png` in the same folder. Straight habitat boundaries, close blade variation, and the effect of heavier screening on an ordinary hunt still need review. Do not thin the core habitat simply to keep the dog visible.

Cottonwood and shelterbelt trunks now supply player/dog obstacles and actual wood intersections for shot blocking. Focused tests cover both entries, trunk collisions, obstructed shots and disposal; an assisted South cottonwood approach stopped at the expected trunk clearance. Evidence: `output/playwright/pheasant-solid-cottonwood-verified.png`. The earlier similarly named screenshot without `verified` targeted an empty position and is not collision evidence.

The West walking approach left the dog approximately 69 yards ahead on point. Guidance now distinguishes closing the gap while the dog tracks from slowing to a walk on point. This is a cue correction; the West hunt still needs a complete input-only replay.

**Refinement after the dense-cover pass**

Added a varying visual fringe outside the authoritative cover rectangles. Shorter, less continuous vegetation now blends into the shoulders while the dense interior stays intact. A habitat contract verifies that the fringe does not expand bird cover. Blades have narrower roots, broader bends, increased curvature, and a root-to-tip color gradient. Seed heads now attach to explicit stems instead of appearing detached beside the taper. Wind movement follows the hunt's direction and strength, with restrained movement in calm conditions. Detail switching has a hysteresis band to prevent repeated parcel changes when hovering near a distance threshold.

A South Gate Seed 1 Lightweight replay completed the approach, natural point and flush, one-shell rooster shot, retrieve, and field notes without pausing or using position, time-step, flush or down helpers. It used rehearsed keyboard/mouse-drag inputs, so it is evidence of the complete input path rather than first-time usability or native pointer-lock feel. Field notes reported one retrieved bird, one point flush, and zero escaped birds. Screenshots: `output/playwright/pheasant-refined-input-point.png`, `pheasant-refined-input-shot.png`, and `pheasant-refined-input-results.png`. The final stem and wind refinements followed this full replay.

A West Track Standard morning input approach closed the tracking gap before the point and reached approximately 27 yards from the dog, compared with roughly 69 yards in the earlier walking-only reference. It then paused for review; no completed West retrieve is claimed. Guidance now explicitly describes walking toward the point and identifying the rooster above the cover. Screenshot: `output/playwright/pheasant-refined-west-point.png`. Final camera-positioned stem review: `output/playwright/pheasant-refined-west-stems-final.png`. Browser review reported no warnings or errors.

The full suite passed 581 tests across 83 files. The full-property two-tier cover test now has a 15-second allowance: its normal assertions passed in isolation, but concurrent suite/build workers pushed generation past the previous five-second timeout. This does not relax density, placement, disposal, or distance-detail assertions. The final West static view reports 161 draws and 1,375,000 triangles; mobile performance is still unverified. The scene remains short of the requested finish, particularly close vegetation silhouettes, distant landscape composition, and sustained play across both entries.

**Vegetation cost and West encounter review**

Standing vegetation now has three detail levels. Distance is measured to the parcel's horizontal bounding box rather than an expanded sphere, with separate enter/leave thresholds. The same root instances and height transforms remain in every tier. At the matched West morning viewpoint, Standard decreased from 1,375,000 triangles/161 draws to 1,140,345 triangles/157 draws before adding the neighboring farm trees, approximately a 17 percent triangle reduction. This is a static rendering comparison, not a measured frame-rate improvement. The focused cover test now verifies the intermediate geometry as well as near/far detail, unchanged instance counts and identical tall habitat across quality tiers.

Broken windbreak groups beyond the property boundary give neighboring farmland a visible horizon. They use existing trunk and crown batches without shadow casting or additional draw batches. Their positions remain outside the playable property. Camera-positioned review: `output/playwright/pheasant-neighboring-windbreaks-high.png`. The dense West comparison is `output/playwright/pheasant-west-three-detail-high.png`.

A West Standard approach reached a natural rooster flush, then paused for inspection. Its resumed assisted shot missed and field notes recorded an escaped bird; the mouse movement during that review is not reliable aiming-usability evidence. A fresh Lightweight morning replay ran continuously from entry through point, flush, shot, retrieve and results. The shot used live bird-position telemetry to calculate a mouse correction, so it is explicitly an assisted aiming review, with no forced flush, direct down, repositioning or simulation stepping. One rooster was downed and retrieved, with zero escaped birds. Evidence: `output/playwright/pheasant-west-continuous-assisted-results.png`. Normal visual acquisition and an unassisted West completion remain outstanding.

TypeScript checking, the production build, and four focused cover/solidity tests passed. Existing large-bundle warnings remain. Phone hardware performance remains unverified.

**Physical cover response and remaining acquisition problem**

Actual bird launches now emit a cosmetic disturbance. Pheasant vegetation responds within 2.6 meters, using four bounded impulses that decay over 2.5 seconds. The fixed debris pool sheds more, longer stems from higher within tall cover. The continuous-covey regression verifies one disturbance per actual launch, including delayed birds, without changing flight positions or stagger across quality tiers.

Close blades were intersecting the hunter and obscuring the sight picture. Per-vertex displacement distorted the faces and was discarded. Each blade now carries its own root attribute; stems within 1.4 meters lean away from the hunter, with roots fixed and no transparency, instance removal, or corridor toward the target. Matched mounted-gun review: `output/playwright/pheasant-body-rooted-lite.png`.

A final normal-input West approach captured a natural rise at approximately 1.3 and 2.3 seconds without firing or forcing the encounter. Evidence: `output/playwright/pheasant-rooted-launch-early.png` and `pheasant-rooted-launch-clear.png`. Near-camera clipping improved, but the bird remains difficult to acquire from inside the dense stand. These images do not prove a visually acquired shot. Review an edge approach next; do not thin the habitat to make an interior approach easy. Close retrieve presentation also remains outstanding.

The full suite passed 582 tests across 83 files before the final root-based shader refinement. The final TypeScript check, production build and 13 focused cover/debris/continuous-covey tests passed afterward. The existing large-chunk warning remains. Disk exhaustion subsequently blocked screenshots and Git writes. Removed only discarded screenshots from this pass and the regenerable, untracked `dist` output; the successful build had already been verified. The development server does not require `dist`. Free space is needed before larger artifact work.

**Laptop readiness and pheasant takeoff**

The user cleared disk space; the subsequent check showed approximately 80 GiB available, and the development server is running again on port 4583. Laptop controls use F to toggle aim and Space to shoot. Reload now clears the keyboard aim latch, fixing a reproduced case where the next F press left the gun lowered. Fire requests provide brief feedback while the gun is lowered, mounting, or waiting for a flush. The existing restriction to firing during an active rise remains in place. Browser review confirmed the lowered-gun and waiting-for-flush messages.

Pheasants no longer inherit the shallow initial climb cap used for covey launches. Their initial forward drive ramps in over 900 milliseconds, and the existing species flight controller reduces the climb afterward. This follows the upward burst described by [Cornell's Ring-necked Pheasant guide](https://www.allaboutbirds.org/guide/Ring-necked_Pheasant/id); the numeric timing is a game-design choice. A fixed regression fixture exceeds two meters after 0.6 seconds and subsequently reduces its climb while remaining airborne. This is fixture evidence, not a measured guarantee for every encounter.

A normal-input West Track Lightweight morning Seed 1 approach reached a natural point and flush using F to aim. No position, time-step, forced-flush, or down helpers were used, and no shot was attempted. Screenshots `output/playwright/pheasant-upright-rise-early.png` and `pheasant-upright-rise-clear.png` show the revised rise, but the bird is still small against the vegetation and background. Clear visual acquisition, an unassisted West completion, an edge approach, and close retrieve presentation remain outstanding. Do not shorten or thin the standing habitat to mask this problem.

All 584 tests across 83 files, TypeScript checking, and the production build passed. The reviewed browser reported no warnings or errors. The build's existing large-chunk warning remains, and phone hardware performance is unverified.

**Close flushes and individual presentations**

Continuous 3D pheasants now have a stable individual approach disposition: tight birds use approximately 2.5–5.5 yards, ordinary birds 8–14 yards, and wary birds 18–26 yards. The identifier hash assigns tuning bands of 40/40/20 percent; these are design weights, not wildlife statistics or guaranteed encounter frequencies. The profile does not reroll during an approach or depend on rendering quality. Existing runner behavior remains active. Tight birds lose nerve more slowly at a distant point, giving a walking hunter time to approach; dog pressure, sprinting and finite nerve still matter. The 2D approach and other species retain their existing rules.

A walking hunter can also disturb an unpointed pheasant within its close physical radius, including a resting runner. That is an uncredited wild flush; a dog-held point still uses the earned proximity path. Regression coverage checks a quiet walk from 40 yards into a tight bird, a wary break, a sprint spook, and an unpointed resting runner underfoot.

Pheasant launch impulse now responds to actual hunter distance, with a stronger upward break close by and less climb at distance. The random individual impulse is retained. Continuous 3D pheasants now use smooth wing articulation rather than stepped poses, with a fuller and faster opening cadence that decays continuously. Existing launch disturbance and bounded stem debris still begin at the real bird position. No added geometry, material batches, target highlighting, camera steering, or grass thinning is involved.

An assisted West Track Seed 1 review repositioned the camera four meters from the actual pointed bird, then resumed the simulation to trigger proximity normally. Screenshots `output/playwright/pheasant-close-burst-opening.png` and `pheasant-close-burst-carry.png` show an initially screened launch followed by a substantially larger rooster silhouette, visible tail and wings above the grass. At 700 milliseconds the bird was at world height 3.35 meters. This is camera-assisted visual evidence, not an ordinary approach, successful shot, or proof of encounter distribution. Full-hunt frequency, unassisted close acquisition, distant presentations and close retrieve presentation still need review.

All 588 tests across 83 files, TypeScript checking, and the production build passed. Browser warnings and errors were absent; the existing build chunk warning remains. Mobile hardware performance has not been established.

**Dedicated pheasant geometry and encounter integration audit**

Roosters and hens now use a dedicated vertex-colored mesh instead of the generic stretched bird body and wing panels. The body has an extended neck, smaller head, tucked feet, and patterned plumage; the rooster adds a green head, red facial patches and an ivory collar. Rounded overlapping flight feathers replace the flat wing panels. A separate barred tail has restrained movement and is shorter on the hen. Shape and marking references follow [Cornell's Ring-necked Pheasant identification guide](https://www.allaboutbirds.org/guide/Ring-necked_Pheasant/id). The model remains stylized and uses the existing gameplay scale, not a claim of life-size anatomy.

Frozen live-material side views at approximately eight meters are `output/playwright/pheasant-model-rooster-side.png` and `pheasant-model-hen-side.png`. They show a distinguishable color pattern and shorter hen tail; they do not establish identification during an ordinary fast encounter. Geometry is shared across the bird pool, with no image textures and fewer than 3,000 triangles per complete bird. The moving tail adds one draw per visible pheasant. A geometry integration test catches invalid attribute/index combinations encountered during development. The browser initially loaded a stale failed module; clearing review-browser caches restored the current development version. A later recurrence had no service-worker registration or cache-storage entries and was resolved by disabling the review browser HTTP cache, so the earlier specific service-worker attribution was not established.

An independent audit found that the 3D hunter adapter wrote its new position into authoritative state before checking movement, disabling the walking-underfoot path despite isolated simulation tests passing. The adapter now supplies a separate current position. A regression drives the actual live-camera adapter over a resting pheasant and checks the uncredited flush. Approach disposition now uses the existing seeded individual nerve roll rather than a globally incrementing runtime identifier, preserving same-seed restart behavior without consuming additional random draws. Pheasant approach distances now also honor the selected challenge multiplier.

The full suite passed 595 tests across 84 files after the model and integration fixes; TypeScript and production build passed. A normal-control South Gate Seed 2 approach reached runner tracking and then paused for inspection; it is not a completed uninterrupted hunt. The production goal and all remaining verification requirements are recorded in `docs/3d/production-goal.md`.

**Runner world pace and actual launch sound**

Continuous ringneck runners now use a species-owned 4.8 meters/second burst instead of the inherited 42 property yards/second (38.4 meters/second). Energy and rest clocks remain unchanged, as do 2D and other species. Controlled simulations using seeds 1, 7 and 29 with two handler gaps produced cover-end points at 7.8–8.0 seconds and flushes at 18.7–21.8 seconds, 4.2–7.4 meters away. Straight broad-cover walking pursuit still failed to flush in four of six setups by 180 seconds. Closing the safe gap at a run improved the two resulting opportunities from roughly 53–59 meters to 24.6 meters. These constructed dog-follow scenarios support retaining cutoff strategy, not a claim of natural encounter balance. Evidence is in `output/audit/runner-*`.

The 3D adapter previously used only generic covey flutter: the cackle existed solely in 2D. Actual pheasant launches now play a distance-attenuated opening wing burst and a rooster-only cackle; hens have wing noise without the cackle. A focused regression verifies one sound request per actual bird launch without the additional generic flutter. This remains synthetic audio and has not yet passed a listening-quality or directional-audio review.

A fresh West Track Balanced Seed 1 normal-input approach kept the tracking dog within seven yards after closing the gap, then walking reached a natural rooster rise at approximately 23.6 meters. Ordinary pause/resume was used for inspection; no shot, retrieve or uninterrupted completion is claimed. `output/playwright/pheasant-world-pace-west-tracking.png` and `pheasant-world-pace-west-rise.png` record the review. Foreground blade shapes still screen the early rise heavily. Close vegetation and sight-picture composition are the next priority, preserving the dense/tall habitat requirement.

All 598 tests across 84 files, TypeScript checking and the production build passed at this checkpoint. The existing large-bundle warning remains. Full-goal completion remains unproven.

**Arching leaves and close retrieve distances**

Near and middle prairie geometry now separates slender upper stalks from broad, arching leaves below. Small branching seed heads replace solid spear shapes in those detail levels. Plant placement consumes the same random draws, and the existing tests confirm identical tall root placement across Standard and Lightweight, unchanged instance counts through detail changes, and preserved habitat height multipliers. Core density, habitat boundaries and plant transforms are unchanged. This changes visual leaf distribution, not bird cover rules.

Assisted matched-position views are `output/playwright/pheasant-branched-grass-lite.png` and `pheasant-branched-grass-high.png`. They report 610,779 triangles/133 draws and 1,250,837 triangles/156 draws respectively. These are static counts, not measured performance improvements or phone validation. More facets in the near leaves increase geometry work; the upper canopy is less sheet-like while dense lower foliage remains.

A fresh West Track Balanced Seed 1 route used normal movement and F aim continuously through a natural rise, then paused for inspection. `output/playwright/pheasant-arching-natural-rise.png` records approximately 700 milliseconds after the flush. A resumed view, `pheasant-arching-natural-carry.png`, shows the next flight beat. No forced position, flush or down was used for this route, and no shot or retrieve was attempted. The bird remains difficult to separate from the background trees. This route still does not establish an ordinary completed hunt; compare a genuine cover-edge approach next instead of repeatedly approaching through the stand interior.

The retrieve audit found a separate world-scale mismatch: pickup and delivery both used a six-yard radius, allowing the bird to attach or disappear about 5.5 meters away. Continuous encounters now use 0.65-meter pickup and one-meter handoff radii, with 2D defaults unchanged. Actual Hunt3D integration verifies close pickup, no premature retrieve credit and close delivery. The obstacle detour regression also passes with these distances. The generated dog's dedicated pickup/carry/delivery pose remains missing and is the next concrete dog-presentation task.

All 599 tests across 84 files, TypeScript checking and the production build pass. The existing large-bundle warning remains. The full production goal remains incomplete.

**Generated retrieval actions and carried bird proportions**

GeneratedDogSystem now reads the simulation's pickup/delivery hold clock. GeneratedFieldMotion applies a smoothly blended upper-body layer after solving planted feet: the muzzle lowers for pickup, settles into carrying and lifts briefly at handoff. The existing mouth attachment follows this pose. Tests exercise the actual generated subsystem, a muzzle below 20 centimeters during pickup, stable paws, smooth return to carrying, and point/swim priority. The level-ground study is `output/audit/retrieve-preview.html`; pickup and carrying views are in `output/playwright/generated-retrieve-pickup.png` and `generated-retrieve-carry.png`. These are staged geometry reviews, not a complete natural retrieve.

The combined dog/bird study exposed two inherited presentation defects. The generic folded-wing rotations raised pheasant feathers vertically, and the ground/carry presentation scale made the bird oversized beside the dog. Pheasant wings now sweep aft along the flanks. Their resting scale is 1.25 rather than the generic 2.1 multiplier, retaining the species size factor. Falling pheasants blend toward the resting scale within the last two meters above terrain, so pickup itself does not resize the bird. The corrected shared-geometry study is `output/playwright/generated-retrieve-bird-carry-corrected.png` and `generated-retrieve-bird-handoff.png`. The earlier unsuffixed `generated-retrieve-bird-carry.png` records the discarded oversized, raised-wing presentation. A focused folded-wing regression verifies that feathers remain low and extend aft. The dead bird's neck remains rigid; further natural falling/carry posture review is still needed.

The survey map and authored route show the West path runs around world z=110–116 through this section, whereas the repeated interior approach ran around z=95. A normal-input Seed 7 outer-route prefix reached tracking with the dog about 24 yards away; a bird had already launched during the timed walking segment. This is route inspection only, not a visually followed or completed encounter. `output/playwright/pheasant-seed7-outer-edge.png` records the paused route position. Next conduct an encounter-aware approach and full return, rather than judging the property from fixed timed walking segments.

All 602 tests across 85 files, TypeScript checking and the production build pass. The existing large-bundle warning remains. The full production goal remains active and incomplete.

**Cover-edge acquisition review**

A West Track Seed 1 outer-path approach produced a natural rooster visible against open sky beside the fence, rather than overlapping the trees and interior grass. The image is `output/playwright/pheasant-edge-shot-review.png`. The route used normal movement through the flush, then paused for inspection. After resuming, aiming from the visible screen position and firing missed; `pheasant-edge-shot-attempt.png` records the bird to the right of the sight. The bird subsequently escaped. No hidden bird coordinates, forced flush or forced down were used for that attempt, but the pause and calculated screen correction mean it is not uninterrupted ordinary-play proof.

A fresh replay did not reproduce the same timing: one bird escaped and the dog established another point farther down the cover. It was paused without another shot or retrieve. This confirms neither a completed hunt nor reliable acquisition across attempts. The edge composition is promising, but encounter-aware route review is still needed. Fixed walking durations are insufficient as an acceptance method.

**Momentum through impact and staged recovery**

Continuous ringnecks now retain horizontal and upward flight velocity when hit. Horizontal drag is 0.65/second and gravity is 9.81 meters/second squared; terrain contact records the moved landing position for the retrieve. Previously the falling branch stopped all horizontal travel and imposed a fixed vertical drop. Tumbling now begins at the visible impact orientation and uses elapsed time since the hit, followed by a 260-millisecond settle at ground contact. Other species and the legacy falling branch retain their prior behavior.

An explicitly assisted browser check advanced the simulation to a point, invoked the walk-in/flush helper, and forced a down after about 967 milliseconds of flight. The falling bird moved from (155.41, 4.04, 96.03) to (158.14, 4.13, 93.38) over the next half-second, retaining the initial climb while carrying forward. `output/playwright/pheasant-momentum-fall.png` records the falling view. Simulation stepping then reached pickup, and real-time rendering followed the dog carrying the bird back. The camera was repositioned onto the path to see the return; `pheasant-momentum-handoff.png` shows the dog approaching at about two yards. The tally subsequently changed to one retrieved, and Field notes reported one bird retrieved and zero escaped. This verifies the assisted fall-to-recovery connection, not shooting, uninterrupted hunting or final dog visual quality. The rigid carried neck and provisional dog remain visible limitations.

All 606 tests across 85 files, TypeScript checking and the production build pass. The existing large-bundle warning remains. Natural hunt quality and actual phone performance remain unproven.

**Explicit generated-GSP return and relaxed bird neck**

Correction to the preceding assisted recovery: that browser URL contained `dog=generated` but omitted breed and coat. The generated audit handle was absent. Boot requires GSP, liver-white coat and the generated selector together; the earlier handoff screenshot shows the legacy dog and therefore does not validate the generated dog's attachment. Its fall-to-retrieve logic evidence still stands. A separate CPU skin check found the generated muzzle socket stays about 19 millimeters from a lower-lip vertex across stand, pickup, carry and handoff poses; subsystem ordering updates the dog before the carried bird.

The new browser review explicitly uses `breed=gsp&coat=liver-white&dog=generated` and confirms the `generated-gsp` audit source. It again uses simulation stepping, camera repositioning and a forced down, then follows the return in real time. `output/playwright/pheasant-generated-relaxed-carry-edge.png` shows the crosswise bird at the muzzle outside the cover. The earlier `pheasant-generated-relaxed-carry.png` is obscured by foliage. The generated dog completed delivery and the tally reached one retrieved. These are assisted presentation checks, not ordinary hunt acceptance.

Rooster and hen body geometry now includes a shared relaxed-neck morph target. It bends the neck progressively above the shoulder while preserving the torso/grip, blends in over 300 milliseconds after impact, and remains relaxed on the ground and during carry. Corresponding normals are authored once. This adds morph attribute storage but no triangles, textures or draw calls, and does not rebuild geometry during animation. Tests cover both sexes, the fixed torso, head drop and the actual falling/grounded influence transition.

All 607 tests across 85 files pass. Type checking and the production build pass after correcting optional-attribute typing in the new test. The existing large-bundle warning remains. Full natural hunts and actual phone performance are still open.

**Observable pheasant scent cues**

The pheasant-specific tracking label previously overrode every scent stage with “DOG TRACKING RUNNER,” including the stationary point setup. Labels now distinguish checking, locating, closing and setting point, using only the dog's observable stage. They no longer claim a concealed bird is running. Closing beyond 30 meters retains advice to close the gap along dry cover; nearby closing asks for a quiet walk, and locking asks the hunter to slow. The detailed guidance follows those distinctions.

A South Gate Balanced Seed 2 review explicitly selected the generated GSP. Before the change, a walking approach reached a distant hen flush with the dog about 58 yards away; no shot was taken. After the change, live HUD sampling saw closing/quiet-walk at 15 seconds and closing/close-gap at 19 seconds. A resumed run-to-setup sequence reached “SETTING POINT” at 31 yards, then switched to walking. The approach was paused for visual review at 19 yards; despite its filename, `output/playwright/pheasant-south-cued-rise.png` shows the point approach, not a flush. Turning toward the displayed dog-bearing arrow and walking produced a hen flush with the dog about 16 yards away. `pheasant-south-cued-follow.png` records the view one second after the rise. Fire was held.

These were normal movement inputs with pauses for review and a calculated turn from the visible GPS arrow, not uninterrupted hunts or hidden-position-assisted flushes. The closer presentation remains hard to distinguish against cover. HUD sex identification does not establish visual rooster/hen recognition. Five focused cue tests, TypeScript checking and the production build pass; the existing build chunk warning remains. No new audio or completed-hunt claim is included.

**Banking and initial local frame measurements**

Flying pheasants previously had body roll explicitly reset to zero on every render. Their heading changes now drive a restrained bank on the fixed simulation tick, with wrapped angular differences, smoothing and a 20-degree cap. Straight flight returns toward level; pooled launches reset the bank and falling keeps the visible banked impact orientation. Trajectory, velocity and target scale are unchanged. Focused tests exercise actual render roll, heading wrap, repeated frozen renders, settling and pool reuse. Source review found no missing upper/lower wing faces warranting a material or scale change. Ordinary flight readability is still unproven.

Initial timing checks used this MacBookPro18,3, Apple M1 Pro, 16 GiB memory, Chrome 152, and the ANGLE Metal Apple M1 Pro renderer. At a 1512-by-833 CSS viewport, the camera was explicitly positioned at West Track world (129,95), yaw -98 degrees, level pitch, morning light. Both scenes ran live for 20 seconds after warming, with the dog at heel and no airborne birds. A first sample at the same coordinates under South Gate was outside the intended stand and was excluded from the dense-cover comparison. A failed file-export attempt did not alter the scene; the Lightweight dense sample was collected again.

| Display | Render resolution | Draw calls | Triangles | Callback rate | p95 interval | p99 interval | Gaps over 33.4 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lightweight | 1293 × 712 | 135 | 618,861 | 120.04/sec | 9.2 ms | 9.3 ms | 0 |
| Standard | 1940 × 1068 | 157 | 1,255,029 | 120.01/sec | 9.2 ms | 9.3 ms | 0 |

These measure requestAnimationFrame scheduling alongside the active render loop, corroborated by the engine's advancing rendered-frame counter. They are not GPU timer queries, display-scanout proof, moving-hunt stress measurements, low-end laptop qualification or phone evidence. No performance optimization is claimed. The next performance review should include traversal, active dog work, launches and repeated sessions; actual phone hardware is still required.

All 609 tests across 85 files, TypeScript checking and the production build pass. The existing large-bundle warning remains. The full production goal remains incomplete.

**Directional physical flush audio**

A physical pheasant launch now places its wing burst and optional rooster cackle in stereo using the current camera position and yaw at actual takeoff. Previously the launch sound was centered and distance used the original flush camera, which could be stale for a delayed bird. The default audio API remains centered for callers without a direction. One shared panner handles the short launch burst and disconnects on the final wing-wash completion; source, filter and gain nodes also disconnect after playback. Mute and gesture unlock remain in force. This is launch-time left/right placement, not continuous moving-source tracking or full front/back spatial audio.

An actual browser OfflineAudioContext rendered the procedural rooster launch at three meters with pan -0.8, 0 and +0.8. The measured left/right RMS amplitudes were 0.01651/0.00262, 0.01167/0.01167 and 0.00264/0.01664 respectively. This verifies stereo channel routing, not perceived realism or headphone/speaker quality. The review temporarily substituted an offline context in isolated module instances and restored the normal constructor afterward. An initial decimal-valued module-query suffix triggered a Vite loader error; integer query suffixes resolved the review harness, without an application-source workaround.

Focused coverage exercises the current camera for delayed takeoff, turn-relative pan, silent frozen review, shared routing, node cleanup and muting. Natural listening review, the sound palette and actual phone output remain open.

All 611 tests across 86 files, TypeScript checking and the production build pass. The existing large-bundle warning remains.

**Nearby leaf folds and traversal timing**

Near prairie leaves now have a shallow central fold so lighting can separate their two faces. Roots, existing outer vertices, width, arch height, random sequence, instance placement and habitat density remain unchanged. The first version also folded middle-detail leaves; matched Standard geometry rose from 1,250,549 to 1,712,894 triangles for a subtle visual difference. That version was rejected. The retained near-only version uses a stronger fold and 1,466,459 triangles at the same view, with the same 155 draws. Middle and far geometry retain their earlier shapes. Cost per near clump is 90 additional triangles in Standard and 50 in Lightweight.

The explicitly positioned West Track view at (129,95), yaw -98, pitch -8, morning, is recorded in `output/playwright/pheasant-leaf-fold-before.png`, the discarded `pheasant-leaf-fold-after.png`, the retained `pheasant-leaf-fold-near.png`, and `pheasant-leaf-fold-lite.png`. The fold adds close surface definition; the stand still needs broader composition and material refinement before visual acceptance. It is not a replacement for the dense-cover requirement.

Twenty-second forward walks from that assisted start used the actual movement controls and active dog simulation. Both ended around (172.58,101.12), with the dog tracking around (200.42,99.68). On the same M1 Pro/Chrome/ANGLE Metal setup as the preceding timing record, Standard measured 119.95 callbacks/second and Lightweight 120.02. Both had p95 9.2 milliseconds, p99 9.3 milliseconds and no callback gaps above 33.4 milliseconds. Standard ended at 2,337,993 triangles/149 draws; Lightweight at 1,103,136 triangles/128 draws. These are short traversal samples with no airborne birds, shooting or retrieve, and they measure scheduling rather than GPU time. They do not establish lower-end or phone performance.

An attempt to enumerate mobile devices through xctrace could not run because that developer utility is unavailable. This establishes a missing inspection tool, not that no phone exists. Actual phone validation remains open.

All 611 tests across 86 files, TypeScript checking and the production build pass. The existing large-bundle warning remains.


**Farmland horizon and windbreak lighting**

Pheasant's camera-following ridge rings now draw behind the playable world. Their radii lie inside the property, so their earlier depth-tested ordering could hide farther terrain and props. The horizon also follows 70 percent of camera elevation and uses broader low rolling silhouettes. This changes decorative scenery, not traversable terrain or habitat.

Standard quality now casts shadows from farm windbreak trunks and crowns. Those shared batches had excluded even nearby walkable trees from shadow rendering. Lightweight retains its existing shadow budget. Pheasant fill light now comes from the opposing elevated direction, using the existing time-of-day colors and intensities, so shaded tree faces retain more shape in evening light.

The assisted South Gate view at (-55,-57), yaw 31, pitch 0, compares `output/playwright/pheasant-horizon-before.png` and `pheasant-horizon-after.png`; both used 119 draws and 1,000,832 triangles. Adding windbreak shadows produced 123 draws and 1,037,052 triangles in `pheasant-windbreak-shadow.png`. Evening comparison appears in `pheasant-windbreak-evening.png` and `pheasant-windbreak-evening-fill.png`. These are static composition reviews, not ordinary-hunt or device-performance evidence.

All 613 tests across 86 files passed before the final fill-direction adjustment; the eight sky tests, TypeScript checking and production build passed again afterward. The existing large-bundle warning remains. Natural hunts, broader environment acceptance and actual mobile validation remain incomplete.


**Handler range and conflicting scent guidance**

A West Track, seed 17, morning, Balanced, explicitly selected generated-GSP session used normal movement, mouse dragging, aim toggle and the visible survey. No camera teleport, forced bird event, simulation stepping or hidden bird positions were used. Field notes ended at four minutes, three point flushes, three escapes and no retrieved birds. One hen was visibly airborne above cover and fire was withheld; other rises were not acquired during the tool-driven observation intervals. This is a real-control session with observation gaps, not proof of uninterrupted human-quality shooting or sex identification.

The session exposed two concrete obstacles. At 44 and 76 yards the headline requested closing the gap while detailed text requested giving the dog room. The dog also continued a long scent pursuit without the handler-range hold used in thick timber. Evidence is in `output/playwright/pheasant-west17-north.png`, `pheasant-west17-east.png` and `pheasant-west17-results.png`. Close cattail seed heads still look rectangular, and broad habitat transitions remain visually repetitive; those are further environment priorities.

Continuous Pheasant country now supplies a 48-meter tracking limit. Beyond it, a dog roads in no farther until the handler is inside 70 percent of that distance, about 34 meters. A dog already within point-settling distance can finish its point. The hold does not move or freeze birds, fabricate a point, interrupt retrieval, or change legacy Pheasant and other properties. Losing the scent releases the hold. This generous limit is a tuning starting point, not a claim that 48 meters is universally correct hunting behavior.

Both tracking messages now use one decision for scent stage, distance and waiting state. The short locator says DOG HOLDING SCENT; headline and detail explain closing up. A fresh seed-17 entry followed by twenty seconds walking and ten seconds stationary naturally reached a 53-yard hold. Turning toward the visible dog bearing and walking ten seconds resumed tracking, ending at 42 yards with consistent move-up advice. Screenshots are `pheasant-handler-range-live.png` and `pheasant-handler-range-resume.png`; the hold screenshot predates the final shorter locator wording. No forced event or camera helper was used for this check.

Regressions cover stopping, hysteresis, resuming, scent loss and real shared-simulation wiring with legacy and Quail exclusions. All 616 tests across 86 files, TypeScript checking and the production build pass. The existing large-bundle warning remains. Multi-seed encounter balance and complete shooting/recovery acceptance are still open.


**Cattail seed-head volume**

Nearby cattail heads now use slender six-sided volumes with tapered ends aligned to their stalks. The previous single-card heads read as rectangular signs and vanished edge-on. Middle detail uses two crossed tapered silhouettes; far detail remains two triangles. Existing plant roots, leaves, instance placement, random sequence, density and habitat authority are unchanged. No new material, texture or draw batch was added.

The assisted West Pothole view at (130,80), yaw 30, pitch -5, morning, compares `output/playwright/pheasant-cattail-shape-before.png`, `pheasant-cattail-shape-after.png` and `pheasant-cattail-shape-retained.png`. Standard reported 1,708,833 triangles before, 2,085,338 in the first version with solid middle heads, and 1,988,346 with the retained crossed middle heads, at 125 draws. The discarded version cost more for little visible benefit. Lightweight retained dense reed cover at 912,365 triangles and 103 draws in `pheasant-cattail-shape-lite.png`. These views use camera positioning for shape comparison, not natural-hunt evidence.

A twenty-second Standard lateral walk from that staged start ended at (168.11,58.00), with active dog tracking, 113 draws and 2,848,499 triangles. The same local M1 Pro browser produced 2,400 animation-frame intervals, p95 9.2 ms, p99 9.3 ms and no gaps above 33.4 ms. This is callback cadence during traversal, not GPU timing, a shooting/retrieve workload or phone validation. The geometry increase remains a cost to revisit on weaker hardware.

All 616 tests across 86 files, TypeScript checking and production build pass; the existing large-bundle warning remains. The heads have improved volume, while vegetation grouping, material variation and habitat transitions still need refinement.


**Harvest and standing-cover transition**

Harvest ground paint was continuous, but plant construction switched exclusively to stubble above a 0.3 harvest sample for an entire 2.8-yard cell. That could truncate the independently authored grassy fringe. Fringe roots now sample the same harvest and moisture fade used by terrain paint, gradually reducing fringe grass as cut ground increases. Stubble and verge grass can coexist; authoritative cover interiors are not subjected to this harvest thinning, and gameplay cover rectangles are unchanged.

The first implementation exposed a quality-tier regression: omitted Lightweight stubble consumed fewer random values before neighboring grass. Both tiers now consume the same stubble variation before deciding whether to render it. The existing exact tall-root/height comparison passes again. It now reports a concise equality failure instead of dumping millions of characters. The standing-habitat check also verifies fringe grass exists in substantially harvested transition ground.

The assisted West Track view at (97.95,156.69), yaw 0, pitch -8, morning, is recorded in `output/playwright/pheasant-harvest-fringe-before.png`, `pheasant-harvest-fringe-after.png` and `pheasant-harvest-fringe-lite.png`. Standard reported 1,755,431 triangles before and 1,756,269 after at 137 draws. Lightweight reported 1,023,508 triangles and 107 draws. The visual change fills some abrupt bare verge gaps without a new material or draw batch. These are static shape comparisons, not complete hunt or mobile performance evidence.

All 616 tests across 86 files, TypeScript checking and production build pass; the existing large-bundle warning remains. Track shoulders, broader habitat composition and full ordinary-hunt acceptance remain open.


**Farm-lane wear and readable low-sun light**

The existing Pheasant route ribbon now emphasizes two softly edged wheel-wear bands, leaving more ground color visible along its center and shoulders. This is surface wear, not a physical rut depression. Slight width and wear variation keeps the bands from being completely uniform. The change uses the existing geometry/material pass and does not widen the route or remove vegetation. Other properties retain their prior route shader.

The staged West Track view at (32,75), yaw -138, pitch -8, morning, is recorded in `output/playwright/pheasant-track-wear.png`; the earlier plain-lane comparison is `pheasant-verge-before.png`. The evening Lightweight review exposed a larger palette problem: inherited saturated key light made vegetation orange while shaded ground became nearly black. Pheasant dawn/evening now use a softer warm key, a lighter blue-gray sky ambient and stronger ambient contribution. The sun angle, sky, time progression and other properties are unchanged.

`pheasant-track-wear-evening-lite.png` records the pre-adjustment evening light; `pheasant-evening-balanced.png` and `pheasant-dawn-balanced.png` show the revised low-sun balance. The evening comparison retains 134 draws and 823,543 triangles. This improves visible ground detail and keeps warmth in the foliage; it does not establish ordinary bird-identification acceptance at low sun.

TypeScript checking and production build pass after both edits; the existing large-bundle warning remains. No new tests were added for these visual-only changes. The previous full-suite result remains 616 passing tests, predating this pass. Walking-height composition and complete hunts remain the next evidence priority.


**South Gate evening approach and close-point guidance**

A fresh seed-23 South Gate evening hunt used normal walking, mouse dragging and the player HUD with the generated GSP explicitly selected. No camera positioning, simulation stepping, forced birds or hidden bird coordinates guided the session. The dog progressed from scent to point; walking closed its displayed distance from 39 to 23, 13, 6 and 1 yard. The player then passed the dog into cover. Field notes recorded five minutes, one point flush, one escape and no retrieve; the bird was not acquired in the observation frames and no shot was attempted. Tool-driven observation gaps mean this is not continuous human-play evidence or proof of bird unreadability by itself.

The session did expose a concrete instruction problem: even beside and beyond the dog, the detailed cue still only said to walk toward the point. Within twelve meters it now gives the compass direction the dog faces and asks the player to walk past its nose into cover, identifying the bird before firing. That direction comes exclusively from the dog's body heading, not a hidden bird position. Farther away the earlier approach instruction remains. This is a navigation aid requiring fresh ordinary-play review, not a completed encounter solution.

Evidence screenshots run from `output/playwright/pheasant-south23-evening-start.png` through `pheasant-south23-near.png`, `pheasant-south23-walkpast.png`, `pheasant-south23-relocate.png` and `pheasant-south23-results.png`. Several intermediate filenames contain rise/flush but their captured state is still on point; filenames do not establish events. Seven locator tests, including all four cardinal heading conversions and the near/far instruction change, pass with TypeScript checking and production build. The large-bundle warning remains.


**Natural rise recording and persistent close-launch impulse**

West Track seed 7, morning, Balanced, generated GSP reached a natural point using ordinary walking and mouse dragging. The new close-point instruction appeared at eight yards. A sequence of 36 screenshots continued through the approach; frames 24–35 showed HEN FLUSH. Movement stopped when the visible HUD announced the flush, and no shot was attempted. Reviewed frames 24, 26 and 30 did not show a clearly identifiable forward-view bird. Files are `output/playwright/west7-natural-00.png` through `west7-natural-35.png`. Capturing frames adds overhead, and this is not a human reaction-time or performance measurement.

Source review found consistent launch/world coordinates, immediate first-bird launch and ordinary mesh frustum culling. The HUD announces global rise activity, while escape direction follows the bird relative to the hunter plus wind, so a truthful rise cue can accompany an off-axis bird. That remains an explanation to verify, not a confirmed diagnosis of this capture. A later attempt to record revealed-airborne positions during the next approach captured no airborne slots during its observation window. A development reload interrupted the attempt to end the session; no complete-results evidence is claimed for it.

The audit separately found a concrete defect in close-flush presentation: the distance-sensitive initial vertical impulse was written to a velocity that the first flight tick immediately rebuilt. The intended factor now modifies the persistent flight-controller input. Close ringnecks retain 1.25 times their randomized impulse, far ones retain 0.85, and the existing level-off controller still eases the climb. Legacy ringnecks, other species and RNG order are unchanged.

The old implementation failed the extended first-flight-tick regression: close/far climb became equal. The corrected ratio stays 1.4706 through 500 ms and matches actual upward displacement in the controlled flat-ground fixture. Distance-neutral legacy-ringneck and continuous-bobwhite regressions pass. This proves the flight integration fix; ordinary visual readability and successful shooting/retrieve acceptance remain open.

All 619 tests across 86 files, TypeScript checking and production build pass. The existing large-bundle warning remains.

**West Track rise direction verified**

A repeat ordinary approach on West Track seed 7, morning, Balanced, generated GSP recorded only revealed airborne positions and the camera every 50 ms. The player followed the visible dog cues, stopped walking at the hen-flush announcement and held fire. No hidden bird coordinates, forced event, simulation stepping or camera placement guided the approach. The 49-sample trace is saved in `output/playwright/west7-rise-camera-audit.json`; the forward view after the rise is `output/playwright/west7-projection.png`.

At launch, the hen's center was 57.92 degrees right of the camera, outside the approximately 51.8-degree horizontal half-view. At 600, 1,200 and 2,300 ms it was respectively 67.56, 75.08 and 107.28 degrees right. It climbed from 1.41 meters below camera height at takeoff to 2.95 meters above it. This confirms an off-axis rise in this replay; the empty forward view does not establish a rendering disappearance. It does not prove that every earlier missed bird had the same cause.

The dog-facing compass conversion agrees with generated body orientation. Its direction originates at the dog, and a cardinal sector is coarse; it is not a precise bird bearing from the player. Source review separately found that a runner can relocate within the existing point-distance threshold while the dog retains its initial pointing heading. That behavior merits a relocation response, but the off-axis capture alone does not prove it occurred here. Ordinary visual acquisition, shooting and complete-hunt acceptance remain open.

**Re-establishing a relocated pheasant point**

An established point now records the bird's position. In continuous Pheasant encounters, a ringneck moving more than three meters from that position releases the dog into the existing stalking and settling sequence, even if the bird remains within the old point-distance ring. The dog retains its heading on the release tick and works the new direction through ordinary scent behavior. It does not continuously swivel toward a hidden target. Each fresh point resets the displacement reference; small movements retain a steady point. Other species and legacy encounters retain their existing rule.

The three-meter threshold is a tuning choice, approximately one-quarter of the existing settling separation. Regression checks cover lateral relocation inside the old release radius, unchanged heading before re-establishment, small movements, a fresh displacement reference and excluded encounters. All 622 tests across 86 files, TypeScript checking and the production build pass. The existing large-bundle warning remains. Natural hunt review is still required to assess the rhythm of repeated points and whether this improves the player's understanding of runner work.

**West Track runner follow-through after relocation change**

A fresh West Track seed-17 morning hunt used normal walking and mouse dragging, following the visible dog locator. The dog moved between closing on scent and waiting for the handler before reaching a point. The player approached from 17 to seven yards, then turned toward the displayed southeast point direction and continued. Subsequent observation found another point farther away. Results recorded two point flushes, three escaped birds, two minutes afield and no retrieves. No bird was acquired for a shot. Screenshots are `output/playwright/west17-relocation-walk.png`, `west17-repoint-close.png`, `west17-guided-rise.png` and `west17-relocation-results.png`; the guided-rise filename captures a point, not visible flight.

Tool observation gaps prevent a claim of uninterrupted play or a diagnosis of every missed rise. The session does verify that the route continues through runner work and results after the change. It does not establish a satisfying shooting opportunity or successful retrieve. Source review identified a separate directional-audio limitation: the short launch sound kept its initial stereo position while the bird and listener could turn. Tracking that already-audible source is the next focused correction.

**Moving launch sound**

The existing approximately 0.71-second pheasant wing burst and optional cackle now share an adjustable distance gain and stereo panner. An actual launch creates the sound handle; subsequent rendered updates use the launched bird and current camera, with 25 ms smoothing. Completion releases the routing nodes independently of rendering, and recycling or disposing a bird stops its routing. Hidden birds create no sound handle. The existing short envelope, capture silence and mute behavior remain intact.

A real browser OfflineAudioContext rendered a burst initially at full right, then changed its direction to full left at 250 ms. From 50–200 ms, channel RMS was effectively zero left and 0.03428 right. From 400–650 ms, it was 0.00736 left and 0.00000567 right; the handle was inactive after rendering. This verifies audible channel routing through real Web Audio, not subjective sound quality, full spatial front/back localization or ordinary hunting acceptance. Focused integration checks also cover a 180-degree camera turn, changing bird distance, recycling and expiration. All 623 tests across 86 files, TypeScript checking and the production build pass; the existing large-bundle warning remains.

**Close grass silhouette and priority reset**

Nearby prairie leaves now have narrower bases, shoulders and bends, and upright stalks taper toward their tips. Height, instance placement, counts, random samples and geometry complexity remain unchanged. The staged camera at (63,93), yaw -121, pitch -4 compares `output/playwright/pheasant-leaf-taper-before.png`, `pheasant-leaf-taper-after.png` and `pheasant-leaf-stalk-taper.png`. Standard retained 161 draws and 2,812,664 triangles. Lightweight is recorded in `pheasant-leaf-stalk-taper-lite.png` at 140 draws and 1,040,534 triangles. Both retain dense standing cover. These are shape comparisons, not complete-hunt or mobile evidence. The two existing vegetation checks, TypeScript checking and production build pass; no new test was needed for the silhouette edit.

The user explicitly questioned diminishing returns from minor polish. Isolated vegetation, material and anatomy refinements are now deferred unless a complete-hunt review identifies them as a material obstacle. The next milestone is the full sequence from field entry through a naturally encountered bird, shot or deliberate miss, recovery where applicable, and results. Record the three largest player-facing failures, address those, and repeat the whole sequence. Tests protect changes but cannot substitute for this milestone. Existing broader production requirements remain open; this priority reset does not declare any of them complete.
