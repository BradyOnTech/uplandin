# Cover lane log

Campaign 2, "Shape-first cover", of the [world and birds campaign](../world-and-birds.md). Branch `lane/cover`. Evidence images live in `docs/3d/campaign/cover/`.

## Milestone 1: one bake-off, one winner, the Sharptail pilot

### The shared ground kit (`src/three/groundKit/`)

- **Cover map** (`coverMap.ts`, pure): one cell every 2 yards over the ground plus a 200-yard margin, holding cover class, density, crown height and a colony tone. It is derived, never hand-placed:
  - landform metrics from height queries alone (`LandAnalysis`, 4-yard grid): local and broad position (crown or hollow), slope, exposure, contour convergence, and a multiple-flow wetness with shallow-pit spill; draw heads are found where a channel first gathers on a slope;
  - the ground's habitat (the sim's cover patches), routes and working clearings;
  - a per-ground recipe (`coverRecipes.ts`) that turns those into plant classes.
  When the Landform lane rebuilds a ground, or exposes land-derived cover classes, the recipe redresses it with no coordinates to move. Build time is about 0.5 s for Sharptail with its margin (Node, desktop).
- **Palette and colour field** (`coverPalette.ts`): each ground's species palette, and one feathered colour field that both the terrain and every plant sample, so class edges blend over ~10 yards and a plant dithering out lands on the colour painted under it.
- **Three bands**: near garnish blades and a basal mat; the middle representation under trial; the far colour mosaic painted into the terrain from a cover texture (`coverSurface.ts`), handing from litter to canopy colour as the middle band dithers out. Band edges dither (ordered Bayer, per-instance jitter) instead of collapsing or blending. The hunt wind sways every band and rolls one sheen field through the plants and the terrain.
- Off by default; `?cover=<style>` turns it on for review. `?cover=legacy` keeps the old stack with the same review hooks (a stand-in GSP on point, layer numbers) for before/after frames.

### Bake-off

Three genuinely different representations, each read from the same cover map, palette and far band:

- **A, faceted sward masses**: instanced tussock bodies with a serrated crown of narrow leaning blades, footprint scaled to crown height (two layers: short shoulder grass to ~90 m, tall swale and stand grass to ~165 m on High); tall cover on Cattail uses an open variant (dark stems, pale seed heads).
- **B, terrain strokes with crest fringes**: two octaves of wind-combed strokes drawn by the terrain shader, serrated fringe strips only on crests, and a wider blade garnish.
- **C, chunky tufts with dithered fades**: blade tufts in three coarsening rings to ~115 m.

Fixed budget for the grass layers (style minus the `bare` baseline of terrain, far band and woody clumps): High ≤ 460k triangles and ≤ 75 draws; Lightweight ≤ 125k triangles and ≤ 45 draws. Standard Sharptail slope: the GSP on point on an open shoulder at property (250, 310), looking north-east across a swale with woody draw heads to a copper crown; frames at 10, 27 (the 30-yard point), 40 and 150 m. Cattail strip: the dog four yards inside a CRP block edge at (980, 377), frames at 12, 20, 40 and 150 m. 1440×810, morning, uncapped headless Chrome.

| Sharptail, grass layers | High tris | High draws | Lite tris | Lite draws |
| --- | --- | --- | --- | --- |
| A masses | 372k–416k | 69–73 | 112k–122k | 40–44 |
| B strokes | 196k–260k | 26–32 | 51k–72k | 16–22 |
| C tufts | 389k–455k | 60–66 | 101k–124k | 39–45 |

Whole frame, same views: legacy High 1.48–1.76M triangles and 215–232 draws, Lite 568k–654k and 152–171; with masses High 641k–678k and 196–221, Lite 271k–293k and 139–169.

Sheets: `cover/bakeoff-sharptail-high.jpg`, `cover/bakeoff-sharptail-lite.jpg`, `cover/bakeoff-cattail-high.jpg`, `cover/bakeoff-cattail-lite.jpg` (rows legacy, masses, tufts, strokes).

**Winner: A, faceted sward masses.** Against the Sharptail target:

- Middle distance. Masses keep a continuous grass surface with a serrated top edge and real height differences out to where the far mosaic takes over, with no ring: the swale reads as a taller maroon band, the copper crown as a grass hillside. Strokes leave the middle as flat painted colour bands, the failure the old studies kept hitting. Tufts thin into stipple at the same budget and read as sand with dots.
- Mosaic. All three share the far band, but only masses give the communities volume where the eye resolves them.
- The dog. With shoulder grass knee-high (masses 0.3–0.45 m), the GSP's back and head stand clear of the sward at 27 m on both tiers. In the legacy stack at the same spot it is lost in thigh-high bunches even at 10 m.
- Cattail. The open stand variant gives a CRP edge of stems under pale seed heads; strokes have no height at all; tufts stipple.
- Cost. At budget on both tiers, and the whole Lightweight frame drops from ~570–650k to ~270–290k triangles. Masses cost the most draws of the three, so the pilot watches draws on Lightweight.

Known weaknesses carried into the pilot: the near garnish still reads a little stiff; the fine sward texture under it ripples like sand at grazing angles; woody clumps read as dark blobs, too boulder-like up close; a dog four yards inside a CRP block is still hidden from 12 m (stems too dense for "open at dog height").

### Sharptail pilot

Sharptail now runs on the kit by default (`?cover=legacy` brings the old stack back for review). The losing candidates are gone from the code; they live in `932504c` and the sheets above.

- Near band: a basal mat of short sprouts to ~9 m, blade tufts to ~15 m, and sparse seed culms with pale heads (little bluestem fluff, needle-and-thread) over them. The flat-triangle mat of the first pass read as confetti and was replaced.
- Middle band: short masses to ~90 m (High) / ~58 m (Lite), tall masses to ~165 m / ~105 m. Band edges use the full 3D distance, so a lifted overview closes the bands instead of showing plant tops. Only the far edge dithers, and there a mass also settles toward the ground so the dither never leaves a dotted crest; near the hunter a mass grows out of the garnish instead, because a broad mass dithering in read as a screen door. Each mass and thicket core is closed on top: from eye height an open skirt read as a tray and a near thicket as a pit.
- Far band: the fine cover texture over the ground and a 120-yard margin, and a coarse far map (16-yard cells, 1,100-yard margin) painted into the terrain's vertex colour, so the mosaic reaches the horizon ground on both tiers with no edge.
- Woody draw heads: three shapes failed (faceted lobes read as boulders, octahedron clusters on stems as umbrellas, a smooth dome as loaves). The fourth builds a thicket the way the masses are built, a low domed core under rings of twiggy sprays, and reads as dark brush in the middle distance; up close it is still a crude spiky mound. A proper low-poly buckbrush, chokecherry and buffaloberry kit from the Blender pipeline is the fix (milestone 2 kit work).
- The accepted native-plant near ring (`e57ee89`) and common grass (`b35875e`) are not carried into the kit: they are the thigh-high bunches that made the shoulders read as a crop and hid the dog. Their code stays reachable through `?cover=legacy` until the lead accepts the pilot.
- The kit answers the shared `grass` contract (`launchHeightAt`), so the dog's bound now reads Sharptail's crown heights: in swales over 0.9 m a quartering dog bounds, as it already did in Cattail's stands.
- Build cost: the fine cover map takes about 0.44 s and the far map 0.12 s in Node on the desktop, plus 35 ms for the colour fields. That is new load time (a phone may take two to three times as long) against the old Sharptail sward fields and middle-sward planting it replaces.

#### Numbers (same staged views, 1440×810, uncapped headless Chrome)

Postcards, before = this build with `?cover=legacy`, after = the kit:

| Sharptail view | Lite before | Lite after | High before | High after |
| --- | --- | --- | --- | --- |
| truck | 172 draws, 677k | 146 draws, 315k | 233, 1.83M | 212, 616k |
| west-draw | 191, 641k | 173, 352k | 249, 1.61M | 239, 656k |
| return | 209, 738k | 169, 304k | 269, 1.90M | 240, 647k |
| swale | 115, 563k | 110, 274k | 182, 1.48M | 184, 599k |
| cover-close | 150, 641k | 123, 310k | 209, 1.67M | 201, 690k |

Lightweight is at or below the old draw count in every view and roughly halves its triangles (274k–352k, under the ~480k cap); High drops about 60% in triangles with draws within ±2 of the old stack at the swale and lower elsewhere. Quail Fields and Cattail Coverts are untouched by this lane: their postcard numbers match the campaign baseline exactly (`cover/quail-fields-check.jpg`, `cover/pheasant-coverts-check.jpg`).

