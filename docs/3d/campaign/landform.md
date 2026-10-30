# Landform lane: bigger grounds of named hunt areas

Lane log and design for the World and Birds campaign (`docs/3d/world-and-birds.md`), branch `lane/landform`. The targets are the decisions "Bigger grounds made of recognisable hunt areas", "Birds live where the land says, not around the truck", "Chukar climbing costs something, but is not punishing" and "Landform tests become invariants", and the Chukar art target. Evidence images live in `docs/3d/campaign/landform/`.

## What a player gets

Each core ground grows to roughly two to three times its area and is built from six to ten named hunt areas. Each area has its own landform, cover and landmark, and is named on the survey map and in the HUD as you walk into it. Each ground has three or four truck entries around its edge. Birds are placed where the land suits them at that hour and month, seeded per hunt, so two hunts on the same ground find birds in different places. Every entry has a covey within a fair walk out ahead, but nothing is staged in front of the truck.

Chukar Ridge is rebuilt first (milestone 1). Sharptail, Quail and Cattail follow at their new sizes; their designs are below.

## The four grounds at their new size

Sizes are in yards (one property pixel is one yard). Bird uses are roost, feed, loaf, escape and water. They are weighted by hour (dawn, morning, noon, evening, last light) and by month, so hunting a different hour means hunting a different part of the ground.

### Chukar Ridge: a Snake River / Owyhee canyon wall (built)

2,200 × 1,400 yd, up from 1,400 × 800 (2.75× the area). About 225 m of climb from the river road to the rim flat, with the river another 55 m below the south fence. It has three basalt rim bands, each with a talus apron below and a bench above. Spring Creek is a side canyon on the east, Sage Draw and Juniper Draw cut the west wall, the Hogback spur sits between them, and an east ridge rises beyond the creek. The river runs in the canyon floor off the property to the south, under the far canyon wall.

| Area | Landform | Cover | Landmark | Birds |
| --- | --- | --- | --- | --- |
| Rim Flat | The sage plateau above the upper rim | Big sage in stands, with cheat and bunchgrass openings | Line camp corral | Huns feed on the flat at first light and in the evening; in late season chukar work the rim edge and pitch over it when pushed. Feed .6, loaf .2 |
| West Point | An upper-rim spur, its talus and the cheat slope below | Rimrock, talus, cheatgrass | The point itself | Roost and call off the point at dawn, then walk down onto the cheat; pushed birds run back up into the rocks. Roost .8, escape .9 |
| High Bench | The broad bench between the middle and upper rims | Bluebunch wheatgrass, sage under the rim lip | Sheepherder's cairn | Midday loafing within reach of the rim; on warm days in the lip shade. Loaf .9, feed .5 |
| Castle Rock | The middle rim's promontory, with columns on three sides | Rimrock and talus | Castle Rock | Roost and escape: birds call from the castle at first light and run into its talus. Roost .9, escape 1 |
| Sage Draw | A draw cutting all three rims: the easy way up the west wall | Big sage in the bottom, cheat on the sides | Juniper snag | On windy days birds tuck into the sage bottom; runners use it to go uphill. Escape .6, loaf .6 |
| West Bench | The lower bench on the west wall | Cheat and bunchgrass, sage along the lip | Guzzler | Early in the season and on hot afternoons the guzzler draws coveys down; in the mornings they feed on the bench. Water .9, loaf .6 |
| Cheat Face | The long south-facing slope between the lower and middle rims | Cheatgrass striped with cattle trails | The Slide (talus) | The morning feed, more so as the season goes on and the cheat greens after rain; flushed birds sail down the face. Feed 1 |
| River Breaks | Rolling knobs and gullies above the river road | Cheatgrass, sage in the gullies | Cabin chimney | Early and late in the day birds come down toward the river; the nearest birds to the road. Feed .7, water .3 |
| Spring Creek | The side canyon, its bed greened below the spring | Willow, rose and green grass on the seam; sage and cheat on the walls | Spring and willows | Water: in September and on hot days coveys stay within a walk of the spring and come to it morning and evening. Water 1, feed .5 |
| North Face | The shaded north flank of the east ridge | Bluebunch wheatgrass and talus, cool | Split Rock | Warm afternoons push loafing coveys into the shade; holds frost and scent longest in the morning. Loaf .7, escape .5 |

**Entries:**
- River Road (south): the classic climb from the bottom.
- West Bench (west): starts on the lower bench, mid-wall.
- Rim Gate (north): starts on top, for hunting down ("get above them").
- Spring Creek (south-east): the side canyon's mouth.

**Routes:** eight trails, planned over the land by `tools3d/bake-trails.mjs chukar-ridge` (contours where possible, switchbacks where needed, never through rock):
- River Road climb, up Sage Draw through all three rims to the flat.
- West Bench trail.
- High Bench and Castle trails along the benches.
- Rim two-track across the flat.
- Spring Creek trail, up the creek bed past the spring to the flat.
- A cattle traverse across the Cheat Face.
- The breaks road between the two bottom entries.

Rim breaks (draw floors and weathered stretches) are the easy ways up. Cattle trails stripe the slopes as scenery.

### Sharptail Prairie: Missouri Coteau mixed-grass (next)

2,400 × 1,500 yd (about 1.3 sections, up from 1,400 × 800). It is built from glacial swells and kettle draws cut by two coulees. Their heads are dark buckbrush (snowberry, chokecherry, buffaloberry) thinning into big bluestem swales. Rounded crests carry granite erratics. A section fence, a windmill and the stock dam give scale.

| Area | Landform | Cover | Landmark | Birds |
| --- | --- | --- | --- | --- |
| Line Shack Crest | The highest swell, a view across the coteau | Short grazed wheatgrass, needle-and-thread | Claim shack | Midday loafing on the gentle crest with a view; late-season packs flush wild off it |
| West Coulee | A coulee cutting the west side, with a woody head | Buckbrush head, bluestem swale | The coulee head thicket | Escape and winter shelter; evening feeding on snowberry and rose hips along it |
| Big Swale | A broad wet swale below the shack | Maroon big bluestem, taller | Badger knoll | Loafing in the heat of the day; roost cover at last light |
| Stock Dam | A dam and its draw | Rank grass, cattails at the dam | The dam | Water early in the season; morning feeding on the grasshoppers along the margin |
| Erratic Knob | A rounded knob with granite erratics | Copper little bluestem on the dry crown | The big erratic | Dawn feeding on forbs; sunning |
| Snowberry Draw | A side draw | Snowberry and rose | A lone ash | Midday shade and berries; late-season packs |
| Tipi Ring Hill | A long shoulder with stone circles | Mixed grass, grazed shorter | Tipi rings | Morning feed, open-view loafing |
| Windmill Pasture | Flat pasture around the windmill and tank | Grazed shortgrass | Windmill | Huns; water in September |
| North Coulee | The second, deeper coulee | Buckbrush and chokecherry | Cutbank | Late-season shelter, packs in snow |
| Section Fence Edge | The fenceline along a neighbour's stubble | Fence-line grass against stubble | Corner post | Morning and evening feeding toward the grain |

**Entries:** South Gate (section road), West Track, North Section Line, East Windmill road.
**Routes:** section-line two-tracks, cattle trails along the coulee rims, and a loop past the dam.

