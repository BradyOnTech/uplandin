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
