# Light lane log

Branch `lane/light`. Target: "The look" and the art targets in `docs/3d/world-and-birds.md`. Evidence lives in `docs/3d/campaign/light/`.

## Milestone 1: each ground's own light, on every screen (2026-10-09)

### What changed

**The grade is in every material, so phones get it.** The approved Crisp grade and each ground's light used to run only in High's last screen pass. Now the renderer uses three's `CustomToneMapping`, and the tone-mapping chunk that every material compiles runs ACES Filmic and then the grade (white balance, CDL, shadow and highlight tints, contrast, saturation, vignette, a half-step dither) (`src/three/grade.ts`). High still renders its scene linear into the screen-effects target, and its last pass calls the same GLSL with the same values. Each tier grades exactly once, and High differs from Lightweight only by ambient occlusion and bloom. The values are one shared `Float32Array`. three copies non-three uniform values by reference when it clones a material's uniforms, so putting the array into `ShaderLib` reaches every built-in material and every `onBeforeCompile` shader. The sky dome and ridge `ShaderMaterial`s add `gradeUniforms()` themselves. Every value is stored as a departure from neutral, so a shader that misses the uniform renders plain ACES, never black. `?look=off` is plain ACES on both tiers, and L cycles looks on both.

**Fog is driven from the sky, and is the same on both tiers.** In `src/three/atmosphere.ts`:
- Away from the sun the fog is the scene's `FogExp2` colour. Toward the sun's azimuth it warms with the sky's own horizon colour, keeping the far land's value so into-sun views warm rather than whiten.
- A height fog pools in low ground. Its floor is a quantile of the property's heights read from the landform, so a bigger or reshaped ground moves it. It is integrated along each view ray from the camera, so a raised view sees the fog lying below it instead of being washed in it.
- Each region caps how much of any far surface the distance fog may hide, so the farthest land stays a band of colour below the sky.
- High's screen-space height haze is gone. Its floor followed the camera, which washed the Quail and Cattail overviews white.

**A three quirk the old look sat on.** three applies fog after tone mapping and sRGB encoding. On screen it hands the fog colour over sRGB-encoded, but into a render target it hands it over linear. So the same fog read dark and muddy on Lightweight and pale on High; Chukar's into-sun canyon went white on one tier and grey on the other. The fog now runs at the start of the tone-mapping chunk, in linear light, on both tiers. It decodes three's screen-space colour, and three's own fog chunk stands down. Matched Chukar captures now agree pixel for pixel away from shadow edges.

**Horizons true to each region** (`src/three/horizon.ts`; `src/three/pheasantSkyline.ts` and the plains contour tables are retired). Each core ground builds its horizon from a region profile. The profile is seeded by the ground's terrain seed and reads two facts from the landform: where the property's edge runs lowest (drainages leave there) and how much relief the edge carries.
- Sharptail: layered swells stepping back blue-grey, a windmill and one far shelterbelt.
- Quail: low rolling breaks with gullies and mesquite, creek timber on the drainages, and caprock breaks beyond.
- Cattail: flat section country, long low shelterbelts of rounded crowns, a pole line along a section road, and a far grain elevator.
- Chukar: canyon rims in flat-topped steps with side-canyon notches, opening toward the river where the land drains, each wall cooler.