### Quail Fields: Rolling Red Plains, western Oklahoma (next)

2,200 × 1,500 yd. It is red sandy rangeland in low rolls with one creek winding through. The creek's gullied red clay breaks are lined with hackberry, elm and cottonwood. Sand plum thickets cluster in covey headquarters on the uplands, with shinnery oak and sand sage mottes between them. Mesquite is scattered, and there is a windmill and tank.

| Area | Landform | Cover | Landmark | Birds |
| --- | --- | --- | --- | --- |
| Windmill Flat | A low rise with the windmill and tank | Grazed grass, bare ground at the tank | Windmill | Water in September heat; covey call at first light from the plum nearby |
| Plum Row | A line of sand plum thickets along a swell | Plum thickets 1–3 m, open underneath, little bluestem between | The big plum motte | Headquarters: midday loafing and escape; roost ring in the grass beside it at dusk |
| Creek Bottom | The creek's floodplain and timber | Hackberry, elm, cottonwood; sand sage on the terraces | The crossing | Escape cover and winter shelter; singles go here after a covey rise |
| Red Breaks | Gullied red clay where the creek cuts the uplands | Bare clay, sand sage, sumac | A washout | Escape; loafing in the gully shade |
| Shinnery Flats | Sandy flats of shinnery oak mottes | Shinnery oak, sand bluestem | A big motte | Feeding on acorns in autumn; loafing under the mottes |
| Old Burn | Last spring's prescribed burn, greening | Short regrowth with forbs | The firebreak gate | Morning and evening feeding on seeds and insects |
| Disked Strip | Disked firebreak strips | Ragweed and bare soil | The disk-harrow | Dawn feeding and dusting |
| Sand Sage Hill | A sand hill of sand sagebrush | Sand sage, sideoats | A blowout | Loafing; escape for scattered singles |
| Mesquite Pasture | An open pasture with scattered mesquite | Grass, mesquite | Lone mesquite | Feeding and travel between headquarters |
| Old Fence Corner | A sagging four-wire corner | Fencerow grass and plum | The corner post | Edge feeding, morning |

**Entries:** South Gate, West Track, Creek Crossing (east), North Road.
**Routes:** two-tracks, the creek trail, the firebreaks.

### Cattail Coverts: prairie-pothole farm, eastern South Dakota (next)

2,400 × 1,600 yd (about 1.4 sections). It keeps the farm grid that already works: section roads, stubble fields, CRP blocks and shelterbelts. It gains real pothole basins, a grassed waterway in a shallow draw, and slight crowns on the section roads.

| Area | Landform | Cover | Landmark | Birds |
| --- | --- | --- | --- | --- |
| Homestead | The farmyard on a low crown | Shelterbelt, weedy yard edges | Barn and bins | Late-season shelter; loafing in the windbreak |
| South Slough | A large pothole | Cattail ring, open water | Muskrat lodge | Roost at last light; winter shelter until snow chokes it |
| West Pothole | A smaller pothole | Cattail and bulrush | The pothole | Roost; slough points for runners |
| Grassed Waterway | A shallow draw through the fields | Brome and switchgrass strip | Culvert | Travel lane; birds pile up at its end |
| CRP Block | A long-term grass block | Switchgrass and big bluestem | Shelter belt end | Midday loafing |
| North Corn | Corn stubble | Stubble | Grain bins on the horizon | Morning and evening feed |
| East Beans | Bean stubble | Stubble | A rock pile | Feeding; walk-outs from the CRP |
| Fencerow Corner | A weedy fence corner | Kochia and grass | Corner post | Runners stop at the corner |
| Old Farmstead | An abandoned grove | Overgrown trees and plum | Collapsed shed | Winter shelter; Huns |
| Section Slough | A slough on the section line | Cattail ring | Power pole | Roost and runners |

**Entries:** South Gate, West Track, North Section Road, East Approach.
**Routes:** section roads, field edges, the waterway.

## Technical approach

### Feature-authored landforms behind the existing seam

`LandscapeModel` and its `LandformAdapter` stay the single authoritative, synchronous landscape. The player, dog, birds, shots, survey map and renderer all read it, and Node tests construct it synchronously. Behind the adapter, a rebuilt ground is data evaluated by `src/game/featureLandform.ts`:

- **A wall profile** (`WallProfile`). The cross-section of the land is a list of segments (floor, slope, talus, rim, bench, flat), each with a width and a rise. It is smoothed into a lookup table. A second, heavily smoothed table turns rim faces into steep walkable chutes wherever a break softens them.
- **A wall coordinate** (`chukarCanyon.ts`). This is the distance up-wall from the river, meandered so the rims bay in and out.
  - Drainages are thalweg polylines with an incision depth and a half-width per vertex (`FeatureLine`). They cut the coordinate.
  - Crests and spurs raise it; a mesa holds one bench level.
  - Because height depends only on this coordinate, every rim wraps around a draw head or a spur nose at the same elevation, the way horizontal basalt flows do.
- **Breaks.** Draw floors and authored chutes soften rim faces. A weathering field slumps stretches of every rim into rubble.
- **Free relief.** Knobs on the breaks, rills down the fall line and low hummocks are added only where they cannot move a rim.
- **A lazy height cache** (`TiledHeightCache`): a 2 yd grid filled in 64-cell tiles on first touch. A test sampling three points pays for three tiles; the renderer pays once. Bilinear reads equal the analytic surface at the grid nodes. Outside the property (horizon, far terrain) reads are analytic, and the surface is defined for kilometres in every direction.

**Derived grids:**
- An 8 yd habitat grid (`landHabitat.ts`) holds slope, aspect (`southness`), cover class, a distance to escape cover (a chamfer pass) and a distance to water.
- An 8 yd hunt-area membership grid is built from elevation-weighted seeds.
- Rim contours come from marching squares on the wall coordinate (`isoLines`).

Sky occlusion is baked by the Light lane's `groundLight.ts` from whatever landform a ground has, so the canyon floor and the draws already see less sky. Flow accumulation is not yet derived; it belongs in milestone 2.

### Rimrock

Rim modules (`chukarRimModules()`) are spaced 4.2 yd along each rim band's mid-line wherever the rim is intact. Each module records an out-of-cliff normal, the foot and lip heights, a weathering amount and a buttress offset. The weathering field spares the two promontories (Castle Rock and West Point) and their flanks, so the landmarks keep whole columnar crowns.

- **Blocking:** the same modules give the collision discs that stop the hunter (`ChukarEnvironmentSystem.collisionCircles`) and the dog (`LandscapeModel.solidBlockers`, read by `hunt3d`). They also give `solidAt`, which keeps birds and falls out of rock.
- **Rendering** (`chukarRimrock.ts`): each module is a short run of hexagonal basalt columns (the colonnade) under a broken entablature, with a rubble cone burying the foot. Draw cost is fixed at four calls:
  - an instanced far slab for every module, always drawn, a few triangles each and set inside the columns;
  - three instanced column variants, refilled around the hunter.
- **Shots:** the far slabs are the shot solids.

### Habitat made from the land