The dog at 30 yards, GSP on point on the open shoulder at (250, 310), visible dog pixels from a with/without-dog diff (`tools3d/dog-pixels.py`):

| Distance | High legacy | High kit | Lite legacy | Lite kit |
| --- | --- | --- | --- | --- |
| 10 m | 291 px | 686 px | 173 px | 538 px |
| 27 m | 24 px | 73 px | 33 px | 47 px |
| 40 m | 16 px | 21 px | 19 px | 18 px |

Contrast of the visible dog against the cover behind it rises from 0.15 to 0.23 (High) and 0.16 to 0.24 (Lite) at 27 m. Crops: `cover/sharptail-dog-30yd.jpg`. Sheets: `cover/sharptail-before-after.jpg` (before and after rows for High morning, Lightweight morning and High evening).

#### Gaps against the Sharptail target

- The landform has few true coulees, so the woody draw heads are small and sparse; they will grow where the Landform lane cuts real draws (the recipe reads heads from the land).
- Woody clumps are crude up close (above). Shrubs and trees want authored low-poly assets.
- Short masses within 10–25 m on Lightweight still read as low jagged plates where the garnish ends at ~10 m.
- The near floor's fine sward texture still has a faint sand-ripple look at grazing angles inside ~30 m.
- The mosaic is there but quiet: shoulders dominate most postcard views, and copper crowns and maroon swales read most clearly on the skyline and in the swale view. Colour weight belongs with the Light lane's grade too.
- At 40 m the dog is still a speck on both tiers; that is pixels, not cover (look-closer covers it).
- The kit adds about 0.6 s of desktop load time for its maps.
- No grass parting round the dog in the kit yet (the old stack bowed blades away); with knee-high shoulders only the legs pass through blades.

### Proposal: milestone 2, Quail Fields as Rolling Red Plains rangeland

- A Quail recipe from the land and the sim's cover: copper little bluestem and sideoats bunches at lower density so red sandy loam shows between them; sand plum thickets 1–3 m tall clustered by covey-headquarters guidance (blocks of at least 30×50 ft, no more than 150 ft apart, beside the sim's cover); sand sage and shinnery oak mottes on sandy rises; scattered mesquite and rounded hackberry on the uplands; hackberry, elm and cottonwood along the one drainage where wetness is high; gullied red clay where the creek cuts steep banks; two-tracks worn.
- Kit additions: a tree layer of instanced low-poly crowns (mesquite low, spreading, multi-trunked with a fine grey-green crown; hackberry rounded), authored in the headless Blender pipeline with merged or card versions past ~80 m; a low open-based thicket form for plum (open at ground level, as quail use it) and a low motte form for shinnery and sage; the same shrub assets replace Sharptail's crude clumps.
- Quail's own terrain (`quailTerrain.ts`) takes the same small far-band hook PropertyTerrain has, so the red soil and grass mosaic carry to the horizon on phones. The umbrella-crowned field trees and the Quail grass systems stand down on the kit.
- Judged on one question at review: does this read as southern quail country, on both tiers?

### Proposal: milestone 3, Cattail Coverts

