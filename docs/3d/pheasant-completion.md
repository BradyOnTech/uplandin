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

**Natural close rooster and laptop trigger timing**

West Track seed 1184004868, morning, Balanced, generated GSP was approached with walking and mouse dragging guided by the visible dog locator. After a prolonged road-in, a rooster flushed close to the player while the dog was 36 yards ahead. No bird was forced and no hidden positions guided the route. The review paused at the flush and again during shooting to inspect screenshots; this is assisted shooting evidence, not an uninterrupted reaction-time benchmark. The rooster emerged through nearby cover and became clearly visible above it after approximately another half second. Evidence is `output/playwright/loop1184-long-road.png` and `loop1184-rooster-mount.png`.

One shot missed and consumed a shell. A subsequent rapid F-then-Space sequence displayed RAISING GUN and consumed no shell even after the mount completed. Source inspection confirmed the trigger request was discarded while mounting. This is a practical input-timing obstacle to a fast laptop response, independent of the pause-assisted aim. Reload restored three shells. Results recorded three minutes, one escaped bird, zero point flushes and no retrieve. Files include `loop1184-first-shot.png`, `loop1184-followup.png` and `loop1184-results.png`. Recovery after a successful ordinary shot remains unverified. The next correction is a short, cancellable mount-time trigger buffer, rather than further asset polish.

**Mount-time trigger buffer verified**

A deliberate trigger during active mounting now waits up to 250 ms of simulation time for the existing firing threshold. It is bound to the current rise and consumed once through the ordinary firing and cooldown path. Lowering, pause/blur, reload, disposal, expiry or an ended/changed rise cancel it. A trigger with no aim intent cannot queue a later shot. This changes responsiveness, not the shot ray, spread or hit allowance.

After normal walking reached a point in seed 7, a separate controlled browser check used the debug flush helper and immediately pressed F then Space. This was a forced hen rise and an untargeted missed shot, not ethical hunting or successful-shot acceptance evidence. Mount/shell telemetry changed from 0 and three shells to 1 and two shells after 220 ms, remaining at two after another 400 ms. The rapid input fired exactly once in the running browser. All 631 tests across 86 files, TypeScript checking and production build pass; the existing large-bundle warning remains. Full ordinary shooting, recovery and repeat-hunt acceptance remain open.

**Recovery through results, and two-dog ownership defect**

A controlled continuation of the seed-7 browser session positioned the player near the visible dog, advanced simulation, invoked the debug flush helper at a point and deliberately downed the revealed bird. This is an assisted recovery setup, not a successful ordinary shot. After the fall, normal real-time updates carried the generated GSP through pickup and return. The HUD first reported Bag 0 / Down 1 and DOG RETURNING WITH BIRD; subsequently it reported Bag 1 / Down 0, enabled End hunt and recorded one bird retrieved in results. Evidence is `output/playwright/recovery-single-controlled.png` and `recovery-single-results.png`. The single-dog recovery-to-results path completed in this fixture.

A separate source audit and controlled reproduction identified a two-dog ownership failure: both dogs could select the same downed bird, and the second dog accepted the first dog's carried target without owning it. With the first dog fixed at the fall and the second fixed beside the handler, the second could credit delivery before the carrier returned. The next correction protects carried ownership and coordinates assignments so an available second dog can recover another fall. This is a bag-credit and recovery correctness issue, not asset polish.

The correction now rejects a carried target that belongs to another dog. Shared simulation derives each dog's current recovery claim before selecting falls, allowing packmates to choose separate birds without removing carried birds from the authoritative list. Claims release when retrieving ends. The original regression failed with premature retrieved state before the fix. The two-fall integration now verifies one owner per carried bird, bird position following its actual carrier, both physical handoffs within one meter, one retrieve credit per dog and released claims/carrier IDs afterward. All 633 tests across 86 files, TypeScript checking and production build pass; the existing large-bundle warning remains. A natural two-dog hunt and ordinary shot-to-retrieve acceptance remain outstanding.

