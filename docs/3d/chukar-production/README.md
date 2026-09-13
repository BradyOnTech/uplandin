# Chukar Ridge environment production proof

September 13, 2026. Playable environment and visual polish checkpoint, following the first route pass on September 12. Editable source assets and repeatable staged views support continued art review; this is not final art acceptance or a claim of finished mobile performance.

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

**September 13 polish pass**

The three rock families now have distinct, asymmetric profiles: a raised brow, broad overlapping shelves and a split shoulder with unequal masses. Tilted tops, weathered color planes and fallen wedges replace the repeated upright columns. The revised assets use fewer triangles and smaller downloads.

Bunchgrass uses finer bent blades, a low thatch skirt and smaller seed heads. Sage has spreading woody stems and fuller compound crowns. Continuous stand patterns now guide both plant placement and the underlying ground tint, with bare talus and sheltered growth responding to the rock layout. Detailed plant forms stay near the camera; simpler opaque geometry handles the distance and Lightweight tier without adding alpha overdraw.

Ground texture is quieter, cliff bedding is less uniform, and distant tablelands have less regular edges. Thin wind-shaped cloud banks and adjusted haze replace the generic cumulus treatment. Plant fill light varies with the time of day to preserve shaded detail without keeping the morning brightness at evening.

The path was partly buried because its height followed the analytic terrain rather than the rendered terrain triangles. It now fits the actual mesh in both detail levels and on either side of terrain tile boundaries. The review page also preserves the selected lighting after a reload and carries its light/detail choices into the play link. Playable landforms, route layout and stocking were not changed in this polish pass.

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

Each Standard mesh is 746–826 triangles and about 57–63 KB; each Lightweight mesh is 268–294 triangles and about 21–23 KB. The game loads three meshes for the selected tier: about 176 KB total for Standard or 65 KB for Lightweight. The source Blender file and source PNGs are not runtime downloads. All runtime kit exports and the ground WebP are included in the offline asset manifest.

**Generated art**

Built-in image generation produced both images, without image references. Exact prompts are saved in [image-prompts.txt](image-prompts.txt).

- [Environment concept](concept.png): the art direction target for the route, geology, palette and vegetation relationships. It is not a capture of the current game.
- [Ground source](../../../assets/source/chukar-kit/dry-ground-source.png): the original generated raster.
- [Runtime ground texture](../../../public/textures/terrain/chukar-dry-ground.webp): resized to 1024 square and encoded as WebP, quality 83. Its color variation is blended with the terrain material rather than displayed at full strength.

**Verification**

The full regression run passed 102 files and 771 tests during this pass. After the final plant geometry, terrain detail and lighting adjustments, the focused Chukar and ground-fitting checks passed 19 tests across two files. These include raycasting against the rendered near/far terrain under the path, asset and plant geometry budgets, and the existing route/cover constraints. The shared ground-fitting helper retains Quail's existing default settings.

The final `npm run build` passed TypeScript and the production build. The existing large JavaScript chunk warning remains.

Browser review used the staged route locations, including both approaches, Sage Bench and Rim Overlook. Standard and Lightweight rendered, morning and evening were inspected, and the review page reported no console errors. This pass did not include a complete played hunt.

At the same morning Sage Bench camera in the 1280 by 720 browser review after the final geometry changes:

| Tier | Submitted draws | Submitted triangles |
| --- | ---: | ---: |
| Standard | 156 | 1,530,366 |
| Lightweight | 140 | 543,916 |

These are renderer submission counters for a staged scene, including repeated rendering passes, not measured frame rate or a phone benchmark. Lightweight reduces this view's triangle submissions by about 64 percent. The counter is higher than the previous pass's differently positioned Rim Overlook capture; those two samples are not a valid before/after performance comparison.

**What still needs refinement**

The concept is still ahead of the in-game art. Broad slopes remain too uniform in places; transitions from major rocks to smaller rubble and soil need more deliberate composition. The next review should judge close plant silhouettes, the visible change to simpler distant crowns, rock contact and erosion detail, and the balance of empty ground against composed stands. The three rock families are more distinct now, but their placement and large color planes still need artistic scrutiny before this becomes the benchmark for other properties.

A complete hunt still needs assessment for encounter pacing, high-side approach choices, dog navigation around the new rocks and return-to-truck flow. Route geometry tests and staged camera views do not establish those experiences. Physical mobile testing, sustained frame times, loading behavior on slower connections and long-session memory remain separate acceptance work.

Keep this route as the benchmark: concept and reference, shared terrain and habitat, editable mesh kit, actual game composition, then performance and hunting review. Expand to the next property only once this benchmark earns approval.