- Turn on the Cattail recipe already in the kit for the cover blocks: CRP switchgrass and big bluestem open at dog height under a band of pale seed heads (fewer, darker stems than the bake-off strip, so a dog four yards in is a shape against stems), cattail rings with brown heads where blocks meet a slough, fencerows and the waterway as narrow strips.
- Yard turf October-tan from the homestead's own short class; the farm's crop surface and residue stay as they are (the hard stubble-to-cover edge is the ground's strength).
- Shelterbelt and neighbour-farm crowns from the shared plains tree kit instead of saturated icosahedra (with the Light lane's horizon shelterbelts).
- Retire `pheasantCover.ts` and, with the lead's acceptance of the Sharptail pilot, Sharptail's legacy grass, turf, middle-sward and native-plant modules.

## Milestone 2: Quail Fields as Rolling Red Plains rangeland

Branch `feat/quail-fields-rangeland`: the campaign head `957f40a` with `lane/cover` merged in, then the milestone. Captures are headless desktop Chrome, 1440×810, uncapped; "before" is the campaign head's read-only checkout (`957f40a`) at the same staged views.

### The merge

`lane/cover` merged into the campaign head with no conflicts. The lane had already taken in the campaign branch up to the birds lane's second milestone, and Landform milestone 1 touches none of the kit's files. tsc was clean and the full suite passed (2,063 tests in 248 files). The campaign branch's two later commits merged in cleanly too: `bd0b885` (the dog lane's row in the spec) and the playthrough's End hunt on the pause card.

### Sharptail re-checked

The lane's unreviewed work since milestone 1, re-captured against the campaign head, which carries milestone 1's kit:

- `545f282`, `1d09c23`: the shared woody kit, eleven species from the headless Blender pipeline in high, lite and far details, with foliage grown from leafy lobes (a dark core dressed with tilted leaf cards) instead of faceted balls.
- `41b9ce0`: Sharptail patched at every scale (needle-and-thread, wheatgrass, copper bluestem on the dry knobs, sage and forb patches, rank stands that keep their community), short grass gathered into tussocks, a cured-thatch floor in place of the rippling sward texture, and the draws grown from the woody kit: chokecherry and buffaloberry heads skirted with buckbrush, buckbrush colonies on the lee slopes, wild rose on the fence.
- `8791527`, `5db3357`, `0b83d6e`: Lightweight kept under budget, a clean near-to-far brush handover, and no procedural cloud dapple on kit grounds (the Light lane's ground light casts the cloud shadows).

| Sharptail view | High before | High after | Lite before | Lite after |
| --- | --- | --- | --- | --- |
| truck | 211 draws, 617k | 212, 990k | 145, 315k | 139, 432k |
| west-draw | 238, 657k | 243, 1.04M | 172, 352k | 169, 471k |
| return | 239, 648k | 247, 1.07M | 168, 304k | 166, 435k |
| swale | 183, 600k | 184, 948k | 109, 274k | 104, 400k |
| cover-close | 200, 692k | 204, 1.16M | 122, 310k | 117, 429k |
| vista | 121, 370k | 127, 680k | 65, 185k | 62, 264k |
| crest | 248, 620k | 252, 975k | 177, 330k | 168, 432k |

High evening matches High morning within a few draws. The dog at 30 yards, the GSP on point on the open shoulder at (250, 310) with the hunter coming from (520, 160), visible pixels from `tools3d/dog-pixels.py`:

| Distance | High before | High after | Lite before | Lite after |
| --- | --- | --- | --- | --- |
| 10 m | 545 px | 359 px | 360 px | 296 px |
| 27 m | 59 px (17 tall) | 48 px (17 tall) | 32 px (9 tall) | 33 px (9 tall) |
| 40 m | 25 px | 24 px | 18 px | 16 px |

Reading it:

- **The look moved toward the target.** The shoulders are a patchwork (silver needle-and-thread, tawny wheatgrass, copper on the knobs) where milestone 1 was one tawny sward. The swale view shows maroon big bluestem under dark chokecherry and buffaloberry heads, the coulee head the target describes.
- **The dog holds.** It stands as tall in the frame at 27 m on both tiers, with a fifth fewer pixels on High where the patched bunches reach its legs.
- **It costs more.** Lightweight stays under the ~480k cap but only just in the west-draw view (471k), and its draws fall slightly. High's triangles rise by half to two thirds (the woody kit's leafy brush and the denser patches), and its draws rise by one to eight. Against the old pre-kit stack measured in milestone 1 (truck 233, west-draw 249, return 269, swale 182, cover-close 209), High stays within it except the swale (184), as milestone 1's kit already did.
- Sheets: `cover/sharptail-recheck-before-after.jpg` (before and after rows for High morning, Lightweight morning and High evening) and `cover/sharptail-dog-30yd-recheck.jpg` (High before, High after, Lite before, Lite after).

### Quail Fields on the kit

Quail Fields now grows from the shared ground kit by default (`?cover=legacy` brings the old field back for review). Everything is read from four sources: the land, the sim's cover patches, the routes (with the gates' two-track approaches), and the ground's own feature queries for the creek bed, the burn and the firebreak. The recipe holds no coordinates, so the Landform lane's larger Quail will dress itself. `cover/quail-fields-cover-plan.jpg` is the cover map in plan: the far colour, the sim's patches in blue, trees and shrubs as dots.

**The recipe** (`quailCoverRecipe` in `coverRecipes.ts`):

