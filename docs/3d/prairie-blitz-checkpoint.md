# Quail and Sharptail playable map checkpoint

September 22, 2026. This batch turns Quail into a sequence of connected refuge edges and gives Sharptail continuous native prairie beyond the entry. It preserves the shared simulation, seeded encounters, existing species mixes and Cattail environment. This is a playable composition checkpoint, not final art or phone performance acceptance.

**Quail Fields**

Seven authored plum chains replace the random cover scatter. Their 28 habitat rectangles feed the simulation, map and grass placement together. The two established entry coverts remain. Narrow woody cores have broader nesting/feeding grass aprons; seven short-grass casting openings leave room to work either side of an edge and reposition between coverts.

The route now has connected South Gate and West Track edges, a drainage shoulder, visible refuge beside the windmill, an eastern return and a northern outlying covert. Existing shrub assets supply 124 deterministic roots across the same six material batches. Larger, unequal groups at the drainage and windmill are visible from ordinary camera height. Procedural shrubs concentrate in the plum cores instead of scattering evenly over the property. Ground color follows the cover and clearings. Seven small rooted timber/litter props extend beyond the entry.

The first candidate's distant groups were too small to read. The final pass reallocated remote groups toward the drainage and windmill, keeping the same total kit roots. No new downloaded assets were added.

**Sharptail Prairie**

Twenty-one long native stands, plus the two existing entry patches, follow six broad shoulders and two shallow swales. Terrain, soil color, grass height and grass tint share those property-space features. The same heightfield is used from either parking place. The mixed population remains sharptail, prairie chicken and Hun; neither bird locations nor flushes are scripted to scenic landmarks.

Grass previously stopped at the legacy 235-metre entry-centered boundary. Sharptail now uses its real property bounds with the existing moving near-grass pool, capped distant stand instances and distance culling. Walking the eastern return no longer exposes a bare terrain plate. The grass wear follows the actual area routes instead of synthetic links between nearby cover patches.

The first candidate exposed another inherited mismatch: clipped cereal stubble in a native prairie. Sharptail now reuses tapered, rooted grass geometry at its own heights and colors. Two northern shelterbelts use 49 matched trees instead of scattered primitive trees across the casting ground. Wind-stretched cloud banks replace the old isolated cumulus shapes. Both quality settings share the shelterbelt roots and authored habitat.

**Review and evidence**

Use the immutable baseline at commit `201a8098f3d1cbcc4edb5a465f6e42b2739197c9`. The review script records the same positions, morning light, seed 1184004868 and FOV70 for before/after comparison. Fixed-position inspections are explicitly staged environment evidence. Separate recordings start at the ordinary South Gate spawn and use keyboard input for an approximately 33-metre approach and return, without setting position, advancing time or altering birds.

```sh
node tools3d/review-prairie-blitz.mjs --url http://localhost:4621 --label before
node tools3d/review-prairie-blitz.mjs --url http://localhost:4623 --label final --walk
node tools3d/review-prairie-blitz.mjs --url http://localhost:4623 --label final --quality lite --mobile
```

The three Quail views are entry plum shoulder, drainage crossing and windmill return. The three Sharptail views are south grass shoulder, windbreak approach and prairie return. Captures and JSON reports are local, uncommitted evidence in `artifacts/3d/prairie-blitz/`. The `final-high-*-ordinary-walk.mp4` recordings preserve elapsed time. Browser errors and missing renders fail the script. Mobile captures use an emulated 844×390 touch viewport, not a physical phone.

Observed full-frame submissions, including the existing game presentation:

| Map/view | Baseline High triangles / calls | Final High triangles / calls | Final Lite, 844×390 triangles / calls |
| --- | ---: | ---: | ---: |
| Quail entry shoulder | 960,487 / 314 | 1,169,082 / 255 | 628,483 / 226 |
| Quail drainage | 1,011,896 / 313 | 1,007,490 / 239 | 512,312 / 208 |
| Quail windmill | 616,876 / 250 | 807,360 / 215 | 451,425 / 188 |
| Sharptail south shoulder | 524,826 / 138 | 645,113 / 146 | 272,921 / 113 |
| Sharptail windbreak | 88,780 / 94 | 810,033 / 161 | 300,729 / 126 |
| Sharptail return | 269,924 / 118 | 1,046,520 / 195 | 469,535 / 181 |

Sharptail's large outer-route increase restores previously missing grass. Its near pool remains fixed, distant candidates cap at 650 per stand in Lite and 1,000 in High, and the interpolated sward field uses about 28 KB. CPU inspection found about 3,500 accepted far instances and 2.06 MB of grass instance buffers on Lite; these are buffer counts, not total GPU memory. Quail uses more nearby triangles at the entry and windmill to make the refuge groups readable, while visible batch counts fell as woody scatter consolidated.

**Verification**

The final production build and TypeScript check passed. Eleven combined test files passed 66 tests covering composition, shared terrain, habitat, seeded encounters, entry safety, kits, vegetation continuity and hunting opportunities. Quail's existing checks cover 50 seeds at each entry. An additional read-only Sharptail audit covered 100 seeds per entry: stocked birds remained inside habitat and outside both parking clearings, with varied first encounter anchors roughly 76–183 yards away. Sampled Sharptail route grades stayed below approximately 10.3%.

A regression test places a route close enough to clip a shelterbelt crown and verifies that the whole tree is excluded. Matching trunk/crown clearances are scoped to Sharptail's normalized tree geometry. Existing woodland contracts were also checked by the implementation worker.

**Remaining work**

The distant Quail backdrop is still broad and plain, and some procedural foliage silhouettes remain angular. Sharptail's ground and track transitions can look too uniform at long distances; the Line Shack is still a simple prop. These are the next art priorities after reviewing the whole integrated build. This batch does not redesign dog animation, shooting, other maps or the accepted Cattail cover.

The short input walks verify entry motion and near/mid vegetation transitions. They do not establish a complete hunt, full-route navigation, user preference or every lighting combination. Existing nonblocking scenery-tree behavior remains on Sharptail; its shelterbelts sit beyond the main casting lanes. Full-hunt acceptance and sustained physical-phone performance are still required, particularly for the added outer-property grass. No desktop frame-rate claim is substituted for that device check.
