# Cattail Coverts: the working farm

Cattail Coverts used to be a flat plain of bare tan dirt. It had a few random
rectangles of tall grass and a slough-and-homestead pocket in the middle. It is
now a prairie-pothole farm in late October. Every yard of it belongs to
something: harvested crop, hay, a grass fencerow, a CRP block, a slough or the
farmstead.

## Layout (`src/game/pheasantFarm.ts`)

- **Fields:** ten axis-aligned fields tile the 1400 × 800 yd property.
  - Crops: corn stubble ×3, soybean stubble ×2, wheat stubble ×3 and hay ×2.
  - Each field has a planter direction (rows run east–west or north–south).
- **Cover:** the old `scatterRects` cover is replaced by `pheasantFarmCover`.
  - It holds CRP blocks on the north line, the weedy section-line fencerows, a
    grassed waterway through the north beans, an east food-plot strip and CRP
    buffers.
  - The authored pond pockets and farmstead windbreak still win through
    `pheasantDryCover`, exactly as before.
  - Total cover area is comparable to the random layout, and it is split into
    about 38 stands, so birds spread along it the same way.
- **Fences:** `pheasantFarmFenceLines` gives the section fences. Openings are
  left where routes, truck entries and pond margins cross.
- **Field edges:** fields stop 3.5 yd short of each section line. That leaves a
  brome headland and fencerow between every pair of parcels.

## Ground

### Crop paint (`propertyTerrain.ts`)

Each crop has its own tone in `PHEASANT_MATERIALS`:

- bleached corn residue over dark loam
- grey-brown bean ground
- pale wheat straw
- cured hay aftermath

Any dry ground that is neither crop nor cover paints as a brome verge. The cool
litter under standing cover now stops within 4.5 m of the cover, instead of 9 m.

### Farm map (`pheasantCropSurface.ts`)

A 3-yd property texture records four things per texel:

- crop
- row axis
- harvest amount
- verge

The terrain shader uses it to draw, in world metres:

- 30-inch corn rows with drifting residue
- 15-inch bean rows with chaff
- 7.5-inch wheat drill rows with sprayer tramlines every 18.3 m
- hay windrow scars

Patterns fade out with `fwidth` before they can alias. The map is built once per
landscape (about 0.25 s in Node) and shared with the residue system.

## Residue near the hunter (`pheasantCropResidue.ts`)

Residue geometry depends on the crop:

- **Corn:** cut stalk stubs standing exactly on the shader's rows, with
  knocked-down stalks and shredded leaves.
- **Wheat:** straw in four-row drill patches.
- **Beans:** snapped bean stems and pods.
- **Hay:** regrowth tufts.

It streams in 24 m chunks:

- One chunk is built per frame, at about 2 ms each.
- Chunks are built within 64 m and released beyond 96 m.
- The near mesh is used within 24 m and a simple mesh out to 50 m (14 / 32 m
  on lite).
- The emissive lift follows time of day, so stubble does not glow at dawn or
  dusk.

The old sparse "stubble" and litter in harvested ground were removed from
`PheasantCoverSystem`. Verges now get knee-high brome clumps.

## Scenery (`pheasantScenery.ts`)

- **Section fences:** three-wire fences on round posts.
- **Hay bales:** a broken line of round bales along the hay windrows. They are
  solid for the hunter.
- **Windbreaks:** a row of dark eastern red cedars on the field side of every
  shelterbelt.
- **Belt placement:** the field belts now sit on the farm's edges:
  - the west property line
  - the north line
  - the section road above the east corn
  - the south-east line

## Survey map

The survey map tints harvested ground by crop, hatches it along each field's
rows and draws the section fences.

## Reviewing it

- **Playground:** `tools3d/cattail-coverts-review.html` runs the real renderer
  with staged views. It includes light and detail switches, look left, right
  and down, and a route walk. Two views are raised overviews: `setPose` accepts
  an optional `lift` for these, and ordinary play never passes it.
- **View list:** `tools3d/cattailCovertsViews.ts` holds the views. They are
  anchored to landmarks, so layout edits keep them aimed.
- **Headless frames:**
  `node tools3d/review-cattail-coverts.mjs --label after [--tod evening] [--quality lite] [--views truck,harvest]`
  writes frames plus a JSON report of draws and triangles. It needs the dev
  server.

## Budget

Staged high-quality frames, before → after (draws / triangles):

| View | Before | After |
| --- | --- | --- |
| Truck | 260 / 1.10 M | 270 / 1.12 M |
| Slough neck | 259 / 1.31 M | 262 / 1.44 M |
| Harvest field | 207 / 0.48 M | 217 / 0.73 M |
| East fields | 137 / 1.21 M | 143 / 1.30 M |
| Overview (north) | 239 / 0.43 M | 200 / 0.54 M |

On lite, the truck and harvest views are 232 / 0.70 M and 194 / 0.54 M.