Chukar cover classes are rimrock, talus, sage, cheat, bunchgrass, seep and bare (`chukarHabitat.ts`):
- Rims and their talus are roost and escape cover.
- Cheat takes the sunny south and west slopes and the breaks.
- Bluebunch takes the north and east faces and the high bench.
- Sage fills the draw bottoms, sits in stands on the flat, and shelters under the rim lips.
- The spring seam is water.

Each 8 yd cell carries a land suitability for each bird use. Habitat is queryable for the Cover lane and any other consumer through:
- `habitatClassAt(area, x, y)`
- `habitatRoleAt(area, role, x, y)`
- `landHabitat(area)` (the whole grid)
- `huntAreaAt(area, x, y)` and `huntAreasFor(area)`

**The derived-rectangle view.** `derivedCoverRects(area)` keeps `dog.ts` and `birds.ts` working during the migration. It merges into rectangles, at most 128 yd a side with a 1.5 yd seam between them, the quarter of open ground where birds sit: roost, escape, water and loafing ground, plus feeding ground within a short run of the rocks. The quarter matches the share of cover on the other grounds, and the seams pin a runner at the end of its piece of cover instead of letting it road along a whole rim. `AreaConfig.patches` for Chukar is a lazy getter over this view.

### Placement from the land, seeded per hunt

`landDrivenAnchors` (`landHabitat.ts`, reached through `authoredEncounterAnchors` for any ground with a land habitat) works as follows:

1. **Weights.** Each candidate cell's suitability for each use is weighted:
   - by hour: dawn is roost and feed; noon is loaf and escape;
   - by month: September doubles water; late season leans to feed and escape;
   - by weather when it is known: hot means water and shade;
   - by the hunt area's uses.
2. **Lean.** The hunt's seed leans every area up or down (a log-normal factor), so the same ground holds birds in different places on different hunts.
3. **Routes.** A share of birds favours ground within 110 yd of a route, so walking the trails is a fair way to hunt.
4. **The entry covey** is drawn first:
   - any decent cover out ahead of the truck within about 410 yd of walking (climb counts 2.5 yd per metre), near a route;
   - the nearest, most directly ahead, most on-route cover is favoured, and the weights are flattened so the covey is not in the same pocket every hunt;
   - never closer than 150 yd to the chosen truck;
   - the conditions relax in steps if the land has none.
5. **The second covey** lies within 520 yd further along the way out.
6. **The rest** are a weighted draw with 64 yd spacing.

Coveys stay 70 yd inside the fence, because a runner pressed against a boundary roads along it for minutes, and the derived cover view stops there too, so a dog never spends the first minutes of a hunt on a strip by the fence no covey can sit in. They also stay a dog's reach (4.5 yd) clear of rock. A Loaded field packs coveys into the good cover within a walk of the entry.

Chukar stocks 32 coveys (`AreaConfig.coveyTarget`), which keeps the old ground's bird density on the bigger one.

### Climbing

`src/game/climbing.ts`. On a ground built as a climb (`AreaConfig.climbing`, set only on Chukar Ridge), the hunter's walk slows with the grade along the line of travel:
- 0.84× on a 10% grade, 0.55× on 30%, 0.45× on 40%;
- a trail takes a third of the grade's sting;
- steep descents are careful.

Climbing spends breath. About 48 m of steady climbing winds a rested hunter: he slows to 60–100% and can't run, and he gets his breath back on the level or standing. The HUD says "winded".

### The dog and the rimrock

A long rim defeats local obstacle avoidance: a dog steering straight at a fall above a rim slides along the rim forever. `LandformNav` (`src/game/landformNav.ts`) works on a 2 yd rock grid with a soft margin and hard rock:
- a windowed A* finds the route round the rim through the nearest break;
- the dog steers at the farthest point along it that it can see;
- routes are cached per target.

`dog.ts` uses it, through an optional `DogEnv.navigate`, for retrieves, deliveries, "dead bird" seeking and the scent road-in. `hunt3d` makes three more fixes:
- it keeps hidden birds off the rock each tick;
- it moves a fall that lands on the rim to open ground beside it;
- it brings a delivery to open ground at the hunter's side when he faces off a rim.

### Performance plan for bigger grounds

- **Heights** are evaluated once into the lazy cache. Placement and the habitat grid use an 8 yd analytic lattice, so stocking birds never forces the fine cache to fill.
- **Plants and talus** stream in 128 yd tiles around the hunter (build range 320 m High, 215 m Lightweight), one tile per frame while walking and all at once after a jump or capture. Far tiles are disposed. Draw and memory cost track the view, not the ground's size.
  - Draw ranges: grass 150 / 95 m, sage 190 / 130 m, talus chips 130 / 80 m, talus blocks 300 / 200 m (High / Lightweight).
  - Up close each tier keeps a share of the grass and sage candidates (High 62% / 70%, Lightweight 34% / 40%).
  - Past 45 m (30 m on Lightweight) from a tile's edge, only its far share is drawn: one grass bunch in three and one sage in two. The far share sits first in each instance buffer, so thinning is just a smaller `InstancedMesh.count`.
  - The fine plant geometry is only used underfoot (10 m for sage); grass always uses its light form.
- **Rimrock** is a fixed four draw calls.
- **Terrain.** Near tiles (128 yd) follow the hunter. Their far form is merged into blocks of 3 × 3 tiles, sunk 0.15 m so a near tile drawn over its block always wins. The ground has 198 tiles where it had 77, but only about two dozen far blocks.
- **Measuring it.** `tools3d/scene-cost.mjs` stages a review view and lists the meshes in the frustum with their draws and triangles.
- **The horizon** is the 1,000 yd apron the region horizon (`horizon.ts`) stands on. It is coarser per sample (18 yd High, 28 yd Lightweight) and kept under 110k triangles on High, with Lightweight at half.

### Invariant test policy

Tests no longer pin heights or positions on a rebuilt ground. They assert rules that always hold:
- the cache agrees with the authored surface;
- the canyon has its relief, and rims are cliffs in the heightfield;
- every rim module lies on its own band, and every rim is broken in places;
- drops sit on gentle ground clear of rock;
- every route is walkable along its own grade, connected to an entry, and clear of the rimrock;
- every piece of cover is reachable on foot from every entry;
- a dog can route round a rim to a fall;
- the hunt areas cover the ground, follow the land and carry their landmarks;
- habitat follows aspect and draws, and the rimrock shows on the habitat map;
- no covey is staged in front of the truck, one is always within a fair walk, and placements differ between hunts and between hours;
- no bird or fall is in rock;
- climbing costs something and is not punishing.

See `test/chukarLandform.test.ts` and `test/chukarScenery.test.ts`. Tests elsewhere that named Chukar positions now find them from the land (`test/huntSimulation.test.ts`, `test/reachableCoverSearch.test.ts`).

## Hunt lab

`tools3d/huntlab/` plays real hunts headless. It drives the actual `Hunt3DSystem` and `BirdsSystem` through Vite SSR, nothing is written to the repo, and `HUNTLAB_ROOT` points it at another checkout for a baseline.

**Hunters.** They watch the dog, shoot birds 12–38 m out (two shots a rise, hit chance falling with range) and send the dog with "dead bird" for a fall it has not picked up. They never read hidden birds. Each kind walks a different way:
- *follow*: walks after the dog;
- *trail*: walks the trail network out from the entry;
- *tactic*: walks to the nearest unvisited visible cover (hunt areas, or patches on older grounds), comes into a chukar point from above and elsewhere from the flank.

