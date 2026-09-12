# Chukar Ridge environment production proof

September 12, 2026. First playable environment pass, with editable source assets and a repeatable route review. This establishes the workflow; it is not final art acceptance or a claim of finished mobile performance.

**Play and review**

With Vite running on port 4583:

- [Play the south entry](http://127.0.0.1:4583/index3d.html?area=chukar-ridge&drop=south-gate&quality=high&tod=morning&dog=generated&seed=7701&challenge=balanced).
- [Review six locations](http://127.0.0.1:4583/tools3d/chukar-world-review.html). Switch light and detail, turn the view, or run the camera route study. This development page uses the actual renderer and heightfield, with the hunt paused. It is not a substitute for playing a hunt or testing movement collision.
- Press M in the game for the property atlas. The new benches, contours, rock footprints and connected paths use the same geography as the world.

**What changed**

The south entry now begins on a gentler shoulder, with an ascending route through Sage Bench and Split Shoulder to Rim Overlook. A return path joins the climb, and a separate traverse reaches Rimrock Tank. The western entry remains an alternate sidehill approach.

Ten authored rock brows establish the route's landmarks. The property has three broad climbing shelves, an eastern drainage and distant eroded tablelands. These are actual world landforms; they remain fixed when the drop, encounter seed or rendering tier changes.

Three basalt mesh families replace the former procedural ribs. Their feet conform to the local slope, preserving the upper face instead of sinking the entire asset to the lowest ground corner. A chain of collision circles follows each formation. Nearby talus, protected sage and bunchgrass stands take their placement cues from the same brows. New bench cover participates in stocking; rock footprints are removed from cover patches. Existing seed outcomes can therefore change.

Dry earth uses a generated painted texture, blended at two world scales and faded with distance. Warmer ground, a cooler shadow floor for basalt, Chukar-specific morning light and reduced decorative horizon walls support the new terrain. Other properties retain their existing environment treatments.

**Editable asset workflow**

- Source gallery: [basalt-kit.blend](../../../assets/source/chukar-kit/basalt-kit.blend).
- Builder/exporter: [build.py](../../../tools3d/assets/chukar-kit/build.py).
- Studio shape review: [basalt-kit.png](basalt-kit.png). This is a Blender studio image, not an in-game screenshot.
- Runtime exports: [manifest.json](../../../public/models/chukar-kit/manifest.json).

To rebuild the kit from its deterministic geometry recipe:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools3d/assets/chukar-kit/build.py
```

To export after editing the saved Blender gallery:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools3d/assets/chukar-kit/build.py -- --export-only
```

The first command regenerates and overwrites the source gallery. The second preserves saved mesh edits. Keep the six asset object names and the `chukar_asset` custom property. Each export is one mesh with one vertex-painted material. Runtime dimensions come from the authored formation layout; source units are metres. The game supplies lighting and material response.

Each Standard mesh is 1,076 triangles and about 82 KB; each Lightweight mesh is 592 triangles and about 46 KB. The game loads three meshes for the selected tier. The source Blender file and source PNGs are not runtime downloads. All runtime kit exports and the ground WebP are included in the offline asset manifest.

**Generated art**

Built-in image generation produced both images, without image references. Exact prompts are saved in [image-prompts.txt](image-prompts.txt).

- [Environment concept](concept.png): the art direction target for the route, geology, palette and vegetation relationships. It is not a capture of the current game.
- [Ground source](../../../assets/source/chukar-kit/dry-ground-source.png): the original generated raster.
- [Runtime ground texture](../../../public/textures/terrain/chukar-dry-ground.webp): resized to 1024 square and encoded as WebP, quality 83. Its color variation is blended with the terrain material rather than displayed at full strength.

**Verification**

`npm test`: 102 files, 767 tests passed. New checks cover gentle arrival, elevated benches, mapped route slope and clearance from authored collision circles, shared habitat exclusions, route connections, and actual GLB structure and geometry budgets. Two older terrain-dependent fixtures now sample the intended steep property faces rather than the newly gentler arrival ground.

`npm run build`: TypeScript and the production build passed. The existing large JavaScript chunk warning remains.

Browser review used the normal playable entry and atlas, plus staged views at the climbing shoulder, Sage Bench, Split Shoulder, Rim Overlook and western approach. Both detail tiers rendered; the review page reported no console errors. The atlas opened at the player and displayed the complete loop at whole-property zoom.

At the same morning Rim Overlook camera in the 1280 by 720 browser review, before the review footer layout adjustment:

| Tier | Submitted draws | Submitted triangles |
| --- | ---: | ---: |
| Standard | 144 | 975,388 |
| Lightweight | 115 | 288,968 |

Those are renderer submission counters for a staged scene, not measured frame rate or a phone benchmark. Geometry changes preserve the major silhouette while reducing this view's triangle submissions by about 70 percent.

**What still needs refinement**

The concept is ahead of the current in-game art. Several open slopes still read too uniformly, some vegetation silhouettes look coarse at close range, and the rock families need more variation in their overall shapes. The next art pass should concentrate on a few deliberately composed plant stands, talus transitions and hero rock silhouettes along this route before spreading the kit to other properties.

A complete hunt still needs assessment for encounter pacing, high-side approach choices, dog navigation around the new rocks and return-to-truck flow. Route geometry tests and staged camera views do not establish those experiences. Physical mobile testing, sustained frame times, loading behavior on slower connections and long-session memory remain separate acceptance work.

Keep this route as the benchmark: concept and reference, shared terrain and habitat, editable mesh kit, actual game composition, then performance and hunting review. Expand to the next property only once this benchmark earns approval.