The rings still follow the hunter across the ground (no parallax yet). Each band's datum now sits on the sightline to the far terrain's edge (the property's mean edge height at the 1,000-yard terrain apron), so silhouettes stand on the horizon from a draw or a crest. Bands take the region's own distance fog, a little more per band, so they step back lighter and cooler.

**Per-ground, per-hour air** (`palette.ts`, `looks.ts`):
- Distance colours are mid-tone land, darker than each sky's horizon.
- Fog is thinner where long views washed out.
- Sharptail's evening has warm gold light instead of the generic ember key, which had turned the cured grass oxblood.
- Cattail's grade moves from warm golden to cold November light (pale stubble, blue shade), keeping some low-sun warmth at evening through a new per-hour ground tweak.
- Cattail's last light leans a little less violet, and Sharptail's last light is lifted slightly.

### Numbers

Draw calls and triangles per postcard view are unchanged on both tiers: no extra pass and no new draw. Quail truck, for example, is 301 draws and 1.416 M triangles on High, and 234 draws and 780 k on Lightweight, before and after. The table gives ranges over the five postcard views.

| Ground | High draws | High triangles | Lightweight draws | Lightweight triangles |
| --- | --- | --- | --- | --- |
| Quail | 150–301 | 465k–1,416k | 122–234 | 270k–781k |
| Sharptail | 182–269 | 1,477k–1,899k | 115–209 | 563k–738k |
| Cattail | 181–281 | 959k–1,516k | 127–216 | 573k–981k |
| Chukar | 124–214 | 1,017k–1,349k | 81–179 | 436k–502k |

The horizon rings add under 200 triangles of poles, elevator and windmill per ground (Quail 3,584, Sharptail about 2,700 ring triangles; the test budget is 3,800). Per-fragment cost does rise on Lightweight: the grade (two sRGB conversions, a CDL pow, smoothsteps) and the fog (a length, a pow, two exps) run in every fragment, overdrawn grass included. This has not been measured on a phone.

### Evidence

- `light/<ground>-before-after.jpg`: eight rows per ground, before and after for High and Lightweight, morning and evening. Before is the campaign baseline (`327189b`), plus a Lightweight-evening baseline captured from the same code.
- `light/horizons-and-fog.jpg`: horizon strips. They show Quail's mountains gone, the Cattail evening overview no longer white, Chukar's canyon rims receding in blue bands, and Sharptail's evening no longer oxblood.

### Honest gaps against the targets

- **Horizons are camera-following rings with no parallax.** They read as the right country (plains silhouettes, canyon rims), but they never get closer as you walk, and their silhouettes are thin: a few to twenty pixels on a 1440-wide frame. Sharptail's "three or four layers of swells" show from a crest only as faint value steps. That is milestone 2's job.
- **Cattail shelterbelts on the horizon** are long low groves now and read as distant walls from the overview. They are still a single silhouette colour per band, with no farmstead detail.
- **Chukar's hard canyon light** (rim lit, floor and north faces in cool shade) needs the landform's rims and baked sky occlusion. Fog and grade alone cannot do it, and the cairn view's dark-green ground is terrain paint.
- **Quail still reads as savanna up close** because of the umbrella trees and bare ground (Cover lane). Its light, sky and horizon are now Red Plains.
- **Overviews** keep a soft haze over the far property. They separate near, middle and far and never white out, but they are hazier than a Firewatch vista.
- **Last light** is still essentially the old silhouette-hour recipe: dark navy on Sharptail, mauve on Cattail, violet-blue on Quail and Chukar. It is readable but was not tuned for this milestone; the postcard set has no last-light row.
- **Not measured on a phone:** frame time, and banding on mediump GPUs. three compiles at highp where the GPU supports it, and the grade dithers before the 8-bit write.

### Notes for the other lanes

- Every built-in material gets the grade and the fog automatically. A new `ShaderMaterial` that tone maps should spread `gradeUniforms()` into its uniforms; one with `fog: true` should spread `atmosphereUniforms()`.
- Fog now runs inside `#include <tonemapping_fragment>`. Shader edits that rely on fog running after tone mapping, or replace that chunk, will lose it.
- The horizon reads `horizonLand(landscape)`: the edge heights on `worldBounds()` and the low exits. It assumes the terrain apron is 1,000 yards (`TERRAIN_APRON_M`, mirroring `propertyTerrain.ts`). If the Landform lane changes the apron, change that constant with it.
- `docs/3d/regional-atmosphere.md` describes the retired plains contour tables.

### Milestone 2 proposal

1. **A far-terrain ring with real parallax**, generated from the landform and the region profile. Low-resolution terrain annuli run from the apron edge out to about 4–6 km. Their heights extend the property's landform outward and are blended into region features from `horizon.ts`: swell trains, the creek-timber band along the drainages, section-line belts and roads, canyon rims stepping down to the river. They are built once at load as one or two merged meshes per tier, drawn with the same terrain material and fog, and colour-ramped from the region's land colours to its distance colour. The camera-following rings stay only as the farthest band. Budget: Lightweight up 2% or less in triangles, no new pass, at most two draws.
2. **Baked sky occlusion in the terrain's vertex colours.** A per-vertex horizon-angle or ambient visibility term, from the landform at build time, multiplies ambient light. Crests read light and draws, coulees and the canyon floor dark, so swells read at 400 m on both tiers. It is cheap (vertex colours exist) and needs only a light hook in the terrain material.
3. **Wind-driven cloud shadows.** One scrolling noise lookup, offset by the hunt wind, darkens the sun term in terrain and vegetation. A shared GLSL include works like the fog chunk: put it in `lights_fragment_end` or after the direct-light term. The Sharptail cloud atlas can drive the shape. Phones get the same lookup.
4. While in there: tune last light per ground, add a Sharptail crest postcard so the layered swells are judged, and give Chukar's rim-lit or north-face-shaded hour a light rig that works with the Landform lane's new rims.

## Milestone 2: far country, ground light, last light (2026-10-09)

### What changed

**A far country with real parallax** (`src/three/farTerrain.ts`). Each core ground has one merged mesh, drawn in one call, from the edge of its terrain apron out to `FAR_COUNTRY_M` (3.9 km) beyond it. It is laid out at load from `worldBounds()`, the landform and `TERRAIN_APRON_M`, so a ground resized two or three times keeps working; a test builds one from a 2.4x-wider, 30 m-higher landform. At the apron's edge the far country takes the landform's own height, sitting just beneath the apron. Over 700 m it blends into its region's country:
- Sharptail: swells that grow to about 40 m of relief, cut by coulees along the drainages, with one shelterbelt and a windmill.
- Quail: rolling breaks, creek timber down the drainages, mesquite, and a caprock escarpment the creeks break.
- Cattail: flat section country on a seeded mile grid of gravel roads, quarter-section fields, farmsteads behind L-shaped shelterbelt rows of rounded crowns with broken tops, a pole line down the nearest section road, and a grain elevator at the farthest corner town. A small vertex hook keeps poles at least about 1.5 px wide at any distance.
- Chukar: rims climbing in four benches, cut by the river's gorge where the land drains.

Vertex colours carry the region's land colours and an occlusion baked from the ring's own heights. The camera-following rings are gone except one farthest band (`horizon.ts`), which is flat on Cattail and carries no blocks that could read as mesas on the plains. The camera's far plane is now 9 km.

**Sky occlusion and cloud shadows for every lit material** (`src/three/groundLight.ts`). At load the landform is baked into a small map over the property and apron, at most 320 samples a side and 8 to 24 m a sample, in 60 to 125 ms. The map holds sky openness (how much sky each spot sees out to about 100 m in eight directions) and a crest term. Cloud shadows are one two-octave noise field, drifted by the hunt's wind at 3 to 13 m/s. Cover follows the region's cover scaled by the hour's sky, and the shadows fade as the sun drops. Both are applied in three's shared `lights_fragment_end` chunk at each surface's world position: openness scales indirect (sky) light, cloud shade scales direct (sun) light. So terrain, grass and cover, the dog and props darken together in a draw or under a cloud, on both tiers, with no per-system hook.

This departs from the plan of baking into terrain vertex colours. Three terrain systems that other lanes own each build their own geometry, and vertex colours would darken only the ground, not what stands on it. The map costs one texture fetch per lit fragment.

**Fog curve.** Distance fog is now squared near and linear far: `1 - exp(-x²/(1+x))` with `x = density × distance`. The hunter's ground stays clear and each far band steps back paler instead of every band reaching the same haze by two kilometres. Air is clearer on every ground, and the regional caps rose to 0.9–0.93.

**Review fixes.**
- Cattail mesas: the shelterbelts are now world-space crowned tree rows on the far country, and the farthest band is flat.
- Cattail's morning and noon air is thinner, so the far property reads as section country; pothole fog stays at dawn.
- Sharptail's evening shade side takes a lifted blue-violet sky light and a gentler evening curve instead of sinking to mud brown.
- Last light on all four grounds drops the old silhouette-hour cool clamp that turned fields navy, mauve or violet.

**New postcard views** (`tools3d/mapReviewViews.ts`, `postcards.sh`). Every ground gets a high-ground vista out over its nearest edge, and Sharptail gets a crest view across the property. Both are found from the landform.

### Numbers

Per postcard view, milestone 1 against milestone 2:

| Ground | Draws | Lightweight triangles | High triangles | Far mesh triangles (High / Lightweight) |
| --- | --- | --- | --- | --- |
| Quail | -1 every view | +242 (+0.15% worst) | +2,384 (+0.96% worst, the vista) | 5,200 / 3,058 |
| Sharptail | -1 | -77 | +1,125 (+0.09%) | 3,061 / 1,859 |
| Cattail | -1 | +194 (+0.04%) | +2,586 (+0.33%) | 6,078 / 3,686 |
| Chukar | -1 | -1,344 (-0.33%) | -192 | 2,880 / 1,728 |

There is no new pass. The far mesh builds in about 20 ms and casts and receives no shadows. Per-fragment cost rises by one texture fetch and a few noise hashes in every lit material on both tiers. This has not been measured on a phone.

### Evidence

`light/<ground>-m2-before-after.jpg` for all four grounds. Each pairs milestone 1 with milestone 2 for High and Lightweight morning and evening plus High last light, with the vista (and Sharptail's crest) first.

### Honest gaps

- **The far country is mostly a thin band from inside the property.** The terrain apron fills the first 900 m, and from eye height far relief of 20–40 m at 2–4 km is a fraction of a degree. It reads clearly from crests and vistas: Sharptail's layered swells, Chukar's benches and gorge, Cattail's belts and elevator. The apron itself stays flat wherever the landform is flat outside the property (Sharptail's vista); that is the Landform lane's apron.
- **Cloud shadows** are the wind-driven noise only. The older, weak sin×sin dapple terms in `grass.ts`, `terrain.ts` and `propertyTerrain.ts` still run on top (about 3%); the Cover lane's kit should drop them.
- **Sky occlusion** is gentle on purpose: plains strength 0.65–0.7 and floor 0.58–0.6, Chukar 0.8 and 0.5. Quail and Cattail are flat enough that the map barely changes them; Sharptail's coulees and Chukar's slopes show it.
- **Chukar's hard canyon light** still needs the Landform lane's real rims. North faces darken now through occlusion, but there is no rim-lit hour rig yet.
- **Last light** is readable dusk on every ground, but it is the least tuned hour.
- **Not measured on a phone:** frame time, and banding.

### Notes for the other lanes

- **Cover lane: adopting the ground light.** Any material built on three's lambert, phong, standard, physical or toon gets sky occlusion and cloud shadows automatically through `lights_fragment_end`. A custom `ShaderMaterial` that lights itself can take the same light: spread `groundLightUniforms()` into its uniforms, prepend `GROUND_LIGHT_GLSL`, then call `vec2 l = uplandGroundLight(worldPosition)`; multiply sky light by `l.x` and sun light by `l.y`. Please retire the old sin×sin cloud dapple when the kit lands.
- **Landform lane:** the far country, the sky map and the long views read `worldBounds()`, `heightAtWorld` and `TERRAIN_APRON_M` at load; nothing is keyed to today's size. If the apron's width changes, change `TERRAIN_APRON_M` (`horizon.ts`) with it, or pass the new width to `buildFarTerrain`.

## Milestone 3: weather and season, and the sound of place (2026-10-30)

Branch `feat/light-weather-audio`, from the campaign head `957f40a` plus the lane's three unmerged commits.

### The merge and the weather seam

`lane/light` (`fc18154` review links, `13bace0` the field-conditions layer, `215e246` the unfinished sound of place) merged onto the campaign head with one textual conflict: `hunt3d.ts`, where both sides added fields (kept both). The auto-merge also left a duplicate `Condition` import in `gameplayMode.ts`. The campaign's later `bee4bf3` (the playthrough reaches End hunt on the pause card) and `bd0b885` came in afterwards.

The seam: land-driven placement read staged visits as frost, career hunts as no weather, and ignored `?weather=` and `?month=`, while the hunt rolled its own day. `createThreeHuntSetup` now rolls the day first and places the birds for it:
- `rollHuntDay` (`state.ts`) is the one definition of a day: wind strength, then the condition, from the hunt's stream in that order. `createHunt` uses it too, so the setup's early roll draws exactly what `createHunt` would have. Every career and quick seed keeps its day, wind strength and wind direction: 100 setups over staged, career and quick launches compared identical before and after.
- Placement takes that condition and the week of the month the field is dressed for. A `?month=` link places for that month's middle week and rolls that month's kind of day.
- Tests (`huntConditionsLaunch.test.ts`): a rolled day's birds sit exactly where a link asking for that day puts them, on staged, career and quick launches; hot against snow and September against December move Chukar's coveys; an undated visit places as mid-October. The second test fails on the unfixed merge.

### What changed on the ground

The lane's field-conditions layer (season, wet, frost, snow and wind sheen on every lit surface, `fieldConditions.ts`) was unreviewed. Looking at it on all four grounds found these, now fixed:
- **Birds took the field's weather.** Birds are plain lit meshes, so on a snow day a rising bird's back went the white of the snow under it, and frost greyed a covey in the cover. Bird materials are now exempt (`exemptFromField`), compiled out of the layer by a define. The skinned dog was already exempt.
- **Tree crowns ignored the season.** Crowns stand above the layer's ground band, so Cattail's shelterbelts were October gold in January. Crowns now keep a leaf year, picked by colour so the cedars and junipers stay dark: summer green in September, russet in November, bare grey-brown twigs in winter (Quail's creek timber turns later). The far country's tree rows follow on the CPU once per day (`FarTerrain.setLeaves`).
- **September was June.** The plains ramp greened every grass, and "low ground" was every metre near the pooled-air floor, which on flat ground is all of it: Cattail's stubble and Sharptail's shoulders went lawn-green. September is gentler now, green swales follow the hollows (the sky map's openness), Cattail's stubble stays straw, and Chukar's cheat is the year's driest straw in September (it cures in June and greens after the November rains).
- **Frost didn't read**, and never burned off. It was a 24% mix that read as bleached ground, and its "linger" term kept 55% of it on any level ground all day. It is now a broken silver rime that lingers in shade, hollows and north faces and burns off sunlit open ground over the hunt.
- **A wild day looked like a calm one.** The sky's cloud amount and the cloud shadows' cover and strength now follow the hunt's wind (calm days clearer), the grass sheen is stronger, and there is twice the chaff. Wind still reads mostly in motion (below).
- **Rain** fell as a few fat ticks. Streaks are now finer and twice as many (900 on High, 460 on Lightweight, still one draw).
- **Cost.** Each part of the day is behind a branch on its own uniform (the same for every fragment of a draw), so a clear October day pays for none of frost, snow, wet or the leaf year.

### How the days are reviewed

- `tools3d/weather-review.mjs` loads a ground on a frost October morning (the day staged visits were forced to before the field showed weather, so the hunt is the same hunt on the campaign head), then uses a capture-only hook (`window.__fieldReview`, `sky.ts`) to dress the same frozen moment for each day. It takes:
  - a month strip (September to January, clear) and a weather strip (clear, rain, frost, snow, a strong wind) of the truck view and the vista;
  - frame cost per day: every system's update and the render, synchronised with a one-pixel read, median of 40 frames;
  - readability: it hunts to a real point, frames the pointing dog from 30 yd back along the hunter's line, then walks in under the flush law and freezes the first birds at 0.5 s and 1.2 s. Each frame is taken with and without its subject (the dog's body, or the birds), for every day.
- `tools3d/weather-sheet.py` measures what each day leaves of the subject: the visible pixels (where the frame differs from the one without it) and their mean luminance step against what is behind them. It lays out the strips and readability crops with the campaign head first.
- Systems that build once for the day keep the page's day under the hook. Cattail's older frost and snow patches are one, and none showed in the reviewed views.
- `tools3d/postcards.sh` now pins the fixed set to a clear October morning (`POSTCARD_DAY` overrides), since staged visits roll their own weather. Other lanes' postcards stay comparable.

### The sound of place

The lane's unfinished `215e246` (weather beds, the cover's voice, gusts, a grain dryer at harvest, far working sounds, crickets and ground birds by month) was reviewed, measured and partly rebuilt.

**Building the buffers hitched frames.** Timed in Node on this M1 Pro, under load:
- each of the day's beds and far sounds takes 3 to 27 ms to make: crickets 27, train 25, grass hiss 19, gravel truck 19, rain 18, cattle 13, gusts 11, the cattail rattle 9, sleet 5, the dryer 3;
- the two wind beds (18 and 11 ms) were made on the first frame in the field;
- an evening's two cricket loops (about 54 ms) were made on the frame the hour came, even in January when they are silent;
- the day's beds went one whole job per idle moment, and the idle queue's 1.5 s timeout forced them into busy frames.

A phone is several times slower. Every bed and far sound is now made in a module worker (`sound/fieldSynth.ts`, `fieldSynthWorker.ts`, `fieldSynthJobs.ts`) and fades in when it arrives. Where no worker can run, each is made in an idle moment of its own. A far sound not yet made doesn't play, and the field gives the ambience the day before the hour, so a winter evening never makes crickets. Bird calls, gun reports and foley still use the older idle queue (see open issues).

**Not yet heard in a browser.** `tools3d/field-sound-review.mjs` records an ordinary field's destination mix through phases:
- the bed while the dog works;
- the walk-in on a point at 35 m and then 10 m (the hush);
- the covey's rise;
- one report from the game's own gun.

`tools3d/field-sound-levels.py` reads each phase's floor, peak and full-scale samples. Every run here came back silent (see the self-assessment), so the levels rest on the model tests in `soundOfPlace.test.ts`: the bell rings at least 9 dB over the whole bed on an ordinary day, and 5 dB over it on the wildest, and every far sound peaks under the bell at working range. The limiter on the master bus (threshold −4 dB, ratio 18) still guards against clipping. The hush is in code: on a close point the beds fall to 40%, rain and sleet only to 70%, and far sounds and the land's birds wait.

**Shape.** Every synthesised bed and far sound was rendered and checked as a spectrogram. Loop seams step no more than the sound itself does (measured on every loop); the train's horn plays four blasts over the rumble, the cow's call glides, the truck passes, the rain hisses, sleet ticks sparse and hard, gusts swell twice a loop, and the crickets pulse. None of it has been listened to.

### Chukar's far country

From inside the new canyon, the far side read as flat haze bands, the river below the south fence never glinted, and neither the rim overlook nor the vista showed the canyon below.
- **The river catches the sky** (`riverLight.ts`, used by `chukarTerrain.ts`). Its Phong highlight only showed where the sun's mirror angle came round, which from the rims it never does. The water now gives back the field's sky by Fresnel (Schlick, from water's 2%), a pale ribbon down the dark gorge floor, with the sun's glint on top when the angle comes. The sky is the one wet ground reflects, so it follows the hour and the weather, and the river takes none of the field's frost or snow.
- **Far country cools with distance** (`atmosphere.ts`). Fog used to fade far land toward one colour, so ridge after ridge only grew paler. It now cools toward the hour's mid-sky colour, held at the fog's own value, between 600 m and 4.5 km: most in the canyon (0.55), then Sharptail (0.35), Cattail (0.3) and the Red Plains (0.2).
- **Clearer canyon air, cooler shade** (`palette.ts`, `atmosphere.ts`). By day the distance fog hid about half of a floor 1.5 km off, and the pooled canyon haze added up to a quarter more. The anti-sun fill also lit the north faces across the river nearly as bright as the sunlit cheat in front.
  - Morning and noon fog drops from 0.0008 to 0.0004, and evening from 0.001 to 0.00055.
  - The pooled haze is capped at 0.10–0.16 by day.
  - The fill drops from 0.44 to 0.3 and the ambient from 1.04 to 0.96.

  The rims now catch the sun while the north faces sit in cool shade. From the same vista camera, into the morning sun, the clearer air alone takes the far wall's band from luminance 135 to 115, and its spread from 65 to 90, as the benches and the gorge's dark bands read through.
- **The vista looks into the canyon** (`tools3d/mapReviewViews.ts`). On a ground that falls more than 100 m from its high ground to the fence, the vista stands on the brink, raised 3 m, and looks down toward the lowest ground at the fence. Before, Chukar's looked north across the rim flat. The plains vistas are unchanged.

### Numbers

**Readability.** On every ground and tier, the pointing dog was seen from 30 yd and the first birds frozen at 0.5 s and 1.2 s, the same moment dressed for each day. The rows below compare each subject on its worst day for contrast with the same subject on a clear day. "Px" is the subject's visible pixels at 1440×810; "step" is their mean luminance step against what's behind them.

| Ground | Tier | Subject | Clear day: px, step | Worst day for contrast | Its px, step | Step against clear |
| --- | --- | --- | --- | --- | --- | --- |
| quail-fields | high | dog | 62, 0.139 | frost | 63, 0.148 | 106% |
| quail-fields | high | birds t0.5 | 131, 0.366 | rain | 128, 0.349 | 95% |
| quail-fields | high | birds t1.2 | 177, 0.397 | rain | 190, 0.361 | 91% |
| quail-fields | lite | dog | 72, 0.105 | rain | 45, 0.105 | 100% |
| quail-fields | lite | birds t0.5 | 149, 0.307 | rain | 144, 0.284 | 93% |
| quail-fields | lite | birds t1.2 | 253, 0.330 | rain | 248, 0.307 | 93% |
| sharptail-prairie | high | dog | 64, 0.300 | rain | 62, 0.229 | 76% |
| sharptail-prairie | high | birds t0.5 | 156, 0.379 | rain | 149, 0.366 | 97% |
| sharptail-prairie | high | birds t1.2 | 77, 0.405 | rain | 78, 0.383 | 95% |
| sharptail-prairie | lite | dog | 70, 0.192 | rain | 60, 0.159 | 83% |
| sharptail-prairie | lite | birds t0.5 | 178, 0.225 | rain | 172, 0.207 | 92% |
| sharptail-prairie | lite | birds t1.2 | 108, 0.343 | rain | 109, 0.317 | 92% |
| pheasant-coverts | high | dog | hidden (0 px) on every day, the campaign head too | - | - | - |
| pheasant-coverts | high | birds t0.5 | hidden (0 px) on every day, the campaign head too | - | - | - |
| pheasant-coverts | high | birds t1.2 | 51, 0.186 | frost | 52, 0.187 | 101% |
| pheasant-coverts | lite | dog | hidden (0 px) on every day, the campaign head too | - | - | - |
| pheasant-coverts | lite | birds t0.5 | hidden (0 px) on every day, the campaign head too | - | - | - |
| pheasant-coverts | lite | birds t1.2 | 87, 0.156 | frost | 90, 0.148 | 95% |
| chukar-ridge | high | dog | 78, 0.360 | snow | 72, 0.223 | 62% |
| chukar-ridge | high | birds t0.5 | 174, 0.149 | rain | 150, 0.108 | 72% |
| chukar-ridge | high | birds t1.2 | 153, 0.164 | rain | 137, 0.127 | 77% |
| chukar-ridge | lite | dog | 114, 0.216 | snow | 106, 0.141 | 65% |
| chukar-ridge | lite | birds t0.5 | 155, 0.112 | rain | 146, 0.093 | 83% |
| chukar-ridge | lite | birds t1.2 | 172, 0.135 | rain | 139, 0.119 | 88% |

- **No condition swallows a subject that a clear day shows.** The worst case is the white GSP on Chukar's snow (white on white). On High it keeps 72 visible pixels and a step of 0.22 (62% of its clear day), still more than Quail's dog has in its grass on a clear day (0.14). Rain costs the rising birds 3–28% of their step, most on Chukar at 0.5 s.
- **Rain dims the whole frame**, so fewer of a far bird's pixels pass a fixed threshold (Cattail's birds at 1.2 s: 51 to 30 px on High), while the pixels that remain step further from their background (0.186 to 0.214).
- **On Cattail the cover hides the dog at 30 yd, and the birds at 0.5 s, on every day, the campaign head included.** That is the stems (the Cover lane's open-at-dog-height target), not the weather. On Quail the dog shows only its head and back over the bluestem on any day.
- Lightweight was judged at 1440×810, like the postcards, not at phone resolution.

**Frame cost** (`weather-review.mjs --parts cost`: update and render, synchronised by a one-pixel read, median of 60 frames, uncapped headless Chrome on the M1 Pro's GPU; the truck view). Each case ran twice, interleaved with the campaign head so machine load fell on both alike:

| Case | Campaign head | Clear | Rain | Frost | Snow | Strong wind |
| --- | --- | --- | --- | --- | --- | --- |
| Chukar Lightweight | 9.5, 10.1 | 9.5, 7.9 | 9.1, 8.7 | 8.2, 9.2 | 8.8, 10.0 | 10.3, 6.6 |
| Cattail High | 18.0, 19.5 | 19.4, 17.6 | 21.2, 25.1 | 24.4, 25.7 | 25.3, 26.6 | 26.5, 25.6 |
| Quail Lightweight | 11.4, 11.5 | 12.8, 13.3 | 13.0, 13.0 | 13.9, 13.7 | 14.5, 13.6 | 13.7, 12.6 |

- A clear day costs the same as the campaign head within run-to-run noise, plus one draw: the near weather's points, 140 on High and 72 on Lightweight on a dry day.
- Triangles are unchanged.
- On the heaviest view (Cattail High, 281 draws), weather days read 2–8 ms slower than clear. But the strong-wind day, which adds no shader work over a clear one, reads as slow as snow, and every day was measured in the same order. A reverse-order run to separate the two was queued, but a session restart lost it, so the weather days' own cost on this view is open.

### Evidence

All images are captures of this branch against the campaign head (`957f40a`), seed 7701, a morning, under `docs/3d/campaign/light/`:
- `<ground>-m3-months.jpg`: the truck view and the vista on High and Lightweight. The campaign head is first, then September to January on a clear day.
- `<ground>-m3-weather.jpg`: the same views on an October morning: clear, rain, frost, snow, and a strong wind.
- `<ground>-m3-readability.jpg`: the pointing dog from 30 yd and the first birds at 0.5 s and 1.2 s, the same moment each day, cropped to the subject. Each crop is labelled with its visible pixels and luminance step.
- `chukar-ridge-m3-canyon.jpg`: Chukar's vista, rim overlook and breaks, before and after, on High morning and evening and Lightweight morning.

Grounds are named by id: `quail-fields` (Quail), `sharptail-prairie` (Sharptail), `pheasant-coverts` (Cattail) and `chukar-ridge` (Chukar).

### Honest self-assessment

- **Weather and season on the ground: met, with one weak column.**
  - Each ground now turns through its year in its own way: green swales in September (never Chukar's cheat), the October peak, November's bleach and bare belts, and snow by slope, aspect and drift in December and January (Quail mostly open).
  - Rain reads as a grey deck over wet, darkened ground. Frost reads as a rime that holds in the shade. Snow reads as snow.
  - The strong-wind column is the weak one: in a still it shows only as broken cloud shadow and chaff. Wind is a motion cue (sway, rolling sheen, racing shadows), so the strips undersell it.
- **Readability: met where the weather is concerned.** No condition hides a subject that a clear day shows. Two things are not the weather's doing: Cattail's cover hides the dog at 30 yd on every day, and the first half-second of its rise is hidden too, a stems problem. On Quail, the bluestem hides most of the dog on any day.
- **Frame cost: a clear day is unchanged within noise; the weather days are not separated cleanly** from measurement drift on the heaviest view.
- **The sound of place:**
  - Building it no longer touches the main thread.
  - Its levels are pinned by the model tests: the bell rings at least 9 dB over the whole bed on an ordinary day, and 5 dB over it on the wildest.
  - It is not verified in a browser. Recorded playthroughs failed on pointer lock. Three runs of the new field probe (`tools3d/field-sound-review.mjs`) recorded only silence, with the audio context running and the field never paused. In the same runs the dog never pointed in real time, which points at headless Chrome's real-time loop on this machine (frames starve while the display sleeps) rather than at the sound. A listening pass in a real browser is the open check.
- **Chukar's far country: improved, not done.** The river now gives back the sky, and the far country cools with distance. The vista looks into the canyon, and the canyon's air is clearer. From inside, the shaded far wall still reads as a pale, banded sheet into the morning sun. The light can deepen that shade, but not give the wall the draws, spurs and colour breaks its paint lacks. And no review view sees the river.

### Open issues for the lead

- **Cattail's dog at 30 yd** is hidden by the stems on every day, the campaign head included. So is the first half-second of a rise from the walk-in point (Cover lane: "open at dog height").
- **Wind** reads in motion, not in a still frame. If the strips need to show it, a short clip is the honest evidence.
- **Chukar's far wall** is uniformly painted in shade (the apron's paint, Landform lane). Its benches and rim bands would read with value breaks between talus, cheat and basalt. The rim overlook's own knoll hides the canyon below. No review view looks down on the river, so its new light is pinned by a test, not seen.
- **Bird calls, gun reports and foley** still synthesise on the older idle queue: one whole job per idle moment, forced into a busy frame after 1.5 s. A report took 17–40 ms here. They're the next candidates for the worker.
- **Not measured on a phone:** frame time, banding, and the worker on mobile Safari (module workers need iOS 15; older devices fall back to idle moments).
- **Lightweight readability** was judged at 1440×810, like the postcards, not at phone resolution.
- **Review links:**
  - `?month=` on a career hunt also places the birds for, and rolls the day of, that month: review links only.
  - Staged visits roll real days. The postcard set pins a clear October morning (`POSTCARD_DAY`). Other review tools that relied on the old forced frost should pass `weather=` themselves.
- **The cooler far air** reaches every ground's far country (Sharptail 0.35, Cattail 0.3, Quail 0.2). It was judged on Chukar; the plains strips showed no ill effect, but no plains vista was reviewed for it.

### Files touched outside the lane

- `src/game/gameplayMode.ts`, `src/game/state.ts`: the weather seam, as the lead asked (`rollHuntDay`).
- `src/three/subsystems/hunt3d.ts`: the merge (both sides' fields).
- `src/three/subsystems/birds.ts`: one line, the bird material is exempt from the field's weather (Birds lane).
- `src/three/subsystems/chukarTerrain.ts`: the river takes `riverMaterial()` (Landform lane; the land is unchanged).
- `src/audio.ts`, `src/three/subsystems/fieldAudio.ts`: the field's beds and far sounds go to the worker (shared audio).
- `tools3d/playthrough.mjs` (`--query`), `tools3d/postcards.sh` (the pinned day), `tools3d/mapReviewViews.ts` (the canyon vista): shared review tooling.
- `test/fieldSoundscape.test.ts`: the ambience tests now wait for the beds to arrive.