**Constraints.** Hunters stop for the rise and the retrieve, can't walk through rock, and route round rims as a player who can see the breaks would.

**Metrics:**
- first contact, first point and first flush;
- the longest dry spell between contacts (scent, point or flush), counting the walk to the first and the tail after the last;
- coveys met, points, flushes;
- shots, hits and birds delivered, with retrieve time;
- stuck retrieves (not delivered within 90 s);
- stuck dog states (any state but heel or quartering held over 75 s);
- birds and falls inside rock;
- climb.

**Running it:**

```
node tools3d/huntlab/configs.mjs pacing [areas] [entries-json] > /tmp/set.json
tools3d/heavy.sh node tools3d/huntlab/sweep.mjs /tmp/set.json /tmp/out.jsonl --workers 2 --chunk 36
node tools3d/huntlab/report.mjs /tmp/out.jsonl area,hunter     # or drop,hunter / area,dog
```

The sweep runs at most two workers, each recycled after a chunk of hunts. The 432-hunt baseline took 130 s.

### Baseline: all four grounds before the rebuild

These are 10-minute hunts. Each row covers both entries × 6 seeds × (GSP 8, English setter 8, GSP 1), so 36 hunts. The code is the campaign head `f6d0f89`: no landform work, but the birds lane's waves merged. The lab's current hunters are used, so the rows compare like for like. Times are in seconds.

Two columns need reading carefully:
- "long chases" are tracking spells over 75 s, a dog roading a runner.
- "in rock" counts birds or falls inside solid rock.

A first run from `3b518a2`, before the birds lane's waves, gave nearly the same picture.

Per-hunt rows are in `landform/pacing-baseline.csv`.

| group | n | 1st contact | 1st point | dry med | dry p90 | dry>3m | coveys | points | flushes | shots | hits | delivered | retrieve s | stuck retr | stuck states | long chases | in rock | climb m |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chukar-ridge follow | 36 | 10 | 31 | 492 | 563 | 100% | 1.2 | 2.1 | 2.2 | 234 | 126 | 126 | 22 | 0 | 0 | 0 | 0 | 65 |
| chukar-ridge tactic | 36 | 10 | 31 | 246 | 357 | 56% | 4.6 | 5.8 | 6.2 | 639 | 328 | 308 | 21 | 0 | 0 | 0 | 0 | 104 |
| chukar-ridge trail | 36 | 10 | 31 | 152 | 224 | 22% | 5.3 | 6.8 | 7.3 | 696 | 362 | 346 | 21 | 0 | 0 | 0 | 0 | 67 |
| pheasant-coverts follow | 36 | 89 | 121 | 300 | 459 | 94% | 2.2 | 2.9 | 3.7 | 154 | 87 | 86 | 16 | 0 | 0 | 4 | 0 | 6 |
| pheasant-coverts tactic | 36 | 90 | 107 | 206 | 600 | 53% | 3.1 | 4.1 | 4.9 | 211 | 108 | 104 | 15 | 0 | 0 | 4 | 0 | 11 |
| pheasant-coverts trail | 36 | 70 | 86 | 271 | 496 | 89% | 2.3 | 3.6 | 4.4 | 171 | 103 | 102 | 16 | 0 | 0 | 5 | 0 | 8 |
| quail-fields follow | 36 | 19 | 34 | 172 | 363 | 42% | 6.0 | 5.6 | 6.6 | 558 | 354 | 344 | 20 | 0 | 1 | 0 | 0 | 17 |
| quail-fields tactic | 36 | 17 | 32 | 130 | 188 | 14% | 6.4 | 6.8 | 7.5 | 696 | 422 | 406 | 20 | 0 | 1 | 0 | 0 | 15 |
| quail-fields trail | 36 | 19 | 34 | 120 | 245 | 28% | 6.3 | 6.6 | 7.5 | 626 | 392 | 369 | 20 | 0 | 1 | 0 | 0 | 17 |
| sharptail-prairie follow | 36 | 36 | 58 | 481 | 530 | 100% | 1.9 | 2.1 | 2.3 | 167 | 80 | 80 | 19 | 0 | 0 | 0 | 0 | 35 |
| sharptail-prairie tactic | 36 | 35 | 51 | 358 | 515 | 78% | 2.9 | 3.1 | 3.3 | 215 | 109 | 105 | 20 | 0 | 0 | 1 | 0 | 48 |
| sharptail-prairie trail | 36 | 36 | 52 | 184 | 380 | 50% | 5.4 | 5.5 | 6.0 | 388 | 202 | 192 | 20 | 0 | 0 | 0 | 0 | 28 |

stuck states (17):
quail-fields south-gate 1184004868 english-setter-8 follow: pointing 152s @281
quail-fields south-gate 41 gsp-8 trail: pointing 92s @311
pheasant-coverts south-gate 1184004868 gsp-8 tactic: tracking 83s @121
pheasant-coverts south-gate 1184004868 english-setter-8 tactic: tracking 91s @122
pheasant-coverts south-gate 41 gsp-8 trail: tracking 91s @509
pheasant-coverts south-gate 41 english-setter-8 follow: tracking 102s @490
pheasant-coverts south-gate 41 english-setter-8 trail: tracking 97s @497
quail-fields west-track 41 english-setter-8 tactic: pointing 77s @523
pheasant-coverts west-track 7 gsp-8 follow: tracking 88s @6
pheasant-coverts west-track 7 gsp-8 trail: tracking 88s @6
pheasant-coverts west-track 7 gsp-8 tactic: tracking 88s @6
pheasant-coverts west-track 7 english-setter-8 follow: tracking 86s @11
pheasant-coverts west-track 7 english-setter-8 trail: tracking 86s @11
pheasant-coverts west-track 7 english-setter-8 tactic: tracking 86s @11
pheasant-coverts west-track 2026 english-setter-8 follow: tracking 82s @203
pheasant-coverts west-track 2026 english-setter-8 trail: tracking 82s @155
sharptail-prairie west-track 2026 english-setter-8 tactic: tracking 102s @361

Chukar by entry:

| group | n | 1st contact | 1st point | dry med | dry p90 | dry>3m | coveys | points | flushes | shots | hits | delivered | retrieve s | stuck retr | stuck states | long chases | in rock | climb m |
| chukar-ridge south-gate follow | 18 | 13 | 35 | 491 | 554 | 100% | 1.4 | 2.1 | 2.2 | 112 | 59 | 59 | 22 | 0 | 0 | 0 | 0 | 47 |
| chukar-ridge south-gate tactic | 18 | 13 | 34 | 106 | 141 | 11% | 6.0 | 7.3 | 8.1 | 388 | 201 | 189 | 20 | 0 | 0 | 0 | 0 | 88 |
| chukar-ridge south-gate trail | 18 | 13 | 35 | 109 | 152 | 6% | 5.7 | 7.2 | 7.7 | 381 | 192 | 183 | 20 | 0 | 0 | 0 | 0 | 73 |
| chukar-ridge west-track follow | 18 | 8 | 28 | 502 | 564 | 100% | 1.0 | 2.1 | 2.2 | 122 | 67 | 67 | 21 | 0 | 0 | 0 | 0 | 84 |
| chukar-ridge west-track tactic | 18 | 8 | 28 | 330 | 357 | 100% | 3.2 | 4.3 | 4.4 | 251 | 127 | 119 | 22 | 0 | 0 | 0 | 0 | 120 |
| chukar-ridge west-track trail | 18 | 8 | 28 | 173 | 224 | 39% | 4.8 | 6.3 | 6.9 | 315 | 170 | 163 | 21 | 0 | 0 | 0 | 0 | 60 |