**Dense-cover rendering cost**

Standing vegetation now partitions into 28-yard groups rather than 56-yard groups. Smaller bounds allow distant plants to use the existing simpler geometry sooner and improve culling. Individual plants, instance transforms, habitat density and detail thresholds are unchanged. Litter and stubble retain their prior grouping. The tradeoff is more draw calls. Staged comparisons use West Track coordinates, morning, seed 17; they are not ordinary hunts.

| View x,z | Standard triangles before / after | Draws before / after |
| --- | --- | --- |
| 63,93 | 2,812,664 / 1,462,623 | 161 / 193 |
| 130,80 | 1,988,346 / 1,194,176 | 125 / 182 |
| -55,-57 | 163,281 / 114,952 | 43 / 51 |
| 32,75 | 1,516,694 / 1,275,373 | 156 / 196 |

At (63,93), Lightweight changed from 1,040,534 to 625,344 triangles and 140 to 160 draws. Screenshots `output/playwright/pheasant-batching28.png` and `pheasant-batching28-lite.png` retain dense cover and the nearby silhouette. The standing-habitat test initially failed because it compared batch enumeration order across tiers. It now compares sorted complete root/height tuples, retaining multiplicity; exact plant positions and heights match. Both existing vegetation tests, TypeScript checking and production build pass. The preceding full-suite result remains 633; no full-suite rerun was needed for this grouping change.

Actual WebGL GPU timer queries on the local Apple M1 Pro/ANGLE Metal renderer bracketed 30 paused `renderOnce` samples after five warm-up renders, with disjoint-clock checking. At fixed 1940×1068 Standard resolution, median GPU time was 9.00 ms before and 7.61 ms after; p95 was 9.10 and 9.73 ms, so this small sample does not demonstrate improved worst-case latency. Median CPU submission rose from 1.2 to 1.8 ms. At fixed 1293×712 Lightweight resolution, median GPU time was 7.51 to 5.50 ms, p95 8.20 to 6.45 ms, and median CPU submission 1.2 to 1.6 ms. The review script is `output/audit/pheasant-gpu-review.js`. These short static measurements support the geometry-cost reduction and expose its CPU tradeoff; they do not prove sustained whole-hunt performance or actual mobile readiness.

**Simultaneous touch controls**

Desktop Chromium touch emulation at 844×390 exposed a functional problem with click-only action buttons. The initial test incorrectly used the touch-end point list as remaining fingers rather than fingers to release, so its intermediate mount-zero observation was inconclusive. A corrected browser fixture using a clone of the Aim button with the original click-only handling received zero clicks from a secondary-finger tap while movement remained held, and one from a subsequent single-finger tap. Aim, Reload and Whistle depended solely on these compatibility clicks; the existing Fire control already handled touch pointers directly. This is browser input evidence, not a physical phone test.

The correctly sized layout is recorded in `output/playwright/mobile-loop-viewport.png`. Earlier `mobile-loop-start.png` and `mobile-loop-full.png` had a screenshot/emulated-pixel-ratio mismatch and are not valid layout evidence; synchronizing the Playwright viewport and using device pixel ratio one corrected capture. The next fix gives the three ordinary action buttons explicit multi-touch activation while preserving click/keyboard access and cancelling interrupted gestures.

The new shared action binding captures any touch pointer and activates on release inside its button, including secondary touches. Interrupted gestures, outside release and pause cancel activation; synthesized duplicate clicks are suppressed while keyboard and mouse activation remain available. In the corrected live trace, pointer 8 remained on movement while non-primary pointer 9 pressed and released Aim: mount reached one after 250 ms with the movement stick still active. `output/playwright/mobile-secondary-aim-verified.png` records the resulting view. All 641 tests across 87 files, TypeScript checking and production build pass; the existing large-bundle warning remains. This fixes simultaneous mobile action input but does not establish a full touch hunt or real-device readiness.

**Unpaused repeat of the close-rooster route**

