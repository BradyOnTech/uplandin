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
