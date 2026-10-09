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
