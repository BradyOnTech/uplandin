# Quail and Sharptail regional identity

September 22, 2026. This follow-up gives Quail Fields and Sharptail Prairie separate plant silhouettes and ground treatments while retaining the accepted habitat and routes. Quail reads as warm southern bobwhite cover; Sharptail reads as pale, open northern mixed-grass prairie. It builds on the playable checkpoint at `4a26d7a`.

**Quail Fields**

The connected plum refuges now have wider, darker, unequal crowns above visible branching stems. Grass is shorter and less dense inside their woody cores; the established grass aprons and casting openings remain. Existing kit roots widen without growing taller or moving. Ground paint separates sandy/russet openings from darker woody litter.

The 124 kit roots and 546 procedural shrub roots remain fixed. Procedural shrub geometry falls from 392 to 320 triangles. The widened kit assets remain inside their existing occupancy masks: the largest unit-scale footprint is approximately 1.54 metres against a 2.29-metre mask. An independent asset audit measured more than four yards from every transformed kit vertex to the closest track center.

**Sharptail Prairie**

Independent native grass replaces the shared Quail leaf fans. The plants have upright culms, narrow tapered leaves and small seed spikelets. The first candidate was too wiry at 844×390, so the final pass widens lower leaf bodies and sheaths while keeping slender tips and the same number of plants and triangles. Low, open silver-sage/snowberry shapes replace solid shrub lumps. The same 49 shelterbelt roots now carry slender deciduous crowns on visible forked trunks.

Pale litter covers the broad shoulders, with cooler green-gray swales. The terrain shader reuses its existing noise evaluations at a finer litter scale and stronger contrast specifically for Sharptail. It adds no texture, shader sample, draw group or terrain geometry. Other properties retain their previous surface response.

Grass geometry costs 26, 34 and 78 triangles for short, stalk and cover variants, below the previous 36/36/80 limits. Tree pairs fall from 580 to 170 triangles; open shrubs use 36. Grass instance counts, quality-tier geography and placement budgets are unchanged.

**Scope and integration**

This commit does not change bird stocking, encounter logic, habitat rectangles, terrain heights, routes, controls or dog behavior. Shared hooks are restricted to the two map IDs. Cattail and Chukar keep their accepted assets and ground treatments.

The coordinator owns a separate atmosphere change in `palette.ts` and `sky.ts` at `b2196eb`. That change is intentionally absent from this branch and the captures below. The coordinator must review the combined foliage, soil and atmosphere after integration.

**Evidence**

The same three positions per map were captured at FOV70, ordinary eye height, seed 1184004868, morning and noon. High uses 1440×810; Lite uses an emulated 844×390 touch viewport. These fixed positions are staged environment inspections, not complete playthroughs. Separate morning recordings use ordinary input from the actual South Gate spawn to approach and return without setting position, time or bird state.

Local, uncommitted evidence lives in `artifacts/3d/regional-identity/`. Final reports use `regional-final-morning-*` and `regional-final-noon-*`. The noon baseline uses `regional-before-noon-*`; the morning baseline is `artifacts/3d/prairie-blitz/final-*`. Files labeled `regional-after-*` preserve the initial wiry candidate and are not the final result.

```sh
node tools3d/review-prairie-blitz.mjs --url http://localhost:4623 --label regional-final-morning --tod morning --walk --out artifacts/3d/regional-identity
node tools3d/review-prairie-blitz.mjs --url http://localhost:4623 --label regional-final-morning --tod morning --quality lite --mobile --out artifacts/3d/regional-identity
node tools3d/review-prairie-blitz.mjs --url http://localhost:4623 --label regional-final-noon --tod noon --out artifacts/3d/regional-identity
node tools3d/review-prairie-blitz.mjs --url http://localhost:4623 --label regional-final-noon --tod noon --quality lite --mobile --out artifacts/3d/regional-identity
```

Full-frame submissions include the existing game presentation. Counts describe these views, not all possible camera directions or frame rates.

| View | Previous High triangles / calls | Final High triangles / calls | Previous Lite triangles / calls | Final Lite triangles / calls |
| --- | ---: | ---: | ---: | ---: |
| Quail entry | 1,169,082 / 255 | 1,139,544 / 255 | 628,483 / 226 | 612,517 / 226 |
| Quail drainage | 1,007,490 / 239 | 980,304 / 239 | 512,312 / 208 | 494,639 / 208 |
| Quail windmill | 807,360 / 215 | 792,594 / 215 | 451,425 / 188 | 442,854 / 188 |
| Sharptail south shoulder | 645,113 / 146 | 567,912 / 145 | 272,921 / 113 | 250,215 / 113 |
| Sharptail windbreak | 810,033 / 161 | 752,358 / 161 | 300,729 / 126 | 275,972 / 126 |
| Sharptail return | 1,046,520 / 195 | 986,910 / 195 | 469,535 / 181 | 443,276 / 181 |

**Verification and limits**

The final production build, TypeScript and whitespace checks pass. Eight focused test files pass 57 tests for composition, vegetation geometry and LOD, kits, world continuity, habitat and optional ground textures. All 24 final staged inspections and both ordinary-input recordings passed their guards, with no browser errors. Both entry walks advanced approximately 33 metres before returning. Browser capture guards check scene readiness, actual rendered image variation, ordinary FOV and browser errors.

The maps are more regionally distinct, but this is a checkpoint rather than finished environment art. Quail's refuge silhouettes are still simplified. Sharptail's short-grass entry is intentionally sparse; the outer native stands retain a continuous band of stems on Lite. Both properties still have conspicuously straight, uniform tracks, and Sharptail's ground remains plain in open foregrounds despite the stronger litter variation. These are concrete later composition and material priorities.

The short entry walks do not establish a complete hunt or full-route acceptance. Emulated mobile screenshots do not establish physical-phone frame time, thermal behavior or foliage shimmer. The combined atmosphere review and sustained device play remain required.
