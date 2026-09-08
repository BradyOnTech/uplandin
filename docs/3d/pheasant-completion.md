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
