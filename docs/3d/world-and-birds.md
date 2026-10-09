# World and birds campaign

Started 2026-10-08 on branch `campaign/world-birds`. Brady asked for the two pillars, Terrain & World and The Birds, to be built until they satisfy, and delegated the creative calls. This file is the target every lane builds toward and the record of what was decided. Lane notes live in `docs/3d/campaign/`.

Baseline postcards (before any campaign work) are captured with `tools3d/postcards.sh base` and summarised in `docs/3d/campaign/baseline.md`.

## Decisions taken (delegated by Brady, 2026-10-08)

- **Duck Hunt rules the sky again, in 3D.** At most three birds airborne at once, in waves; the next wave rises as the sky clears or the gun is reloaded. The cover erupts and the wing thunder is sized to the whole covey, so a 12-bird covey still feels bigger than a 5-bird one. The 3D whole-covey launch (the `spatialEncounter` bypass) was introduced by agent critics, not by Brady, and is removed.
- **Missed birds can be marked down.** Every core species can set down in visible, reachable cover after the shooting window, and the follow-up is a second act.
- **Phones get a cheaper version of the same look,** not a different style. The grade and each ground's light are built into materials so Lightweight gets them with no extra pass.
- **Quail Fields is the Rolling Red Plains** of western Oklahoma and north Texas: red sandy loam and gullied red clay, little bluestem curing copper, sand plum thickets, shinnery oak and sand sage mottes, mesquite, and hackberry, elm and cottonwood along one creek.
- **Sound stays synthesised.** No recorded or third-party audio enters the public repo.
- **Landform tests become invariants.** Tests that pin exact heights are replaced by rules that always hold: drops sit on the ground, routes are walkable, cover is reachable, no bird or retrieve sits inside rock, and the survey map agrees with the world.
- **Bigger grounds made of recognisable hunt areas (Brady, 2026-10-08).** Hunting the same spots with birds in the same places makes the game monotonous. Each core ground grows to roughly two to three times its area (about a full section or more, around 2,000–2,400 by 1,400–1,600 yd) and is built from 6–10 named hunt areas, each with its own landform, cover and landmark, recognisable from across the property and named on the survey map and in the HUD as you enter it. Each ground has three or four entries spread around its edge.
- **Birds live where the land says, not around the truck.** Today coveys are placed in rings out from the chosen truck, the first always 72–180 yd ahead. Instead, coveys are placed in the hunt areas that suit them: roost, feed, loaf, escape and water cover, weighted by hour, season, weather and wind, and seeded per hunt so two hunts on the same ground find birds in different places. Every entry still has birds within a reasonable walk, so the first contact never becomes a long dry spell, but nothing is staged in front of the truck.
- **Chukar climbing costs something, but is not punishing.** Slope slows the hunter and spends stamina; rim breaks and cattle trails are the easy routes.
- **Not touched:** dog retirement, the GSP point tail, new grounds, new species, new breeds.

## The look: one house style

Bold low-poly. Big readable shapes first, detail second. Flat or faceted shading on built things and rock, soft colour on land. Colour does the work that geometry density used to do: each habitat is a colour mass you can name from 300 m. Fog is graded colour that separates near, middle and far; it never washes the ground out white. Every ground has an authored sky and light per hour (the Firewatch approach: a three-colour gradient, sun halo and horizon halo, with fog and distance colour driven from it). The hunt's one wind moves grass sheen, cover sway, chaff and cloud shadows everywhere.

## Art targets per ground

Each target is written as the frame a hunter sees at eye height, mid-morning, with the dog on point about 30 yd out. The acceptance bar for a ground is that its postcard set, on High and on Lightweight, reads as this place to someone who knows it.

**Sharptail Prairie — North Dakota mixed-grass, the Missouri Coteau.**
Long grass slopes rise to rounded crests with a granite erratic or two. Coulees cut the swells; each coulee head is a dark clump of buckbrush, chokecherry and buffaloberry that thins downslope into a swale of maroon big bluestem. Dry crowns are copper little bluestem; shoulders are tawny western wheatgrass and needle-and-thread, grazed shorter than the swales. From the crest you see three or four layers of swells fading blue-grey, a section fence, a windmill and a distant shelterbelt; no mountains. Cloud shadows race across the swells. The sky is the biggest thing in the frame. The dog on point at 30 yd on an open shoulder is plainly visible because shoulder grass is knee-high, not thigh-high.

**Quail Fields — Rolling Red Plains, western Oklahoma.**
Rolling red-sand rangeland under a warm, dusty sky. Copper little bluestem and sideoats cover the ground in bunches with red soil showing between them, never bare orange plains. The covey headquarters read from across the property: low, dense, rounded sand plum thickets 1–3 m tall in clusters, with sand sage and shinnery oak mottes between, all open at ground level. Scattered mesquite (low, spreading, multi-trunked, fine grey-green crown) and a few rounded hackberries stand on the uplands. One creek winds through, lined with hackberry, elm and cottonwood, with gullied red clay banks where it cuts the breaks. A windmill and stock tank, two-tracks and a sagging four-wire fence. The horizon is low rolling breaks and creek timber; no mountains, no umbrella trees.