### Chukar Ridge rebuilt

The same hunters and seeds are used across all four entries, 72 hunts per hunter. Per-hunt rows are in `landform/pacing-chukar-m1.csv`.

| group | n | 1st contact | 1st point | dry med | dry p90 | dry>3m | coveys | points | flushes | shots | hits | delivered | retrieve s | stuck retr | stuck states | long chases | in rock | climb m |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chukar-ridge follow | 72 | 79 | 121 | 378 | 600 | 75% | 2.7 | 3.3 | 3.5 | 637 | 322 | 313 | 21 | 0 | 0 | 0 | 0 | 35 |
| chukar-ridge tactic | 72 | 72 | 105 | 150 | 271 | 33% | 5.2 | 6.3 | 6.8 | 1073 | 526 | 505 | 19 | 0 | 0 | 4 | 0 | 47 |
| chukar-ridge trail | 72 | 55 | 80 | 151 | 257 | 28% | 4.7 | 6.2 | 6.5 | 1087 | 541 | 528 | 19 | 0 | 0 | 1 | 0 | 34 |

By entry:

| group | n | 1st contact | 1st point | dry med | dry p90 | dry>3m | coveys | points | flushes | shots | hits | delivered | retrieve s | stuck retr | stuck states | long chases | in rock | climb m |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| creek-mouth follow | 18 | 43 | 76 | 240 | 466 | 72% | 3.4 | 3.9 | 4.3 | 218 | 113 | 110 | 21 | 0 | 0 | 0 | 0 | 38 |
| creek-mouth tactic | 18 | 43 | 72 | 189 | 293 | 50% | 5.1 | 6.3 | 6.8 | 288 | 155 | 150 | 19 | 0 | 0 | 0 | 0 | 51 |
| creek-mouth trail | 18 | 56 | 77 | 188 | 316 | 50% | 4.2 | 5.8 | 6.0 | 262 | 129 | 123 | 20 | 0 | 0 | 0 | 0 | 33 |
| rim-track follow | 18 | 56 | 76 | 311 | 426 | 78% | 3.4 | 4.3 | 4.7 | 232 | 109 | 105 | 21 | 0 | 0 | 0 | 0 | 6 |
| rim-track tactic | 18 | 81 | 108 | 228 | 301 | 72% | 3.4 | 4.4 | 4.8 | 216 | 106 | 102 | 22 | 0 | 0 | 0 | 0 | 11 |
| rim-track trail | 18 | 56 | 74 | 141 | 231 | 28% | 4.4 | 6.4 | 6.5 | 296 | 152 | 147 | 20 | 0 | 0 | 0 | 0 | 4 |
| south-gate follow | 18 | 409 | 446 | 529 | 600 | 83% | 1.5 | 2.1 | 2.1 | 62 | 36 | 36 | 18 | 0 | 0 | 0 | 0 | 55 |
| south-gate tactic | 18 | 72 | 100 | 147 | 167 | 0% | 6.4 | 7.2 | 8.0 | 290 | 138 | 130 | 17 | 0 | 0 | 2 | 0 | 76 |
| south-gate trail | 18 | 61 | 116 | 151 | 184 | 17% | 4.2 | 4.9 | 5.0 | 219 | 104 | 104 | 18 | 0 | 0 | 0 | 0 | 72 |
| west-track follow | 18 | 600 | 600 | 600 | 600 | 67% | 2.4 | 3.1 | 3.0 | 125 | 64 | 62 | 19 | 0 | 0 | 0 | 0 | 40 |
| west-track tactic | 18 | 117 | 133 | 134 | 179 | 11% | 5.8 | 7.1 | 7.7 | 279 | 127 | 123 | 17 | 0 | 0 | 2 | 0 | 49 |
| west-track trail | 18 | 50 | 86 | 95 | 219 | 17% | 5.9 | 7.6 | 8.4 | 310 | 156 | 154 | 18 | 0 | 0 | 1 | 0 | 28 |

stuck states (5):
chukar-ridge south-gate 2026 gsp-8 tactic: tracking 82s @201
chukar-ridge south-gate 2026 english-setter-8 tactic: tracking 83s @211
chukar-ridge west-track 2026 gsp-1 trail: tracking 86s @211
chukar-ridge west-track 2026 gsp-1 tactic: tracking 105s @276
chukar-ridge west-track 90210 gsp-8 tactic: tracking 184s @416

**Reading it against the baseline:**
- **Dry spells.** The median longest dry spell falls from 492 to 378 s following the dog, and from 246 to 150 s reading the cover. On the trails it holds (152 to 151 s).
- **Coveys met.** Up from 1.2 to 2.7 following the dog, and from 4.6 to 5.2 reading the cover. Down from 5.3 to 4.7 on the trails, because the coveys no longer sit in a line along the trail from the truck.
- **First contact.** The median moves from 10 s (the old covey staged 72–180 yd ahead of the truck) to 55–79 s, by design.
- **Stuck retrieves and stuck dogs:** none. Birds or falls in rock: none.
- **Long chases.** Five long chases with runners, where the old ground had none: chukar run uphill and the dog roads them.
- **By entry:**
  - West Bench is better than before on every count but one: following the dog from the West Bench the dog casts away from the birds.
  - River Road is worse than before on the trails (151 s against 109 s) and reading the cover (147 against 106 s). Its old staged covey sat on the switchback; now the only escape cover in a fair walk ahead is the mouth of Sage Draw.
  - The new entries hunt well: Rim Gate 141 s on the trails, Spring Creek 188 s.
- **Cost.** Simulation time is about 0.11 ms a tick on average.

## Lead review of milestone 1 (2026-10-30)

Reviewed on `lane/landform` at `99b9275` (the lane's last code commit is `2e93877`), against the campaign head `b3c6c87`, before merging.

**Checks.** tsc is clean, 2,063 tests pass in 248 files, and the production build passes. The merge into the campaign branch is clean: the lane already holds the campaign head, so the merged tree is the lane's tree.

**Postcards.** `landform/chukar-ridge-m1-before-after.jpg` pairs the campaign head with the lane for each tier and hour (High morning, Lightweight morning, High evening): truck, talus, guzzler, seep-above, cairn and vista. `landform/chukar-ridge-m1-canyon-views.jpg` adds seven canyon views on High morning: Castle Rock, the rim overlook, Rim Gate, Sage Draw, the North Face, the River Breaks and the corral. No page errors.

| View | High draws | High triangles | Lightweight draws | Lightweight triangles |
| --- | --- | --- | --- | --- |
| truck | 213 → 116 | 1.35M → 950k | 178 → 90 | 501k → 459k |
| talus | 123 → 124 | 1.02M → 1.10M | 80 → 84 | 435k → 457k |
| guzzler | 203 → 125 | 1.29M → 1.18M | 158 → 88 | 490k → 508k |
| seep-above | 145 → 146 | 1.34M → 1.52M | 104 → 106 | 460k → 559k |
| cairn | 148 → 115 | 1.26M → 1.15M | 100 → 79 | 439k → 483k |
| vista | 121 → 73 | 1.19M → 1.39M | 78 → 43 | 401k → 477k |

Draws fall in most views (the streamed tiles and the four-call rimrock); triangles rise by at most a fifth, and fall in some views. Lightweight runs 43–106 draws and 457–559k triangles against the old ridge's 78–178 and 401–501k. Nothing has been measured on a phone.

**Hunt lab, re-run on the lane head.** The lane's own pacing run came before its last commits (the birds lane's planned lines merged in, and falls over the fence). Re-run with the same hunters and seeds over all four entries (216 hunts in 277 s; rows in `landform/pacing-chukar-m1-review.csv`):