A clean desktop tab was necessary because mobile emulation persisted across reloads of the earlier review tab. The desktop check confirmed 1512×833, no coarse pointer and zero touch points. The existing drag-look fallback was explicitly enabled by simulating unavailable pointer lock before the hunt route; no camera pose, bird state, simulation clock or hit result was overridden during the route.

West Track seed 1184004868 was then walked along the previously reviewed headings. At approximately 221 yards from the truck, another natural close rooster flush occurred while the dog was 36 yards ahead. The script reacted to the visible rooster HUD, mounted, turned using ordinary mouse dragging and fired. There was no pause during the rise or shot. One shell was consumed and the shot missed; the rooster was visible above cover in `output/playwright/route-repeat-shot.png`. This used a rehearsed route and planned aim, so it is not independent human reaction-time or fun evidence. It confirms the repeatable natural presentation and working unpaused trigger, not a successful shot-and-retrieve hunt. Hit detection was not changed to fit the automated attempt.

Reload and End hunt completed normally. `output/playwright/route-repeat-results.png` records three minutes afield, one escaped bird, zero point flushes and no retrieves. No gameplay source changed in this review; the prior 641-test result remains the latest full suite. Further attempts to tune this single scripted shot would have diminishing value compared with player feedback and broader encounter review.


**Hunter interception changes a covered runner route**

The strategic audit found that the map already supplies water-edge routes, cover ends, and wind-sensitive scent work, but ground-running birds had no hunter position input. Getting ahead of a rooster did not influence its ground direction until the separate disturbance/flush logic acted. This took priority over the proposed survey-map presentation change; no survey changes were made.

Continuous Pheasant ringnecks now reject covered running steps that approach a hunter within twelve meters. The current movement input supplies the hunter position. Existing covered side routes remain available if they gain distance from the dog and avoid the occupied approach; otherwise the bird holds using its existing rest behavior. The dog still initiates running, individual temperament and flush authority remain unchanged, and no hidden position is exposed. Other species, legacy encounters, and birds starting outside cover retain their existing movement.

Regression fixtures compare a hunter ahead, behind, and distant; verify a covered lateral escape and a closed narrow-strip hold; prevent a long step from crossing an occupied route; and retain excluded contexts. All 647 tests across 87 files, TypeScript checking, and production build pass. The existing large-bundle warning remains. These are controlled behavior checks, not ordinary-play acceptance. Twelve meters is an initial play-tuning choice; the existing approximately 1.87-second hold after an unsuccessful escape needs natural-play review to ensure a brief interception is not too reliable. Full-hunt excitement, successful ordinary shot/recovery, and actual mobile acceptance remain open.


**South Gate seed 41: fresh route through a natural hen rise**

Morning, Balanced, generated GSP, South Gate seed 41 was followed with ordinary walking and the visible survey/dog cues. No hidden bird positions, forced flush, camera pose override, simulation stepping, or hit override guided the hunt. The survey revealed the dry approach around South Slough; closing the gap brought the dog out of its waiting state and into a point near the homestead. At seven yards the cue reported the dog facing north. Walking beside the dog and turning north produced HEN FLUSH with the dog three yards away. Fire was held. End hunt recorded one point flush, one escaped bird, zero retrieves, and four minutes.

This was tool-mediated play with observation gaps, not uninterrupted human acceptance. Pointer-locked browser automation also introduced unintended camera turns between screenshots early in the route. For the final approach, the review made canvas pointer-lock requests reject and used the existing drag-look fallback; heading then remained stable across capture. This review-only override was not a source change. Evidence: `output/playwright/south41-approach.png`, `south41-survey.png`, `south41-shore.png`, `south41-point.png`, `south41-near.png`, `south41-rise.png`, and `south41-results.png`. The hen was not identifiable in the captured forward-view rise frame; the HUD is evidence of the event, not visual acquisition. This does not establish a rendering failure or prove the hunter-blocking change caused the hold.

