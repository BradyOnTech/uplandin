# Chukar western route composition

The western approach now has twelve authored vegetation and exposed-ground stands around West Sentinel, Western Mesa and the existing switchback. This is a bounded visual composition pass, using the accepted sage, bunchgrass, stone and terrain paint. It does not redesign the accepted southern climb, rocks or horizon.

**Where the changes lead the eye**

| Existing route section | Composition | Intended read |
| --- | --- | --- |
| West Track arrival and first turn | A low grass pocket beside the approach | A recognizable start and final return landmark without obscuring the path |
| West Sentinel | Sage behind the brow, an exposed talus apron below it, another sage pocket along the contour | Separate sheltered ground from the steep rocky face |
| Contour to Western Mesa | Grass on the lower shoulder, sage along the bench, a pale open apron below the rock | Follow the existing traverse while seeing changes in ground and shelter |
| Mesa high side and eastern shoulder | Two distinct sage pockets, followed by a grassy saddle and open shoulder | A progression toward the middle route rather than one uniformly planted hillside |

All positions are property yards. West Sentinel remains at `(159, 386)`, Western Mesa at `(410, 283)`, and the mapped western bench and shoulder at `(392, 336)` and `(588, 296)`. Plant generation and ground paint consume the same composition samples from either truck drop. Existing trail, landmark and solid-rock exclusion rules still keep plant placement out of the walking corridor.

**Gameplay boundary**

This makes the existing route and its reverse more visually recognizable. It does not add a new return loop or direct-climb trail, move bird habitat, change scent, promise a bird in a sage pocket, or introduce new terrain obstacles. The western ground remains dry: no new drainage or height change was introduced. Actual encounter placement and tactical high-side advantages need their own gameplay assessment before this route can be called a complete hunting slice.

**Verification**

`test/chukarComposition.test.ts` and `test/chukarProduction.test.ts` passed together: 19 tests. Coverage includes sheltered versus exposed planting, proximity to the actual western switchback, intentional gaps, drop-independent coordinates, preserved southern composition samples, original drainage and existing route/rock clearance.

Three matched before/after views were inspected in the real 3D renderer at player eye height, FOV 70, morning, 1440 × 900, in both Standard and Lightweight detail. These are staged environment comparisons; no bird state was used to judge the composition and they are not ordinary hunting, mobile usability or FPS evidence. All four capture runs reported no page errors. The Lightweight baseline omitted the new western stand entries only in the browser's module response; it did not revert or rewrite the shared source checkout.

Local review files are in `output/chukar-western-blitz/`: `before` and `after` screenshots for `west-entry`, `mesa-bench` and `return`, with camera and renderer records in the matching JSON manifests. `review.mjs` reproduces these views against the isolated development server on port 4629.

A separate ordinary Lightweight run used keyboard movement and pointer-lock looking from West Track, around the first switchback and toward West Sentinel. It recorded 28 seconds of movement, 108 metres of net displacement and 3.3 metres of net elevation gain, without a blocked route, unintended pause or page error. The grass and sage transitions remain visible in the moving-run screenshots, and the path stays clear. Evidence is `west-entry-walk.mp4`, `walk.json`, `moving-00.png`, `moving-07.png`, `moving-14.png`, `moving-21.png` and `moving-final.png` in the same folder. This short segment did not reach Western Mesa or complete a hunt. Recording affects timing, so it is not a frame-rate measurement.

**Rendering cost and remaining work**

| Standard view | Draw calls before → after | Submitted triangles before → after |
| --- | ---: | ---: |
| West entry | 187 → 187 | 1,163,510 → 1,332,236 (+14.5%) |
| Mesa bench | 160 → 160 | 1,337,266 → 1,627,790 (+21.7%) |
| Return | 143 → 145 | 1,052,414 → 1,302,180 (+23.7%) |

| Lightweight view | Draw calls before → after | Submitted triangles before → after |
| --- | ---: | ---: |
| West entry | 166 → 165 | 433,908 → 463,596 (+6.8%) |
| Mesa bench | 137 → 136 | 456,694 → 507,710 (+11.2%) |
| Return | 122 → 122 | 390,406 → 431,808 (+10.6%) |

Lightweight retains the bench pockets and exposed aprons with a smaller geometry increase and no added draw calls at these viewpoints. The additional vegetation reuses the current instancing and distance-detail rules, but it adds submitted geometry, including Standard shadow passes. These measurements establish the cost rather than demonstrate a frame-rate improvement. Physical-device review remains explicit acceptance work. Further tuning should preserve these recognizable pockets and exposed gaps while reducing their rendering cost if measurements require it.

Next, walk the complete western approach and return during an ordinary hunt, review dog casts and bird presentations against the new scenery, and reconcile any habitat changes with the shared map and simulation. Keep that follow-through distinct from the completed composition work.