| group | n | 1st contact | 1st point | dry med | dry p90 | dry>3m | coveys | points | flushes | stuck retr | stuck states | long chases | in rock | climb m |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chukar-ridge follow | 72 | 80 | 109 | 248 | 600 | 60% | 3.2 | 4.0 | 4.1 | 0 | 0 | 0 | 0 | 34 |
| chukar-ridge tactic | 72 | 77 | 108 | 139 | 249 | 32% | 5.4 | 6.4 | 6.9 | 0 | 0 | 4 | 0 | 45 |
| chukar-ridge trail | 72 | 61 | 83 | 132 | 211 | 18% | 5.1 | 6.2 | 6.7 | 0 | 0 | 4 | 0 | 33 |

- **Better than the lane's run on every hunter.** The median longest dry spell is 248 s following the dog (378 in the lane's run, 492 on the old ridge), 139 s reading the cover (150, 246) and 132 s on the trails (151, 152). Coveys met rise to 3.2, 5.4 and 5.1.
- **The fence fix holds.** No stuck retrieves, no stuck dogs, and no bird or fall in rock.
- **Long chases.** Eight tracking spells over 75 s (five in the lane's run). Two are far too long for a game: 321 s (West Bench, setter, trail hunter) and 253 s (Rim Gate, GSP, reading the cover). Chukar do run uphill ahead of a roading dog, but not for four or five minutes.
- **Weak entries, unchanged.** Following the dog from the West Bench, the median hunt meets no birds in ten minutes. From River Road following the dog, 89% of hunts have a dry spell over three minutes. Hunters who read the cover or walk the trails do well from every entry.

**Browser hunts.** Two ordinary hunts in a desktop browser with `tools3d/playthrough.mjs`: automated play, `--uncapped`, not a measure of frame time.
- **River Road, Lightweight.** Scent at 110 s, a point at 155 s, then the covey rise and a bird down. The retrieve came to hand at 183 s, and the HUD named Sage Draw underfoot. The tool then failed at its last step, clicking End hunt. The 2026-09-29 menu redesign moved End hunt into the pause menu, and the tool (last changed 2026-09-07) still looks for the old button. A Quail Fields control on the same tree failed the same way after a full hunt.
- **Spring Creek, High.** A point at 60 s and the rise at 81 s, then a deliberate miss and four aimed misses. The bot walked straight in from below the covey, and the birds flew back past it at 2–7 m. The ground's hint is to come in from the high side, and a bot that walks in from below, then aims at birds passing at arm's length, is no test of the canyon. The same bot also missed all four shots at a rise on the old ridge (the campaign head, birds at 10–31 m).

**Against the target.** The canyon reads. Three rim bands of columnar basalt with talus aprons stand over benches and cheat slopes. Castle Rock keeps a whole columnar crown. Spring Creek is a side canyon with a green seam, the north face sits in shade, and cattle trails stripe the slopes. In the evening the rims catch the sun over shaded draws. The rounded boulder blobs are gone. Ten named areas, four entries, birds placed by the land and the climb's cost are in. It is a large step past the old sidehill.

**Carried forward:**
- **Far country from inside the canyon** (Light lane and this lane's apron). It reads as flat haze bands. The river never glints in any view, and neither the rim overlook nor the vista shows the canyon below.
- **Open slopes** (Cover lane). They read as smooth tan with sparse tufts on both tiers. The target's cheat slopes want density and mottling.
- **Sage close up** (Cover lane's woody kit). It still reads as grey-green stone clusters.
- **The River Road entry view.** It looks across the breaks to low, distant rims. The wall should loom from the truck.
- **Long runner chases** (above). Cap a chukar's roading spell, or let the bird flush.
- **Weak entries** (above). Following the dog from the West Bench and from River Road.
- **Phone cost.** Lightweight is a little above the old ridge, and has not been measured on a phone.
- **Climbing on Timberline Parks.** The climb's cost applies to any ground that has an uphill (`area.slope`), so it also applies to Timberline Parks, a ground outside the campaign. Keep it there or limit it to Chukar.
- **The playthrough tool** (`tools3d/playthrough.mjs`). It can't end a hunt since the menu redesign. Point it at the pause menu's End hunt, and let its hunter come into a chukar point from above.
- **For the light lane's merge.** Land-driven placement (`createThreeHuntSetup`) treats staged visits as frost and does not read `?weather=`, but the light lane's third milestone rolls a real day for those visits. The placement context should follow the same weather.

## Chukar fixes (2026-10-30)

Four fixes from the lead's review of milestone 1, with the hunt lab re-run over all four entries before and after. The work is on `feat/landform-chukar-sharptail`, from the campaign head `957f40a`.

### What changed

**Runner chases end inside about a minute and a half** (`src/game/birds.ts`, `species.ts`, `huntSimulation.ts`). The review's two worst "chases" were two different things:
- **253 s, a real road.** A chukar kept about 40 yd ahead of the dog for four minutes. A winded runner rested two seconds and set off again on full legs, with no limit.
- **321 s, no road at all.** A covey sat on the talus under the lower rim. The dog above it flipped between two birds of the covey 363 times, restarting its scent check each time, and never closed.

One rule now ends both. A chukar has a pressure clock:
- It runs while the lead dog works its covey's scent within two flee radii (80 yd), and runs back down while it doesn't. Ordinary scent work finishes well inside the limit.
- Past 51–69 s (seeded per bird), a runner either sits tight where it is with a sitter's nerve, so the dog can pin it, or flushes wild.
- A bird that sat and is still unpointed 15 s later flushes.
- A dog that only quarters near birds, without their scent, presses nothing.

Only chukar carry the limit (`RunnerBehavior.pressLimitMs`), and only in the continuous 3D field.

**A hunter who only follows the dog finds birds from every entry** (`src/game/dog.ts`, `huntDoctrine.ts`, `landHabitat.ts`). From the West Bench and the River Road, the dog spent the hunt by the fence. It checked cover strips there that no covey is ever placed in (coveys keep 70 yd inside the fence). Then it swept the open ground round a hunter who faced it, so the pair drifted along the fence. Two changes:
- **Fence margin.** The derived cover the dog hunts stops where the coveys do, 70 yd inside the fence.
- **Leading to cover.** On the big rebuilt grounds (`HuntDoctrine.dogObjectiveReach`: Chukar now, Sharptail next), the dog leads when nothing in range is left to check. Its open cast leans (1.2 against the gun's own line) toward the nearest unchecked cover that is ahead of the gun or level with it, or that leads further out from where the hunt began. Cover behind the gun, or back toward the truck, costs more.

A finished dog hunts to objectives this way. A hunter walking their own line still keeps the dog in front of them; the quartering test is unchanged. Nothing about hidden birds is read.

**The canyon wall looms from the River Road truck** (`src/game/chukarCanyon.ts`, `chukarRidge.ts`, `areas.ts`). A basalt spur now noses down the breaks between the west gully and Sage Draw. Its lower rim wraps the nose about 110 yd up from the truck, and the cheat face and the higher rims stack behind it. At first the rim-weathering noise slumped that rim exactly where the truck looks, and the spur read as a bare sand dome. So a spur's nose can now be kept whole, as the named promontories are; this one's is, within 130 yd. Further up, the spur's rim weathers like any other, as it did before, so the trails across the bench keep their lines. (Kept whole all along the spur, the rim sent the West Bench trail round the spur's north end.)
- **Truck headings.** Each truck now faces the way its entry was authored to open (`ChukarEntry.toward`, which the code had used only as a fallback). The River Road truck faces the spur, and Rim Gate looks down into the canyon.
- **Trails.** The River Road climb's waypoint by the spur moves to the Sage Draw floor. The trails are re-planned with `tools3d/bake-trails.mjs chukar-ridge`, which replaces `bake-chukar-trails.mjs` and serves any rebuilt ground. Four of the eight trails move where the land changed: the River Road climb, the Breaks Road, the West Bench trail and the Castle trail.

**The climb costs only on Chukar Ridge** (`src/game/climbing.ts`, `areas.ts`, `src/three/subsystems/player.ts`). A ground now opts in (`AreaConfig.climbing`), and only Chukar Ridge does. Timberline Parks keeps its `slope`, so its runners still go uphill, but it has no climb cost. I found no reason to keep the cost there:
- the ground is outside the campaign;
- its grades were never designed for a climb, and its trails were not planned over the land;
- the breath tuning was made for Chukar's 225 m wall.

The hunt lab's hunter now pays the climb where a player does; it had paid it on every ground. On an older checkout it falls back to that checkout's rule.

**Tests.** Test hunts now start their bird ids at one (`resetBirdIdsForTest`). Before, a seeded hunt's birds depended on which tests had run earlier in the same worker.

### Numbers

**Hunt lab.** The same 216 hunts as the review: four entries × three hunters × 18 (six seeds, three dogs), ten minutes each in a breeze and frost. Before is the campaign head `957f40a`, which matches the review run hunt for hunt (`landform/pacing-chukar-m1-review.csv`). After is `9114c50` (`landform/pacing-chukar-fixes-after.csv`). Each cell reads before → after. Two earlier after runs, on `8cebadc` (the spur's rim weathered) and `abd039f` (its rim whole all along), are quoted in the self-assessment for the spread.

| Hunter | 1st contact s | 1st point s | dry median s | dry p90 s | dry > 3 min | coveys met | points | long chases |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Following the dog | 80 → 82 | 109 → 116 | 248 → 152 | 600 → 312 | 60% → 44% | 3.2 → 4.9 | 4.0 → 5.8 | 0 → 0 |
| Reading the cover | 77 → 96 | 108 → 132 | 139 → 156 | 249 → 240 | 32% → 33% | 5.4 → 5.8 | 6.4 → 6.5 | 4 → 0 |
| Walking the trails | 61 → 65 | 83 → 88 | 132 → 140 | 211 → 237 | 18% → 19% | 5.1 → 5.2 | 6.2 → 6.7 | 4 → 1 |

By entry:

| Entry, hunter | 1st contact s | dry median s | dry > 3 min | coveys met | long chases |
| --- | --- | --- | --- | --- | --- |
| River Road, following the dog | 77 → 80 | 428 → 124 | 89% → 39% | 1.8 → 5.5 | 0 → 0 |
| River Road, reading the cover | 65 → 141 | 161 → 146 | 44% → 28% | 5.4 → 6.0 | 2 → 0 |
| River Road, walking the trails | 51 → 65 | 170 → 140 | 44% → 22% | 3.6 → 5.8 | 2 → 0 |
| West Bench, following the dog | 600 → 184 | 600 → 247 | 83% → 67% | 1.9 → 3.5 | 0 → 0 |
| West Bench, reading the cover | 134 → 139 | 138 → 182 | 11% → 50% | 6.5 → 4.1 | 1 → 0 |
| West Bench, walking the trails | 69 → 70 | 115 → 168 | 22% → 39% | 6.3 → 4.0 | 1 → 1 |
| Rim Gate, following the dog | 67 → 41 | 173 → 132 | 39% → 33% | 5.1 → 5.1 | 0 → 0 |
| Rim Gate, reading the cover | 70 → 42 | 218 → 153 | 61% → 22% | 4.3 → 7.3 | 1 → 0 |
| Rim Gate, walking the trails | 65 → 39 | 112 → 116 | 6% → 6% | 5.7 → 5.4 | 1 → 0 |
| Spring Creek, following the dog | 98 → 94 | 117 → 132 | 28% → 39% | 4.0 → 5.4 | 0 → 0 |
| Spring Creek, reading the cover | 68 → 87 | 113 → 162 | 11% → 33% | 5.6 → 6.0 | 0 → 0 |
| Spring Creek, walking the trails | 72 → 89 | 132 → 149 | 0% → 11% | 4.9 → 5.6 | 0 → 0 |

**Long chases** (tracking spells over 75 s): 8 → 1 in 216 hunts. The one left is 78 s, at the West Bench (seed 48291, GSP, trail hunter), and it is no road (see the self-assessment). No stuck retrieves or stuck dogs, before or after, and no bird or fall in rock.

**The River Road view**, measured from the review's truck view over the authored land:

| | Before | After |
| --- | --- | --- |
| Skyline across the middle of the view (±10°) | 12–14° above the eye | 34–37° |
| Nearest rimrock | 397 yd | 93 yd, wrapping the spur's nose |
| High: draws, triangles | 116, 950k | 132, 976k |
| Lightweight: draws, triangles | 90, 459k | 102, 465k |

### Evidence

- **River Road truck view.** `landform/chukar-river-road-before-after.jpg`: the truck view before and after, High and Lightweight, morning.
- **Pacing rows.** `landform/pacing-chukar-fixes-after.csv`; the before rows are the review's.
- **Tests:**
  - `test/chukarPressure.test.ts`, seven tests:
    - every road ends between 45 and 90 s, sitting tight or flushing;
    - a bird that sits gets a sitter's nerve, and a point has its own;
    - only a dog working the covey's scent presses it, and only in the open field;
    - a dog on the rim 70 yd above presses it;
    - the clock runs back down when the dog moves off;
    - other species keep their own temperament.
  - `test/followTheDog.test.ts`: a hunter who only follows the dog meets birds from each of the four entries.
  - `test/chukarLandform.test.ts`: every truck faces its authored view; the River Road skyline, with rimrock in the middle of the view; cover off the fence margin; the climb's cost only where a ground opts in.
  - `test/encounterPacing.test.ts`: the casting check, over approaches of 15 m and more.
- **Full suite.** On `9114c50`: tsc is clean, and all 2,076 tests in 250 files pass.

### Self-assessment

- **Chases: done.** In the final run only one tracking spell passes 75 s, at 78 s, and it is no road. A trail hunter walked on past a chukar that never moved, and the dog held the scent about 50 s until the hunter came back. The review run had eight spells over 75 s, up to 321 s. Across the three after runs made during the work (one per land version), one spell passed 90 s: the Hun covey above a rim (open issues).
- **Following the dog: much better, though the West Bench is still the weakest entry.**
  - Following the dog, the median hunt's longest dry spell falls from 248 to 152 s, and coveys met rise from 3.2 to 4.9.
  - From the River Road, hunts with a dry spell over three minutes fall from 89% to 39% (22% in both earlier runs).
  - From the West Bench, the median hunt now meets its first birds at 184 s, where before it met none in ten minutes. But two hunts in three there still have a dry spell over three minutes, and I haven't found why. The West Bench truck has cover within 50 yd, and twice as much within 200 yd as the River Road truck.
- **The other hunters: about where they were.** Reading the cover and walking the trails, coveys met and points are at or above the review run's in all three after runs. The dry-spell medians sit either side of it: reading the cover 139 s against 111, 140 and 156 s; on the trails 132 s against 122, 119 and 140 s. At the West Bench these hunters met fewer coveys in all three runs (reading the cover, 6.5 against 5.6, 5.4 and 4.1). With only six covey placements per entry I can't yet tell that from chance, so a check on twelve new seeds is queued.
- **The lab's noise.** Any change to the land redraws every hunt's covey placement. So the same hunter at the same entry moves by about 15 points between runs of 18 hunts, even far from the change. Treat the per-entry numbers here as indications, not measurements; the per-hunter ones, over 72 hunts each, are steadier.
- **The River Road view: it looms, and reads as basalt.** The spur stands 34–37° above the eye, with a columnar crown 93 yd off. It reads as a butte in front of the wall rather than the wall itself: from the truck, the spur hides the bench and the higher rims behind it.
- **The climb: done.** Only Chukar Ridge charges for it, and nothing else changes.

### Open issues

- **A dog that can't close on a covey above a rim** (dog behaviour). The rule above ends this loop for chukar only. In one of the three after runs, one 104 s spell was a Hun covey on the rim flat, 14 m above a dog on the upper talus, about 66 yd off. The dog caught the edge of its scent, lost it, then caught a covey-mate's. Each switch between covey-mates restarts the check from the start, so it never closed: from second 496 to the end of the hunt. The fix belongs in the dog's scent work rather than in the land:
  - a switch to a covey-mate should keep the approach going;
  - or the lost-scent check should be bounded across the covey.

  Giving Huns the pressure limit would also end it, but would change their temperament on every ground.
- **The West Bench, reading the cover and walking the trails.** These hunters met fewer coveys there in all three after runs. A run on twelve new seeds, before and after, is queued to tell a real loss from placement luck.
- **The hunt lab's per-entry cells.** At six covey placements per entry, a change anywhere on the land moves them by about 15 points. Conclusions per entry want more seeds than the standard set.
- **The spur's lower slope** (Cover lane). It reads as smooth tan with terracettes and sparse tufts, the open-slopes point carried from milestone 1.
- **Phone cost.** The River Road view costs a dozen more draws on both tiers (rimrock on the spur). Still not measured on a phone.

### Files touched outside the lane

- **Birds:** `src/game/birds.ts` (the pressure clock, `resetBirdIdsForTest`), `src/game/species.ts` (`RunnerBehavior.pressLimitMs`, set on chukar).
- **The dog:** `src/game/dog.ts` (the objective cast, `workingBirdId`), `src/game/huntDoctrine.ts` (`dogObjectiveReach`).
- **The hunt:** `src/game/huntSimulation.ts` (passes the worked and pointed coveys to the birds, and flushes a bird that breaks).
- **The player:** `src/three/subsystems/player.ts` (`climbCosts`).
- **Hunt lab:** `tools3d/huntlab/harness.mjs` (the climb rule).
- **Tests outside the lane's own:**
  - `test/encounterPacing.test.ts`: the casting check, and bird ids from one per hunt;
  - `test/propertyHabitatContract.test.ts`: Chukar's trucks leave the check that an entry faces along its first route segment, since they now face their authored views (checked in `chukarLandform.test.ts`);
  - `test/birdVariety.test.ts`: longer timeouts under load.

### Lead review of the Chukar fixes (2026-10-30)

Merged into `campaign/world-birds` as fd7dd26, on top of Cover milestone 2, Birds milestone 3, Dog D1 and Light milestone 3.

**Conflicts:**
- Chukar Ridge's doctrine keeps this lane's `dogObjectiveReach: 220` and the Birds lane's `circleBack: true`.
- The bird-variety test keeps one note for the timeout both sides gave it.

**Checks:** tsc is clean, and the full suite on the merged tree passes, 2,176 of 2,176.

**The River Road truck view:** the spur's basalt crown now looms over the cattle-trail contours. That is the first impression the target asked for.

**Hunt lab on the merged tree** (216 hunts, all four entries):

| group | 1st contact | dry med | dry p90 | dry>3m | coveys | stuck retr | stuck states | long chases | in rock |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| follow | 82 | 134 | 328 | 38% | 5.3 | 0 | 2 | 0 | 0 |
| tactic | 96 | 141 | 259 | 25% | 5.8 | 0 | 0 | 0 | 0 |
| trail | 65 | 123 | 279 | 18% | 5.3 | 0 | 1 | 0 | 0 |

**Bug found and fixed:** the three stuck states were the dog marking a covey for 278–484 s. The cause was the Birds lane's Hun circle-back combined with this canyon:
- the wall rose under a circling covey and set it down 2–3 s into its loop, beside the dog;
- the dog flushed it again in the next simulation tick;
- the birds still held it as staged, so the re-flush was never flown.

The lead fixed it in `birds.ts`, with a regression test (6475aa3). The landing beside the dog is the Birds lane's to fix in milestone 4.

**Still open:** West Bench is still the weakest entry for a hunter who follows the dog (61% of hunts with a dry spell over 3 minutes). The Hun scent loop is logged as open.

## Lane log

- **2026-10-08.** Milestone 1 started from `3b518a2`. Hunt lab brought into the repo and the baseline recorded. Chukar Ridge rebuilt as a canyon:
  - land, habitat, hunt areas and placement;
  - rimrock, talus, vegetation and cattle trails;
  - the river below;
  - the survey map;
  - views and invariant tests.
- **2026-10-09.** Review fixes for milestone 1:
  - 32 coveys, and steadier hunting on the bigger ground;
  - Lightweight cost near the old ridge's;
  - whole basalt crowns on Castle Rock and the mesas;
  - a tool that lists where a view's triangles go;
  - falls over the fence drop just inside it.

  The lane stopped that afternoon with this log uncommitted.
- **2026-10-30.** Log committed, reviewed by the lead (above), and merged into `campaign/world-birds`.
- **2026-10-30.** Chukar fixes (above): runner chases bounded, the dog leads a following hunter to cover, the River Road spur, and the climb on Chukar only. The hunt lab was re-run before and after, and the full suite passes.