The next work should address three substantial readability issues: the nearby dog's body can be concealed by standing cover, so its direction is understood mainly from UI; the captured natural rise again lacks visual identification; and the property reads as largely uniform-height cover between the pond and barn, with landmarks carrying most navigation. Source inspection confirms rooted vegetation reacts to hunter contact and bird launch disturbances but currently has no dog-contact bending input. A local, physical dog-contact response is a concrete candidate for making its work visible without thinning habitat or displaying hidden birds. It needs a visual/performance comparison before acceptance. No gameplay source changed during this review; the latest full suite remains 647 passing tests.


**Local dog contact in standing vegetation**

Standing vegetation now bends around up to two interpolated dog bodies. A short capsule follows each rendered position and heading, with influence fading out within 0.85 meters of its body segment. Roots remain planted; opacity, plant placement, cover density, geometry, and concealed bird state are unchanged. The strongest dog contact is used where dogs overlap, and hunter contact reduces the added bend to prevent folding stems below ground.

The two existing vegetation tests and TypeScript checking pass. The production build passes with its existing bundle warning. A fresh running browser reports no console errors after shader compilation. This adds vertex shader arithmetic without adding draw calls or geometry; sustained GPU cost has not yet been compared. The existing test fixtures now provide an empty dog roster.

Staged camera views at the actual dog position are `output/playwright/dog-cover-contact.png` (track edge) and `dog-cover-contact-standing.png` (cattails). The second uses simulation stepping and camera placement and is not ordinary hunt evidence. The dog remains substantially hidden behind foreground cattails at four meters: local contact does not solve that broader visibility problem. These captures predate the final overlap-limit adjustment, which was subsequently browser-compiled. A moving comparison and performance measurement remain needed before calling the response visually accepted. Do not enlarge the contact radius into a visibility corridor merely to expose the dog.


**Dog-contact cost and usable survey orientation**

A browser-only response override removed the dog-contact shader block for an otherwise identical paused-render comparison. The override was removed and the page reloaded afterward. West Track seed 17, morning, camera (63,93), yaw -121, pitch -4 used thirty GPU timer queries per condition with disjoint-clock checks. Standard at 1940x1068 retained 193 draws / 1,462,623 triangles: median GPU time was 8.90 ms without contact and 9.02 with it; p95 was 11.12 / 11.19. Lightweight at 1293x712 retained 160 draws / 625,344 triangles: medians 3.48 / 3.74 ms, p95 6.35 / 6.73. Wide sample variation and sequential runs limit attribution. This does not establish sustained mobile performance or justify further micro-optimization now.

The survey now states wind blowing toward a cardinal direction, marks north, and draws the hunter facing line from actual camera yaw instead of always pointing north. Header and footer have reserved space. Browser layout review at 1512x833 and 844x390 exposed an existing paused-map resize problem: the previous canvas bitmap stretched because simulation time stopped. A ResizeObserver now redraws an open map when its canvas size changes and disconnects on disposal. Compact text remains correctly proportioned after a resize; the whole property is necessarily smaller in the short viewport. Screenshots: `output/playwright/survey-wind-heading.png` and `survey-wind-heading-compact.png`. Desktop viewport was restored.

TypeScript checking and production build pass; the existing bundle warning remains. No new tests were added for these presentation changes. Full-hunt readability, sustained performance, and mobile hardware acceptance remain outstanding.


**Three-dimensional launch sound**

Launch audio previously reduced each source to a left/right stereo value; directly ahead and directly behind therefore had the same direction signal. The existing pheasant wing burst and rooster cackle now share an HRTF PannerNode. Source direction uses the actual bird offset transformed by the inverse camera quaternion, including pitch, while full three-dimensional distance feeds the existing attenuation curve. The panner's own rolloff is disabled to avoid double attenuation. Listener-global state is unchanged, and source direction is normalized with a finite fallback. Existing smoothing, actual-launch timing, mute/capture behavior, and completion/recycle cleanup remain.