- **Rangeland.** Copper little bluestem on the sandier soil and tawny sideoats and grama on the harder loam and the slopes, as bunches with red sandy loam between them (density 0.64–0.8), knee-high (0.30–0.48 m). Sandy crowns thin to sand bluestem, opening here and there into a blowout. Sand sage country silvers the grass. "Sandy" is a soil field read from the land: the swells and broad rises, never the draws.
- **Covey headquarters** are the sim's cover patches. They carry rank bluestem under a pointing dog's back (0.42–0.6 m) and clusters of sand plum thickets over about a third of each, with a few stray clumps just outside. Plum and timber report the open grass beneath them to the dog and the birds, never their crowns.
- **Between the coverts:** shinnery oak mottes on the deep sand, more of them within a covey's range of its headquarters, and loose colonies of sand sage on the sandy swells.
- **Uplands:** mesquite scattered over pastures a few hundred yards across (the deeper loam, away from the sand and the draws) and, rarely, a rounded hackberry in a hollow.
- **The creek:** hackberry, elm and cottonwood in groves along a corridor round the channel, with Indiangrass and switchgrass between the groves. The corridor is the distance to where the land's own flow gathers (`LandAnalysis.channel`), so the timber follows the creek and its big draws wherever the landform puts them.
- **Red clay** on the creek's cut banks and where the land falls steeply into a draw.
- **Worn ground:** two-tracks bare in the ruts and thin at the verges, clear truck yards and windmill, this spring's burn as black stubble, the firebreak as turned sand.

**What grows it:**

- The kit's grass bands in Quail's own style: tussocks with red sand between them near the boots, a sparse mat, no seed culms, larger chunks.
- The woody kit's Red Plains species, reworked (`cover/red-plains-woody-kit.jpg`: high, lite and far from left to right, the high detail clipped at each frame's edge; a Blender Workbench render in flat studio light, where cores show facets they do not have in the game):
  - **sand plum:** a low, dense, rounded mound on many thin stems, open in its bottom fifth;
  - **shinnery:** a lumpy mound leafy to the sand;
  - **sand sage:** an airy silver clump;
  - **mesquite:** four or five trunks leaning out from the ground under one fine grey-green dome that droops to knee height;
  - **hackberry, elm and cottonwood:** crowns that come down to a third of their height.

  Far details stay on the ground; lobe cores shade fully round, so a crown's shade never lights up as faceted stone.
- **Distance tiers.** Thickets have three on High (high detail to ~28 m, lite to ~100 m, broad far mounds on a wider lattice to ~430 m) and two on Lightweight. Trees have their own band out to ~900 m (High) or ~470 m (Lightweight), so the creek timber and the mesquite carry to the edge of the ground. Tree trunks are solid to the hunter and to shot (`groundKitTrunks`, from the same sites and picks the renderer draws).
- **The far band on Quail's own terrain** (`quailTerrain.ts`). Its tiles and horizon strips are painted from the cover map. Its shader takes the palette's own red-soil floor near the hunter (a floor field, new in `coverPalette.ts`) and the canopy colour with distance, so the red soil and the grass mosaic carry to the horizon on both tiers. The far colour leans to the soil where cover is thin; the plants themselves take the pure canopy colour.
- The two-tracks are pale pinkish sand ground out of the red loam.

**Retired on the default path** (behind `?cover=legacy` until the milestone is accepted):

- the umbrella-crowned field-tree stands;
- the hand-placed sand plum kit;
- the old field grass, sage, shrubs and distant grass groups;
- the field paint and thatch mat.

**Numbers.** Postcards before (the old Quail stack) and after:

| Quail view | High before | High after | Lite before | Lite after |
| --- | --- | --- | --- | --- |
| truck | 300 draws, 1.42M | 175, 1.45M | 233, 781k | 148, 462k |
| old-fence | 216, 990k | 126, 1.43M | 172, 473k | 99, 411k |
| creek | 260, 1.34M | 152, 1.36M | 215, 678k | 122, 398k |
| burn | 149, 467k | 107, 1.24M | 121, 271k | 85, 342k |
| overview-south | 295, 1.25M | 170, 1.09M | 226, 726k | 129, 339k |
| vista | 83, 251k | 83, 1.00M | 62, 166k | 64, 303k |

