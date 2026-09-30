# Sharptail Prairie look pass

Sharptail Prairie is late-October mixed-grass pasture in rolling glacial country. The pass aims for a stylised, low-poly AAA look. The land should read as a working rangeland with plant communities, stone and ranch history, not as one straw colour with evenly spaced clumps.

Review it in the map playground (`tools3d/map-review.html?area=sharptail-prairie`) or render the staged frames:

```
node tools3d/review-map.mjs --area sharptail-prairie --label after
node tools3d/review-map.mjs --area sharptail-prairie --label after --tod evening --views truck,swale,windmill,overview-south
```

The staged views are defined in `tools3d/sharptailPrairieViews.ts`. They are look-development evidence only, never playthrough evidence.

## What the land is made of

| Layer | Where | What it does |
| --- | --- | --- |
| Plant communities | `sharptailCommunities.ts` | Colonies tens of yards across: copper little bluestem on dry crowns, bronze-maroon big bluestem in swales, blue-grey western wheatgrass on flats and silver needle-and-thread on cured shoulders. They change hue but keep the meadow's light and shade. Grass, the mid sward and terrain paint all share them, so near blades and far ground agree. |
| Bunches | `sharptailBunchGeometry.ts` | Finer, upright fountains that don't read as crop seedlings. The wind comb still lays the windlaid form over. |
| Turf floor | `sharptailTurf.ts` | A streamed short sward between the bunches, so there is no bare paint floor near the hunter. It stays off stones, the shack yard, exposed till and two-track ruts. Sparse cured forbs (goldenrod, aster, yarrow, gumweed) stand in loose drifts on drier ground. |
| Mid sward | `sharptailMidSward.ts` | The 30–250 m canopy, with slow wind waves (a sheen band scaled by wind strength). |
| Terrain paint | `propertyTerrain.ts` | A darker crown floor and less washed cure, plus the community tint at a lower strength. |
| Erratics | `sharptailErratics.ts` | Sloped, weathered granite with lichen and crevice tones, instead of upright tombstones. |
| Shelterbelts | `plainsTree.ts` (`poplar`) | Grown plains poplars in autumn yellow, instead of lollipop trees. |
| Ranch | `sharptailRanch.ts` | A four-wire boundary fence with heavy corner and stretch posts, open gaps at both drops, and a swale windmill and stock tank. The windmill and tank are solid for the hunter and dogs. |

## Budgets

Triangle counts are for a single staged view at 1440×810.

| Quality | Typical view | Heaviest view |
| --- | --- | --- |
| High | 1.3–1.7M | about 1.9M (return) |
| Lite | 0.70–0.75M | — |

Before this pass, high was about 1.5–1.73M. The main costs are the turf and the poplars. Tests guard the tree (≤900 triangles) and habitat budgets. `test/sharptailRanch.test.ts` covers the communities, turf streaming and ranch furniture.

## Known trade-offs

- Poplars read dark when they are backlit in the morning. This is kept on purpose, because it is what a real shelterbelt does against the sun.
- The turf only streams within about 18 m (high) or 11 m (lite). Beyond that range, the mid sward and paint carry the ground.