Integration checks cover camera reversal, pitch, bird/listener translation, delayed launches, and routing lifetime. Initial failures reflected the old tests' horizontal-only distance assumptions; assertions now include the fixture's actual 0.2-meter launch height. All 647 tests across 87 files, TypeScript checking, and production build pass; the existing bundle warning remains.

Real browser OfflineAudioContext renders used the same deterministic noise sequence for front, back, right, and elevated sources at five meters. Front RMS was 0.02179 per channel; rear 0.01768 per channel; right 0.01712 left / 0.02547 right; elevated 0.01910 per channel. Front/back/elevated waveform comparisons differed and every handle released at completion. The review temporarily supplied an offline audio context to fresh module instances and restored both the global constructor and random generator afterward. This establishes actual spatial audio processing, not subjective quality, reliable localization on laptop speakers, or ordinary-hunt acceptance.


**Authored dry shoulders and homestead rise**

Pheasant terrain now combines its existing wetland noise with three broad, property-anchored dry landforms: a six-meter homestead rise, a five-meter western field shoulder, and a nine-meter interior crest. These amplitudes overlap and are not final absolute elevations. Contributions remain zero within 1.5 normalized pond radii and ease in through radius 2.7, preserving existing basin floors and shoreline terrain. Shared terrain sampling carries the change into ground, props, vegetation, birds, and both entry transforms. No stocking or cover footprint changed.

The matching South approach camera (-42,-27), yaw 0, pitch -4 compares `output/playwright/pheasant-relief-before.png` and `pheasant-relief-after.png`: the homestead now stands on a visible rise and the track climbs toward it, while wet cover remains lower beside the approach. `pheasant-relief-west.png` records West coordinates (63,93), yaw -121, pitch -4; the change is subtler there. These are staged composition checks, not ordinary-hunt acceptance.

A ten-yard property grid measured maximum slope 0.2665 (grade), elevations from -1.7605 to 11.6766 meters, and zero height difference between entry transforms. All three pond-floor elevations match their pre-change values exactly. The regression checks retained water anchors, entry agreement, dry relief, and a sampled slope below 0.3. All 648 tests across 87 files, TypeScript checking, and production build pass, with the existing bundle warning. Whole-hunt traversal, changing flight sightlines, and sustained terrain-sampling performance still need play review.


**South Gate seed 53 and precise point guidance**

A fresh morning South Gate seed-53 hunt walked the revised homestead approach through a natural point, hen rise, and results: one point flush, one escaped bird, no shot or retrieve, two minutes afield. Screenshots `south53-route.png`, `south53-climb.png`, `south53-point.png`, and `south53-rise.png` are in `output/playwright/`. Movement and mouse input were ordinary; pointer-lock requests were made unavailable for browser review so the existing drag fallback could be used. No pose, bird, hit, or simulation-time overrides guided the route. Observation gaps remain, and the first drag initiated fallback rather than turning. The new climb is visible during travel, but the captured forward-view hen rise was again not visually identified.

A focused audit found that eight-way point guidance can miss the nose line materially: a 337-degree dog heading reads NW, while walking 315 degrees for roughly 12.3 meters produces about 4.6 meters of lateral error. That is comparable to a tight pheasant's flush radius. It is a plausible mechanism for side/rear rises, not a verified explanation of this particular hen. An unpointed neighbor can also flush independently.

Close-point guidance now includes the observable dog's compass degrees alongside its cardinal. From three to twelve meters it asks the player to close to the dog first; within three meters it asks them to follow the nose bearing into cover. Beyond twelve meters the existing general approach cue remains. It never reads concealed bird coordinates or promises a shooting opportunity. A sector-boundary regression preserves 337 degrees rather than replacing it with NW's center. All eight locator checks, TypeScript checking, and production build pass; the existing bundle warning remains. A fresh approach is still required to assess the improved cue in ordinary play.


**Continuous close approach captures an identifiable natural hen**