- **Lightweight** is under the ~480k cap in every view (at most 462k, from the old stack's 781k).
- **High's draws** stay within the old stack's in every morning view (the vista ties). In the evening the vista takes 77 draws against the old stack's 75; the other evening views match the morning.
- **High's triangles** rise in most views (up to 1.45M). The kit buys its draw savings with larger chunks, and an instance past its band is collapsed in the vertex shader but still submitted.
- **Load:** the kit's maps take about 0.8 s in desktop Node (fine map and sites 0.6 s, far map 0.1 s, colour fields 0.1 s), against which the old field's own whole-property planting loop no longer runs.

**The dog at 30 yards.** The GSP on point in open bunchgrass 8 yd outside the south headquarters at (450, 578), pointing into it, with the hunter coming up from the west. The spot was chosen by rule: open short grass beside a patch, with no shrub, tree or lone plant within 3 yd of 45 yd of sight line.

| Distance | High before | High after | Lite before | Lite after |
| --- | --- | --- | --- | --- |
| 10 m | 821 px | 623 px | 922 px | 650 px |
| 27 m | 71 px (20 tall) | 42 px (19 tall) | 76 px (19 tall) | 46 px (18 tall) |
| 40 m | 26 px | 24 px | 26 px | 18 px |

- **The dog reads on both tiers.** It keeps its full height at 27 m; the knee-high bunches take its legs, which the old bare plain never covered. The visible pixels match Sharptail's kit (48 px High, 33 px Lite at 27 m).
- **Contrast falls** (0.15 against 0.19 at 27 m on High): a liver-and-white GSP sits closer in value to red soil and dark plum than to the old orange plain.
- **A dog behind a motte is hidden.** The first spot tried, (200, 472), turned out to have a shinnery motte across the sight line 1–5 yd in front of the dog: 11 px on High and 1 px on Lightweight at 27 m, against 70 and 47 on the old bare plain. That is a dog pointing behind brush, as a real one would be.
- Crops: `cover/quail-fields-dog-30yd.jpg`. Rows, top to bottom: open spot High before and after, open spot Lite before and after, the motte spot on High before and after.

**Sheets:** `cover/quail-fields-before-after.jpg` (before and after rows for High morning, Lightweight morning and High evening).

**Does this read as southern quail country, on both tiers?**

- **High:** yes, at postcard distances.
  - Red loam shows between copper and tan bunches, and the colour mosaic carries to the horizon.
  - The covey headquarters read from across the property as low bands of autumn plum in rust, orange and gold.
  - Hackberry, elm and cottonwood line the creek, worn pinkish two-tracks lead to them, and dark mesquite stands scattered on the uplands. Nothing reads as an umbrella tree on a pole any more.
  - It falls short up close:
    - The rank headquarters grass reads like a uniform red field.
    - Within about 10 m the near plum is a busy heap of small cards rather than a twiggy thicket.
    - Between about 30 and 100 m the mesquite's lite detail reads as a dark dome on dark trunks, still close to the umbrella the target forbids.
    - Sand sage and shinnery are present but too small and dark to read as their own communities in the postcard views.
- **Lightweight:** the same country, thinner.
  - The brush bands, timber and far mosaic carry.
  - Near the boots the sparser tufts leave more bare red soil than the target wants: it leans back toward the "bare orange plain" in the foreground.
  - The near plum's single-triangle cards read as red shards.

### Chukar's big sage

Up close, Chukar's sagebrush read as clusters of faceted grey stones. `chukarSageGeometry` (`src/three/assets/chukarPlants.ts`) now grows each bush on three gnarled trunks that lean out from one root and fork into twigs. The leaves gather at the twig ends as silver lobes, each a core dressed with leaf cards tilted out from it (the woody kit's leafy lobes, in TypeScript). The crown is low, ragged and wider than tall, and the base is open, with the trunks' feet showing beneath.

Only the plant changed: the Landform lane's placement, colours and distance bands are as they were. The near form, drawn within 10 m, is 322 triangles. The far and Lightweight form keeps one lobe per trunk and the old 94-triangle budget.

Close-ups at 5, 10 and 25 m on both tiers are in `cover/chukar-sage-before-after.jpg`:

- On High the bush is twiggy, silver-grey and open at the base, much like a small gnarled tree, as old big sage often is.
- On Lightweight, at 10–25 m it reads thinner than the old solid tufts: dark cores and pale cards rather than a silver mass.

### Open issues for the lead

- **The near plum and the mesquite's middle distance.** Neither reads right yet: the plum within ~10 m is a busy heap of cards (red shards on Lightweight), and the mesquite's lite detail between ~30 and 100 m is a dark dome on dark trunks. Fixes:
  - **Plum:** fewer, broader card clusters on a lighter core; diamond cards on Lightweight too.
  - **Mesquite:** merge the drooping skirts into the dome and lighten the crown.
  - **Far mesquite:** about 17% narrower than its lite detail, a small width pop at the handover. Fix it with `far_mesquite`'s dome radii (0.82 to 0.95); the asset test's spread bar is set to what the GLBs guarantee (1.1× wider than tall).