**Cattail Coverts — prairie-pothole farm, eastern South Dakota.**
Keep what works: section fields of stubble rows, hard edges between stubble and cover strips, the farmstead with bins, shelterbelts as dark walls, slough water. Fix the rest: the yard turf is October tan, not lawn green; tree crowns are deciduous plains crowns, not saturated icosahedra; neighbouring farms show as shelterbelt rectangles and a far grain elevator, not mushrooms; the horizon is flat section country with power poles; no mountains. Cover interiors are open at dog height with pale seed heads above, so a pointing dog is a dark shape against stems rather than lost in a wall of blades. Cold blue November light, slanting sun on pale stubble, dawn fog lying in the potholes.

**Chukar Ridge — a Snake River / Owyhee canyon.**
A canyon you climb. Stacked bands of columnar basalt rimrock, each with a grey talus apron below and a bench above. Steep slopes of cheatgrass bleached gold in October, striped with contour cattle trails; bluebunch wheatgrass on the north faces; sagebrush in the draws. A spring seam shows as a line of willow and rose with greener grass. Below the property a river glints in the canyon floor. The light is hard: the rim catches the sun while the canyon floor and north faces sit in cool shade, and each ridge beyond recedes in a cooler band of haze. Rocks are angular, layered or columnar basalt, never rounded blobs.

## The birds: what done looks like

- **The rise is a short score per species.** A tell, the cover blowing out across the covey's footprint, the whole covey heard, at most three birds in the sky, each on its own line. Crossing and quartering birds are common; straightaways are under about 40%. Each bird is against the sky for its first second where the land allows.
- **Every exit is honest.** No bird blinks out mid-screen. It drives off-screen or sets down where you can see it.
- **You know the bird by eye and ear** at 30–40 m on a phone: silhouette, wingbeat rhythm, flash marks, call. Wingbeats don't strobe at 30 fps. No live bird within range shrinks to an anonymous dot.
- **Falls read instantly:** feather puff, silhouette collapse, a thump that arrives late at distance; misses become chases you can mark.
- **Birds exist before the flush,** but only where real hunters see them: a rooster crossing a two-track, chukar running uphill above you, sharptails on a dawn skyline, plus sign on the ground. Never drawn inside cover.

## How work is verified

- `tools3d/heavy.sh <command>` wraps every memory-heavy job (tsc, the full test suite, vite build, browser captures, simulation sweeps). It holds one machine-wide lock so lanes never run two at once. The Mac has 16 GB with little free.
- Focused test runs use `npx vitest run <file> --maxWorkers=1`.
- `tools3d/postcards.sh <label>` captures the fixed postcard set (4 grounds × 5 views × High morning, Lightweight morning, High evening) and `tools3d/contact-sheet.py <label>` builds one sheet per ground. Lanes judge their work against the baseline sheets and the targets above, and look at the images.
- Captures pass `--uncapped`, because a sleeping display stops headless frames.
- Every commit leaves tests green and is a playable build.
- Everything placed in the world (vegetation, trees, props, far terrain, bird sites) is derived from the landform, the cover data and each ground's hunt areas, never hand-placed against today's coordinates, so the bigger rebuilt grounds dress themselves.

## Lanes

| Lane | Campaign | Owns |
| --- | --- | --- |
| Birds | The rise (waves, one flight system, line variety, honest exits), then falls and marks, identity, ground birds | `src/three/subsystems/birds.ts`, `src/game/flightLine.ts` (one planned flight line per bird), `src/game/riseScore.ts`, flight and bird presentation files, `src/game/birds.ts`, `src/game/species.ts`, bird tests |
| Light | Each ground's own light on every screen: grade in materials, authored sky and fog, far terrain instead of mountain cards, sky occlusion, cloud shadows; later weather and season | `src/three/looks.ts`, `postEffects.ts`, `palette.ts`, `subsystems/sky.ts`, engine tone mapping, terrain shader hooks for light |
| Landform | Bigger grounds of named hunt areas with feature-authored landforms (Chukar first, then Sharptail, Quail, Cattail), rimrock, habitat and bird placement from the land, the in-repo hunt lab that proves pacing | `src/game/landscape.ts`, `src/game/*Landscape.ts`, `src/game/areas.ts` layouts, `src/game/areaEncounters.ts` placement, landform tooling, rim and talus kits, Chukar vegetation |
| Cover | Shape-first cover: one bake-off, one shared ground kit, Sharptail, Quail and Cattail rollouts | `src/three/subsystems/grass.ts`, per-ground vegetation subsystems, `src/three/landscapeVisuals.ts`, tree and shrub kits |