The first repeat of South Gate seed 53 showed the new 327-degree cue, but observation gaps confounded attribution: the dog changed from four yards away to thirty-two, and results recorded two escapes for one point flush. The later captured rise cannot be confidently assigned to the earlier observed point. `south53-precise-close.png` and `south53-precise-rise-0.png` through `-7.png` document that limited attempt.

A second repeat walked the same entry for thirty-eight seconds, then continuously steered using only dog position/heading and the hunter camera, equivalent to the information supplied by the locator and point direction. Once within two meters of the pointing dog, automation followed its nose bearing. Ordinary mouse dragging and walking supplied movement; no hidden bird position, forced flush, simulation stepping, pose placement, pause during the approach, or hit override guided it. This is precise automated alignment, not independent human play.

A natural hen flushed with the dog five yards away. Eight subsequent captures record the bird rising through the right-hand cover, visibly clearing the stems by the third capture, and leaving the forward frame. Files: `output/playwright/south53-continuous-rise-0.png` through `-7.png`. Revealed-airborne diagnostics, recorded only after the flush and not used to steer, show the first sample at 267 ms, approximately 4.3 meters away horizontally and 0.10 meters below camera height. At 833 ms the bird was 1.76 meters above camera height. The camera remained on the 327-degree point line at its original downward pitch. Fire was held; results in `south53-continuous-results.png` report zero point flushes, one escape, no retrieve, and two minutes. The event therefore cannot be credited as the pointed target: it may be an unpointed neighboring bird disturbed during the approach.

This verifies a readable natural rise in this guided encounter and demonstrates why isolated captures with observation gaps are insufficient. It does not prove the revised cue alone caused the improvement, establish repeatable human acquisition, or satisfy ordinary successful-shot/retrieve acceptance. No gameplay source changed in this review.


**Hold a separate point through a neighboring rise**

Source review found that every continuous flush called each dog's onFlush handler, and a successful steadiness roll always switched a pointing dog into marking, clearing its target and turning it toward the rise. That abandoned a separate still-hidden bird when a neighbor flushed. This is a confirmed state-machine behavior; the previous South-53 capture does not establish which specific point/neighbor relationship occurred there.

A steady dog now retains its point, heading, and target when the actual flushed IDs exclude its pointed bird. The existing steadiness roll still permits an unsteady dog to break. Its own bird flushing still transitions into marking normally, as does ordinary non-pointing work. This preserves a meaningful remaining point during an unexpected neighbor rise instead of converting every rise into the end of the dog's work. The existing HUD reads actual dog state and can show a point while a neighboring rise is active.

Dog regressions verify the held nose line and target, subsequent own-bird marking, and retained breaking behavior. The shared simulation regression flushes a separate covey with no point credit, confirms the original bird remains hidden and pointed, then flushes that target and credits precisely one point. All 652 tests across 87 files, TypeScript checking, and production build pass; the bundle warning remains. Natural mixed-bird encounters and the player's choice between the airborne neighbor and remaining point still need play review.

**Whole-hunt review and effort reset**

The subsequent live South-53 review displayed HEN FLUSH while DOG ON POINT remained five yards away. This is observable evidence of retaining a separate point during a neighbor rise. A diagnostic prototype hook did not attach to the live module, so it supplies no event attribution. The completed session recorded one point flush, two escapes, and no retrieve in five minutes. Observation gaps prevent treating this as an uninterrupted encounter or identifying the later pointed bird from the results alone.

A fresh West Track seed-87 morning review walked the starting track, observed closing and holding scent, and later observed a point. The dog resumed other work before the next approach was captured. No shooting opportunity was identified or fired upon. Screenshots `output/playwright/west87-first-approach.png`, `west87-track-end.png`, and `west87-point-approach.png` document the route. Browser tool gaps make this unsuitable evidence for encounter pacing or failed player acquisition; the session is paused rather than counted as a complete hunt. No forced events, pose changes, or hit overrides were used.