- **Lightweight's near ground on Quail** leaves too much red soil showing. There is headroom for a denser Lightweight garnish or mat (462k at most against the ~480k cap).
- **The dog runs through Quail's trees.** `hunt3d.ts` builds the dog's obstacles from a fixed list of scenery systems that has never included `quail-environment`. So on Quail the dog ignores the fence, the props and now 436 kit tree trunks; the hunter and shot do not. One line in `syncDogObstacles` fixes it, but it changes the dog's pathing on a core ground, so a hunt-lab run should follow it. Not changed here.
- **Delete the old Quail field** once this milestone is accepted:
  - `quailVegetation.ts`, `quailGrass.ts`, `quailGrassGround.ts`, `quailWoody.ts`;
  - `quailKit.ts` with `public/models/quail-kit/sand-plum-*`, and `quailTreeKit.ts` with `public/models/quail-kit/field-tree-*`;
  - `QUAIL_TREE_STANDS`;
  - the legacy branches of `quailEnvironment.ts` and `quailTerrain.ts`, and their tests.

  Sharptail's legacy grass, turf, middle-sward and native-plant modules wait on the same decision from milestone 1.
- **The rebuilt, larger Quail.** The recipe reads only the land, `area.patches`, the trails with the gates' approaches, and `FEATURES['quail-fields']` (`quailCreekAt`, `quailBurnAt` and `quailFeatureBare` from `quailFeatures.ts`). When the Landform lane rebuilds Quail:
  - it must keep a creek in the heightfield, because the timber reads the channel from flow, not from `QUAIL_DRAINAGE`;
  - it must keep those three feature queries or point `FEATURES` at their replacements.

  A land habitat for Quail (`landHabitat`) could later feed the recipe's classes directly.
- **Load time grows with the ground.** About 0.8 s in desktop Node for today's Quail. A phone may take two to three times that, and a ground two to three times larger scales with its area. Building the fine map per tile on demand is the fix if it bites.
- **Chunk builds are unmeasured in the browser.** A dense headquarters' high-detail chunk merges up to ~70k triangles on the main thread, two chunks per layer per frame while walking; a slow device may hitch.
- **Sharptail's cost.** High triangles are up by half to two thirds since milestone 1. Lightweight's west-draw view sits at 471k.
- **Chukar's sage on Lightweight** reads thinner at 10–25 m than the old tufts. Fix: more and larger lite cards, brighter cores, within the 110-triangle test budget.
- **Not measured on a phone.** All numbers are headless desktop Chrome.
- **The far country's own trees.** The Light lane's Red Plains far terrain dresses its own creek timber and mesquite past the apron; their size and colour are not yet matched to the kit's.
- **Hand-placed Quail history and props.** The old line fence, the dump rake, the creek bed decal, the burn and the fallen-wood props stay at their authored coordinates (game data the Landform lane owns). The kit only reads the burn, the bed and the firebreak, through the feature queries.

### Files touched outside the lane

- `src/three/subsystems/quailTerrain.ts`: Quail's own terrain, given the kit's far band as the brief asked (vertex paint from the cover map, the kit's floor and canopy in its shader, a coarser Lightweight horizon strip on the kit). The legacy path is unchanged.
- `src/three/assets/chukarPlants.ts`: the big sage plant only, as the brief asked. `chukarEnvironment.ts` is untouched.
- `src/three/subsystems/quailTracks.ts`: a red-plains palette for the track ribbon, used only on the kit.

Everything else is the lane's own:

- `src/three/groundKit/`, `src/three/landscapeVisuals.ts` and `src/three/subsystems/quailEnvironment.ts` (Quail's vegetation subsystem);
- the woody kit (`tools3d/assets/woody-kit/`, `public/models/woody-kit/`, `assets/source/woody-kit/`);
- `tools3d/cover-map.mjs` (new: the cover map in plan, with the land layers it reads) and `tools3d/cover-review.mjs` (a stand-in dog on builds without the kit's hooks, `--nodog`);
- the tests `groundKitCoverMap`, `groundKitQuail` and `woodyKitAssets`.