A bounded source audit found that shooting is instantaneous center-pattern selection: `GunSystem.fire` passes the camera ray to `pickBirdAlongRay`, which checks current bird position without shot travel. That can penalize a hunter who leads a crossing bird, but it is not an established explanation for these reviews, which did not fire. Do not expand ballistics or add further cues to explain an unobserved miss. The next acceptance attempt must exercise the current shooting contract and physical recovery before choosing a change. Minor contact effects, bearing refinements, and repeated isolated-rise captures are deferred. Complete-hunt problems and visibly substantial environment changes take priority. No gameplay changes or additional tests were made in this review.

**Whistle recovery no longer leaves the dog permanently at heel**

Continuing the West-87 hunt exposed a concrete control dead end: after recall, the dog reached heel and remained there. The 2D scene handles a second whistle by casting the pack off; continuous 3D play only cast dogs off during the initial introduction. Further whistles ignored heeled dogs. The locator also labeled heel as coming in, concealing the actual waiting state.

Continuous simulation now casts the pack when a whistle arrives with every dog at heel, consuming that whistle so it does not immediately recall them again. Mixed packs retain the existing behavior, and points and retrieves remain protected. Spatial recall now arrives within 1.5 meters and follows beyond two meters rather than using the legacy ten/fourteen-unit distances. The HUD distinguishes heel from recall and explains that another whistle resumes hunting. Legacy 2D distances and its existing cast handling remain intact.

Live West-87 verification used ordinary walking, Q, waiting, and Q again: the dog returned to a displayed two yards, showed DOG AT HEEL with the cast instruction, then resumed cover-edge work and moved out to thirteen yards. `output/playwright/west87-recall-heel.png` records the waiting state. No position, state, or hit overrides were used. All 654 tests across 87 files, TypeScript checking, and production build pass; the existing bundle warning remains. Regressions cover recall through physical arrival and cast, continued searching, and preserving a mixed pack's point. This removes a confirmed hunt interruption, but does not establish the still-unproven complete shooting-and-retrieval benchmark.

**Natural West-87 flush through assisted shooting and physical recovery**

The resumed West-87 morning hunt completed the functional sequence after the recall/cast check. A continuous browser driver walked the starting heading, then followed the observable dog position during tracking and pointing. The dog began tracking about thirty seconds into this segment and pointed about eight seconds later. A pause divided the walking review into bounded tool calls; simulation stayed paused during the observation gap. On resuming the approach from seventeen yards, a natural rooster flushed after about 4.8 seconds with the dog six yards away.

The driver mounted with F, used the airborne bird's reported coordinates to aim through normal mouse dragging, and pressed Space. The first shot connected at roughly half a second into flight, consuming one shell. This is deliberately assisted targeting: it does not prove the bird was visually identifiable or unobscured at trigger time. There were no concealed-bird steering coordinates, forced flushes, hit overrides, pose setters, or simulation stepping. The driver is retained as untracked review tooling at `output/audit/continuous-hunt-review.js`.

After another review pause, the hunter remained stationary while the actual fall and recovery ran. The dog transitioned from marking to retrieving, carried bird 1 back from about twenty-five yards, and delivered it. The displayed bag remained zero while carried and became one only after handoff; down count changed from one to zero. Ending through the normal button produced one bird retrieved, one point flush, zero escapes, and one minute afield. Evidence: `output/playwright/continuous-hunt-shot.png`, `west87-recovery-0.png`, `west87-recovery-3.png`, `west87-recovery-42.png`, `west87-recovery-94.png`, and `west87-retrieved-results.png`.

This closes the missing end-to-end functional observation for one natural encounter, including recall/cast before searching. It does not close the ordinary unassisted, uninterrupted quality milestone, other seeds, or actual mobile verification. Do not repeat this fixture merely to accumulate successful shots. Recovery now has live evidence; further work should address player-visible weaknesses, especially bird acquisition against the cover and the environment's repetitive silhouettes and weak depth, rather than inventing another recovery defect. No gameplay changes or new tests were needed for this successful observation.

**Autumn leaf shapes and layered pheasant sky**

Standing prairie leaves now arch outward and droop below their shoulders, with four deterministic tip variations. Medium-distance leaves are narrower to reduce their broad spear appearance. Plant roots, population, culm height, seed heads, and habitat placement remain unchanged; the existing vertices carry the new shapes. Pheasant sky now uses four broad, separated autumn cloud banks with restrained underside shading instead of repeated outlined cumulus shapes. Other properties retain their existing cloud selection.

Matching paused West views at (94,98), yaw -69, pitch -7 are recorded in `output/playwright/pheasant-shapes-before.png` and `pheasant-shapes-after.png`. The geometry load is identical: 217 calls and 1,214,780 triangles. This does not measure shader timing. `pheasant-shapes-lite-evening.png` checks the lightweight tier and evening palette; its 181 calls and 661,670 triangles are not an A/B performance comparison. The lightweight capture still shows pronounced edge aliasing, and these changes do not resolve the landscape's weak distant relief or establish airborne bird readability.

Both existing vegetation checks, TypeScript checking, and production build pass, with the existing bundle warning. No new tests were added for these reversible shape changes. The images are staged visual comparisons, not further evidence of ordinary-hunt quality.

**Separated farm-country horizon layers**

The pheasant backdrop now has more distinct, offset low rises. Narrower asymmetric shoulders leave gaps between overlapping features rather than adding into a nearly constant skyline. The near and middle layers carry sparse rounded shelterbelt crowns, generated in the existing ridge vertices. Farmland retains a low, open horizon; the actual playable terrain, routes, bird behavior, and other properties are unchanged.

Staged comparisons at West (94,98), yaw -69, pitch -7 are `output/playwright/pheasant-horizon-before.png` and `pheasant-horizon-after.png`. The reverse view at yaw 111, pitch -4 is `pheasant-horizon-reverse.png`. These show separated haze bands and small broken crown groups, with a quieter reverse horizon. The backdrop adds no meshes, vertices, or rendering passes. TypeScript checking and production build pass; the existing bundle warning remains. This is distant scenery rather than traversable new hills, and no claim of improved encounter readability follows from the still images.

**Edge smoothing at the lightweight pixel budget**

The lightweight renderer now requests context antialiasing, retaining its existing lower resolution, geometry detail, basic shadows, and low-power preference. The browser confirmed antialiasing was enabled in this review. Matching West-87 morning views at (63,93), yaw -121, pitch -4 show cleaner stalk, gun, and horizon edges in `output/playwright/pheasant-lite-aa-before.png` and `pheasant-lite-aa-after.png`.

Thirty sequential GPU timer queries per configuration, after five warm renders, measured median 3.321 ms without smoothing and 4.302 ms with it; p95 was 5.764 and 6.514 ms. Both used 1293 by 712 drawing buffers, 161 calls, and 630,706 triangles. This is a small paused laptop sample, not a sustained hunt or mobile benchmark. The roughly one-millisecond median increase is a measured tradeoff rather than a free visual improvement; actual phone cost remains unverified. Browsers may decline the antialias request. TypeScript checking and production build pass, with the existing bundle warning. No gameplay changes or new tests were needed.

**Fuller irregular canopy masses within the existing tree batches**

Pheasant cottonwoods and shelterbelts now use coherently deformed thirty-two-face foliage masses, replacing the twenty-face seed shapes. Windbreak crown shoulders are broader and overlap more naturally. Faceted shading, tree placement, trunk collision, and batch organization remain. The first eighty-face experiment was rejected for its unnecessary scene-wide geometry increase.

The final reverse West view at (94,98), yaw 111, pitch -4 is `output/playwright/pheasant-canopy-after.png`, comparable to `pheasant-horizon-reverse.png`. It uses 122 calls and 1,347,635 triangles, versus 122 calls and 1,312,559 before the canopy change: about 2.7 percent more triangles in that view, without more calls. These are geometry counts, not measured GPU timing. The silhouette improvement remains modest at distance and does not amount to tree-asset acceptance.
